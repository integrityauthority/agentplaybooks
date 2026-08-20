import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { isMap, parseDocument } from "yaml";
import { discover, discoverGlobal, normalizeText } from "./discovery.js";

/**
 * Adopting a credential that is already sitting in a config file.
 *
 * The rule the rest of the secret handling follows — a plaintext value never
 * touches the disk — does not help someone whose value is *already* on disk. This
 * module is the way out of that: find the literal, put it in the vault, record
 * the reference, and only then, only if asked, replace the literal with a
 * `${VAR}` reference.
 *
 * Two deliberate defaults:
 *
 * - **Nothing is rewritten unless the user names the file.** A config that works
 *   today must keep working; a rewrite that a client does not expand turns a
 *   working server into a 401 nobody can explain.
 * - **The original is never backed up.** Everywhere else in this CLI a replaced
 *   file is copied into `.agentplaybooks/backups/` first. Here that would write a
 *   second plaintext copy of the credential, which is the opposite of the point.
 */

// Keys whose value is a credential. The same vocabulary as doctor's line scan,
// but matched against a key rather than a line, so `X-MSSQL-Password-B64` counts
// and a prose sentence about passwords does not.
const CREDENTIAL_KEY = /(api[_-]?key|secret|token|password|passwd|credential|auth)/i;

// Values that are references already, or obvious examples. Adopting these would
// upload the placeholder as if it were the credential.
const NOT_A_VALUE = /^(\s*|\$\{.*\}|\$[A-Za-z_][A-Za-z0-9_]*|env:.*|vault:.*|\*+|x{3,}|\.{3}|<.*>|your[-_].*|changeme|placeholder|redacted|dummy|todo)$/i;

/**
 * Which clients are known to expand `${VAR}` in the file we would rewrite.
 *
 * `claude`: documented for `.mcp.json` — `${VAR}` and `${VAR:-default}`, in
 * command, args, env, url and headers.
 * `hermes`: documented for `config.yaml` — resolved from the environment, then
 * from `~/.hermes/.env`. Note it keeps an unset placeholder verbatim rather than
 * failing, so a rewrite with no value behind it fails silently at the server.
 * `cursor`: reported to work by users, not documented by Cursor. Rewriting is
 * allowed when the user names the file explicitly, with that stated.
 * `codex`: its TOML config is not rewritten at all — see the roadmap.
 */
const EXPANSION_SUPPORT = {
  claude: "documented",
  hermes: "documented",
  portable: "documented",
  cursor: "undocumented",
  codex: "unsupported",
  generic: "unknown",
};

/** `X-MSSQL-Password-B64` → `MSSQL_PASSWORD_B64`, `api_key` → `API_KEY`. */
export function variableNameFor(keyPath, prefix = "") {
  const key = keyPath[keyPath.length - 1] ?? "secret";
  const cleaned = String(key)
    .replace(/^x[-_]/i, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  const name = cleaned.length > 0 ? cleaned : "SECRET";
  return `${prefix}${/^[A-Za-z_]/.test(name) ? name : `S_${name}`}`;
}

function isCredentialLeaf(keyPath, value) {
  if (typeof value !== "string" || NOT_A_VALUE.test(value)) return false;
  return keyPath.some((key) => CREDENTIAL_KEY.test(String(key)));
}

/** Every credential-looking string in a parsed config, with the path to it. */
function walkForCredentials(value, keyPath, found) {
  if (value === null || value === undefined) return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForCredentials(item, [...keyPath, index], found));
    return found;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walkForCredentials(child, [...keyPath, key], found);
    }
    return found;
  }
  if (isCredentialLeaf(keyPath, value)) found.push({ keyPath, value });
  return found;
}

