import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertSecretName,
  buildRunEnvironment,
  createOrRotateSecret,
  listVaultSecrets,
  reconcileSecrets,
  resolvePlaybookKey,
  resolveSecretValue,
  runWithEnvironment,
  savePlaybookKey,
} from "../src/secrets.js";
import { resolveApiKey, saveApiKey } from "../src/remote.js";

const URL_BASE = "https://remote.test";
const GUID = "abc123";
const PLAYBOOK_KEY = "apb_playbook_key";
const SECRET_VALUE = "sk-THE-ACTUAL-VALUE-1234567890";

async function fixture() {
  return mkdtemp(path.join(tmpdir(), "agentplaybooks-secrets-"));
}

function fakeVault(secrets) {
  const calls = [];
  const respond = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const fetchImpl = async (requestUrl, init = {}) => {
    const method = init.method ?? "GET";
    const { pathname } = new URL(requestUrl);
    calls.push({ method, path: pathname, body: init.body ? JSON.parse(init.body) : undefined });

    if (init.headers?.Authorization !== `Bearer ${PLAYBOOK_KEY}`) {
      return respond(401, { error: "Authentication required." });
    }
    if (method === "GET" && pathname === `/api/playbooks/${GUID}/secrets`) {
      return respond(200, secrets.map(({ name, allow_api_key_reveal, expires_at }) => ({ name, allow_api_key_reveal, expires_at: expires_at ?? null })));
    }
    if (method === "POST" && pathname === `/api/playbooks/${GUID}/secrets`) {
      const body = JSON.parse(init.body);
      secrets.push({ name: body.name, value: body.value, allow_api_key_reveal: false });
      return respond(201, { name: body.name });
    }
    const update = pathname.match(new RegExp(`^/api/playbooks/${GUID}/secrets/([^/]+)$`));
    if (method === "PUT" && update) {
      const secret = secrets.find((item) => item.name === decodeURIComponent(update[1]));
      if (!secret) return respond(404, { error: "Secret not found" });
      const body = JSON.parse(init.body);
      // The API only touches the fields it receives; the reveal flag must survive.
      secret.value = body.value;
      return respond(200, { name: secret.name });
    }
    const reveal = pathname.match(new RegExp(`^/api/playbooks/${GUID}/secrets/reveal/([^/]+)$`));
    if (method === "GET" && reveal) {
      const secret = secrets.find((item) => item.name === decodeURIComponent(reveal[1]));
      if (!secret) return respond(404, { error: "Secret not found" });
      if (!secret.allow_api_key_reveal) {
        return respond(403, { error: "Proxy Only: API keys are not permitted to reveal this secret's raw value." });
      }
      return respond(200, { name: secret.name, value: secret.value });
    }
    return respond(404, { error: `No route for ${method} ${pathname}` });
  };
  return { fetchImpl, calls, secrets };
}

test("a playbook key is stored per playbook and does not disturb the user key", async () => {
  const home = await fixture();
  await saveApiKey(URL_BASE, "apb_user_key", home);
  await savePlaybookKey(URL_BASE, GUID, PLAYBOOK_KEY, home);

  assert.equal(await resolvePlaybookKey(URL_BASE, GUID, { env: {}, homedir: home }), PLAYBOOK_KEY);
  assert.equal(await resolveApiKey(URL_BASE, { env: {}, homedir: home }), "apb_user_key");
  assert.equal(await resolvePlaybookKey(URL_BASE, "other", { env: {}, homedir: home }), null);
  assert.equal(
    await resolvePlaybookKey(URL_BASE, GUID, { env: { AGENTPLAYBOOKS_PLAYBOOK_KEY: "apb_env" }, homedir: home }),
    "apb_env",
  );
});

test("status reconciles the manifest, the vault, and the current environment without values", () => {
  const rows = reconcileSecrets(
    [
      { name: "DEPLOY_API_KEY", ref: "env:DEPLOY_API_KEY", required: true },
      { name: "OPTIONAL_TOKEN", ref: "env:OPTIONAL_TOKEN", required: false },
      { name: "MISSING_KEY", ref: "env:MISSING_KEY", required: true },
    ],
    [
      { name: "DEPLOY_API_KEY", allow_api_key_reveal: true, expires_at: null },
      { name: "PROXY_ONLY", allow_api_key_reveal: false, expires_at: null },
    ],
    { OPTIONAL_TOKEN: "already-set" },
  );

  const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.deepEqual(byName.DEPLOY_API_KEY, {
    name: "DEPLOY_API_KEY", ref: "env:DEPLOY_API_KEY", required: true,
    inEnvironment: false, inVault: true, revealable: true, expiresAt: null,
  });
  assert.equal(byName.OPTIONAL_TOKEN.inEnvironment, true);
  assert.equal(byName.OPTIONAL_TOKEN.inVault, false);
  assert.equal(byName.MISSING_KEY.inVault, false);
  // Vault entries the playbook does not reference are surfaced, not hidden.
  assert.equal(byName.PROXY_ONLY.vaultOnly, true);
  assert.equal(byName.PROXY_ONLY.revealable, false);
  // No row carries a value under any key.
  assert.doesNotMatch(JSON.stringify(rows), /already-set/);
});

