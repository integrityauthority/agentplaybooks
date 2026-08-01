import { mkdir, readFile, rename, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { applyAdapters, planAdapters } from "./adapters.js";
import { runDoctor } from "./doctor.js";
import { comparableManifest, createManifest } from "./manifest.js";

const MANIFEST_NAME = "agentplaybook.json";

async function readExisting(manifestPath) {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Cannot read existing ${MANIFEST_NAME}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function atomicWrite(manifestPath, manifest) {
  const directory = path.dirname(manifestPath);
  const tempPath = path.join(directory, `.${MANIFEST_NAME}.${process.pid}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, manifestPath);
}

export async function planSync(target, options = {}) {
  const report = await runDoctor(target);
  const manifestPath = path.join(report.inventory.root, MANIFEST_NAME);
  const existing = await readExisting(manifestPath);
  const discovered = createManifest(report);
  const manifest = existing?.apiVersion === discovered.apiVersion && existing?.kind === discovered.kind
    ? mergeExisting(discovered, existing)
    : discovered;
  const manifestChanged = !existing || JSON.stringify(comparableManifest(existing)) !== JSON.stringify(comparableManifest(manifest));
  const adapters = await planAdapters(report, manifest.spec.targets, options);
  return {
    report,
    manifest,
    manifestPath,
    existing,
    manifestChanged,
    changed: manifestChanged || adapters.actions.length > 0,
    action: existing ? (manifestChanged ? "update" : "none") : "create",
    fileActions: adapters.actions,
    conflicts: adapters.conflicts,
  };
}

function mergeExisting(discovered, existing) {
  const detectedTargets = new Map(discovered.spec.targets.map((target) => [target.id, target]));
  for (const target of existing.spec?.targets ?? []) detectedTargets.set(target.id, target);

  return {
    ...discovered,
    metadata: {
      ...discovered.metadata,
      ...existing.metadata,
      generatedAt: discovered.metadata.generatedAt,
    },
    spec: {
      ...discovered.spec,
      memory: existing.spec?.memory ?? discovered.spec.memory,
      secrets: existing.spec?.secrets ?? discovered.spec.secrets,
      targets: [...detectedTargets.values()],
      policies: existing.spec?.policies ?? discovered.spec.policies,
      governance: existing.spec?.governance ?? discovered.spec.governance,
    },
  };
}

export async function applySync(plan) {
  if (!plan.changed) return { applied: false, backupPath: null, written: [], backups: [] };

  const backupDirectory = path.join(path.dirname(plan.manifestPath), ".agentplaybooks", "backups", timestampForPath());

  let backupPath = null;
  if (plan.manifestChanged && plan.existing) {
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    backupPath = path.join(backupDirectory, MANIFEST_NAME);
    await copyFile(plan.manifestPath, backupPath);
  }
  if (plan.manifestChanged) {
    await atomicWrite(plan.manifestPath, plan.manifest);
  }
  const { written, backups } = await applyAdapters(plan.fileActions, backupDirectory);
  return { applied: true, backupPath, written, backups };
}

export function printSyncPlan(plan) {
  if (!plan.changed && plan.conflicts.length === 0) {
    console.log(`${MANIFEST_NAME} and platform files are already in sync.`);
    return;
  }
  if (plan.manifestChanged) {
    console.log(`Sync plan: ${plan.action} ${plan.manifestPath}`);
    console.log(`  ${plan.manifest.spec.instructions.length} instruction file(s)`);
    console.log(`  ${plan.manifest.spec.skills.length} skill(s)`);
    console.log(`  ${plan.manifest.spec.connections.mcp.length} MCP server definition(s)`);
    console.log(`  ${plan.manifest.spec.targets.length} detected deployment target(s)`);
  }
  for (const action of plan.fileActions) {
    if (action.kind === "skill") {
      console.log(`  [${action.target}] ${action.action} ${action.path} (from ${action.from})`);
    } else {
      console.log(`  [${action.target}] ${action.action} ${action.path} (+ ${action.servers.join(", ")})`);
    }
  }
  for (const item of plan.conflicts) {
    console.log(`  [conflict:${item.target}] ${item.kind} '${item.name}': ${item.reason}`);
    for (const source of item.sources) console.log(`    - ${source}`);
  }
  if (plan.changed) {
    console.log("No files have been changed. Run again with --apply to write these changes.");
  }
}
