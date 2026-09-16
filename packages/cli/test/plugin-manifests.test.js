import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(packageRoot, relativePath), "utf8"));
}

test("Codex plugin uses an environment-backed bearer token for the account MCP", async () => {
  const [manifest, packageJson] = await Promise.all([
    readJson(".codex-plugin/plugin.json"),
    readJson("package.json"),
  ]);
  const account = manifest.mcpServers["agentplaybooks-account"];

  assert.match(manifest.version, new RegExp(`^${packageJson.version.replaceAll(".", "\\.")}\\+codex\\.`));
  assert.equal(account.url, "https://agentplaybooks.ai/api/mcp/manage");
  assert.equal(account.bearer_token_env_var, "AGENTPLAYBOOKS_API_KEY");
  assert.equal(account.headers, undefined);
});

test("Claude plugin securely prompts for the key and bundles the account MCP", async () => {
  const [manifest, packageJson] = await Promise.all([
    readJson(".claude-plugin/plugin.json"),
    readJson("package.json"),
  ]);
  const keyConfig = manifest.userConfig.agentplaybooks_api_key;
  const account = manifest.mcpServers["agentplaybooks-account"];

  assert.equal(manifest.version, packageJson.version);
  assert.equal(keyConfig.sensitive, true);
  assert.equal(keyConfig.required, true);
  assert.equal(account.url, "https://agentplaybooks.ai/api/mcp/manage");
  assert.equal(
    account.headers.Authorization,
    "Bearer ${user_config.agentplaybooks_api_key}",
  );
});
