import path from "node:path";
import { isMap, parseDocument } from "yaml";
import { digest, normalizePath } from "./discovery.js";

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER_PATTERN = /^(?:\$\{|\{\{|<|your[_-]|example|changeme|replace[_-]|env:|vault:|secret:)/i;
const CREDENTIAL_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{20,}\b/,
  /\bgh[pousr]_[a-zA-Z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|client[_-]?secret)\s*[=:]\s*["']?([^\s,"'}]+)/i,
];

function finding(severity, code, message, source, details = {}) {
  return { severity, code, message, source: normalizePath(source), ...details };
}

function groupBy(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { values: {}, valid: false, body: content };
  const document = parseDocument(match[1], { strict: true, uniqueKeys: true });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return { values: {}, valid: false, body: content.slice(match[0].length) };
  }
  const values = document.toJS();
  return {
    values: values && typeof values === "object" && !Array.isArray(values) ? values : {},
    valid: true,
    body: content.slice(match[0].length),
  };
}

function credentialLines(content) {
  const results = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const pattern of CREDENTIAL_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const candidate = match[1] ?? match[0];
      if (!PLACEHOLDER_PATTERN.test(candidate.trim())) results.push(index + 1);
      break;
    }
  }
  return [...new Set(results)];
}

function findMcpCollections(value, collections = []) {
  if (!value || typeof value !== "object") return collections;
  if (!Array.isArray(value) && value.mcpServers && typeof value.mcpServers === "object") {
    collections.push(value.mcpServers);
  }
  for (const child of Object.values(value)) findMcpCollections(child, collections);
  return collections;
}

function transportFor(server) {
  if (typeof server?.url === "string") return server.url.includes("/sse") ? "sse" : "http";
  if (typeof server?.command === "string") return "stdio";
  return "unknown";
}

export function parseTomlServers(content) {
  const servers = [];
  // Matches both `[mcp_servers.name]` and its `.env` sub-table.
  const sectionPattern = /^\[mcp_servers\.([A-Za-z0-9_-]+)(\.env)?\]\s*$/gm;
  const matches = [...content.matchAll(sectionPattern)];
  const byName = new Map();
  for (const [index, match] of matches.entries()) {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? content.length;
    const block = content.slice(start, end);
    const definition = byName.get(match[1]) ?? {};
    byName.set(match[1], definition);

    if (match[2]) {
      const env = {};
      for (const line of block.matchAll(/^([A-Za-z0-9_]+)\s*=\s*["']([^"']*)["']\s*$/gm)) {
        env[line[1]] = line[2];
      }
      if (Object.keys(env).length) definition.env = env;
      continue;
    }
    const url = block.match(/^url\s*=\s*["']([^"']+)["']/m)?.[1];
    const command = block.match(/^command\s*=\s*["']([^"']+)["']/m)?.[1];
    const argsSource = block.match(/^args\s*=\s*\[([^\]]*)\]/m)?.[1];
    if (url !== undefined) definition.url = url;
    if (command !== undefined) definition.command = command;
    if (argsSource !== undefined) {
      definition.args = [...argsSource.matchAll(/["']([^"']*)["']/g)].map((item) => item[1]);
    }
  }
  for (const [name, definition] of byName) {
    servers.push({
      name,
      definition,
      transport: definition.url ? (definition.url.includes("/sse") ? "sse" : "http") : definition.command ? "stdio" : "unknown",
    });
  }
  return servers;
}

