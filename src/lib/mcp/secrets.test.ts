import { afterEach, describe, expect, it } from "vitest";
import { decryptMcpSecrets, encryptMcpSecrets } from "./secrets";

const originalKey = process.env.MCP_SECRET_ENCRYPTION_KEY;
const hexKey = "0123456789abcdef".repeat(4);
const passphraseKey = "a-passphrase-that-is-long-enough-32";
const serverId = "11111111-2222-4333-8444-555555555555";
const otherServerId = "99999999-8888-4777-8666-555555555555";
const payload = { token: "sk-federated-token", api_key: "ak-1234567890" };

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.MCP_SECRET_ENCRYPTION_KEY;
  } else {
    process.env.MCP_SECRET_ENCRYPTION_KEY = originalKey;
  }
});

describe("MCP federation secret encryption", () => {
  it("round-trips a payload for the server it was written for", async () => {
    process.env.MCP_SECRET_ENCRYPTION_KEY = hexKey;

    const encrypted = await encryptMcpSecrets(payload, serverId);
    expect(encrypted.encryptedPayload.startsWith("v2:")).toBe(true);
    expect(encrypted.encryptedPayload).not.toContain("sk-federated-token");

    await expect(
      decryptMcpSecrets(encrypted.encryptedPayload, encrypted.iv, serverId),
    ).resolves.toEqual(payload);
  });

  it("refuses a payload moved to a different server row", async () => {
    process.env.MCP_SECRET_ENCRYPTION_KEY = hexKey;
    const encrypted = await encryptMcpSecrets(payload, serverId);

    // Both the derived key and the authenticated server id differ, so a blob
    // copied between rows cannot be read.
    await expect(
      decryptMcpSecrets(encrypted.encryptedPayload, encrypted.iv, otherServerId),
    ).rejects.toThrow();
  });

  it("derives a different key per server", async () => {
    process.env.MCP_SECRET_ENCRYPTION_KEY = hexKey;

    const first = await encryptMcpSecrets(payload, serverId);
    const second = await encryptMcpSecrets(payload, otherServerId);
    expect(first.encryptedPayload).not.toEqual(second.encryptedPayload);
  });

  it("accepts a passphrase as well as a hex key, and keeps them distinct", async () => {
    process.env.MCP_SECRET_ENCRYPTION_KEY = passphraseKey;
    const encrypted = await encryptMcpSecrets(payload, serverId);
    await expect(
      decryptMcpSecrets(encrypted.encryptedPayload, encrypted.iv, serverId),
    ).resolves.toEqual(payload);

    process.env.MCP_SECRET_ENCRYPTION_KEY = hexKey;
    await expect(
      decryptMcpSecrets(encrypted.encryptedPayload, encrypted.iv, serverId),
    ).rejects.toThrow();
  });

  it("still reads payloads written in the previous format", async () => {
    process.env.MCP_SECRET_ENCRYPTION_KEY = passphraseKey;

    // Reproduce a pre-v2 row: SHA-256 of the configured value as the key, no
    // prefix, no additional data.
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(passphraseKey));
    const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(JSON.stringify(payload)),
    );
    const toBase64 = (bytes: Uint8Array) => {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    };

    await expect(
      decryptMcpSecrets(toBase64(new Uint8Array(ciphertext)), toBase64(iv), serverId),
    ).resolves.toEqual(payload);
  });

  it("requires a configured key and a server id", async () => {
    delete process.env.MCP_SECRET_ENCRYPTION_KEY;
    await expect(encryptMcpSecrets(payload, serverId)).rejects.toThrow("at least 32 characters");

    process.env.MCP_SECRET_ENCRYPTION_KEY = hexKey;
    await expect(encryptMcpSecrets(payload, "")).rejects.toThrow("server id is required");
  });
});
