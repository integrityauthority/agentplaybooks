import { describe, expect, it } from "vitest";
import {
  checkSecretDestination,
  normalizeAllowedHosts,
  requiresAllowedHosts,
} from "./secret-destinations";

describe("normalizeAllowedHosts", () => {
  it("lowercases, trims and drops empty entries", () => {
    expect(normalizeAllowedHosts([" API.GitHub.com ", "", "  "]))
      .toEqual(["api.github.com"]);
  });

  it("returns an empty list for non-array input", () => {
    expect(normalizeAllowedHosts(null)).toEqual([]);
    expect(normalizeAllowedHosts(undefined)).toEqual([]);
    expect(normalizeAllowedHosts("api.github.com")).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(normalizeAllowedHosts(["api.github.com", 42, null]))
      .toEqual(["api.github.com"]);
  });
});

describe("checkSecretDestination", () => {
  it("allows any destination when no allow-list is set", () => {
    expect(checkSecretDestination("https://anywhere.example/x", null))
      .toEqual({ allowed: true });
    expect(checkSecretDestination("https://anywhere.example/x", []))
      .toEqual({ allowed: true });
  });

  it("allows an exact host match", () => {
    expect(checkSecretDestination("https://api.github.com/user", ["api.github.com"]))
      .toEqual({ allowed: true });
  });

  it("is case-insensitive on both sides", () => {
    expect(checkSecretDestination("https://API.GitHub.com/user", ["api.github.com"]))
      .toEqual({ allowed: true });
  });

  it("rejects a host outside the allow-list", () => {
    const result = checkSecretDestination("https://attacker.example/x", ["api.github.com"]);
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toContain("attacker.example");
  });

  it("does not treat the allow-list entry as a substring", () => {
    // "api.github.com.attacker.example" must not match "api.github.com"
    expect(checkSecretDestination(
      "https://api.github.com.attacker.example/x",
      ["api.github.com"],
    ).allowed).toBe(false);
  });

  it("ignores path, port and query when matching", () => {
    expect(checkSecretDestination(
      "https://api.github.com:8443/a/b?c=d",
      ["api.github.com"],
    )).toEqual({ allowed: true });
  });

  describe("wildcard entries", () => {
    it("matches subdomains", () => {
      expect(checkSecretDestination("https://api.example.com/x", ["*.example.com"]))
        .toEqual({ allowed: true });
    });

    it("matches nested subdomains", () => {
      expect(checkSecretDestination("https://a.b.example.com/x", ["*.example.com"]))
        .toEqual({ allowed: true });
    });

    it("does not match the bare domain", () => {
      expect(checkSecretDestination("https://example.com/x", ["*.example.com"]).allowed)
        .toBe(false);
    });

    it("does not match a lookalike suffix", () => {
      expect(checkSecretDestination("https://notexample.com/x", ["*.example.com"]).allowed)
        .toBe(false);
    });
  });

  it("rejects an unparseable URL once an allow-list is set", () => {
    expect(checkSecretDestination("not a url", ["api.github.com"]).allowed).toBe(false);
  });

  describe("when the deployment requires an allow-list", () => {
    it("rejects an unpinned secret", () => {
      const result = checkSecretDestination("https://api.github.com/x", null, {
        requireAllowList: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.allowed === false && result.reason).toContain("allowed_hosts");
    });

    it("still allows a pinned secret to its own hosts", () => {
      expect(checkSecretDestination("https://api.github.com/x", ["api.github.com"], {
        requireAllowList: true,
      })).toEqual({ allowed: true });
    });
  });
});

describe("requiresAllowedHosts", () => {
  it("is off unless explicitly enabled", () => {
    expect(requiresAllowedHosts(undefined)).toBe(false);
    expect(requiresAllowedHosts("")).toBe(false);
    expect(requiresAllowedHosts("false")).toBe(false);
    expect(requiresAllowedHosts("1")).toBe(false);
  });

  it("is on for 'true' regardless of casing or padding", () => {
    expect(requiresAllowedHosts("true")).toBe(true);
    expect(requiresAllowedHosts(" TRUE ")).toBe(true);
  });
});
