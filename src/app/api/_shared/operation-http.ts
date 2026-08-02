type McpRouteHandler = (request: Request) => Response | Promise<Response>;

type McpError = {
  code?: number;
  message?: string;
};

function statusForMcpError(error: McpError): number {
  if (error.code === -32602) return 400;
  if (error.code === -32001) return 401;
  if (error.code === -32002) return 404;
  return 422;
}
/**
 * REST/OpenAPI is a projection over the same MCP operation handler. This keeps
 * protocol envelopes at the edge while preserving one operation implementation.
 */
export async function invokeMcpOperation(
  handler: McpRouteHandler,
  request: Request,
  endpointPath: string,
  operation: string,
  args: Record<string, unknown>,
): Promise<Response> {
  const endpointUrl = new URL(request.url);
  endpointUrl.pathname = endpointPath;
  endpointUrl.search = "";
  const rpcResponse = await handler(new Request(endpointUrl, {
    method: "POST",
    headers: new Headers(request.headers),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: operation, arguments: args },
    }),
  }));

  const payload = await rpcResponse.json() as {
    result?: { content?: Array<{ type?: string; text?: string }> };
    error?: McpError;
  };
  if (payload.error) {
    return Response.json(
      { error: payload.error.message || "Operation failed", code: payload.error.code },
      { status: statusForMcpError(payload.error) },
    );
  }

  const text = payload.result?.content?.find((item) => item.type === "text")?.text;
  if (text === undefined) return Response.json(payload.result ?? null);
  try {
    return Response.json(JSON.parse(text));
  } catch {
    return Response.json({ result: text });
  }
}
