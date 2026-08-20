import assert from "node:assert/strict";
import test from "node:test";
import {
  planAdoption,
  publicAdoption,
  rewriteConfig,
  variableNameFor,
} from "../src/adopt.js";

function inventory(configs) {
  return {
    root: "/project",
    instructions: [],
    skills: [],
    mcpConfigs: configs,
  };
}

const CURSOR_CONFIG = {
  source: ".cursor/mcp.json",
  platform: "cursor",
  absolutePath: "/project/.cursor/mcp.json",
  content: JSON.stringify({
    mcpServers: {
      mssql: {
        url: "http://db.example.com/mcp",
        headers: {
          "X-MSSQL-User": "service_account",
          "X-MSSQL-Password-B64": "cGxhaW50ZXh0LXNlY3JldA==",
        },
      },
    },
  }, null, 2),
};

const HERMES_CONFIG = {
  source: "~/.hermes/config.yaml",
  platform: "hermes",
  absolutePath: "/home/user/.hermes/config.yaml",
  content: "# Profile\nmcp_servers:\n  github:\n    command: npx\n    env:\n      GITHUB_TOKEN: ghp_realtokenvalue123456\n",
};

test("adoption finds credentials by key, not by line, and never exposes the value", () => {
  const plan = planAdoption(inventory([CURSOR_CONFIG]));

  assert.equal(plan.secrets.length, 1);
  assert.equal(plan.secrets[0].name, "MSSQL_PASSWORD_B64");
  assert.deepEqual(plan.secrets[0].occurrences[0].keyPath, ["mcpServers", "mssql", "headers", "X-MSSQL-Password-B64"]);
  // The username sits next to the password and is not a credential.
  assert.ok(!JSON.stringify(plan.secrets).includes("service_account"));

  // What can be printed carries a length, never a value.
  const shown = JSON.stringify(publicAdoption(plan));
  assert.ok(!shown.includes("cGxhaW50ZXh0LXNlY3JldA=="));
  assert.ok(shown.includes('"length":24'));
});

test("the same value in two clients becomes one vault entry", () => {
  const second = {
    ...HERMES_CONFIG,
    content: "mcp_servers:\n  mssql:\n    url: http://db.example.com/mcp\n    headers:\n      X-MSSQL-Password-B64: cGxhaW50ZXh0LXNlY3JldA==\n",
  };
  const plan = planAdoption(inventory([CURSOR_CONFIG, second]));

  assert.equal(plan.secrets.length, 1);
  assert.deepEqual(plan.secrets[0].occurrences.map((item) => item.source), [".cursor/mcp.json", "~/.hermes/config.yaml"]);
  // And the plan says which client documents ${VAR} expansion and which does not.
  assert.deepEqual(plan.secrets[0].occurrences.map((item) => item.expansion), ["undocumented", "documented"]);
});

test("references and placeholders are not credentials", () => {
  const plan = planAdoption(inventory([{
    source: ".mcp.json",
    platform: "claude",
    absolutePath: "/project/.mcp.json",
    content: JSON.stringify({
      mcpServers: {
        a: { env: { API_KEY: "${API_KEY}" } },
        b: { env: { API_KEY: "your-key-here" } },
        c: { env: { API_KEY: "" } },
        d: { env: { API_KEY: "env:API_KEY" } },
        e: { env: { API_KEY: "***" } },
      },
    }),
  }]));

  assert.equal(plan.secrets.length, 0);
});

test("a TOML configuration is reported rather than half-rewritten", () => {
  const plan = planAdoption(inventory([{
    source: ".codex/config.toml",
    platform: "codex",
    absolutePath: "/project/.codex/config.toml",
    content: '[mcp_servers.api]\ncommand = "npx"\n\n[mcp_servers.api.env]\nAPI_KEY = "realvalue123"\n',
  }]));

  assert.equal(plan.secrets.length, 0);
  assert.match(plan.skipped[0].reason, /TOML/);
});

test("variable names come from the key, not from the value", () => {
  assert.equal(variableNameFor(["headers", "X-MSSQL-Password-B64"]), "MSSQL_PASSWORD_B64");
  assert.equal(variableNameFor(["env", "GITHUB_TOKEN"]), "GITHUB_TOKEN");
  assert.equal(variableNameFor(["env", "api-key"], "APBKS_"), "APBKS_API_KEY");
});

test("rewriting JSON replaces only the literal and keeps the rest", () => {
  const plan = planAdoption(inventory([CURSOR_CONFIG]));
  const occurrences = plan.secrets[0].occurrences;
  const rewritten = rewriteConfig(CURSOR_CONFIG.content, "json", occurrences, ["MSSQL_PASSWORD_B64"]);

  const parsed = JSON.parse(rewritten);
  assert.equal(parsed.mcpServers.mssql.headers["X-MSSQL-Password-B64"], "${MSSQL_PASSWORD_B64}");
  assert.equal(parsed.mcpServers.mssql.headers["X-MSSQL-User"], "service_account");
  assert.equal(parsed.mcpServers.mssql.url, "http://db.example.com/mcp");
});

test("rewriting YAML keeps comments and every unrelated setting", () => {
  const plan = planAdoption(inventory([HERMES_CONFIG]));
  const rewritten = rewriteConfig(HERMES_CONFIG.content, "yaml", plan.secrets[0].occurrences, ["GITHUB_TOKEN"]);

  assert.match(rewritten, /# Profile/);
  assert.match(rewritten, /command: npx/);
  assert.match(rewritten, /GITHUB_TOKEN: \$\{GITHUB_TOKEN\}/);
  assert.ok(!rewritten.includes("ghp_realtokenvalue123456"));
});

test("a rewrite that cannot be placed leaves the file alone", () => {
  const occurrences = [{ keyPath: ["mcpServers", "gone", "env", "API_KEY"], format: "json" }];
  assert.equal(rewriteConfig('{"mcpServers":{}}', "json", occurrences, ["API_KEY"]), null);
  assert.equal(rewriteConfig("mcp_servers: {}\n", "yaml", occurrences, ["API_KEY"]), null);
});
