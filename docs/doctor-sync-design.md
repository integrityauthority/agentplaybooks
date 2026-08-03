# AgentPlaybooks Doctor & Sync

Status: working design for the first CLI release (`v0.1`)

## Product promise

AgentPlaybooks keeps an agent's operating configuration consistent across AI
clients, teams, edge runtimes, and physical robots. The portable unit is a
Playbook: instructions, skills, tool connections, memory policy, secret
references, deployment targets, and safety policy.

The first user-facing wedge is intentionally smaller:

```text
agentplaybooks doctor  -> inspect locally, make risk and drift visible
agentplaybooks sync    -> create a safe, reviewable synchronization plan
```

Both commands are local-only by default. Neither command uploads telemetry or
configuration without an explicit opt-in.

## Doctor

`doctor` discovers agent configuration beneath a project directory and reports:

- Agent instruction files such as `AGENTS.md`, `CLAUDE.md`, and platform files.
- Agent Skills (`SKILL.md`) and basic Agent Skills specification violations.
- MCP configuration in known JSON and Codex TOML locations.
- Likely hard-coded credentials without printing credential values.
- Insecure remote MCP URLs.
- Same-named skills or MCP servers whose definitions drift across platforms.
- An inventory and a deterministic 0-100 health score.

The default command is diagnostic and exits successfully even when it finds
warnings. `--strict` makes high or critical findings fail CI. `--json` provides
stable machine-readable output. Home-directory configuration is out of scope
unless the user explicitly passes `--global`.

Future doctor adapters can add runtime checks without changing the core report:

- MCP handshake and tool-schema checks (`--network`).
- Skill malware and prompt-injection scanning.
- ROS 2 package, node, topic, service, action, and QoS validation.
- OPC UA and industrial gateway validation.
- Signed artifact, policy, approval, and audit checks for enterprise targets.

## Sync lifecycle

Sync is deliberately not blind two-way copying.

1. **Discover** local platform files.
2. **Normalize** them into `agentplaybook.json`.
3. **Plan** a diff against the last synchronized state and optional remote state.
4. **Review** conflicts, secret references, and target-specific changes.
5. **Apply** only with an explicit `--apply`.
6. **Verify** generated files and record hashes for the next three-way diff.

The CLI implements local manifest planning with atomic writes, platform file
generation for the `claude`, `cursor`, `codex` (ChatGPT), `antigravity`, and
`hermes` targets (skills and MCP server definitions wherever the platform keeps
them — a project directory, or a home-scoped profile in the case of Hermes;
conflicting definitions are reported and skipped),
and authenticated remote `pull`/`push` of project instructions, skills, MCP
servers, and the manifest against the management API using user API keys. Three-way conflict resolution
with recorded sync-state hashes will be added behind this same lifecycle.

Instructions are a first-class field on a playbook (`playbooks.instructions`),
kept separate from the persona on purpose: the persona is who the agent is and
travels between projects, while instructions are the always-on rules of one
project. A runtime that needs a single system prompt composes them
persona-first; storage never merges them. They are also not modelled as a skill,
because skills are selected on demand by description whereas instructions are
always in context.

Instruction files are not interchangeable across tools, so the CLI resolves them
by evidence rather than by assumption:

- `AGENTS.md` is the cross-vendor standard and wins when several project-root
  instruction files exist. Root files that disagree with each other are a
  conflict; nested instruction files stay local because they scope a
  subdirectory rather than the project.
- Claude Code reads `CLAUDE.md` and not `AGENTS.md`, but it supports `@` imports.
  The `claude` target therefore writes a `CLAUDE.md` containing `@AGENTS.md`
  instead of a copy: one source of truth cannot drift from itself. An existing
  `CLAUDE.md` without that import is reported, never rewritten.
- `AGENTS.md` no longer implies the `codex` platform. Only a `.codex/` path does,
  otherwise every project holding the vendor-neutral file would get a Codex
  deployment target it never asked for.

Two further asymmetries are deliberate rather than temporary:

- **The hosted record is richer than any local file.** A hosted MCP server can
  carry federation settings (timeouts, auth, access, curated tool lists) that no
  client config expresses. Local files are authoritative for the connection keys
  only (`command`, `args`, `env`, `url`, `headers`); everything else survives a
  push untouched. OpenAPI federation servers have no local equivalent at all and
  are reported on pull rather than half-translated.
- **The portable store is not a deployment target.** `pull` writes to
  `.agents/skills/` and `.agents/mcp.json`; a target has to be enabled before
  anything reaches a tool's own folder. On a machine where the project has no
  target yet, `sync` reports the agent tools detected for the user and
  `--target=<types>` enables them explicitly. Detection never enables anything
  on its own.

Deletion is not mirrored in either direction yet: remote entries missing
locally are left alone. A `--prune` mode belongs behind the same plan/apply
gate as everything else.

Safety rules:

