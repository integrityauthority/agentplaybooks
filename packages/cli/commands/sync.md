---
description: Sync the playbook manifest and platform files (claude, cursor) — plan first, apply on approval
argument-hint: "[path]"
---

Synchronize the project's portable playbook with the AgentPlaybooks CLI.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" sync $ARGUMENTS --json`
2. Summarize the plan for the user: manifest create/update, platform files to
   be written per target, and any conflicts.
3. Conflicts mean the same skill or MCP server has different definitions on
   different platforms. Do not work around them; ask the user which variant is
   canonical, align the files, then re-plan.
4. Only after the user confirms the plan, run the same command with `--apply`
   and report what was written (backups land in `.agentplaybooks/backups/`).
