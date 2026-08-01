import { spawn } from "node:child_process";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { loadCredentials, request, saveCredentials } from "./remote.js";

/**
 * Secret handling has one hard rule: a plaintext value never touches the disk.
 *
 * `push` reads a value from stdin or a named environment variable and sends it
 * straight to the encrypted vault. `run` fetches values into memory and injects
 * them into one child process. Nothing is written to a file, nothing is echoed,
 * and values never appear in argv — a command line lands in shell history and in
 * the process list of every other user on the machine.
 *
 * The vault endpoints authenticate with a playbook-scoped API key rather than the
 * account-wide user key used by push/pull. That is deliberate: the credential that
 * can touch secrets is limited to a single playbook.
 */

const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function savePlaybookKey(url, guid, apiKey, homedir) {
  const credentials = await loadCredentials(homedir);
  const remote = credentials.remotes[url] ?? {};
  remote.playbookKeys = { ...(remote.playbookKeys ?? {}), [guid]: apiKey };
  credentials.remotes[url] = remote;
  await saveCredentials(credentials, homedir);
}

export async function resolvePlaybookKey(url, guid, { env = process.env, homedir } = {}) {
  if (env.AGENTPLAYBOOKS_PLAYBOOK_KEY) return env.AGENTPLAYBOOKS_PLAYBOOK_KEY;
  const credentials = await loadCredentials(homedir);
  return credentials.remotes[url]?.playbookKeys?.[guid] ?? null;
}

export async function listVaultSecrets(url, guid, playbookKey, { fetchImpl } = {}) {
  const secrets = await request(url, `/api/playbooks/${guid}/secrets`, { apiKey: playbookKey, fetchImpl });
  return Array.isArray(secrets) ? secrets : [];
}

/**
 * Compare what the playbook says it needs against what the vault holds and what
 * is actually set in this shell. Reports names and state only — never a value.
 */
export function reconcileSecrets(manifestSecrets, vaultSecrets, env) {
  const vault = new Map(vaultSecrets.map((secret) => [secret.name, secret]));
  const rows = [];
  const seen = new Set();

  for (const required of manifestSecrets) {
    seen.add(required.name);
    const stored = vault.get(required.name);
    rows.push({
      name: required.name,
      ref: required.ref,
      required: required.required !== false,
      inEnvironment: Boolean(env[required.name]),
      inVault: Boolean(stored),
      revealable: stored ? Boolean(stored.allow_api_key_reveal) : false,
      expiresAt: stored?.expires_at ?? null,
    });
  }

  // Vault entries the manifest does not mention are still worth showing: they
  // are usually a rename or a secret only the hosted proxy uses.
  for (const stored of vaultSecrets) {
    if (seen.has(stored.name)) continue;
    rows.push({
      name: stored.name,
      ref: null,
      required: false,
      inEnvironment: Boolean(env[stored.name]),
      inVault: true,
      revealable: Boolean(stored.allow_api_key_reveal),
      expiresAt: stored.expires_at ?? null,
      vaultOnly: true,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Resolve the value to push without ever accepting it as a command-line
 * argument. `--from-env NAME` reads the current environment; otherwise the value
 * is read from stdin, so it can be piped from a password manager.
 */
export async function resolveSecretValue({ fromEnv, env = process.env } = {}) {
  if (fromEnv) {
    const value = env[fromEnv];
    if (!value) throw new Error(`Environment variable ${fromEnv} is empty or unset.`);
    return { value, origin: `environment variable ${fromEnv}` };
  }
  if (process.stdin.isTTY) {
    throw new Error("No value on stdin. Pipe the value in (for example `pass show api | apb secrets push NAME`) or use --from-env NAME.");
  }
  const value = (await readStdin()).replace(/\r?\n$/, "");
  if (!value) throw new Error("Nothing was received on stdin.");
  return { value, origin: "stdin" };
}

export function assertSecretName(name) {
  if (!SECRET_NAME_PATTERN.test(name)) {
    throw new Error(`'${name}' is not a valid secret name. Use letters, digits and underscores, starting with a letter or underscore.`);
  }
}

export async function createOrRotateSecret(url, guid, playbookKey, { name, value, existing, category, description, fetchImpl }) {
  if (existing) {
    // Rotation is an update of the named secret. Only `value` is sent, so the
    // reveal flag, host allow-list, category and expiry set by the owner stay
    // exactly as they are.
    return request(url, `/api/playbooks/${guid}/secrets/${encodeURIComponent(name)}`, {
      method: "PUT",
      apiKey: playbookKey,
      fetchImpl,
      body: { value },
    });
  }
  return request(url, `/api/playbooks/${guid}/secrets`, {
    method: "POST",
    apiKey: playbookKey,
    fetchImpl,
    body: {
      name,
      value,
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
    },
  });
}

async function revealSecret(url, guid, playbookKey, name, { fetchImpl } = {}) {
  const payload = await request(url, `/api/playbooks/${guid}/secrets/reveal/${encodeURIComponent(name)}`, {
    apiKey: playbookKey,
    fetchImpl,
  });
  const value = payload?.value ?? payload?.secret ?? payload?.plaintext;
  if (typeof value !== "string") throw new Error(`The reveal endpoint returned no value for ${name}.`);
  return value;
}

/**
 * Fetch the values a run needs into memory. Secrets the owner has not marked as
 * revealable stay in the vault: they are reported as skipped rather than
 * silently missing, because a half-configured run fails in confusing ways.
 */
export async function buildRunEnvironment(url, guid, playbookKey, names, { fetchImpl, baseEnv = process.env } = {}) {
  const injected = {};
  const skipped = [];
  for (const name of names) {
    if (baseEnv[name]) {
      skipped.push({ name, reason: "already set in this environment" });
      continue;
    }
    try {
      injected[name] = await revealSecret(url, guid, playbookKey, name, { fetchImpl });
    } catch (error) {
      skipped.push({ name, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { injected, skipped };
}

export function runWithEnvironment(command, args, injected) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      env: { ...process.env, ...injected },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code: code ?? 0, signal }));
  });
}

export async function readManifestSecrets(root) {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "agentplaybook.json"), "utf8"));
    const secrets = manifest?.spec?.secrets;
    return Array.isArray(secrets) ? secrets : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw new Error(`Cannot read agentplaybook.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}
