import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runDoctor } from "../src/doctor.js";
import { planPull, planPush } from "../src/remote.js";

// A Windows checkout (or git core.autocrlf) turns every discovered file into
// CRLF. None of that may change what the CLI reports or plans.
const SKILL_LF = "---\nname: release\ndescription: Prepare a release.\n---\nUse the release checklist.\n";
const SKILL_CRLF = SKILL_LF.replace(/\n/g, "\r\n");

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-eol-"));
}

async function put(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

test("CRLF frontmatter is parsed, including the last key before the closing marker", async () => {
  const root = await fixture();
  await put(root, ".claude/skills/release/SKILL.md", SKILL_CRLF);

  const report = await runDoctor(root);
  assert.equal(report.inventory.skills[0].name, "release");
  assert.equal(report.inventory.skills[0].description, "Prepare a release.");
  assert.deepEqual(report.findings, []);
  assert.equal(report.score, 100);
});

test("digests ignore line endings so mixed-platform checkouts do not drift", async () => {
  const crlfRoot = await fixture();
  const lfRoot = await fixture();
  await put(crlfRoot, ".claude/skills/release/SKILL.md", SKILL_CRLF);
  await put(lfRoot, ".claude/skills/release/SKILL.md", SKILL_LF);

  const [crlf, lf] = await Promise.all([runDoctor(crlfRoot), runDoctor(lfRoot)]);
  assert.equal(crlf.inventory.skills[0].digest, lf.inventory.skills[0].digest);

  // The same skill stored with different line endings in two platform folders
  // is the same skill, not drift.
  const mixed = await fixture();
  await put(mixed, ".claude/skills/release/SKILL.md", SKILL_CRLF);
  await put(mixed, ".cursor/skills/release/SKILL.md", SKILL_LF);
  const mixedReport = await runDoctor(mixed);
  assert.equal(mixedReport.findings.filter((item) => item.code === "skill.drift").length, 0);
});

function fakeRemote(skills) {
  const playbook = {
    id: "11111111-2222-4333-8444-555555555555",
    guid: "abc123",
    name: "Team playbook",
    config: {},
    skills,
  };
  const fetchImpl = async (requestUrl, init = {}) => {
    const { pathname } = new URL(requestUrl);
    if (pathname === "/api/manage/playbooks") {
      return { ok: true, status: 200, json: async () => [{ id: playbook.id, guid: playbook.guid, name: playbook.name }] };
    }
    if (pathname === `/api/manage/playbooks/${playbook.id}`) {
      return { ok: true, status: 200, json: async () => playbook };
    }
    void init;
    return { ok: false, status: 404, json: async () => ({ error: "not found" }) };
  };
  return { playbook, fetchImpl };
}

test("pull and push treat a CRLF local file as identical to LF remote content", async () => {
  const root = await fixture();
  const url = "https://remote.test";
  const apiKey = "apb_test_key";
  const { playbook, fetchImpl } = fakeRemote([
    { id: "s1", name: "release", description: "Prepare a release.", content: SKILL_LF },
  ]);

  // Local portable store holds the same skill with Windows line endings.
  await put(root, ".agents/skills/release/SKILL.md", SKILL_CRLF);
  const pullPlan = await planPull(root, "abc123", { url, apiKey, fetchImpl });
  assert.equal(pullPlan.actions.length, 0);
  assert.equal(pullPlan.conflicts.length, 0);

  // Push against the linked playbook must not report a phantom update either.
  await put(root, ".agentplaybooks/remote.json", JSON.stringify({ url, playbookId: playbook.id, guid: playbook.guid, name: playbook.name }));
  const pushPlan = await planPush(root, { url, apiKey, fetchImpl });
  assert.equal(pushPlan.actions.filter((action) => action.kind === "skill").length, 0);
});
