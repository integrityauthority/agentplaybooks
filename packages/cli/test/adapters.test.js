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