- `agentplaybooks sync` is plan-only.
- Non-interactive mutation requires `agentplaybooks sync --apply`.
- Existing files are backed up before replacement.
- Secret values never enter the manifest; only environment, vault, or platform
  references are allowed. `spec.secrets` is populated from the environment
  references discovered in local configuration, so a playbook declares what it
  needs to run without carrying a single credential. Hand-edited entries (a
  vault ref, `required: false`) win over discovery on later syncs.
- No CLI command writes a plaintext secret value to disk. `secrets push` reads a
  value from stdin or a named environment variable — never from argv, which is
  visible in shell history and in the process list — and requires an explicit
  typed confirmation. `secrets run` holds values in memory only, for the lifetime
  of one child process. A generated `.env` was considered and rejected: a
  credential at rest on a developer machine is the thing this design avoids.
- Vault access uses a playbook-scoped API key rather than the account-wide user
  key that `push`/`pull` use, so the credential that can reach secrets is limited
  to one playbook. This also avoided widening the server's authorization model:
  the secrets endpoints already accept exactly this credential.
- Conflicts never silently use last-write-wins.
- A robot configuration deployment does not authorize physical actuation.
- Physical actions default to deny and require a separate runtime policy,
  approval path, and emergency-stop capability.

## Portable manifest

The first canonical representation is JSON so it can be parsed without adding
a runtime dependency. A JSON Schema lives at
`schemas/agentplaybook-v1alpha1.schema.json`. YAML can be supported as a view
later while JSON remains the wire format.

The manifest is extensible through deployment targets:

- Developer agents: Codex, Claude, Cursor, Copilot, Gemini, generic MCP.
- Robot and edge: ROS 2, OPC UA, generic edge runtime.
- Enterprise: approved gateway, environment promotion, signing and policy.

Robot support belongs in the core model, but hardware-specific execution stays
in adapters. A Playbook describes capabilities and policy; a ROS 2 adapter, for
example, maps approved capabilities to nodes, topics, services, and actions.

Enterprise scope is layered rather than forked:

```text
organization policy -> team playbook -> project playbook -> device/runtime overlay
```

The closest layer may specialize behavior but cannot weaken enforced parent
policy. Production promotion can later require approval and a signed immutable
manifest digest.

## Brand and domains

Recommended domain policy:

- `agentplaybooks.ai`: canonical website, documentation, dashboard, and brand.
- `api.agentplaybooks.ai`: canonical public API and MCP endpoints.
- `apbks.com`: short links and redirects only, for example `apbks.com/p/<id>`.
- CLI/package: `apb` and `@agentplaybooks/cli`.

This keeps the memorable descriptive brand while retaining the useful short
domain. Search engines and documentation see one canonical host; QR codes,
robots, terminals, and spoken links can use the short domain.

## Delivery sequence

1. Local doctor, JSON output, strict CI mode. (done)
2. Local manifest plan/apply with backups. (done)
3. Platform adapters (claude, cursor, codex, antigravity, hermes: done) and
   three-way sync state.
4. Authenticated remote push/pull (done) and team collaboration.
5. Claude Code plugin: skill + commands shipped inside `packages/cli`,
   marketplace manifest at the repository root. (done)
6. GitHub Action, health badge, and opt-in aggregate health index.
7. ROS 2 inventory/validation adapter.
8. Enterprise policies, approvals, signing, audit, and gateway deployment.

## Backlog

**Rewriting a credential in Codex's TOML config.** `secrets adopt --rewrite`
replaces a hard-coded value with a `${VAR}` reference in JSON and YAML
configurations. Codex's `.codex/config.toml` is deliberately left out, and the
reason is not the file format: replacing one `key = "value"` on a single line,
guarded to the double-quoted single-line form and refusing everything else, is a
small and low-risk change. The blocker is that **it is undocumented whether the
Codex CLI expands `${VAR}` in `config.toml` at all** — there is an open request
for that documentation (openai/codex#7521), and the community does not agree on
whether the syntax is `$VAR` or `${VAR}`, nor on whether expansion happens at
config load or at server launch. Rewriting a config whose client may not expand
the reference turns a working server into an authentication failure, which is
exactly what the adopt design refuses to risk. Until the behaviour is confirmed
on a real Codex install, Codex is covered by `apb secrets run -- codex`, which
injects the value into that one process and changes no file.

**Declarative secret inheritance.** `spec.governance.inherits[]` exists in the
schema and nothing reads it. The vault is playbook-scoped, so a credential two
playbooks both need has to be stored in both — or referenced through
`apb secrets run --playbook=<baseline-guid>`, which works today but is a manual
step. `inherits` would make a "workstation baseline" playbook a first-class
parent instead.

**Machine-scoped manifest in the secrets commands.** `apb sync --global` writes
its manifest to `~/.agentplaybooks/agentplaybook.json`, but
`readManifestSecrets` looks for `<root>/agentplaybook.json`, so
`apb secrets status --global` does not see the machine's declared secrets yet.
