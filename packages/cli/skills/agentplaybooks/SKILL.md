---
name: agentplaybooks
description: Audit, synchronize, and share portable agent configuration (instructions, Agent Skills, MCP servers) with the AgentPlaybooks CLI. Use when the user wants to check agent-config health or drift, copy skills/MCP config between Claude Code, Cursor, Codex/ChatGPT, Google Antigravity, or Hermes Agent, create an agentplaybook.json manifest, or pull/push a playbook from agentplaybooks.ai.
---

# AgentPlaybooks

AgentPlaybooks keeps an agent's operating configuration — instruction files
(`AGENTS.md`, `CLAUDE.md`), Agent Skills (`SKILL.md`), and MCP server
definitions — consistent across AI clients and shareable as a portable
"playbook" (`agentplaybook.json` manifest, optionally synced with a hosted
playbook on agentplaybooks.ai).

A hosted playbook keeps two different things apart: the **persona** is who the
agent is (identity, portable between projects), while **instructions** are the
always-on rules of one project (`AGENTS.md` / `CLAUDE.md` content). The CLI syncs
instructions; it never touches the persona.

## Locating the CLI

The CLI requires Node.js >= 20. Try in this order:

1. Installed as a Claude Code plugin: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js"`
2. Inside the AgentPlaybooks repository: `node packages/cli/bin/agentplaybooks.js`
3. Installed globally: `agentplaybooks` (alias: `apb`)

Substitute your variant for `apb` in the commands below.

## Commands

| Command | What it does | Writes? |
|---|---|---|
| `apb doctor [path] [--json] [--strict]` | Health report: inventory, spec violations, likely hard-coded secrets, insecure MCP URLs, cross-platform drift, 0-100 score | Never |
| `apb sync [path]` | Plan the canonical `agentplaybook.json` plus platform files missing from enabled targets (claude, cursor, codex, antigravity, hermes) | Plan only |
| `apb sync [path] --apply` | Write the manifest and missing platform files, with backups under `.agentplaybooks/backups/` | Yes |
| `apb sync [path] --target=<types>` | Also enable targets the project does not have yet, e.g. `--target=claude,codex` | Plan only without `--apply` |
| `apb login [--url=<base>]` | Store a user API key (`apb_...`) for a remote; reads `AGENTPLAYBOOKS_API_KEY` first | `~/.agentplaybooks/credentials.json` |
| `apb playbooks [--json]` | List remote playbooks the key can access | Never |
| `apb pull <id\|guid> [path] [--apply]` | Download a playbook's instructions into `AGENTS.md`, skills into `.agents/skills/`, and MCP servers into `.agents/mcp.json`, then link the project | With `--apply` |
| `apb push [path] [--apply]` | Upload local instructions, skills, MCP servers, and the manifest to the linked (or a new) remote playbook | With `--apply` |

## Typical workflows

- **"Is my agent config healthy?"** → `apb doctor . --json`, then explain the
  findings by severity with their sources and line numbers.
- **"Make my Claude skills available in Cursor / ChatGPT (Codex) / Antigravity / Hermes"**
  → run `apb sync --target=<type>`, show the user the plan, then re-run with
  `--apply`. Target file mapping: claude → `.claude/skills` + `.mcp.json`;
  cursor → `.cursor/skills` + `.cursor/mcp.json`; codex → `.codex/skills` +
  `.codex/config.toml`; antigravity → `.agents/skills` (portable store);
  hermes → `~/.hermes/skills` (home-scoped).
- **"Share this project's setup with my team"** → `apb login`, then `apb push`
  (review the plan), then `apb push --apply`. Give the team the playbook GUID;
  they run `apb pull <guid> --apply` followed by
  `apb sync --target=<their tools> --apply`. Skills and MCP servers both make
  the trip.
- **"Set this machine up from our team playbook"** → `apb pull <guid> --apply`,
  then `apb sync --apply`. If the project has no target yet, sync lists the
  agent tools it detected for this user; pass them via `--target`.
- **"Which credentials does this playbook need?"** → run
  `apb secrets status --json` (or read `spec.secrets` in `agentplaybook.json` if
  the project has no playbook key). It reports names and state only. Tell the
  user which variables to set; never try to fetch, print, or guess a value.
- **"Share our project rules with the team"** → the project-root instruction
  file travels with `push`. If `AGENTS.md` and `CLAUDE.md` disagree, `push`
  reports a conflict: ask which one is canonical, make the other a
  `@AGENTS.md` import, then re-run.
- **CI guard** → `apb doctor --strict --json` exits with code 2 on high or
  critical findings.

## Rules

- `doctor` is read-only and local-only; run it freely.
- `sync`, `pull`, and `push` are plan-only by default. Always show or
  summarize the plan for the user before running the same command with
  `--apply`.
- Conflicting definitions (same skill or MCP server, different content) are
  reported and skipped — the CLI never overwrites them. Ask the user which
  variant is canonical, align the files, then re-run.
- Never echo API keys. Prefer `AGENTPLAYBOOKS_API_KEY=<your-key>` in the
  environment over pasting keys into the terminal. `push` refuses to upload
  content that looks like it contains hard-coded credentials — fix the finding
  instead of working around it.
- `apb secrets status` is safe to run. **Do not run `apb secrets push` for the
  user**: storing a credential is theirs to confirm, and the command needs a
  value on stdin that you must never hold or generate. Tell them the exact
  command instead, e.g.
  `pass show deploy/api | apb secrets push DEPLOY_API_KEY`.
- `apb secrets run -- <command>` injects values into one child process and
  writes nothing to disk. Prefer it over asking the user to export variables,
  and never suggest writing secrets into `.env`, `.mcp.json`, or a skill.
- Secret values never belong in `agentplaybook.json` or in pushed content;
  only environment/vault references are allowed. `spec.secrets` records which
  variables the configuration references, never their values.
- `push` treats local files as authoritative for an MCP server's connection
  (command, args, env, url, headers) and preserves hosted-only settings
  (timeouts, auth, access, curated tool lists, descriptions). Remote entries
  missing locally are never deleted; say so rather than implying a full mirror.
- OpenAPI federation servers exist only on the hosted side. `pull` reports
  them; do not hand-write a local equivalent.
- Claude Code reads `CLAUDE.md`, not `AGENTS.md`. The `claude` target therefore
  writes a `CLAUDE.md` that imports `AGENTS.md` instead of duplicating the text.
  Never resolve an instruction conflict by copying content between the two —
  make one import the other.
