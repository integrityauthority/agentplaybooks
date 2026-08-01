---
description: Pull a remote playbook's skills from agentplaybooks.ai into this project
argument-hint: "<playbook-id-or-guid> [path]"
---

Pull a remote AgentPlaybooks playbook into the local project.

1. If no playbook reference was given, run
   `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" playbooks` and let the
   user pick one. If that fails with a missing-key error, ask the user to run
   `agentplaybooks login` (or set `AGENTPLAYBOOKS_API_KEY`) first — never ask
   them to paste the key into the chat.
2. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" pull $ARGUMENTS --json`
3. Summarize the plan: whether the playbook's instructions would be written to
   `AGENTS.md`, which skills would be created under `.agents/skills/`,
   which MCP servers would be added to `.agents/mcp.json`, and any conflicts
   with existing local files (these are skipped, never overwritten). OpenAPI
   federation servers are hosted-only and appear as conflicts by design.
4. Only after the user confirms, re-run with `--apply`, then run
   `sync` to propagate the pulled skills and MCP servers to the platform
   targets. On a fresh project no target exists yet, so read `suggestedTargets`
   from the sync plan and offer `sync --target=<types> --apply`.
5. If the playbook declares `spec.secrets`, list the environment variables the
   user still needs to set. Never ask for or echo their values.
