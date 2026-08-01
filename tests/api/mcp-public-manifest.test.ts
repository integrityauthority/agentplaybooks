import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/mcp/[guid]/route";
import { getSupabase, getServiceSupabase } from "@/app/api/_shared/supabase";
import { validateApiKey } from "@/app/api/_shared/auth";

/**
 * The public MCP manifest is the endpoint every MCP client hits first, and it
 * is deliberately reachable without credentials for a `public` playbook. It
 * reaches the database through the *anon* Supabase client, which means it also
 * depends on the anon SELECT policies in
 * `supabase/migrations/20260107_permissions_refactor.sql`.
 *
 * That makes it easy to break in two ways that nothing else would catch:
 *  - "tidying up" the route to use the service-role client, silently dropping
 *    the row-level safety net behind the visibility filter; or
 *  - removing the anon policies as apparently-dead code.
 *
 * These tests pin the first. The second is a database-level concern that a
 * mocked unit test cannot observe — it needs an integration test against a real
 * Postgres, which this suite does not yet have.
 */

vi.mock("@/app/api/_shared/supabase", () => ({
  getSupabase: vi.fn(),
  getServiceSupabase: vi.fn(),
}));

vi.mock("@/app/api/_shared/auth", () => ({
  validateApiKey: vi.fn(),
}));

vi.mock("@/lib/mcp/federation", () => ({
  federatedTools: vi.fn().mockResolvedValue([]),
  federatedResources: vi.fn().mockResolvedValue([]),
  callFederatedTool: vi.fn(),
  readFederatedResource: vi.fn(),
}));

vi.mock("@/lib/mcp/secrets", () => ({
  decryptMcpSecrets: vi.fn().mockResolvedValue({}),
}));

const publicPlaybook = {
  id: "playbook-1",
  guid: "public-guid",
  user_id: "owner-1",
  name: "Public Playbook",
  description: "Shared with everyone",
  visibility: "public",
  config: {},
  persona_name: "Helper",
  persona_system_prompt: "You are helpful.",
  persona_metadata: null,
  star_count: 0,
  tags: [],
  publisher_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/** Minimal chainable Supabase stub that records the columns requested. */
function stubClient(playbook: unknown, capture?: { select?: string }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn((columns: string) => {
    if (capture) capture.select = columns;
    return builder;
  });
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.single = vi.fn().mockResolvedValue({ data: playbook, error: null });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: playbook, error: null });
  builder.then = undefined;

  return { from: vi.fn(() => builder) };
}

describe("GET /api/mcp/:guid — public manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateApiKey).mockResolvedValue(null);
  });

  it("serves a public playbook to an unauthenticated caller", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      stubClient(publicPlaybook) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient([]) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    const res = await GET(new Request("http://localhost/api/mcp/public-guid"));

    expect(res.status).toBe(200);
    // No credential was presented, so the anon path must have served this.
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it("reads the playbook through the anon client, not the service-role client", async () => {
    const anon = stubClient(publicPlaybook);
    vi.mocked(getSupabase).mockReturnValue(anon as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient([]) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    await GET(new Request("http://localhost/api/mcp/public-guid"));

    expect(anon.from).toHaveBeenCalledWith("playbooks");
  });

  it("requests an explicit column list rather than '*'", async () => {
    const capture: { select?: string } = {};
    vi.mocked(getSupabase).mockReturnValue(
      stubClient(publicPlaybook, capture) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient([]) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    await GET(new Request("http://localhost/api/mcp/public-guid"));

    expect(capture.select).toBeDefined();
    expect(capture.select).not.toBe("*");
    expect(capture.select).toContain("persona_system_prompt");
  });

  it("falls back to API-key auth when the playbook is not public", async () => {
    vi.mocked(getSupabase).mockReturnValue(
      stubClient(null) as unknown as ReturnType<typeof getSupabase>,
    );
    vi.mocked(getServiceSupabase).mockReturnValue(
      stubClient(null) as unknown as ReturnType<typeof getServiceSupabase>,
    );

    const res = await GET(new Request("http://localhost/api/mcp/private-guid"));

    expect(validateApiKey).toHaveBeenCalled();
    expect(res.status).toBe(404);
  });
});
