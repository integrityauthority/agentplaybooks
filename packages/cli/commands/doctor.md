---
description: Audit agent configuration health (instructions, skills, MCP, secrets, drift)
argument-hint: "[path]"
---

Audit the project's agent configuration with the AgentPlaybooks doctor.

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" doctor $ARGUMENTS --json`
   (default to the current project root when no path is given).
2. Report the health score and the finding counts by severity.
3. For each finding, show the source file (and line numbers if present) and a
   concrete fix. Group identical codes together.
4. If there are `secret.hardcoded` findings, recommend moving the values to
   environment references — never print suspected secret values.

Doctor is read-only and local-only; it changes nothing.
