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

## Locating the CLI

The CLI is zero-dependency Node.js (>= 20). Try in this order:

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
| `apb login [--url=<base>]` | Store a user API key (`apb_...`) for a remote; reads `AGENTPLAYBOOKS_API_KEY` first | `~/.agentplaybooks/credentials.json` |
| `apb playbooks [--json]` | List remote playbooks the key can access | Never |
| `apb pull <id\|guid> [path] [--apply]` | Download a remote playbook's skills into `.agents/skills/` and link the project | With `--apply` |
| `apb push [path] [--apply]` | Upload local skills and the manifest to the linked (or a new) remote playbook | With `--apply` |

## Typical workflows

- **"Is my agent config healthy?"** → `apb doctor . --json`, then explain the
  findings by severity with their sources and line numbers.
- **"Make my Claude skills available in Cursor / ChatGPT (Codex) / Antigravity / Hermes"**
  → ensure the manifest has the matching enabled target (run `apb sync` once,
  or add e.g. `{"id": "codex", "type": "codex", "enabled": true, "config": {}}`
  to `spec.targets` in `agentplaybook.json`), show the user the plan from
  `apb sync`, then run `apb sync --apply`. Target file mapping: claude →
  `.claude/skills` + `.mcp.json`; cursor → `.cursor/skills` + `.cursor/mcp.json`;
  codex → `.codex/skills` + `.codex/config.toml`; antigravity → `.agents/skills`
  (portable store); hermes → `~/.hermes/skills` (home-scoped).
- **"Share this project's skills with my team"** → `apb login`, then
  `apb push` (review the plan), then `apb push --apply`. Give the team the
  playbook GUID; they run `apb pull <guid> --apply` in their project.
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
- Secret values never belong in `agentplaybook.json` or in pushed content;
  only environment/vault references are allowed.
- Remote `push`/`pull` cover skills and the manifest. MCP server definitions
  travel between local platform files only — if the user expects them in the
  hosted playbook, say so instead of implying it works.
