import { access, mkdir, copyFile, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizePath, normalizeText } from "./discovery.js";

// Platform adapters describe where a deployment target keeps its skills and
// MCP server definitions.
//
// - `platforms` lists the inventory platform labels that count as "already on
//   this target" (antigravity reads the portable .agents store).
// - `home: true` targets live in the user's home directory (Hermes Agent has
//   no project-scoped skill store); their destinations are checked on disk at
//   plan time because they are outside the scanned project.
// - `format` selects the MCP config writer. Codex uses TOML.
const TARGET_ADAPTERS = {
  claude: { platforms: ["claude"], skillsDir: ".claude/skills", mcpPath: ".mcp.json", format: "json" },
  cursor: { platforms: ["cursor"], skillsDir: ".cursor/skills", mcpPath: ".cursor/mcp.json", format: "json" },
  codex: { platforms: ["codex"], skillsDir: ".codex/skills", mcpPath: ".codex/config.toml", format: "toml" },
  antigravity: { platforms: ["antigravity", "portable"], skillsDir: ".agents/skills" },
  hermes: { platforms: ["hermes"], skillsDir: ".hermes/skills", home: true },
};

const SAFE_SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

// Target types `sync` can write files for, and the home-directory marker that
// indicates the user has that tool installed at all. The marker is only used to
// suggest targets; nothing is ever enabled or written without the user asking.
export const ADAPTER_TARGET_TYPES = Object.keys(TARGET_ADAPTERS);
export const TARGET_HOME_MARKERS = {
  claude: ".claude",
  cursor: ".cursor",
  codex: ".codex",
  antigravity: ".gemini",
  hermes: ".hermes",
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function conflict(target, kind, name, reason, sources) {
  return { target, kind, name, reason, sources: sources.map(normalizePath) };
}

function absoluteFor(root, homedir, adapter, relativePath) {
  const base = adapter.home ? homedir : root;
  return path.join(base, ...relativePath.split("/"));
}

function displayPath(adapter, relativePath) {
  return adapter.home ? `~/${relativePath}` : relativePath;
}

async function readIfExists(absolutePath) {
  try {
    return normalizeText(await readFile(absolutePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function skillActions(report, targetIds, conflicts, { root, homedir }) {
  const actions = [];
  const groups = new Map();
  for (const skill of report.inventory.skills) {
    const group = groups.get(skill.name) ?? [];
    group.push(skill);
    groups.set(skill.name, group);
  }

  for (const [name, variants] of groups) {
    const digests = new Set(variants.map((item) => item.digest));
    for (const target of targetIds) {
      const adapter = TARGET_ADAPTERS[target];
      if (!adapter?.skillsDir) continue;
      if (variants.some((item) => adapter.platforms.includes(item.platform))) continue;
      if (digests.size > 1) {
        conflicts.push(conflict(target, "skill", name, "Skill definitions differ across platforms; resolve the drift before syncing.", variants.map((item) => item.source)));
        continue;
      }
      if (!SAFE_SKILL_NAME.test(name)) {
        conflicts.push(conflict(target, "skill", name, "Skill name is not a safe lowercase kebab-case directory name.", variants.map((item) => item.source)));
        continue;
      }
      const relativePath = `${adapter.skillsDir}/${name}/SKILL.md`;
      const absolutePath = absoluteFor(root, homedir, adapter, relativePath);
      // Home-scoped destinations are outside the scanned project, so check
      // the file itself before planning a write.
      if (adapter.home) {
        const existing = await readIfExists(absolutePath);
        if (existing === variants[0].content) continue;
        if (existing !== null) {
          conflicts.push(conflict(target, "skill", name, `Existing ${displayPath(adapter, relativePath)} differs; not overwritten.`, variants.map((item) => item.source)));
          continue;
        }
      }
      actions.push({
        kind: "skill",
        target,
        name,
        action: "create",
        path: displayPath(adapter, relativePath),
        absolutePath,
        content: variants[0].content,
        from: variants[0].source,
      });
    }
  }
  return actions;
}

// --- MCP config writers -----------------------------------------------------

function tomlString(value) {
  return JSON.stringify(String(value));
}

/**
 * Serialize one MCP server definition as `[mcp_servers.<name>]` TOML
 * sections. Returns null when the definition uses shapes the writer cannot
 * represent; the caller reports a conflict instead of writing a lossy config.
 */
function tomlServerSections(name, definition) {
  const known = new Set(["command", "url", "args", "env"]);
  if (Object.keys(definition ?? {}).some((key) => !known.has(key))) return null;
  const lines = [`[mcp_servers.${name}]`];
  if (typeof definition.command === "string") lines.push(`command = ${tomlString(definition.command)}`);
  if (typeof definition.url === "string") lines.push(`url = ${tomlString(definition.url)}`);
  if (definition.args !== undefined) {
    if (!Array.isArray(definition.args) || definition.args.some((item) => typeof item !== "string")) return null;
    lines.push(`args = [${definition.args.map(tomlString).join(", ")}]`);
  }
  if (definition.env !== undefined) {
    const entries = Object.entries(definition.env ?? {});
    if (entries.some(([, value]) => typeof value !== "string")) return null;
    if (entries.length > 0) {
      lines.push("", `[mcp_servers.${name}.env]`);
      for (const [key, value] of entries) lines.push(`${key} = ${tomlString(value)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function mergedTomlContent(existingContent, additions, target, conflicts, existingSource) {
  const sections = [];
  for (const [name, definition] of Object.entries(additions)) {
    const section = tomlServerSections(name, definition);
    if (section === null) {
      conflicts.push(conflict(target, "mcp", name, "MCP server definition cannot be represented in Codex TOML; add it to .codex/config.toml manually.", [existingSource]));
      continue;
    }
    sections.push(section);
  }
  if (sections.length === 0) return { content: null, added: [] };
  const base = existingContent ? `${existingContent.replace(/\s*$/, "")}\n\n` : "";
  return { content: `${base}${sections.join("\n")}`, added: Object.keys(additions) };
}

function mergedJsonContent(existingContent, additions, target, conflicts, mcpPath) {
  let document = { mcpServers: {} };
  if (existingContent !== null) {
    try {
      document = JSON.parse(existingContent);
    } catch {
      conflicts.push(conflict(target, "mcp", mcpPath, "Existing MCP configuration is not valid JSON.", [mcpPath]));
      return { content: null, added: [] };
    }
    if (!document.mcpServers || typeof document.mcpServers !== "object" || Array.isArray(document.mcpServers)) {
      document.mcpServers = {};
    }
  }
  for (const [name, definition] of Object.entries(additions)) {
    document.mcpServers[name] = definition;
  }
  return { content: `${JSON.stringify(document, null, 2)}\n`, added: Object.keys(additions) };
}

function mcpActions(report, targetIds, conflicts, { root, homedir }) {
  const actions = [];
  const groups = new Map();
  for (const server of report.inventory.mcpServers) {
    const group = groups.get(server.name) ?? [];
    group.push(server);
    groups.set(server.name, group);
  }

  for (const target of targetIds) {
    const adapter = TARGET_ADAPTERS[target];
    if (!adapter?.mcpPath) continue;

    const additions = {};
    for (const [name, variants] of groups) {
      if (variants.some((item) => adapter.platforms.includes(item.platform))) continue;
      const canonical = new Set(variants.map((item) => canonicalJson(item.definition)));
      if (canonical.size > 1) {
        conflicts.push(conflict(target, "mcp", name, "MCP server definitions differ across platforms; resolve the drift before syncing.", variants.map((item) => item.source)));
        continue;
      }
      additions[name] = variants[0].definition;
    }
    if (Object.keys(additions).length === 0) continue;

    const existing = report.inventory.mcpConfigs.find((config) => config.source === adapter.mcpPath);
    const existingContent = existing ? existing.content : null;
    const merged = adapter.format === "toml"
      ? mergedTomlContent(existingContent, additions, target, conflicts, adapter.mcpPath)
      : mergedJsonContent(existingContent, additions, target, conflicts, adapter.mcpPath);
    if (merged.content === null || merged.added.length === 0) continue;

    actions.push({
      kind: "mcp-config",
      target,
      name: adapter.mcpPath,
      action: existing ? "merge" : "create",
      path: displayPath(adapter, adapter.mcpPath),
      absolutePath: absoluteFor(root, homedir, adapter, adapter.mcpPath),
      servers: merged.added.sort(),
      content: merged.content,
    });
  }
  return actions;
}

/**
 * Which agent tools this user appears to have installed. Used to suggest
 * targets when a project has none — for example right after `pull` on a new
 * machine, where the portable store is the only thing on disk.
 */
export async function detectInstalledTargets(homedir = os.homedir()) {
  const detected = [];
  for (const [type, marker] of Object.entries(TARGET_HOME_MARKERS)) {
    try {
      await access(path.join(homedir, marker));
      detected.push(type);
    } catch {
      continue;
    }
  }
  return detected;
}

/**
 * Plan the platform files each enabled target is missing. Conflicting
 * definitions are reported and skipped; nothing is ever silently overwritten
 * with a differing definition.
 */
export async function planAdapters(report, targets, { homedir = os.homedir() } = {}) {
  const root = report.inventory.root;
  const targetIds = targets
    .filter((target) => target.enabled && TARGET_ADAPTERS[target.type])
    .map((target) => target.type);
  const conflicts = [];
  const actions = [
    ...await skillActions(report, targetIds, conflicts, { root, homedir }),
    ...mcpActions(report, targetIds, conflicts, { root, homedir }),
  ];
  actions.sort((a, b) => a.path.localeCompare(b.path));
  return { actions, conflicts };
}

async function atomicWrite(absolutePath, content) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const tempPath = path.join(path.dirname(absolutePath), `.${path.basename(absolutePath)}.${process.pid}.tmp`);
  await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, absolutePath);
}

export async function applyAdapters(actions, backupDirectory) {
  const written = [];
  const backups = [];
  for (const action of actions) {
    if (action.action === "merge") {
      await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
      const backupPath = path.join(backupDirectory, action.path.replace(/^~\//, "HOME/").split("/").join("__"));
      await copyFile(action.absolutePath, backupPath);
      backups.push(backupPath);
    }
    await atomicWrite(action.absolutePath, action.content);
    written.push(action.path);
  }
  return { written, backups };
}

// Exported for reuse by remote pull, which compares fetched content against
// local files using the same canonical comparison rules.
export { canonicalJson };
