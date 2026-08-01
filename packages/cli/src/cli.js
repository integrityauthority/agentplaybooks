import path from "node:path";
import readline from "node:readline";
import { printDoctor, publicReport, runDoctor, runGlobalDoctor } from "./doctor.js";
import { applySync, planSync, printSyncPlan } from "./sync.js";
import {
  applyPull,
  applyPush,
  listPlaybooks,
  planPull,
  planPush,
  removeApiKey,
  resolveApiKey,
  resolveBaseUrl,
  saveApiKey,
  verifyApiKey,
} from "./remote.js";

const HELP = `AgentPlaybooks CLI

Usage:
  agentplaybooks doctor [path] [--json] [--strict] [--global]
  agentplaybooks sync [path] [--apply] [--json]
  agentplaybooks login [--url=<base>]
  agentplaybooks logout [--url=<base>]
  agentplaybooks playbooks [--url=<base>] [--json]
  agentplaybooks pull <id|guid> [path] [--apply] [--json] [--url=<base>]
  agentplaybooks push [path] [--apply] [--json] [--url=<base>]

Commands:
  doctor     Audit agent instructions, skills, MCP configuration, secrets, and drift.
  sync       Plan or apply the canonical manifest and missing platform files
             for enabled targets (claude, cursor, codex, antigravity, hermes).
  login      Store an AgentPlaybooks user API key (apb_...) for a remote.
             Reads AGENTPLAYBOOKS_API_KEY, or prompts on stdin.
  logout     Remove the stored API key for a remote.
  playbooks  List the playbooks the stored API key can access.
  pull       Plan or apply downloading a remote playbook's skills into
             .agents/skills and link the project to that playbook.
  push       Plan or apply uploading local skills and the manifest to the
             linked (or a new) remote playbook. Secret values are never sent.

Safety:
  doctor is read-only and local-only.
  sync, pull, and push are plan-only unless --apply is explicitly supplied.
  Conflicting definitions are reported and skipped, never overwritten.
`;

function parse(args) {
  const command = args[0];
  const flags = new Map();
  const positional = [];
  for (const arg of args.slice(1)) {
    if (arg.startsWith("--")) {
      const separator = arg.indexOf("=");
      if (separator === -1) flags.set(arg, true);
      else flags.set(arg.slice(0, separator), arg.slice(separator + 1));
    } else {
      positional.push(arg);
    }
  }
  return { command, flags, positional };
}

async function promptForKey(question) {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8").trim();
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await new Promise((resolve) => rl.question(question, resolve))).trim();
  } finally {
    rl.close();
  }
}

async function requireApiKey(url) {
  const apiKey = await resolveApiKey(url);
  if (!apiKey) {
    throw new Error(`No API key for ${url}. Run 'agentplaybooks login' or set AGENTPLAYBOOKS_API_KEY.`);
  }
  return apiKey;
}

// File contents are useful on disk, not in a plan summary: they would bury
// the actual decisions in the JSON output.
function withoutContent(action) {
  const summary = { ...action };
  delete summary.content;
  return summary;
}

function printRemotePlan(kind, plan) {
  if (plan.actions.length === 0 && plan.conflicts.length === 0) {
    console.log(`Nothing to ${kind}; already in sync.`);
  }
  for (const action of plan.actions) {
    console.log(`  ${action.action} ${action.kind} ${action.path ?? action.name}`);
  }
  for (const item of plan.conflicts) {
    console.log(`  [conflict] ${item.kind} '${item.name}': ${item.reason}`);
  }
}

