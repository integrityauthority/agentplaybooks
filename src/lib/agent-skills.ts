export const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateAgentSkillName(name: unknown): string | null {
  if (typeof name !== "string" || name.length === 0) return "Skill name is required.";
  if (name.length > 64) return "Skill name must be no longer than 64 characters.";
  if (!AGENT_SKILL_NAME_PATTERN.test(name)) {
    return "Skill name must use lowercase letters, numbers, and single hyphens only (for example: code-review).";
  }
  return null;
}

export function validateAgentSkillDescription(description: unknown): string | null {
  if (typeof description !== "string" || description.trim().length === 0) {
    return "Skill description is required and must explain what the skill does and when to use it.";
  }
  if (description.length > 1024) return "Skill description must be no longer than 1024 characters.";
  return null;
}
