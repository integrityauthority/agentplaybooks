import { SITE_URL } from "@/lib/site-url";

export const MANAGEMENT_MCP_PATH = "/api/mcp/manage";

export function oauthAuthorizationServer(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for MCP OAuth discovery");
  }

  return `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
}

export function oauthResourceUrl(path = MANAGEMENT_MCP_PATH): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
}

export function oauthResourceMetadataUrl(resource: string): string {
  const resourceUrl = new URL(resource);
  return `${resourceUrl.origin}/.well-known/oauth-protected-resource${resourceUrl.pathname}`;
}

export function oauthBearerChallenge(resource: string): string {
  return `Bearer resource_metadata="${oauthResourceMetadataUrl(resource)}"`;
}

export function protectedResourceMetadata(resource: string) {
  return {
    resource,
    authorization_servers: [oauthAuthorizationServer()],
    bearer_methods_supported: ["header"],
    resource_documentation: `${SITE_URL}/docs/management-api`,
  };
}