export function analyze(inventory) {
  const findings = [];
  const skills = [];
  const mcpServers = [];

  for (const instruction of inventory.instructions) {
    const lines = credentialLines(instruction.content);
    if (lines.length) {
      findings.push(finding("critical", "secret.hardcoded", "Possible hard-coded credential found in agent instructions; only line numbers are reported.", instruction.source, { lines }));
    }
  }

  for (const skill of inventory.skills) {
    const frontmatter = parseFrontmatter(skill.content);
    const parentName = path.basename(path.dirname(skill.source));
    const name = typeof frontmatter.values.name === "string" ? frontmatter.values.name : parentName;
    const description = typeof frontmatter.values.description === "string" ? frontmatter.values.description : "";
    skills.push({ ...skill, name, description });

    if (!frontmatter.valid) {
      findings.push(finding("high", "skill.frontmatter.invalid", "SKILL.md must start with valid YAML frontmatter.", skill.source));
    }
    if (typeof frontmatter.values.name !== "string" || frontmatter.values.name.length === 0) {
      findings.push(finding("high", "skill.name.missing", "Skill frontmatter is missing the required name field.", skill.source));
    } else if (!SKILL_NAME_PATTERN.test(frontmatter.values.name) || frontmatter.values.name.length > 64) {
      findings.push(finding("high", "skill.name.invalid", "Skill name must be lowercase kebab-case and no longer than 64 characters.", skill.source));
    }
    if (!description) {
      findings.push(finding("high", "skill.description.missing", "Skill frontmatter is missing the required description field.", skill.source));
    } else if (description.length > 1024) {
      findings.push(finding("high", "skill.description.long", "Skill description exceeds 1024 characters.", skill.source));
    }
    if (frontmatter.values.name && frontmatter.values.name !== parentName) {
      findings.push(finding("high", "skill.directory.mismatch", `Skill name must match its parent directory (${parentName}).`, skill.source));
    }
    if (frontmatter.values.license !== undefined && typeof frontmatter.values.license !== "string") {
      findings.push(finding("high", "skill.license.invalid", "Skill license must be a string when provided.", skill.source));
    }
    if (frontmatter.values.compatibility !== undefined) {
      if (typeof frontmatter.values.compatibility !== "string" || frontmatter.values.compatibility.length === 0 || frontmatter.values.compatibility.length > 500) {
        findings.push(finding("high", "skill.compatibility.invalid", "Skill compatibility must be a non-empty string no longer than 500 characters.", skill.source));
      }
    }
    if (frontmatter.values.metadata !== undefined) {
      const metadata = frontmatter.values.metadata;
      const validMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
        && Object.values(metadata).every((value) => typeof value === "string");
      if (!validMetadata) {
        findings.push(finding("high", "skill.metadata.invalid", "Skill metadata must map string keys to string values.", skill.source));
      }
    }
    if (frontmatter.values["allowed-tools"] !== undefined && typeof frontmatter.values["allowed-tools"] !== "string") {
      findings.push(finding("high", "skill.allowed-tools.invalid", "Skill allowed-tools must be a space-delimited string when provided.", skill.source));
    }
    if (frontmatter.body.split(/\r?\n/).length > 500) {
      findings.push(finding("low", "skill.body.long", "SKILL.md exceeds the recommended 500-line limit; move detailed material into references.", skill.source));
    }
    const lines = credentialLines(skill.content);
    if (lines.length) {
      findings.push(finding("critical", "secret.hardcoded", "Possible hard-coded credential found; only line numbers are reported.", skill.source, { lines }));
    }
  }

  for (const config of inventory.mcpConfigs) {
    const lines = credentialLines(config.content);
    if (lines.length) {
      findings.push(finding("critical", "secret.hardcoded", "Possible hard-coded credential found in agent configuration; only line numbers are reported.", config.source, { lines }));
    }

    let parsedServers = [];
    if (config.source.toLowerCase().endsWith(".toml")) {
      parsedServers = parseTomlServers(config.content);
    } else {
      try {
        const parsed = JSON.parse(config.content);
        parsedServers = findMcpCollections(parsed).flatMap((collection) => Object.entries(collection).map(([name, definition]) => ({
          name,
          definition,
          transport: transportFor(definition),
        })));
      } catch {
        findings.push(finding("high", "mcp.config.invalid-json", "MCP configuration is not valid JSON.", config.source));
        continue;
      }
    }

    for (const server of parsedServers) {
      const serverDigest = digest(JSON.stringify(server.definition));
      mcpServers.push({
        name: server.name,
        source: config.source,
        platform: config.platform,
        transport: server.transport,
        digest: serverDigest,
        // Kept for platform adapters so sync can copy definitions between
        // local configuration files. Never serialized into the manifest.
        definition: server.definition,
      });
      if (server.transport === "unknown") {
        findings.push(finding("high", "mcp.transport.missing", `MCP server '${server.name}' has neither a command nor a URL.`, config.source));
      }
      const url = server.definition?.url;
      if (typeof url === "string" && url.startsWith("http://") && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(url)) {
        findings.push(finding("high", "mcp.url.insecure", `MCP server '${server.name}' uses unencrypted HTTP outside localhost.`, config.source));
      }
    }
  }

  const skillGroups = groupBy(skills, (skill) => skill.name);
  for (const [name, variants] of skillGroups) {
    if (variants.length < 2 || new Set(variants.map((item) => item.digest)).size < 2) continue;
    findings.push(finding("medium", "skill.drift", `Skill '${name}' has different definitions across discovered locations.`, variants[0].source, {
      relatedSources: variants.map((item) => item.source),
    }));
  }

  const serverGroups = groupBy(mcpServers, (server) => server.name);
  for (const [name, variants] of serverGroups) {
    if (variants.length < 2 || new Set(variants.map((item) => item.digest)).size < 2) continue;
    findings.push(finding("medium", "mcp.drift", `MCP server '${name}' has different definitions across platforms.`, variants[0].source, {
      relatedSources: variants.map((item) => item.source),
    }));
  }

  const penalty = findings.reduce((total, item) => total + ({ critical: 25, high: 10, medium: 4, low: 1 }[item.severity] ?? 0), 0);
  const score = Math.max(0, 100 - penalty);
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.source.localeCompare(b.source));

  return {
    score,
    findings,
    inventory: {
      root: inventory.root,
      instructions: inventory.instructions,
      skills,
      mcpConfigs: inventory.mcpConfigs,
      mcpServers,
    },
  };
}
