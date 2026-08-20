import { describe, expect, it } from "vitest";
import {
  buildExchangeBody,
  isLoopbackRedirect,
  isPlanFailure,
  planExchange,
  readExchangeResponse,
} from "./oauth-exchange";
import { CONNECTION_TEMPLATES } from "./connection-catalogue";

/**
 * The property that matters most here is negative: the token URL comes from the
 * catalogue and can never come from the request. A caller-supplied token URL
 * would make this endpoint hand the client secret to any address the caller
 * names — the same arbitrary-destination shape `allowed_hosts` exists to close
 * on the secrets proxy.
 */

describe("planExchange", () => {
  it("takes the token URL from the catalogue, not from any input", () => {
    const plan = planExchange("gmail");
    expect(isPlanFailure(plan)).toBe(false);
    if (isPlanFailure(plan)) return;
    const fromCatalogue = CONNECTION_TEMPLATES
      .find((template) => template.id === "gmail")!
      .transport_config.auth!.token_url;
    expect(plan.tokenUrl).toBe(fromCatalogue);
    expect(plan.refreshSecretName).toBe("GMAIL_REFRESH_TOKEN");
    expect(plan.clientSecretName).toBe("GOOGLE_CLIENT_SECRET");
  });

  it("accepts only ids the catalogue knows", () => {
    // There is no path by which a caller names a destination: an unknown id is
    // a 404, so the only reachable token URLs are the ones we shipped.
    for (const input of ["https://attacker.example/token", "../gmail", "gmial", ""]) {
      const plan = planExchange(input);
      expect(isPlanFailure(plan), `accepted '${input}'`).toBe(true);
    }
  });

  it("rejects a non-string template id", () => {
    for (const input of [undefined, null, 42, {}, ["gmail"]]) {
      expect(isPlanFailure(planExchange(input))).toBe(true);
    }
  });

  it("refuses a template that has no consent flow", () => {
    const plan = planExchange("cloudflare-mcp");
    expect(isPlanFailure(plan)).toBe(true);
    if (!isPlanFailure(plan)) return;
    expect(plan.status).toBe(400);
    expect(plan.error).toMatch(/does not use a consent flow/);
  });

  it("plans every consent template in the catalogue", () => {
    // A new consent entry should be usable without touching this endpoint.
    const consent = CONNECTION_TEMPLATES.filter((template) => template.requiresConsent);
    expect(consent.length).toBeGreaterThan(0);
    for (const template of consent) {
      const plan = planExchange(template.id);
      expect(isPlanFailure(plan), `could not plan ${template.id}`).toBe(false);
    }
  });
});

describe("isLoopbackRedirect", () => {
  it("accepts the loopback addresses the consent flow uses", () => {
    expect(isLoopbackRedirect("http://127.0.0.1:41234/callback")).toBe(true);
    expect(isLoopbackRedirect("http://localhost:8080/callback")).toBe(true);
  });

  it("rejects anything that is not loopback", () => {
    for (const value of [
      "https://attacker.example/callback",
      "http://169.254.169.254/callback",
      "http://127.0.0.1.attacker.example/callback",
      "not a url",
      "",
      undefined,
      null,
      42,
    ]) {
      expect(isLoopbackRedirect(value), `accepted ${String(value)}`).toBe(false);
    }
  });

  it("rejects https loopback, which this flow never uses", () => {
    // The CLI serves plain http on a loopback port; an https redirect means the
    // request did not come from it.
    expect(isLoopbackRedirect("https://127.0.0.1:41234/callback")).toBe(false);
  });
});

describe("buildExchangeBody", () => {
  const base = {
    code: "the-code",
    redirectUri: "http://127.0.0.1:41234/callback",
    clientId: "client-abc",
    codeVerifier: "the-verifier",
  };

  it("sends the code, the verifier and the client secret", () => {
    const body = buildExchangeBody({ ...base, clientSecret: "shhh" });
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("client_secret")).toBe("shhh");
  });

  it("omits client_secret entirely for a public client", () => {
    // Some providers reject an empty client_secret rather than ignoring it.
    expect(buildExchangeBody({ ...base, clientSecret: null }).has("client_secret")).toBe(false);
  });
});

describe("readExchangeResponse", () => {
  it("returns the refresh token on success", () => {
    expect(readExchangeResponse(200, { access_token: "at", refresh_token: "rt" }))
      .toEqual({ ok: true, refreshToken: "rt" });
  });

  it("names the missing refresh token as its own failure", () => {
    // The exchange succeeded, so this would otherwise surface much later.
    const result = readExchangeResponse(200, { access_token: "at" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/access_type=offline/);
  });

  it("reports the provider's description on refusal", () => {
    const result = readExchangeResponse(400, {
      error: "invalid_grant",
      error_description: "Code already redeemed",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Code already redeemed/);
  });

  it("never echoes the rest of a failure body", () => {
    // A token endpoint can echo the authorization code, and this text reaches a
    // client.
    const result = readExchangeResponse(400, {
      error: "invalid_grant",
      error_description: "Bad code",
      code: "SECRET-CODE",
      client_secret: "SHOULD-NEVER-APPEAR",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain("SECRET-CODE");
    expect(result.error).not.toContain("SHOULD-NEVER-APPEAR");
  });

  it("survives a body that is not an object", () => {
    for (const payload of [null, undefined, "nope", 42]) {
      expect(readExchangeResponse(500, payload).ok).toBe(false);
    }
  });
});
