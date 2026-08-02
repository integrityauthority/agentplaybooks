import { describe, expect, it, vi } from "vitest";
import { invokeMcpOperation } from "@/app/api/_shared/operation-http";

describe("REST/OpenAPI operation projection", () => {
  it("passes the REST body to the MCP operation handler and unwraps its result", async () => {
    const handler = vi.fn(async (request: Request) => {
      const body = await request.json();
      expect(new URL(request.url).pathname).toBe("/api/mcp/demo");
      expect(body.params).toEqual({ name: "write_memory", arguments: { key: "k", value: { ok: true } } });
      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: JSON.stringify({ saved: true }) }] },
      });
    });

    const response = await invokeMcpOperation(
      handler,
      new Request("https://agentplaybooks.ai/api/playbooks/demo/operations/write_memory", {
        method: "POST",
        headers: { Authorization: "Bearer apb_test" },
      }),
      "/api/mcp/demo",
      "write_memory",
      { key: "k", value: { ok: true } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("maps JSON-RPC argument errors to an HTTP client error", async () => {
    const response = await invokeMcpOperation(
      async () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "playbook_id is required" } }),
      new Request("https://agentplaybooks.ai/api/control/write_memory", { method: "POST" }),
      "/api/mcp/manage",
      "write_memory",
      {},
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "playbook_id is required", code: -32602 });
  });
});
