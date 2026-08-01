/**
 * Encryption for federated MCP server credentials.
 *
 * The playbook secrets vault (src/lib/crypto.ts) derives a key per user and
 * binds each ciphertext to the row it belongs to. This store used to do neither:
 * one global key encrypted every server's credentials, and a payload was not
 * tied to its server, so a blob copied into another row would still decrypt.
 *
 * New writes are `v2:` and close both gaps:
 *   - the AES key is derived per server via HKDF (salt = mcp_server_id), so one
 *     server's key material is useless against another's payload;
 *   - the server id is authenticated as GCM additional data, so a payload only
 *     decrypts in the row it was written for.
 *
 * Payloads without the prefix are the previous format and are still readable, so
 * no migration or re-encryption window is needed. They upgrade to v2 the next
 * time their server's secrets are saved.
 *
 * Merging this store into the playbook vault is the medium-term goal; see the
 * roadmap. Until then it should not be the weaker of the two.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // 96 bits, the recommended size for GCM
const V2_PREFIX = "v2:";
const V2_INFO = "agentplaybooks-mcp-secrets-v2";
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

export type EncryptedSecretPayload = {
  encryptedPayload: string;
  iv: string;
};

export async function encryptMcpSecrets(
  secrets: Record<string, unknown>,
  serverId: string,
  encryptionKey = process.env.MCP_SECRET_ENCRYPTION_KEY,
): Promise<EncryptedSecretPayload> {
  assertServerId(serverId);
  const key = await deriveServerKey(serverId, encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, additionalData: additionalData(serverId) },
    key,
    encoder.encode(JSON.stringify(secrets)),
  );
  return {
    encryptedPayload: V2_PREFIX + toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

export async function decryptMcpSecrets(
  encryptedPayload: string,
  iv: string,
  serverId: string,
  encryptionKey = process.env.MCP_SECRET_ENCRYPTION_KEY,
): Promise<Record<string, unknown>> {
  assertServerId(serverId);
  const isV2 = encryptedPayload.startsWith(V2_PREFIX);
  const ciphertext = isV2 ? encryptedPayload.slice(V2_PREFIX.length) : encryptedPayload;
  const key = isV2
    ? await deriveServerKey(serverId, encryptionKey)
    : await legacyKey(encryptionKey);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: fromBase64(iv),
      ...(isV2 ? { additionalData: additionalData(serverId) } : {}),
    },
    key,
    fromBase64(ciphertext),
  );
  const value: unknown = JSON.parse(decoder.decode(decrypted));
  if (!isRecord(value)) throw new Error("Decrypted MCP secret payload is invalid");
  return value;
}

function assertServerId(serverId: string) {
  if (!serverId) {
    throw new Error("An MCP server id is required to encrypt or decrypt its secrets");
  }
}

function additionalData(serverId: string) {
  return encoder.encode([V2_INFO, serverId].join("\0"));
}

/**
 * A hex key is used as raw 32-byte material; anything else is hashed first, which
 * is how the previous format derived its key. Either way the result is only base
 * material — HKDF turns it into a distinct key per server.
 */
async function keyMaterial(value?: string): Promise<ArrayBuffer> {
  if (!value || value.length < 32) {
    throw new Error("MCP_SECRET_ENCRYPTION_KEY must contain at least 32 characters");
  }
  if (HEX_KEY_PATTERN.test(value)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      bytes[index] = parseInt(value.substring(index * 2, index * 2 + 2), 16);
    }
    return bytes.buffer;
  }
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

async function deriveServerKey(serverId: string, encryptionKey?: string) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    await keyMaterial(encryptionKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(serverId),
      info: encoder.encode(V2_INFO),
    },
    baseKey,
    { name: ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** The pre-v2 derivation: SHA-256 of the configured value, shared by all servers. */
async function legacyKey(encryptionKey?: string) {
  if (!encryptionKey || encryptionKey.length < 32) {
    throw new Error("MCP_SECRET_ENCRYPTION_KEY must contain at least 32 characters");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(encryptionKey));
  return crypto.subtle.importKey("raw", digest, { name: ALGORITHM }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
