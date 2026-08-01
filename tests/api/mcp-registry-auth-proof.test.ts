import { expect, it } from "vitest";
import { GET } from "@/app/.well-known/mcp-registry-auth/route";

it("serves the public MCP Registry domain-authentication proof", async () => {
  const response = GET();

  expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  expect(await response.text()).toMatch(/^v=MCPv1; k=ed25519; p=[A-Za-z0-9+/]+={0,2}$/);
});
