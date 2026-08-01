# AgentPlaybooks CLI

Local-first CLI for auditing, synchronizing, and sharing portable agent
configuration. Zero runtime dependencies, Node.js >= 20.

```bash
node ./bin/agentplaybooks.js doctor ../my-project
node ./bin/agentplaybooks.js doctor ../my-project --json
node ./bin/agentplaybooks.js doctor ../my-project --strict

node ./bin/agentplaybooks.js sync ../my-project
node ./bin/agentplaybooks.js sync ../my-project --apply
```

`doctor` does not write files or use the network. It reports instruction
files, Agent Skills, MCP server definitions, likely hard-coded credentials,
insecure MCP URLs, cross-platform drift, and a 0-100 health score.

`sync` plans (and with `--apply`, writes) two things:

1. The canonical `agentplaybook.json` manifest.
2. The platform files missing from enabled deployment targets:

   | Target | Skills | MCP servers |
   |---|---|---|
   | `claude` (Claude Code / Cowork) | `.claude/skills/<name>/SKILL.md` | `.mcp.json` |
   | `cursor` | `.cursor/skills/<name>/SKILL.md` | `.cursor/mcp.json` |
   | `codex` (ChatGPT / Codex CLI) | `.codex/skills/<name>/SKILL.md` | `.codex/config.toml` |
   | `antigravity` (Google Antigravity) | `.agents/skills/<name>/SKILL.md` | — (global config only) |
   | `hermes` (Nous Hermes Agent) | `~/.hermes/skills/<name>/SKILL.md` | — (global `config.yaml`) |

   Targets come from `spec.targets` in the manifest; detected platforms are
   enabled automatically, `antigravity` and `hermes` are opt-in (add
   `{"id": "hermes", "type": "hermes", "enabled": true, "config": {}}`).
   Antigravity reads project skills from the portable `.agents/skills/` store;
   Hermes has no project-scoped store, so its adapter writes to the home
   directory and also picks instructions up from `AGENTS.md` natively.
   Same-named definitions with different content are reported as conflicts
   and skipped — never overwritten. Replaced files are backed up under
   `.agentplaybooks/backups/`.

## Remote sync

```bash
export AGENTPLAYBOOKS_API_KEY=<your-user-api-key>   # or paste on the login prompt
node ./bin/agentplaybooks.js login                  # verify + store the key
node ./bin/agentplaybooks.js playbooks              # list accessible playbooks

node ./bin/agentplaybooks.js pull <id|guid> --apply # skills -> .agents/skills/
node ./bin/agentplaybooks.js push --apply           # local skills + manifest -> remote
```

- Keys are user API keys (`apb_...`) created in the dashboard, stored with
  `0600` permissions in `~/.agentplaybooks/credentials.json`.
- `pull` writes remote skills into the portable `.agents/skills/` store and
  links the project via `.agentplaybooks/remote.json`; a subsequent
  `sync --apply` propagates them to the enabled platform targets.
- `push` uploads skills and the manifest to the linked playbook (or creates
  one). It never uploads secret values and refuses to push content that looks
  like it contains hard-coded credentials. Remote skills that no longer exist
  locally are left untouched.
- `pull` and `push` are plan-only unless `--apply` is supplied. Use
  `--url=<base>` or `AGENTPLAYBOOKS_URL` for self-hosted deployments.

## Claude Code / Claude Cowork plugin

This package doubles as a Claude Code plugin: it ships an `agentplaybooks`
skill plus `/agentplaybooks:doctor`, `:sync`, `:pull`, and `:push` commands
that drive this CLI. Install from the repository root marketplace:

```text
/plugin marketplace add integrityauthority/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

The skill also works standalone: copy `skills/agentplaybooks/` into a
project's `.claude/skills/` (or let `sync` do it once it is part of a
playbook).
