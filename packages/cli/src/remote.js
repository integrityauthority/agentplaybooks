import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runDoctor } from "./doctor.js";
import { normalizeText } from "./discovery.js";
import { createManifest, comparableManifest } from "./manifest.js";
import { canonicalJson } from "./adapters.js";

export const DEFAULT_BASE_URL = "https://agentplaybooks.ai";
const LINK_FILE = [".agentplaybooks", "remote.json"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function resolveBaseUrl(flagUrl, env = process.env) {
  const url = flagUrl || env.AGENTPLAYBOOKS_URL || DEFAULT_BASE_URL;
  return url.replace(/\/+$/, "");
}

function credentialsPath(homedir = os.homedir()) {
  return path.join(homedir, ".agentplaybooks", "credentials.json");
}

async function loadCredentials(homedir) {
  try {
    return JSON.parse(await readFile(credentialsPath(homedir), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, remotes: {} };
    throw new Error(`Cannot read stored credentials: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writePrivateJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, filePath);
  await chmod(filePath, 0o600).catch(() => {});
}

export async function saveApiKey(url, apiKey, homedir) {
  const credentials = await loadCredentials(homedir);
  credentials.remotes[url] = { apiKey };
  await writePrivateJson(credentialsPath(homedir), credentials);
}

export async function removeApiKey(url, homedir) {
  const credentials = await loadCredentials(homedir);
  if (!credentials.remotes[url]) return false;
  delete credentials.remotes[url];
  await writePrivateJson(credentialsPath(homedir), credentials);
  return true;
}

export async function resolveApiKey(url, { env = process.env, homedir } = {}) {
  if (env.AGENTPLAYBOOKS_API_KEY) return env.AGENTPLAYBOOKS_API_KEY;
  const credentials = await loadCredentials(homedir);
  return credentials.remotes[url]?.apiKey ?? null;
}

async function request(url, requestPath, { method = "GET", apiKey, body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${url}${requestPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error bodies fall through to the status check below.
  }
  if (!response.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(`${method} ${requestPath} failed: ${message}`);
  }
  return payload;
}

export async function verifyApiKey(url, apiKey, { fetchImpl } = {}) {
  await request(url, "/api/manage/playbooks", { apiKey, fetchImpl });
}

export async function listPlaybooks(url, apiKey, { fetchImpl } = {}) {
  return await request(url, "/api/manage/playbooks", { apiKey, fetchImpl }) ?? [];
}

async function getPlaybook(url, apiKey, id, { fetchImpl } = {}) {
  return request(url, `/api/manage/playbooks/${id}`, { apiKey, fetchImpl });
}

async function resolvePlaybook(url, apiKey, ref, { fetchImpl } = {}) {
  if (UUID_PATTERN.test(ref)) return getPlaybook(url, apiKey, ref, { fetchImpl });
  const playbooks = await listPlaybooks(url, apiKey, { fetchImpl });
  const match = playbooks.find((playbook) => playbook.guid === ref);
  if (!match) throw new Error(`No accessible playbook with GUID '${ref}'. Run 'agentplaybooks playbooks' to list yours.`);
  return getPlaybook(url, apiKey, match.id, { fetchImpl });
}

function linkPath(root) {
  return path.join(root, ...LINK_FILE);
}

export async function readLink(root) {
  try {
    return JSON.parse(await readFile(linkPath(root), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`Cannot read ${LINK_FILE.join("/")}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function writeLink(root, link) {
  await writePrivateJson(linkPath(root), link);
}

function skillFileContent(skill) {
  const content = normalizeText(skill.content ?? "");
  if (content.startsWith("---")) return content.endsWith("\n") ? content : `${content}\n`;
  const description = (skill.description ?? "").replace(/\r?\n/g, " ").trim();
  return `---\nname: ${skill.name}\ndescription: ${description}\n---\n\n${content}${content.endsWith("\n") ? "" : "\n"}`;
}

async function readLocalFile(root, relativePath) {
  try {
    return normalizeText(await readFile(path.join(root, ...relativePath.split("/")), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Plan pulling a remote playbook's skills into the portable local store
 * (.agents/skills). Existing files with different content become conflicts;
 * nothing is overwritten.
 */
export async function planPull(root, ref, { url, apiKey, fetchImpl } = {}) {
  const playbook = await resolvePlaybook(url, apiKey, ref, { fetchImpl });
  const actions = [];
  const conflicts = [];

  for (const skill of playbook.skills ?? []) {
    if (typeof skill.name !== "string" || !SAFE_SKILL_NAME.test(skill.name)) {
      conflicts.push({ kind: "skill", name: String(skill.name), reason: "Remote skill name is not a safe lowercase kebab-case directory name." });
      continue;
    }
    const relativePath = `.agents/skills/${skill.name}/SKILL.md`;
    const content = skillFileContent(skill);
    const existing = await readLocalFile(root, relativePath);
    if (existing === null) {
      actions.push({ kind: "skill", name: skill.name, action: "create", path: relativePath, content });
    } else if (existing !== content) {
      conflicts.push({ kind: "skill", name: skill.name, reason: `Local ${relativePath} differs from the remote skill.` });
    }
  }

  return {
    playbook: { id: playbook.id, guid: playbook.guid, name: playbook.name },
    url,
    actions,
    conflicts,
  };
}

export async function applyPull(root, plan) {
  for (const action of plan.actions) {
    const absolutePath = path.join(root, ...action.path.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, action.content, "utf8");
  }
  await writeLink(root, {
    url: plan.url,
    playbookId: plan.playbook.id,
    guid: plan.playbook.guid,
    name: plan.playbook.name,
    lastSyncedAt: new Date().toISOString(),
  });
  return { written: plan.actions.map((action) => action.path) };
}

function localSkillsForPush(report, conflicts) {
  const groups = new Map();
  for (const skill of report.inventory.skills) {
    const group = groups.get(skill.name) ?? [];
    group.push(skill);
    groups.set(skill.name, group);
  }
  const skills = [];
  for (const [name, variants] of groups) {
    if (!SAFE_SKILL_NAME.test(name)) {
      conflicts.push({ kind: "skill", name, reason: "Skill name is not a safe lowercase kebab-case name; skipped." });
      continue;
    }
    if (new Set(variants.map((item) => item.digest)).size > 1) {
      conflicts.push({ kind: "skill", name, reason: "Skill definitions differ across platforms; resolve the drift before pushing." });
      continue;
    }
    skills.push({ name, description: variants[0].description ?? "", content: variants[0].content, source: variants[0].source });
  }
  return skills;
}

/**
 * Plan pushing the local playbook to the remote. Refuses to plan when doctor
 * finds likely hard-coded credentials in the content that would be uploaded.
 */
export async function planPush(root, { url, apiKey, fetchImpl } = {}) {
  const report = await runDoctor(root);
  const conflicts = [];
  const skills = localSkillsForPush(report, conflicts);

  const leaking = report.findings.filter((item) => item.code === "secret.hardcoded"
    && skills.some((skill) => skill.source === item.source));
  if (leaking.length > 0) {
    const sources = [...new Set(leaking.map((item) => item.source))].join(", ");
    throw new Error(`Refusing to push: possible hard-coded credentials in ${sources}. Move secrets to environment references first.`);
  }

  const manifest = comparableManifest(createManifest(report));
  const link = await readLink(root);
  let remote = null;
  if (link?.playbookId && link.url === url) {
    remote = await getPlaybook(url, apiKey, link.playbookId, { fetchImpl });
  }

  const actions = [];
  if (!remote) {
    actions.push({ kind: "playbook", action: "create", name: manifest.metadata.displayName || manifest.metadata.name });
    for (const skill of skills) {
      actions.push({ kind: "skill", action: "create", name: skill.name });
    }
  } else {
    if (canonicalJson(remote.config?.agentplaybook ?? null) !== canonicalJson(manifest)) {
      actions.push({ kind: "playbook", action: "update-config", name: remote.name });
    }
    const remoteSkills = new Map((remote.skills ?? []).map((skill) => [skill.name, skill]));
    for (const skill of skills) {
      const existing = remoteSkills.get(skill.name);
      if (!existing) {
        actions.push({ kind: "skill", action: "create", name: skill.name });
      } else if (normalizeText(existing.content ?? "") !== skill.content || (existing.description ?? "") !== skill.description) {
        actions.push({ kind: "skill", action: "update", name: skill.name, skillId: existing.id });
      }
    }
  }

  return {
    url,
    manifest,
    skills,
    remote: remote ? { id: remote.id, guid: remote.guid, name: remote.name } : null,
    actions,
    conflicts,
  };
}

export async function applyPush(root, plan, { apiKey, fetchImpl } = {}) {
  const { url } = plan;
  let playbookId = plan.remote?.id ?? null;
  let guid = plan.remote?.guid ?? null;
  let name = plan.remote?.name ?? null;

  const createAction = plan.actions.find((action) => action.kind === "playbook" && action.action === "create");
  if (createAction) {
    const created = await request(url, "/api/manage/playbooks", {
      method: "POST",
      apiKey,
      fetchImpl,
      body: {
        name: createAction.name,
        config: { agentplaybook: plan.manifest },
      },
    });
    playbookId = created.id;
    guid = created.guid;
    name = created.name;
  } else if (plan.actions.some((action) => action.kind === "playbook" && action.action === "update-config")) {
    await request(url, `/api/manage/playbooks/${playbookId}`, {
      method: "PUT",
      apiKey,
      fetchImpl,
      body: { config: { agentplaybook: plan.manifest } },
    });
  }

  const skillByName = new Map(plan.skills.map((skill) => [skill.name, skill]));
  for (const action of plan.actions) {
    if (action.kind !== "skill") continue;
    const skill = skillByName.get(action.name);
    if (action.action === "create") {
      await request(url, `/api/manage/playbooks/${playbookId}/skills`, {
        method: "POST",
        apiKey,
        fetchImpl,
        body: { name: skill.name, description: skill.description, content: skill.content },
      });
    } else {
      await request(url, `/api/manage/playbooks/${playbookId}/skills/${action.skillId}`, {
        method: "PUT",
        apiKey,
        fetchImpl,
        body: { name: skill.name, description: skill.description, content: skill.content },
      });
    }
  }

  await writeLink(root, { url, playbookId, guid, name, lastSyncedAt: new Date().toISOString() });
  return { playbookId, guid, name };
}
