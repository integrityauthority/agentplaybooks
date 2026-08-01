-- Project instructions as a first-class part of a playbook.
--
-- A playbook already carries a persona (who the agent is: voice, standing
-- behaviour) which every client receives as its system prompt. Project
-- instructions are a different thing: the operating rules of one codebase or
-- workspace ("this repo uses pnpm", "run the tests before committing"). Local
-- agent tools keep them in `AGENTS.md` / `CLAUDE.md` and always load them,
-- whereas skills are selected on demand by description.
--
-- Keeping them in a separate column means a playbook can move both without
-- concatenating them into one blob: the persona is portable across projects,
-- the instructions belong to the project. At MCP time they are composed
-- persona-first, which is how agent runtimes already layer identity and
-- project context.

ALTER TABLE public.playbooks
  ADD COLUMN IF NOT EXISTS instructions text;

COMMENT ON COLUMN public.playbooks.instructions IS
  'Always-on project instructions (AGENTS.md / CLAUDE.md content). Complements persona_system_prompt, which carries agent identity. Never a place for credentials.';
