import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import {
  buildAuthorizeUrl,
  buildTokenRequestBody,
  interpretCallback,
  pkcePair,
  randomState,
  readRefreshToken,
  startCallbackServer,
} from "../src/oauth.js";

const query = (search) => new URLSearchParams(search);

test("pkcePair derives an S256 challenge from the verifier", () => {
  const { verifier, challenge, method } = pkcePair();
  assert.equal(method, "S256");
  const expected = crypto.createHash("sha256").update(verifier).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(challenge, expected);
});

test("pkce values are base64url with no padding", () => {
  // Padding and + / would need escaping in a query string; providers reject
  // challenges that arrive re-encoded.
  const { verifier, challenge } = pkcePair();
  for (const value of [verifier, challenge, randomState()]) {
    assert.match(value, /^[A-Za-z0-9_-]+$/, `not base64url: ${value}`);
  }
});

test("the challenge is never the verifier", () => {
  // A `plain` challenge is the verifier, so anything that can read the
  // authorize request can replay it. S256 is the whole point.
  const { verifier, challenge } = pkcePair();
  assert.notEqual(verifier, challenge);
});

test("two calls do not produce the same verifier", () => {
  assert.notEqual(pkcePair().verifier, pkcePair().verifier);
});

test("buildAuthorizeUrl sends the code challenge, not the verifier", () => {
  const { verifier, challenge } = pkcePair();
  const url = new URL(buildAuthorizeUrl({
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: "client-123",
    redirectUri: "http://127.0.0.1:5555/callback",
    scopes: ["a", "b"],
    state: "state-abc",
    challenge,
  }));
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "a b");
  // The verifier stays on this machine until the exchange.
  assert.ok(!url.toString().includes(verifier));
});

test("buildAuthorizeUrl carries provider-specific extras", () => {
  // Google issues no refresh token at all without access_type=offline.
  const url = new URL(buildAuthorizeUrl({
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: "c",
    redirectUri: "http://127.0.0.1:1/callback",
    state: "s",
    challenge: "ch",
    extraParams: { access_type: "offline", prompt: "consent" },
  }));
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
});

test("buildAuthorizeUrl refuses to build a URL it cannot", () => {
  const valid = { clientId: "c", redirectUri: "r", state: "s", challenge: "ch" };
  assert.throws(() => buildAuthorizeUrl({ ...valid, authorizationUrl: undefined }), /authorization_url/);
  assert.throws(() => buildAuthorizeUrl({ ...valid, authorizationUrl: "https://x/a", clientId: "" }), /client_id/);
});

test("buildAuthorizeUrl keeps query parameters already on the endpoint", () => {
  const url = new URL(buildAuthorizeUrl({
    authorizationUrl: "https://provider.example/auth?tenant=acme",
    clientId: "c",
    redirectUri: "http://127.0.0.1:1/callback",
    state: "s",
    challenge: "ch",
  }));
  assert.equal(url.searchParams.get("tenant"), "acme");
  assert.equal(url.searchParams.get("client_id"), "c");
});

test("a callback with a different state is rejected", () => {
  // Not this flow's callback, so its code is not this flow's code.
  const result = interpretCallback(query("code=abc&state=someone-else"), "mine");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "state-mismatch");
});

test("a missing state is rejected too", () => {
  assert.equal(interpretCallback(query("code=abc"), "mine").ok, false);
});

test("a provider error is reported with its description", () => {
  const result = interpretCallback(
    query("state=mine&error=access_denied&error_description=User+said+no"),
    "mine",
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "access_denied");
  assert.match(result.message, /User said no/);
});

test("a callback with the right state and a code succeeds", () => {
  assert.deepEqual(interpretCallback(query("state=mine&code=abc"), "mine"), { ok: true, code: "abc" });
});

test("a callback with the right state but no code is not a success", () => {
  const result = interpretCallback(query("state=mine"), "mine");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-code");
});

test("the token request sends the verifier and the code", () => {
  const body = buildTokenRequestBody({
    code: "the-code",
    redirectUri: "http://127.0.0.1:5555/callback",
    clientId: "c",
    clientSecret: "s",
    verifier: "the-verifier",
  });
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "the-code");
  assert.equal(body.get("code_verifier"), "the-verifier");
  assert.equal(body.get("client_secret"), "s");
});

test("a public client sends no client_secret at all", () => {
  // Some providers reject an empty client_secret rather than ignoring it.
  const body = buildTokenRequestBody({
    code: "c", redirectUri: "r", clientId: "id", clientSecret: null, verifier: "v",
  });
  assert.equal(body.has("client_secret"), false);
});

test("a response without a refresh token is its own named failure", () => {
  // The exchange succeeds and an access token comes back, so this would
  // otherwise surface much later as a missing secret.
  const result = readRefreshToken({ access_token: "at", expires_in: 3600 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-refresh-token");
  assert.match(result.message, /access_type=offline/);
});

test("a refresh token is read out when present", () => {
  assert.deepEqual(readRefreshToken({ access_token: "at", refresh_token: "rt" }), {
    ok: true,
    refreshToken: "rt",
  });
});

test("the callback server listens only on loopback", async () => {
  const server = startCallbackServer();
  const port = await server.ready;
  try {
    assert.ok(port > 0);
    // A code arriving from off-machine would be a code we did not ask for.
    const reachable = await new Promise((resolve) => {
      const request = http.get({ host: "127.0.0.1", port, path: "/callback?state=s&code=c" }, (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on("error", () => resolve(null));
    });
    assert.equal(reachable, 200);
    assert.deepEqual([...(await server.callback)], [["state", "s"], ["code", "c"]]);
  } finally {
    server.close();
  }
});

test("the callback server ignores a request to another path", async () => {
  const server = startCallbackServer();
  const port = await server.ready;
  try {
    const status = await new Promise((resolve) => {
      http.get({ host: "127.0.0.1", port, path: "/favicon.ico" }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", () => resolve(null));
    });
    assert.equal(status, 404);
  } finally {
    server.close();
  }
});

test("the callback server gives up rather than waiting forever", async () => {
  const server = startCallbackServer({ timeoutMs: 30 });
  await server.ready;
  await assert.rejects(server.callback, /Timed out/);
});
