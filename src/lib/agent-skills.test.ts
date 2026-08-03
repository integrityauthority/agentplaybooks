import { describe, expect, it } from "vitest";
import { validateAgentSkillDescription, validateAgentSkillName } from "./agent-skills";

describe("Agent Skills field validation", () => {
  it("accepts specification-compatible names", () => {
    expect(validateAgentSkillName("code-review")).toBeNull();
    expect(validateAgentSkillName("skill2")).toBeNull();
  });

  it("rejects underscores, repeated hyphens, and overlong names", () => {
    expect(validateAgentSkillName("code_review")).toMatch(/hyphens/);
    expect(validateAgentSkillName("code--review")).toMatch(/hyphens/);
    expect(validateAgentSkillName("a".repeat(65))).toMatch(/64/);
  });

  it("enforces the description length limit", () => {
    expect(validateAgentSkillDescription("")).toMatch(/required/);
    expect(validateAgentSkillDescription("a".repeat(1024))).toBeNull();
    expect(validateAgentSkillDescription("a".repeat(1025))).toMatch(/1024/);
  });
});
