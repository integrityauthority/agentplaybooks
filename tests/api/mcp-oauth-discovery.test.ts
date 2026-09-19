import { describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import {
  oauthBearerChallenge,
  oauthResourceUrl,
  protectedResourceMetadata,
} from "@/lib/mcp-oauth";

describe("MCP OAuth protected-resource discovery", () => {
  it("publishes the management MCP resource and Supabase authorization server", async () => {
    const response = await GET(
      new Request("https://agentplaybooks.ai/.well-known/oauth-protected-resource/api/mcp/manage"),
      { params: Promise.resolve({ path: ["api", "mcp", "manage"] }) },
    );
    const metadata = await response.json();

    expect(response.status).toBe(200);
    expect(metadata.resource).toBe("https://agentplaybooks.ai/api/mcp/manage");
    expect(metadata.authorization_servers).toEqual([
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`,
    ]);
    expect(metadata.bearer_methods_supported).toEqual(["header"]);
  });

  it("keeps the resource in the challenge and metadata identical", () => {
    const resource = oauthResourceUrl("/api/mcp/private-playbook");
    const metadata = protectedResourceMetadata(resource);
    const challenge = oauthBearerChallenge(resource);

    expect(metadata.resource).toBe(resource);
    expect(challenge).toContain("/.well-known/oauth-protected-resource/api/mcp/private-playbook");
  });
});

