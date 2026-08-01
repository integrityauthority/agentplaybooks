import { describe, expect, it } from "vitest";
import { resolveAllowedOrigins } from "./hono";

describe("resolveAllowedOrigins", () => {
  it("falls back to the project's own domains when ALLOWED_ORIGINS is unset", () => {
    const origins = resolveAllowedOrigins(undefined, undefined);
    expect(origins).toContain("https://agentplaybooks.ai");
    expect(origins).toContain("https://apbks.com");
  });

  it("puts NEXT_PUBLIC_APP_URL first in the fallback list", () => {
    // The CORS handler uses the first entry for requests without an Origin.
    expect(resolveAllowedOrigins(undefined, "https://example.test")[0])
      .toBe("https://example.test");
  });

  it("replaces the list entirely when ALLOWED_ORIGINS is set", () => {
    const origins = resolveAllowedOrigins("https://apb.internal", undefined);
    expect(origins).toEqual(["https://apb.internal"]);
    // A self-hosted instance must not keep trusting the project's domains.
    expect(origins).not.toContain("https://agentplaybooks.ai");
  });

  it("parses a comma-separated list and trims whitespace", () => {
    expect(resolveAllowedOrigins(" https://a.test , https://b.test ", undefined))
      .toEqual(["https://a.test", "https://b.test"]);
  });

  it("ignores an empty or whitespace-only value", () => {
    expect(resolveAllowedOrigins("", undefined)).toContain("https://agentplaybooks.ai");
    expect(resolveAllowedOrigins("  ,  ", undefined)).toContain("https://agentplaybooks.ai");
  });
});
