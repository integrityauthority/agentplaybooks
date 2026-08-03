import { NextRequest, NextResponse } from "next/server";
import { normalizeRegistryResponse, type OfficialRegistryResponse } from "@/lib/mcp-registry";

const REGISTRY_SERVERS_URL = "https://registry.modelcontextprotocol.io/v0.1/servers";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
    : 50;
  const registryUrl = new URL(REGISTRY_SERVERS_URL);
  registryUrl.searchParams.set("version", "latest");
  registryUrl.searchParams.set("limit", String(limit));
  if (search) registryUrl.searchParams.set("search", search);

  try {
    const response = await fetch(registryUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Official MCP Registry returned HTTP ${response.status}.` },
        { status: 502 },
      );
    }

    const payload = await response.json() as OfficialRegistryResponse;
    return NextResponse.json(normalizeRegistryResponse(payload));
  } catch (error) {
    console.error("Official MCP Registry search failed:", error);
    return NextResponse.json(
      { error: "The Official MCP Registry is temporarily unavailable." },
      { status: 502 },
    );
  }
}
