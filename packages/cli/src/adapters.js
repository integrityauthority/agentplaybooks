import { mkdir, copyFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "./discovery.js";

// Platform adapters describe where a deployment target keeps its skills and
// MCP server definitions. Only JSON-based targets are writable; TOML sources
// (Codex) stay read-only in this release.
const TARGET_ADAPTERS = {
  claude: { skillsDir: ".claude/skills", mcpPath: ".mcp.json" },
  cursor: { skillsDir: ".cursor/skills", mcpPath: ".cursor/mcp.json" },
};

const SAFE_SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

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

function skillActions(report, targetIds, conflicts) {
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
      if (variants.some((item) => item.platform === target)) continue;
      if (digests.size > 1) {
        conflicts.push(conflict(target, "skill", name, "Skill definitions differ across platforms; resolve the drift before syncing.", variants.map((item) => item.source)));
        continue;
      }
      if (!SAFE_SKILL_NAME.test(name)) {
        conflicts.push(conflict(target, "skill", name, "Skill name is not a safe lowercase kebab-case directory name.", variants.map((item) => item.source)));
        continue;
      }
      actions.push({
        kind: "skill",
        target,
        name,
        action: "create",
        path: `${adapter.skillsDir}/${name}/SKILL.md`,
        content: variants[0].content,
        from: variants[0].source,
      });
    }
  }
  return actions;
}

function mcpActions(report, targetIds, conflicts) {
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
      if (variants.some((item) => item.platform === target)) continue;
      const canonical = new Set(variants.map((item) => canonicalJson(item.definition)));
      if (canonical.size > 1) {
        conflicts.push(conflict(target, "mcp", name, "MCP server definitions differ across platforms; resolve the drift before syncing.", variants.map((item) => item.source)));
        continue;
      }
      additions[name] = variants[0].definition;
    }
    if (Object.keys(additions).length === 0) continue;

    const existing = report.inventory.mcpConfigs.find((config) => config.source === adapter.mcpPath);
    let document = { mcpServers: {} };
    if (existing) {
      try {
        document = JSON.parse(existing.content);
      } catch {
        conflicts.push(conflict(target, "mcp", adapter.mcpPath, "Existing MCP configuration is not valid JSON.", [existing.source]));
        continue;
      }
      if (!document.mcpServers || typeof document.mcpServers !== "object" || Array.isArray(document.mcpServers)) {
        document.mcpServers = {};
      }
    }
    for (const [name, definition] of Object.entries(additions)) {
      document.mcpServers[name] = definition;
    }
    actions.push({
      kind: "mcp-config",
      target,
      name: adapter.mcpPath,
      action: existing ? "merge" : "create",
      path: adapter.mcpPath,
      servers: Object.keys(additions).sort(),
      content: `${JSON.stringify(document, null, 2)}\n`,
    });
  }
  return actions;
}

/**
 * Plan the platform files each enabled target is missing. Conflicting
 * definitions are reported and skipped; nothing is ever silently overwritten
 * with a differing definition.
 */
export function planAdapters(report, targets) {
  const targetIds = targets
    .filter((target) => target.enabled && TARGET_ADAPTERS[target.type])
    .map((target) => target.type);
  const conflicts = [];
  const actions = [
    ...skillActions(report, targetIds, conflicts),
    ...mcpActions(report, targetIds, conflicts),
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

export async function applyAdapters(root, actions, backupDirectory) {
  const written = [];
  const backups = [];
  for (const action of actions) {
    const absolutePath = path.join(root, ...action.path.split("/"));
    if (action.action === "merge") {
      await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
      const backupPath = path.join(backupDirectory, action.path.split("/").join("__"));
      await copyFile(absolutePath, backupPath);
      backups.push(backupPath);
    }
    await atomicWrite(absolutePath, action.content);
    written.push(action.path);
  }
  return { written, backups };
}

// Exported for reuse by remote pull, which compares fetched content against
// local files using the same canonical comparison rules.
export { canonicalJson };
