import { hashApiKey } from "@/lib/utils";
import { getServiceSupabase, getSupabase } from "./supabase";
import type { ApiKey, UserApiKeysRow } from "@/lib/supabase/types";

type ApiKeyWithPlaybook = ApiKey & {
  playbooks: { id: string; guid: string };
};

type UserApiKeyData = UserApiKeysRow & { user_id: string };

/**
 * Resolve the signed-in user from the request's bearer token.
 *
 * The browser keeps its Supabase session in localStorage and sends it as an
 * Authorization header (see `src/lib/auth-fetch.ts`); nothing in this app ever
 * writes `sb-access-token` / `sb-refresh-token` cookies. A cookie branch used
 * to be read here, which meant any co-hosted app or proxy able to set a cookie
 * on this domain could impersonate a user. It has been removed.
 */
export async function getAuthenticatedUser(request?: Request): Promise<{ id: string } | null> {
  const supabase = getSupabase();

  if (request) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ") && !authHeader.startsWith("Bearer apb_")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        return { id: user.id };
      }
    }
  }

  return null;
}

export async function requireAuth(request: Request): Promise<{ id: string } | null> {
  const user = await getAuthenticatedUser(request);
  return user || null;
}

export async function validateApiKey(
  request: Request,
  requiredPermission: string
): Promise<ApiKeyWithPlaybook | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();
  const { data: apiKeyData, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !apiKeyData) {
    return null;
  }

  if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
    return null;
  }

  if (apiKeyData.role === 'admin') {
    // Admin has full access
  } else if (!apiKeyData.permissions.includes(requiredPermission) && !apiKeyData.permissions.includes("full")) {
    return null;
  }

  const { data: playbook, error: playbookError } = await supabase
    .from("playbooks")
    .select("id, guid")
    .eq("id", apiKeyData.playbook_id)
    .maybeSingle();

  if (playbookError || !playbook) {
    return null;
  }

  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyData.id);

  return { ...apiKeyData, playbooks: playbook } as ApiKeyWithPlaybook;
}

export async function validateUserApiKey(
  request: Request,
  requiredPermission: string
): Promise<UserApiKeyData | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer apb_")) {
    return null;
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashApiKey(apiKey);
  const supabase = getServiceSupabase();
  const { data: userKeyData, error } = await supabase
    .from("user_api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !userKeyData) {
    return null;
  }

  if (userKeyData.expires_at && new Date(userKeyData.expires_at) < new Date()) {
    return null;
  }

  if (!userKeyData.permissions.includes(requiredPermission) && !userKeyData.permissions.includes("full")) {
    return null;
  }

  await supabase
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", userKeyData.id);

  return userKeyData as UserApiKeyData;
}

export async function getUserFromAuthOrApiKey(
  request: Request,
  requiredPermission: string
): Promise<{ id: string } | null> {
  const user = await getAuthenticatedUser(request);
  if (user) {
    return user;
  }

  const userApiKey = await validateUserApiKey(request, requiredPermission);
  if (userApiKey) {
    return { id: userApiKey.user_id };
  }

  return null;
}
