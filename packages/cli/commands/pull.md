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
3. Summarize the plan: which skills would be created under `.agents/skills/`,
   and any conflicts with existing local files (these are skipped, never
   overwritten).
4. Only after the user confirms, re-run with `--apply`, then suggest
   `sync --apply` to propagate the pulled skills to the enabled platform
   targets.
