---
description: Push local skills and the playbook manifest to agentplaybooks.ai
argument-hint: "[path]"
---

Push the local playbook to the linked (or a new) remote playbook.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" push $ARGUMENTS --json`
   If it fails with a missing-key error, ask the user to run
   `agentplaybooks login` (or set `AGENTPLAYBOOKS_API_KEY`) first — never ask
   them to paste the key into the chat.
2. Summarize the plan: playbook create/update, skill creates/updates, and any
   skipped conflicts. Note that remote skills missing locally are left
   untouched, and no secret values are ever uploaded.
3. If the CLI refuses because of likely hard-coded credentials, help the user
   move the values to environment references and re-plan — do not bypass it.
4. Only after the user confirms, re-run with `--apply` and report the playbook
   GUID so teammates can `pull` it.
