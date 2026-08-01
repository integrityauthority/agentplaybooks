# CLI & Plugin Launch Kit

Launch only after the CLI is published to npm (or drop the `npm install` line
and keep the repository instructions). Canonical URLs:

- Blog: `https://apbks.com/blog/portable-playbooks-cli`
- Documentation: `https://apbks.com/docs/cli`
- Repository: `https://github.com/integrityauthority/agentplaybooks`

## Positioning

**One sentence:** AgentPlaybooks now syncs your agent skills and MCP
configuration across Claude Code, Cursor, ChatGPT/Codex, Google Antigravity,
and Hermes Agent — plan first, apply on approval, no silent overwrites.

**Three proof points:**

1. Write a skill once; `sync --apply` places it in every enabled target,
   translating MCP definitions between JSON and Codex TOML.
2. `push`/`pull` move skills and the manifest between a project and a hosted
   playbook, so a teammate on a different editor gets the same setup.
3. Conflicting definitions are reported and skipped, secrets never enter the
   manifest, and `push` refuses content containing hard-coded credentials.

Do not claim: real-time sync, MCP servers round-tripping to the hosted
playbook (local files only in this release), or support for platforms beyond
the five above.

## X (280 characters)

> Your agent skills live in 5 different folders. `.claude/skills`,
> `.cursor/skills`, `.codex/skills`, `.agents/skills`, `~/.hermes/skills`.
>
> Write once, run `apb sync --apply`, they're everywhere. Plans first, never
> overwrites, backs up.
>
> Open source: apbks.com/docs/cli

Character count target: keep under 280 including the shortened link. If it
runs long, cut the folder list to three entries and add "…and more".

### Optional follow-up thread

1. The interesting part isn't the copying — it's the refusal. Same skill name,
   different content in two tools? That's drift, not a merge. The CLI reports
   it and skips, so you decide which one is canonical.
2. MCP servers translate between formats: JSON for Claude Code and Cursor,
   TOML for Codex. If a definition can't be represented losslessly, you get a
   conflict instead of a silently mangled config.
3. It also audits: hard-coded credentials (line numbers only, never values),
   insecure http:// MCP URLs, Agent Skills spec violations, 0–100 health score.
   `--strict` fails CI.
4. And it ships as a Claude Code plugin, so the agent runs the workflow:
   `/plugin marketplace add integrityauthority/agentplaybooks`

## LinkedIn (3,000 character limit)

> **Your agent configuration has a copy-paste problem.**
>
> Every AI coding tool invented its own folder. Claude Code reads
> `.claude/skills` and `.mcp.json`. Cursor wants `.cursor/mcp.json`. Codex uses
> `.codex/skills` and a TOML config. Google Antigravity reads `.agents/skills`.
> Hermes Agent keeps skills in the home directory.
>
> So teams do what teams do: copy the file, edit one of the copies, forget the
> other, and three weeks later two agents behave differently for reasons nobody
> can reconstruct.
>
> We shipped the AgentPlaybooks CLI to make that a solved problem:
>
> **`agentplaybooks doctor`** — a read-only audit of what you actually have:
> instruction files, Agent Skills, MCP servers, likely hard-coded credentials
> (line numbers only, never the values), insecure MCP URLs, and same-named
> definitions that have drifted apart. It ends with a 0–100 score, and
> `--strict` makes high findings fail CI.
>
> **`agentplaybooks sync`** — normalizes everything into one portable manifest,
> then writes what each enabled target is missing. Five platforms today: Claude
> Code and Claude Cowork, Cursor, ChatGPT/Codex, Google Antigravity, and Nous
> Hermes Agent. MCP definitions are translated between JSON and Codex's TOML
> automatically.
>
> **`push` / `pull`** — move skills and the manifest between a project and a
> hosted playbook. Your teammate pulls it and syncs into whichever editor they
> prefer. The playbook is the portable unit, not the tool.
>
> Three design decisions I'd defend in a review:
>
> 1. **Plan before apply.** Every mutating command prints what it would do and
>    changes nothing until you pass `--apply`. Agents shouldn't rewrite your
>    configuration as a side effect of being asked a question.
> 2. **Conflicts are not merges.** If the same skill has different content in
>    two tools, that's information — a signal that someone edited one copy. The
>    CLI reports it and skips it. No last-write-wins.
> 3. **Secrets are references, never values.** They don't enter the manifest,
>    and `push` refuses to upload content that looks like it contains a
>    hard-coded key.
>
> One more thing: it ships as a Claude Code plugin, so you can just ask —
> "audit my agent config", "make my Claude skills available in ChatGPT" — and
> the agent runs the same safe workflow.
>
> Docs: https://apbks.com/docs/cli
> Write-up: https://apbks.com/blog/portable-playbooks-cli
>
> If you're running agents across more than one tool, I'd genuinely like to
> know which platform adapter you need next.

## Pre-publish checklist

- [ ] CLI published to npm (or the `npm install` line removed from all copy)
- [ ] Blog post reachable at the canonical URL in every locale (en/hu/de/es)
- [ ] `/docs/cli` reachable and linked from the docs index
- [ ] `doctor`, `sync`, `pull`, `push` smoke-tested from a clean clone
- [ ] Screenshot or 20–30s terminal recording of `sync` plan → apply

Platform limits referenced: X standard posts allow 280 characters; LinkedIn
posts allow up to 3,000 characters.
