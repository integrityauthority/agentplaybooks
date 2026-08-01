---
title: One Playbook, Every Agent — CLI Adapters, Remote Sync, and the Claude Code Plugin
description: The AgentPlaybooks CLI now syncs your skills and MCP config across Claude Code, Cursor, ChatGPT/Codex, Google Antigravity, and Hermes Agent — and ships as a Claude Code plugin you can install in one command.
date: 2026-08-01
author: Mate Benyovszky
---

# One Playbook, Every Agent

Your agent configuration is scattered. Skills live in `.claude/skills/`, your
MCP servers in `.mcp.json`, a slightly different copy in `.cursor/mcp.json`,
instructions in `AGENTS.md` — and every new AI coding tool adds another
folder. Keeping them consistent by hand is exactly the kind of chore agents
were supposed to eliminate.

Today the AgentPlaybooks CLI closes that loop. `agentplaybooks sync` now
generates the platform files missing from every enabled target, `pull`/`push`
connect your local project to a hosted playbook, and the whole CLI doubles as
a **Claude Code plugin** — so your agent can run the workflow for you.

## Five platforms, one command

`apb sync` normalizes what it finds into the canonical `agentplaybook.json`
manifest, then fills the gaps per target:

| Target | Skills | MCP servers |
|---|---|---|
| Claude Code / Cowork | `.claude/skills/` | `.mcp.json` |
| Cursor | `.cursor/skills/` | `.cursor/mcp.json` |
| ChatGPT / OpenAI Codex | `.codex/skills/` | `.codex/config.toml` |
| Google Antigravity | `.agents/skills/` | — |
| Nous Hermes Agent | `~/.hermes/skills/` | — |

Write a skill once in Claude Code, run `apb sync --apply`, and it shows up in
Cursor, Codex, and Antigravity too — including your MCP server definitions,
translated between JSON and Codex's TOML automatically.

A nice detail: Google Antigravity reads project skills from
`.agents/skills/`, which is exactly AgentPlaybooks' portable store. Pull a
playbook and it is Antigravity-ready with zero extra steps.

## Safe by default

The sync engine keeps the guarantees from our original design:

- **Plan first.** Nothing is written or uploaded without an explicit
  `--apply`.
- **No silent overwrites.** Same-named definitions with different content are
  conflicts — reported and skipped until you resolve the drift.
- **Backups.** Any modified file is copied to `.agentplaybooks/backups/`
  first.
- **No secret leaks.** Secret values never enter the manifest, and `push`
  refuses to upload content that looks like it contains hard-coded
  credentials.

## Team playbooks: pull and push

```bash
apb login                 # store your user API key (apb_...)
apb push --apply          # upload skills + manifest to a hosted playbook
apb pull <guid> --apply   # teammates pull it into their projects
```

`pull` drops skills into the portable `.agents/skills/` store; a follow-up
`sync --apply` fans them out to every platform your teammate uses — even if
that's a different editor than yours. That's the point: **the playbook is
the portable unit, not the tool**.

## Install it as a Claude Code plugin

The CLI package is itself a Claude Code / Claude Cowork plugin, with an
`agentplaybooks` skill and slash commands:

```text
/plugin marketplace add integrityauthority/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Then just ask: *"audit my agent config"*, *"make my Claude skills available
in ChatGPT and Cursor"*, or run `/agentplaybooks:doctor`. The skill knows the
safe workflow — plan, show you the diff, apply only after you approve.

## Get started

```bash
git clone https://github.com/integrityauthority/agentplaybooks
node agentplaybooks/packages/cli/bin/agentplaybooks.js doctor .
```

Read the full guide in the [CLI & Editor Plugins docs](/docs/cli), and tell
us which platform adapter you want next — ROS 2 is already on the
[roadmap](/docs/roadmap).