function parseConfig(source, content) {
  if (/\.ya?ml$/i.test(source)) {
    const document = parseDocument(content, { strict: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return null;
    return { format: "yaml", data: document.toJSON() };
  }
  if (/\.toml$/i.test(source)) return { format: "toml", data: null };
  try {
    return { format: "json", data: JSON.parse(content) };
  } catch {
    return null;
  }
}

/**
 * Plan what could be adopted from an inventory's MCP configuration files.
 *
 * Values are grouped: the same credential in three clients is one vault entry
 * under one name, not three. The value itself is carried in memory for the apply
 * step and is never part of what gets printed or serialized.
 */
export function planAdoption(inventory, { prefix = "" } = {}) {
  const byValue = new Map();
  const skipped = [];

  for (const config of inventory.mcpConfigs) {
    const parsed = parseConfig(config.source, normalizeText(config.content));
    if (parsed === null) {
      skipped.push({ source: config.source, reason: "Configuration could not be parsed." });
      continue;
    }
    if (parsed.format === "toml") {
      skipped.push({ source: config.source, reason: "TOML configuration is not rewritten yet; adopt the value by hand or use 'secrets run'." });
      continue;
    }
    for (const { keyPath, value } of walkForCredentials(parsed.data, [], [])) {
      const entry = byValue.get(value) ?? { name: null, value, occurrences: [] };
      entry.occurrences.push({
        source: config.source,
        platform: config.platform,
        format: parsed.format,
        keyPath,
        expansion: EXPANSION_SUPPORT[config.platform] ?? "unknown",
      });
      byValue.set(value, entry);
    }
  }

  const used = new Set();
  const secrets = [];
  for (const entry of byValue.values()) {
    let name = variableNameFor(entry.occurrences[0].keyPath, prefix);
    let suffix = 2;
    while (used.has(name)) name = `${variableNameFor(entry.occurrences[0].keyPath, prefix)}_${suffix++}`;
    used.add(name);
    secrets.push({ ...entry, name });
  }

  secrets.sort((a, b) => a.name.localeCompare(b.name));
  return { secrets, skipped };
}

/** What is safe to print: names, places, and a length. Never a value. */
export function publicAdoption(plan) {
  return {
    secrets: plan.secrets.map((secret) => ({
      name: secret.name,
      length: secret.value.length,
      occurrences: secret.occurrences.map((item) => ({
        source: item.source,
        key: item.keyPath.join("."),
        expansion: item.expansion,
      })),
    })),
    skipped: plan.skipped,
  };
}

function setIn(target, keyPath, value) {
  let cursor = target;
  for (const key of keyPath.slice(0, -1)) cursor = cursor?.[key];
  if (cursor === undefined || cursor === null) return false;
  cursor[keyPath[keyPath.length - 1]] = value;
  return true;
}

/**
 * Replace one literal with a `${VAR}` reference, in place, preserving everything
 * else about the document — for YAML that means comments and key order too.
 */
export function rewriteConfig(content, format, occurrences, names) {
  const normalized = normalizeText(content);
  if (format === "yaml") {
    const document = parseDocument(normalized, { strict: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return null;
    for (const [index, occurrence] of occurrences.entries()) {
      if (document.getIn(occurrence.keyPath) === undefined) return null;
      document.setIn(occurrence.keyPath, `\${${names[index]}}`);
    }
    const serialized = document.toString({ lineWidth: 0 });
    return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
  }
  let document;
  try {
    document = JSON.parse(normalized);
  } catch {
    return null;
  }
  for (const [index, occurrence] of occurrences.entries()) {
    if (!setIn(document, occurrence.keyPath, `\${${names[index]}}`)) return null;
  }
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Write the rewritten configuration. No backup of the original is taken: it holds
 * the credential, and the value is in the vault by the time this runs.
 */
export async function applyRewrite(absolutePath, content) {
  const temporary = path.join(path.dirname(absolutePath), `.${path.basename(absolutePath)}.${process.pid}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, absolutePath);
}

export async function readConfigForRewrite(absolutePath) {
  return normalizeText(await readFile(absolutePath, "utf8"));
}

/** The configuration to scan: one project, or every store this machine has. */
export async function inventoryForAdoption({ global = false, root } = {}) {
  return global ? discoverGlobal() : discover(root);
}
