import { describe, it, expect } from "vitest";
import { isSafeSkillFile, skillFileList, skillMarkdown } from "./skill-markdown";

describe("skillMarkdown", () => {
  it("generates spec-valid frontmatter for a body-only skill", () => {
    const document = skillMarkdown({
      name: "release",
      description: "Prepare a release.",
      content: "Use the checklist.\n",
      licence: "MIT",
    });

    expect(document).toBe('---\nname: release\ndescription: "Prepare a release."\nlicense: "MIT"\n---\n\nUse the checklist.\n');
  });

  it("preserves client-specific frontmatter fields instead of regenerating the block", () => {
    const content = `---
name: deploy
description: Deploy the service.
version: 1.2.0
platforms: [linux, macos]
metadata:
  hermes:
    category: devops
required_environment_variables:
  - DEPLOY_TOKEN
---
Run the deploy script.
`;

    const document = skillMarkdown({ name: "deploy", description: "Deploy the service.", content });

    // Every field outside the Agent Skills spec survives: it is the reason the
    // whole document is stored rather than the columns alone.
    expect(document).toContain("version: 1.2.0");
    expect(document).toContain("platforms: [linux, macos]");
    expect(document).toContain("category: devops");
    expect(document).toContain("- DEPLOY_TOKEN");
    expect(document).toContain("Run the deploy script.");
  });

  it("fills in a missing required field without touching the rest", () => {
    const document = skillMarkdown({
      name: "triage",
      description: "Triage incoming bugs.",
      content: "---\nversion: 2\n---\nSteps.\n",
    });

    expect(document).toMatch(/^---\ndescription: "Triage incoming bugs\."\nname: triage\nversion: 2\n---\n/);
  });

  it("corrects a frontmatter name that disagrees with the directory", () => {
    const document = skillMarkdown({
      name: "code-review",
      description: "Review a diff.",
      content: "---\nname: something-else\ndescription: Review a diff.\n---\nBody.\n",
    });

    // The name has to match the directory the skill is served from, or no client
    // will load it.
    expect(document).toContain("name: code-review");
    expect(document).not.toContain("something-else");
  });

  it("keeps a multi-line description untouched rather than corrupting the block", () => {
    const content = "---\nname: wide\ndescription: |\n  A long description\n  over two lines.\n---\nBody.\n";
    const document = skillMarkdown({ name: "wide", description: "A long description over two lines.", content });

    expect(document).toContain("description: |\n  A long description\n  over two lines.");
  });

  it("refuses to publish a skill with no description anywhere", () => {
    expect(skillMarkdown({ name: "empty", description: null, content: "Body only.\n" })).toBeNull();
  });

  it("takes the description from the frontmatter when the column is empty", () => {
    const document = skillMarkdown({
      name: "fallback",
      description: "  ",
      content: "---\nname: fallback\ndescription: From the frontmatter.\n---\nBody.\n",
    });

    expect(document).toContain("description: From the frontmatter.");
  });
});

describe("skill file names", () => {
  it("accepts spec directories and rejects traversal", () => {
    expect(isSafeSkillFile("references/ADVANCED.md")).toBe(true);
    expect(isSafeSkillFile("scripts/extract.py")).toBe(true);
    expect(isSafeSkillFile("../../etc/passwd")).toBe(false);
    expect(isSafeSkillFile("/etc/passwd")).toBe(false);
    expect(isSafeSkillFile("scripts\\win.ps1")).toBe(false);
    // SKILL.md is served from the document itself, never from an attachment.
    expect(isSafeSkillFile("SKILL.md")).toBe(false);
  });

  it("lists SKILL.md first and drops unsafe attachments", () => {
    expect(skillFileList([
      { filename: "references/B.md" },
      { filename: "../escape.md" },
      { filename: "assets/a.json" },
      { filename: null },
    ])).toEqual(["SKILL.md", "assets/a.json", "references/B.md"]);
  });
});