export async function run(args) {
  const { command, flags, positional } = parse(args);
  if (!command || flags.has("--help") || command === "help") {
    console.log(HELP);
    return;
  }

  if (command === "doctor") {
    const report = flags.has("--global")
      ? await runGlobalDoctor()
      : await runDoctor(path.resolve(positional[0] ?? process.cwd()));
    if (flags.has("--json")) console.log(JSON.stringify(publicReport(report), null, 2));
    else printDoctor(report);
    if (flags.has("--strict") && report.findings.some((item) => item.severity === "critical" || item.severity === "high")) {
      process.exitCode = 2;
    }
    return;
  }

  if (command === "sync") {
    if (flags.has("--global")) throw new Error("Global sync is not supported yet.");
    const plan = await planSync(path.resolve(positional[0] ?? process.cwd()));
    if (flags.has("--json")) {
      console.log(JSON.stringify({
        action: plan.action,
        changed: plan.changed,
        manifestPath: plan.manifestPath,
        manifest: plan.manifest,
        fileActions: plan.fileActions.map(withoutContent),
        conflicts: plan.conflicts,
      }, null, 2));
    } else {
      printSyncPlan(plan);
    }
    if (flags.has("--apply")) {
      const result = await applySync(plan);
      if (!flags.has("--json")) {
        console.log(result.applied ? "Applied sync plan." : "No changes applied.");
        for (const written of result.written) console.log(`Wrote: ${written}`);
        if (result.backupPath) console.log(`Backup: ${result.backupPath}`);
        for (const backup of result.backups) console.log(`Backup: ${backup}`);
      }
    }
    return;
  }

  const url = resolveBaseUrl(typeof flags.get("--url") === "string" ? flags.get("--url") : undefined);

  if (command === "login") {
    const apiKey = process.env.AGENTPLAYBOOKS_API_KEY
      || await promptForKey(`Paste your ${url} user API key (apb_...): `);
    if (!apiKey.startsWith("apb_")) throw new Error("That does not look like an AgentPlaybooks user API key (apb_...).");
    await verifyApiKey(url, apiKey);
    await saveApiKey(url, apiKey);
    console.log(`Stored API key for ${url}.`);
    return;
  }

  if (command === "logout") {
    const removed = await removeApiKey(url);
    console.log(removed ? `Removed API key for ${url}.` : `No stored API key for ${url}.`);
    return;
  }

  if (command === "playbooks") {
    const apiKey = await requireApiKey(url);
    const playbooks = await listPlaybooks(url, apiKey);
    if (flags.has("--json")) {
      console.log(JSON.stringify(playbooks.map((p) => ({ id: p.id, guid: p.guid, name: p.name, visibility: p.visibility, skill_count: p.skill_count })), null, 2));
      return;
    }
    if (playbooks.length === 0) {
      console.log("No accessible playbooks.");
      return;
    }
    for (const playbook of playbooks) {
      console.log(`${playbook.guid}  ${playbook.name} (${playbook.visibility}, ${playbook.skill_count ?? 0} skill(s))`);
    }
    return;
  }

  if (command === "pull") {
    const ref = positional[0];
    if (!ref) throw new Error("Usage: agentplaybooks pull <id|guid> [path]");
    const root = path.resolve(positional[1] ?? process.cwd());
    const apiKey = await requireApiKey(url);
    const plan = await planPull(root, ref, { url, apiKey });
    if (flags.has("--json")) {
      console.log(JSON.stringify({
        playbook: plan.playbook,
        actions: plan.actions.map(withoutContent),
        conflicts: plan.conflicts,
      }, null, 2));
    } else {
      console.log(`Pull plan for '${plan.playbook.name}' (${plan.playbook.guid}):`);
      printRemotePlan("pull", plan);
    }
    if (flags.has("--apply")) {
      const result = await applyPull(root, plan);
      if (!flags.has("--json")) {
        for (const written of result.written) console.log(`Wrote: ${written}`);
        console.log(`Linked ${root} to playbook ${plan.playbook.guid}.`);
      }
    } else if (!flags.has("--json")) {
      console.log("No files have been changed. Run again with --apply to write these changes.");
    }
    return;
  }

  if (command === "push") {
    const root = path.resolve(positional[0] ?? process.cwd());
    const apiKey = await requireApiKey(url);
    const plan = await planPush(root, { url, apiKey });
    if (flags.has("--json")) {
      console.log(JSON.stringify({
        remote: plan.remote,
        actions: plan.actions,
        conflicts: plan.conflicts,
      }, null, 2));
    } else {
      console.log(plan.remote
        ? `Push plan for linked playbook '${plan.remote.name}' (${plan.remote.guid}):`
        : "Push plan (a new remote playbook will be created):");
      printRemotePlan("push", plan);
      console.log("Remote skills that no longer exist locally are left untouched.");
    }
    if (flags.has("--apply")) {
      const result = await applyPush(root, plan, { apiKey });
      if (!flags.has("--json")) {
        console.log(`Pushed to playbook '${result.name}' (${result.guid}).`);
      }
    } else if (!flags.has("--json")) {
      console.log("Nothing has been uploaded. Run again with --apply to push.");
    }
    return;
  }

  throw new Error(`Unknown command '${command}'.\n\n${HELP}`);
}
