import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { applySync, planSync } from "../src/sync.js";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-adapters-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

const SKILL = "---\nname: release\ndescription: Prepare a release.\n---\nUse the release checklist.\n";

async function manifestWithCursorTarget(root) {
  const plan = await planSync(root);
  const manifest = plan.manifest;
  manifest.spec.targets.push({ id: "cursor", type: "cursor", enabled: true, config: {} });
  await put(root, "agentplaybook.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

test("sync plans and applies missing platform files for enabled targets", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"] } } }));
  await manifestWithCursorTarget(root);

  const plan = await planSync(root);
  const skillAction = plan.fileActions.find((action) => action.kind === "skill");
  const mcpAction = plan.fileActions.find((action) => action.kind === "mcp-config");

  assert.equal(skillAction.target, "cursor");
  assert.equal(skillAction.path, ".cursor/skills/release/SKILL.md");
  assert.equal(mcpAction.path, ".cursor/mcp.json");
  assert.deepEqual(mcpAction.servers, ["deploy"]);
  assert.equal(plan.conflicts.length, 0);

  // Plan-only: nothing on disk yet.
  await assert.rejects(readFile(path.join(root, ".cursor", "mcp.json"), "utf8"), { code: "ENOENT" });

  const result = await applySync(plan);
  assert.ok(result.written.includes(".cursor/skills/release/SKILL.md"));
  assert.equal(await readFile(path.join(root, ".cursor", "skills", "release", "SKILL.md"), "utf8"), SKILL);
  const cursorMcp = JSON.parse(await readFile(path.join(root, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cursorMcp.mcpServers.deploy.command, "npx");

  // A second sync converges to no further file actions.
  const followUp = await planSync(root);
  assert.equal(followUp.fileActions.length, 0);
});

test("sync merges into an existing MCP config with a backup and preserves other keys", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"] } } }));
  await put(root, ".cursor/mcp.json", JSON.stringify({ other: true, mcpServers: { search: { url: "https://mcp.example.com/http" } } }));
  await manifestWithCursorTarget(root);

  const plan = await planSync(root);
  const mcpActions = plan.fileActions.filter((action) => action.kind === "mcp-config");
  // Both directions: deploy is missing from cursor, search is missing from claude.
  assert.deepEqual(mcpActions.map((action) => action.path).sort(), [".cursor/mcp.json", ".mcp.json"]);

  const result = await applySync(plan);
  assert.equal(result.backups.length, 2);

  const cursorMcp = JSON.parse(await readFile(path.join(root, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cursorMcp.other, true);
  assert.ok(cursorMcp.mcpServers.deploy);
  assert.ok(cursorMcp.mcpServers.search);
});

test("sync reports drift as a conflict and never overwrites", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await put(root, ".cursor/skills/release/SKILL.md", "---\nname: release\ndescription: Different.\n---\nDifferent content.\n");
  await manifestWithCursorTarget(root);

  const plan = await planSync(root);
  assert.equal(plan.fileActions.filter((action) => action.kind === "skill").length, 0);
  // Drift is already reported by doctor; adapters must not copy either variant
  // to a third target, and existing files must stay untouched.
  await applySync(plan);
  assert.equal(await readFile(path.join(root, ".claude", "skills", "release", "SKILL.md"), "utf8"), SKILL);
});

async function manifestWithTargets(root, types) {
  const plan = await planSync(root);
  const manifest = plan.manifest;
  for (const type of types) {
    manifest.spec.targets.push({ id: type, type, enabled: true, config: {} });
  }
  await put(root, "agentplaybook.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

test("codex target gets skills and a TOML MCP config, both directions", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await put(root, ".mcp.json", JSON.stringify({
    mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"], env: { API_KEY: "${DEPLOY_API_KEY}" } } },
  }));
  await put(root, ".codex/config.toml", '[mcp_servers.search]\nurl = "https://mcp.example.com/http"\n');
  await manifestWithTargets(root, ["codex"]);

  const plan = await planSync(root, { homedir: root });
  const skillAction = plan.fileActions.find((action) => action.kind === "skill" && action.target === "codex");
  assert.equal(skillAction.path, ".codex/skills/release/SKILL.md");

  const tomlAction = plan.fileActions.find((action) => action.path === ".codex/config.toml");
  assert.equal(tomlAction.action, "merge");
  assert.match(tomlAction.content, /\[mcp_servers\.search\]/);
  assert.match(tomlAction.content, /\[mcp_servers\.deploy\]\ncommand = "npx"\nargs = \["deploy-mcp"\]/);
  assert.match(tomlAction.content, /\[mcp_servers\.deploy\.env\]\nAPI_KEY = "\$\{DEPLOY_API_KEY\}"/);

  // The codex TOML server is copied into the claude JSON config too.
  const jsonAction = plan.fileActions.find((action) => action.path === ".mcp.json");
  assert.deepEqual(jsonAction.servers, ["search"]);

  await applySync(plan);
  const followUp = await planSync(root, { homedir: root });
  assert.equal(followUp.fileActions.length, 0);
  assert.equal(followUp.conflicts.length, 0);
});

test("antigravity target maps to the portable .agents store", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await manifestWithTargets(root, ["antigravity"]);

  const plan = await planSync(root, { homedir: root });
  const skillAction = plan.fileActions.find((action) => action.target === "antigravity");
  assert.equal(skillAction.path, ".agents/skills/release/SKILL.md");

  await applySync(plan);
  // Portable skills count as present for antigravity: no repeat action.
  const followUp = await planSync(root, { homedir: root });
  assert.equal(followUp.fileActions.filter((action) => action.target === "antigravity").length, 0);
});

test("hermes target writes to the home-scoped skill store and respects existing files", async () => {
  const root = await fixture();
  const home = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL);
  await manifestWithTargets(root, ["hermes"]);

  const plan = await planSync(root, { homedir: home });
  const skillAction = plan.fileActions.find((action) => action.target === "hermes");
  assert.equal(skillAction.path, "~/.hermes/skills/release/SKILL.md");

  await applySync(plan);
  assert.equal(await readFile(path.join(home, ".hermes", "skills", "release", "SKILL.md"), "utf8"), SKILL);

  // Identical home file: converged. Different home file: conflict, no write.
  const converged = await planSync(root, { homedir: home });
  assert.equal(converged.fileActions.filter((action) => action.target === "hermes").length, 0);

  await put(home, ".hermes/skills/release/SKILL.md", "different\n");
  const conflicted = await planSync(root, { homedir: home });
  assert.equal(conflicted.fileActions.filter((action) => action.target === "hermes").length, 0);
  assert.ok(conflicted.conflicts.some((item) => item.target === "hermes" && item.kind === "skill"));
  assert.equal(await readFile(path.join(home, ".hermes", "skills", "release", "SKILL.md"), "utf8"), "different\n");
});

test("conflicting MCP definitions across platforms are skipped with a conflict", async () => {
  const root = await fixture();
  await put(root, ".mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["deploy-mcp"] } } }));
  await put(root, ".vscode/mcp.json", JSON.stringify({ mcpServers: { deploy: { command: "npx", args: ["other-mcp"] } } }));
  await manifestWithCursorTarget(root);

  const plan = await planSync(root);
  const conflict = plan.conflicts.find((item) => item.kind === "mcp" && item.name === "deploy");
  assert.ok(conflict);
  assert.equal(plan.fileActions.filter((action) => action.kind === "mcp-config").length, 0);
});
