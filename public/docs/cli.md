# CLI & Editor Plugins

The AgentPlaybooks CLI (`@agentplaybooks/cli`, binary `agentplaybooks` or
`apb`) keeps your agent configuration — instruction files, Agent Skills, and
MCP server definitions — healthy, consistent across AI coding tools, and
shareable as a hosted playbook. It is a zero-dependency Node.js (>= 20)
package that lives in [`packages/cli`](https://github.com/integrityauthority/agentplaybooks/tree/main/packages/cli).

## Doctor: audit your agent configuration

```bash
apb doctor .            # human-readable health report
apb doctor . --json     # stable machine-readable output
apb doctor . --strict   # exit code 2 on high/critical findings (CI)
```

Doctor is read-only and local-only. It discovers `AGENTS.md`, `CLAUDE.md`,
`.cursorrules`, `SKILL.md` files, and MCP configs across platform folders and
reports:

- Agent Skills specification violations (missing name/description, bad names)
- Likely hard-coded credentials (values are never printed, only line numbers)
- Insecure `http://` MCP URLs outside localhost
- Same-named skills or MCP servers whose definitions drift between platforms
- A deterministic 0–100 health score

## Sync: one playbook, every agent

```bash
apb sync .              # plan only — shows what would be written
apb sync . --apply      # write the manifest and missing platform files
```

Sync normalizes what it finds into the canonical `agentplaybook.json`
manifest, then generates the files missing from each enabled deployment
target:

| Target | Skills | MCP servers |
|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<name>/SKILL.md` | `.mcp.json` |
| `cursor` — Cursor | `.cursor/skills/<name>/SKILL.md` | `.cursor/mcp.json` |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<name>/SKILL.md` | `.codex/config.toml` |
| `antigravity` — Google Antigravity | `.agents/skills/<name>/SKILL.md` | — (global config) |
| `hermes` — Nous Hermes Agent | `~/.hermes/skills/<name>/SKILL.md` | — (global `config.yaml`) |

Detected platforms are enabled automatically; `antigravity` and `hermes` are
opt-in — add an entry to `spec.targets` in `agentplaybook.json`:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

Safety rules:

- Plan-only unless `--apply` is passed explicitly.
- Same-named definitions with different content are **conflicts**: reported
  and skipped, never overwritten. Resolve the drift, then re-run.
- Modified files are backed up under `.agentplaybooks/backups/` first.
- Secret values never enter the manifest — only environment references.
- Line endings are normalized (CRLF is treated as LF), so the same skill has
  the same digest on Windows, macOS, and Linux. A mixed-platform team never
  sees phantom drift from a checkout difference.

## Remote sync: share playbooks with your team

```bash
export AGENTPLAYBOOKS_API_KEY=<your-user-api-key>
apb login               # verify and store the key (~/.agentplaybooks, 0600)
apb playbooks           # list playbooks your key can access

apb pull <guid> --apply # download skills into .agents/skills/
apb push --apply        # upload local skills + manifest
```

The round trip works in both directions:

- **Local → hosted** (`push`): skills discovered in any platform folder plus
  the canonical manifest are uploaded to the linked (or a new) playbook.
  Remote skills that no longer exist locally are left untouched, secret values
  are never uploaded, and the CLI refuses to push content that looks like it
  contains hard-coded credentials.
- **Hosted → local** (`pull` + `sync --apply`): remote skills land in the
  portable `.agents/skills/` store and the project is linked via
  `.agentplaybooks/remote.json`; the follow-up sync fans them out to every
  enabled platform target, whichever editor your teammate uses.

Use `--url=<base>` or `AGENTPLAYBOOKS_URL` for self-hosted deployments.

Scope note for this release: remote `push`/`pull` cover skills and the
manifest. MCP server definitions are synchronized between local platform
files (`.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`) but are not yet
written to or read from the hosted playbook's MCP server list.

## Claude Code & Claude Cowork plugin

The CLI package doubles as a Claude Code plugin with an `agentplaybooks`
skill and `/agentplaybooks:doctor`, `:sync`, `:pull`, `:push` commands:

```text
/plugin marketplace add integrityauthority/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

After installing, ask Claude things like *"audit my agent config"* or *"make
my Claude skills available in Cursor and ChatGPT"* — the skill knows the safe
workflow (plan first, apply after your approval).

## Other platforms

- **ChatGPT / Codex**: skills land in `.codex/skills/`, MCP servers in
  `.codex/config.toml` — picked up by the Codex CLI and ChatGPT's coding
  agent automatically.
- **Google Antigravity**: reads project skills from `.agents/skills/`, which
  is exactly AgentPlaybooks' portable store — a pulled playbook is
  Antigravity-ready with no extra step.
- **Hermes Agent**: has no project-scoped store, so the adapter writes to
  `~/.hermes/skills/` (shown as a home-path in the plan); Hermes also reads
  `AGENTS.md` instructions natively.
- **Cursor**: skills in `.cursor/skills/`, MCP servers in `.cursor/mcp.json`.