test("secret names are validated before anything is sent", () => {
  assert.doesNotThrow(() => assertSecretName("DEPLOY_API_KEY"));
  for (const bad of ["with space", "dash-name", "1leading", "path/traversal", ""]) {
    assert.throws(() => assertSecretName(bad), /not a valid secret name/);
  }
});

test("a value is read from a named environment variable, never from argv", async () => {
  const resolved = await resolveSecretValue({ fromEnv: "SOURCE_VAR", env: { SOURCE_VAR: SECRET_VALUE } });
  assert.equal(resolved.value, SECRET_VALUE);
  assert.match(resolved.origin, /environment variable SOURCE_VAR/);
  await assert.rejects(resolveSecretValue({ fromEnv: "NOT_SET", env: {} }), /empty or unset/);
});

test("push creates then rotates, and the value never lands on disk", async () => {
  const home = await fixture();
  await savePlaybookKey(URL_BASE, GUID, PLAYBOOK_KEY, home);
  const vault = fakeVault([]);

  await createOrRotateSecret(URL_BASE, GUID, PLAYBOOK_KEY, {
    name: "DEPLOY_API_KEY", value: SECRET_VALUE, existing: false, fetchImpl: vault.fetchImpl,
  });
  assert.equal(vault.secrets[0].value, SECRET_VALUE);
  assert.equal(vault.calls.at(-1).path, `/api/playbooks/${GUID}/secrets`);

  vault.secrets[0].allow_api_key_reveal = true;
  await createOrRotateSecret(URL_BASE, GUID, PLAYBOOK_KEY, {
    name: "DEPLOY_API_KEY", value: "sk-ROTATED", existing: true, fetchImpl: vault.fetchImpl,
  });
  assert.equal(vault.secrets[0].value, "sk-ROTATED");
  assert.equal(vault.calls.at(-1).method, "PUT");
  // Rotating must not reset the owner's reveal decision.
  assert.equal(vault.secrets[0].allow_api_key_reveal, true);

  // Nothing under the credential directory ever contains a secret value.
  const stored = await readdir(path.join(home, ".agentplaybooks"));
  for (const file of stored) {
    const contents = await readFile(path.join(home, ".agentplaybooks", file), "utf8");
    assert.doesNotMatch(contents, /sk-ROTATED|THE-ACTUAL-VALUE/);
  }
});

test("run injects only revealable values, and reports what it skipped", async () => {
  const vault = fakeVault([
    { name: "REVEALABLE", value: SECRET_VALUE, allow_api_key_reveal: true },
    { name: "PROXY_ONLY", value: "sk-never", allow_api_key_reveal: false },
  ]);

  const { injected, skipped } = await buildRunEnvironment(
    URL_BASE, GUID, PLAYBOOK_KEY,
    ["REVEALABLE", "PROXY_ONLY", "ABSENT", "ALREADY_SET"],
    { fetchImpl: vault.fetchImpl, baseEnv: { ALREADY_SET: "from-the-shell" } },
  );

  assert.deepEqual(Object.keys(injected), ["REVEALABLE"]);
  assert.equal(injected.REVEALABLE, SECRET_VALUE);
  const reasons = Object.fromEntries(skipped.map((item) => [item.name, item.reason]));
  assert.match(reasons.PROXY_ONLY, /Proxy Only/);
  assert.match(reasons.ABSENT, /Secret not found/);
  assert.match(reasons.ALREADY_SET, /already set/);
});

test("the injected value reaches the child process and nothing else", async () => {
  const result = await runWithEnvironment(
    process.execPath,
    ["-e", "if (process.env.INJECTED !== 'in-memory-only') process.exit(3); if (process.env.NOT_INJECTED) process.exit(4);"],
    { INJECTED: "in-memory-only" },
  );
  assert.equal(result.code, 0);
});

test("an unauthenticated vault call fails loudly instead of returning nothing", async () => {
  const vault = fakeVault([]);
  await assert.rejects(
    listVaultSecrets(URL_BASE, GUID, "apb_wrong_key", { fetchImpl: vault.fetchImpl }),
    /Authentication required/,
  );
});
