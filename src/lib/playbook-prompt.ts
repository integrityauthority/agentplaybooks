/**
 * `persona_system_prompt` says who the agent is and travels with it between
 * projects. `instructions` are the always-on operating rules of one project
 * (the AGENTS.md / CLAUDE.md content). They are stored as separate columns and
 * are never merged on write.
 *
 * A runtime that can only take a single system prompt needs them joined, so
 * this is the one place that composes them: persona first, then instructions.
 */
export function composePlaybookSystemPrompt(
  personaSystemPrompt: string,
  instructions: string | null | undefined
): string {
  // An absent or blank field must leave the prompt byte-for-byte unchanged.
  if (!instructions?.trim()) return personaSystemPrompt;
  return `${personaSystemPrompt}\n\n${instructions}`;
}
