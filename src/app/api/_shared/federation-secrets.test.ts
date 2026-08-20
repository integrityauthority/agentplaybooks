import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/lib/crypto";

const { getServiceSupabaseMock } = vi.hoisted(() => ({
  getServiceSupabaseMock: vi.fn(),
}));

vi.mock("./supabase", () => ({ getServiceSupabase: getServiceSupabaseMock }));

import { loadFederationSecrets, referencedSecretNames } from "./federation-secrets";
import type { MCPServer } from "@/lib/supabase/types";

const PLAYBOOK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SERVER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const server = (transportConfig: Record<string, unknown>): MCPServer => ({
  id: SERVER_ID,
  playbook_id: PLAYBOOK_ID,
  publisher_id: null,
  name: "search",
  description: null,
  tools: [],
  resources: [],
  transport_type: "http",
  transport_config: transportConfig,
  created_at: new Date().toISOString(),
} as unknown as MCPServer);

type VaultRow = {
  id: string;
  name: string;
  value: string;
  allowed_hosts?: string[] | null;
};

/**
 * A minimal supabase stub for exactly the tables the resolver touches. Vault
 * rows are stored encrypted with the real crypto, so the test proves actual
 * decryption, not just plumbing.
 */
async function stubDatabase({ vault }: { vault: VaultRow[] }) {
  const vaultRows = await Promise.all(vault.map(async (row) => {
    const encrypted = await encryptSecret(row.value, USER_ID, { playbookId: PLAYBOOK_ID, secretName: row.name });
    return {
      id: row.id,
      playbook_id: PLAYBOOK_ID,
      name: row.name,
      ...encrypted,
      allowed_hosts: row.allowed_hosts ?? null,
      use_count: 0,
    };
  }));
  const updates: Array<{ id: string }> = [];

  getServiceSupabaseMock.mockReturnValue({
    from(table: string) {
      if (table === "playbooks") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: PLAYBOOK_ID, user_id: USER_ID } }) }),
          }),
        };
      }
      if (table === "secrets") {
        return {
          select: () => ({
            eq: () => ({
              in: (_column: string, names: string[]) => Promise.resolve({
                data: vaultRows.filter((row) => names.includes(row.name)),
              }),
            }),
          }),
          update: () => ({
            eq: (_column: string, id: string) => {
              updates.push({ id });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  });

  return { updates };
}

beforeEach(() => {
  process.env.SECRETS_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SECRETS_ENCRYPTION_KEY;
});

describe("referencedSecretNames", () => {
  it("derives the names each auth type resolves at call time", () => {
    expect(referencedSecretNames(undefined)).toEqual([]);
    expect(referencedSecretNames({ auth: { type: "none" } })).toEqual([]);
    expect(referencedSecretNames({ auth: { type: "bearer" } })).toEqual(["token"]);
    expect(referencedSecretNames({ auth: { type: "bearer", token_secret: "SEARCH_TOKEN" } })).toEqual(["SEARCH_TOKEN"]);
    expect(referencedSecretNames({ auth: { type: "api_key", api_key_secret: "MY_KEY" } })).toEqual(["MY_KEY"]);
    expect(referencedSecretNames({ auth: { type: "oauth2_client_credentials" } }))
      .toEqual(["client_secret", "client_id"]);
    expect(referencedSecretNames({ auth: { type: "oauth2_client_credentials", client_id: "app", client_secret: "OAUTH_SECRET" } }))
      .toEqual(["OAUTH_SECRET"]);
  });
});

describe("loadFederationSecrets", () => {
  it("resolves a referenced name from the vault", async () => {
    await stubDatabase({
      vault: [{ id: "s1", name: "SEARCH_TOKEN", value: "vault-token-value" }],
    });
    const secrets = await loadFederationSecrets(
      server({ url: "https://mcp.example.com/http", auth: { type: "bearer", token_secret: "SEARCH_TOKEN" } }),
      PLAYBOOK_ID,
    );
    expect(secrets.SEARCH_TOKEN).toBe("vault-token-value");
  });

  it("only decrypts vault names the config references", async () => {
    await stubDatabase({
      vault: [
        { id: "s1", name: "SEARCH_TOKEN", value: "vault-token-value" },
        { id: "s2", name: "UNRELATED_KEY", value: "must-not-appear" },
      ],
    });
    const secrets = await loadFederationSecrets(
      server({ url: "https://mcp.example.com/http", auth: { type: "bearer", token_secret: "SEARCH_TOKEN" } }),
      PLAYBOOK_ID,
    );
    expect(secrets.SEARCH_TOKEN).toBe("vault-token-value");
    expect(secrets.UNRELATED_KEY).toBeUndefined();
  });

  it("honours an explicitly-set allowed_hosts list against the server's destinations", async () => {
    await stubDatabase({
      vault: [{ id: "s1", name: "SEARCH_TOKEN", value: "pinned-value", allowed_hosts: ["api.other.com"] }],
    });
    const secrets = await loadFederationSecrets(
      server({ url: "https://mcp.example.com/http", auth: { type: "bearer", token_secret: "SEARCH_TOKEN" } }),
      PLAYBOOK_ID,
    );
    // Pinned elsewhere: unresolved, so federation reports MISSING_SECRET by name.
    expect(secrets.SEARCH_TOKEN).toBeUndefined();
  });

  it("records vault use without failing the call if the update does", async () => {
    const { updates } = await stubDatabase({
      vault: [{ id: "s1", name: "SEARCH_TOKEN", value: "vault-token-value" }],
    });
    await loadFederationSecrets(
      server({ url: "https://mcp.example.com/http", auth: { type: "bearer", token_secret: "SEARCH_TOKEN" } }),
      PLAYBOOK_ID,
    );
    expect(updates).toEqual([{ id: "s1" }]);
  });

  it("makes no vault queries at all when the config references nothing", async () => {
    // The stub throws on any unexpected table, so reaching the database here
    // would fail rather than pass quietly.
    await stubDatabase({ vault: [] });
    const secrets = await loadFederationSecrets(
      server({ url: "https://mcp.example.com/http" }),
      PLAYBOOK_ID,
    );
    expect(secrets).toEqual({});
  });
});
