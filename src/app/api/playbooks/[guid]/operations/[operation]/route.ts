import { POST as handlePlaybookMcp } from "@/app/api/mcp/[guid]/route";
import { invokeMcpOperation } from "@/app/api/_shared/operation-http";

type RouteContext = { params: Promise<{ guid: string; operation: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { guid, operation } = await context.params;
  const args = await request.json().catch(() => ({}));
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return Response.json({ error: "JSON object body required" }, { status: 400 });
  }
  return invokeMcpOperation(
    handlePlaybookMcp,
    request,
    `/api/mcp/${encodeURIComponent(guid)}`,
    operation,
    args as Record<string, unknown>,
  );
}
