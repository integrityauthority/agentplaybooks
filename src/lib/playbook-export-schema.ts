import type { Skill } from "@/lib/supabase/types";

export const MEMORY_TIERS = ["working", "contextual", "longterm"] as const;
export const RETENTION_POLICIES = ["permanent", "session", "auto"] as const;

export const exportedSkillSchema = {
  type: "object",
  description: "An instructional skill stored in SKILL.md-compatible form",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", description: "Skill name" },
    description: { type: ["string", "null"], description: "When the skill should be used" },
    // The whole document, not just the body: keeping the author's frontmatter is
    // what lets a skill written for one client keep the fields only that client
    // understands (`version`, `platforms`, `metadata.<client>.*`) across a
    // round trip.
    content: { type: ["string", "null"], description: "The SKILL.md document, including its YAML frontmatter when the author wrote one" },
    licence: { type: ["string", "null"] },
    priority: { type: ["integer", "null"] },
  },
} as const;

export const exportedMemoryFields = {
  tier: { type: "string", enum: [...MEMORY_TIERS], description: "RLM memory tier" },
  priority: { type: "integer", minimum: 1, maximum: 100 },
  parent_key: { type: ["string", "null"] },
  summary: { type: ["string", "null"] },
  retention_policy: { type: "string", enum: [...RETENTION_POLICIES] },
} as const;

export function exportSkill(skill: Skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    licence: skill.licence,
    priority: skill.priority,
  };
}
