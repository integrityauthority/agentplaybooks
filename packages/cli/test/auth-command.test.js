import test from "node:test";
import assert from "node:assert/strict";
import { fetchTemplate, obtainRefreshToken, planConsent } from "../src/auth-command.js";

const gmail = {
  id: "gmail",
  requiresConsent: true,
  authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
  authorization_params: { access_type: "offline", prompt: "consent" },
  transport_config: {
    base_url: "https://gmail.googleapis.com",
    auth: {
      type: "oauth2_refresh_token",
      token_url: "https://oauth2.googleapis.com/token",
      client_id: "GOOGLE_CLIENT_ID",
      client_secret: "GOOGLE_CLIENT_SECRET",
      refresh_token_secret: "GMAIL_REFRESH_TOKEN",
      scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    },
  },
  secrets: [{ name: "GMAIL_REFRESH_TOKEN" }],
};

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("fetchTemplate reads a template from the catalogue", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "https://apb.test/api/connections?id=gmail");
    return jsonResponse(gmail);
  };
  assert.equal((await fetchTemplate("https://apb.test", "gmail", { fetchImpl })).id, "gmail");
});

test("fetchTemplate says how to list them when the id is wrong", async () => {
  const fetchImpl = async () => jsonResponse({ error: "nope" }, 404);
  await assert.rejects(
    fetchTemplate("https://apb.test", "gmial", { fetchImpl }),
    /No connection template 'gmial'.*api\/connections/s,
  );
});

test("planConsent pulls out both endpoints and the secret name", () => {
  const plan = planConsent(gmail);
  assert.equal(plan.authorizationUrl, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(plan.tokenUrl, "https://oauth2.googleapis.com/token");
  assert.equal(plan.refreshSecretName, "GMAIL_REFRESH_TOKEN");
  assert.deepEqual(plan.extraParams, { access_type: "offline", prompt: "consent" });
});

test("planConsent redirects a paste-in template to the right command", () => {
  // Running `auth` on a static-token service is a reasonable mistake; the error
  // should say what to do instead of what went wrong.
  const cloudflare = {
    id: "cloudflare-mcp",
    secrets: [{ name: "CLOUDFLARE_API_TOKEN" }],
    transport_config: { auth: { type: "bearer" } },
  };
  assert.throws(() => planConsent(cloudflare), /secrets push CLOUDFLARE_API_TOKEN/);
});

test("planConsent refuses a template missing an endpoint", () => {
  const noAuthUrl = { ...gmail, authorization_url: undefined };
  assert.throws(() => planConsent(noAuthUrl), /authorization_url/);

  const noTokenUrl = {
    ...gmail,
    transport_config: { auth: { ...gmail.transport_config.auth, token_url: undefined } },
  };
  assert.throws(() => planConsent(noTokenUrl), /token_url/);
});

test("planConsent refuses a template that does not name the secret", () => {
  const anonymous = {
    ...gmail,
    transport_config: { auth: { ...gmail.transport_config.auth, refresh_token_secret: undefined } },
  };
  assert.throws(() => planConsent(anonymous), /which secret/);
});

/** A server stub that hands back a callback the test controls. */
function fakeServer(searchParams) {
  let closed = false;
  return {
    stub: {
      ready: Promise.resolve(41234),
      callback: Promise.resolve(new URLSearchParams(searchParams)),
      close: () => { closed = true; },
    },
    wasClosed: () => closed,
  };
}

test("the whole flow returns the refresh token", async () => {
  const plan = planConsent(gmail);
  let openedUrl = null;
  let tokenBody = null;
  const { stub, wasClosed } = fakeServer("state=STATE&code=THE-CODE");

  // The state has to match what buildAuthorizeUrl put in the URL, so it is read
  // back out of the URL the browser was asked to open.
  const refreshToken = await obtainRefreshToken(plan, {
    clientId: "client-abc",
    clientSecret: "client-secret",
    openBrowser: async (url) => {
      openedUrl = new URL(url);
      const state = openedUrl.searchParams.get("state");
      stub.callback = Promise.resolve(new URLSearchParams({ state, code: "THE-CODE" }));
    },
    startServer: () => stub,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      tokenBody = new URLSearchParams(String(init.body));
      return jsonResponse({ access_token: "at", refresh_token: "the-refresh-token" });
    },
  });

  assert.equal(refreshToken, "the-refresh-token");
  assert.equal(openedUrl.searchParams.get("access_type"), "offline");
  assert.equal(openedUrl.searchParams.get("redirect_uri"), "http://127.0.0.1:41234/callback");
  assert.equal(tokenBody.get("code"), "THE-CODE");
  assert.equal(tokenBody.get("grant_type"), "authorization_code");
  assert.ok(tokenBody.get("code_verifier"));
  // The verifier is sent here and nowhere else.
  assert.ok(!openedUrl.toString().includes(tokenBody.get("code_verifier")));
  assert.ok(wasClosed(), "the loopback server must not be left listening");
});

test("a mismatched state fails before any token is requested", async () => {
  const plan = planConsent(gmail);
  const { stub, wasClosed } = fakeServer("state=NOT-OURS&code=abc");
  let exchanged = false;

  await assert.rejects(
    obtainRefreshToken(plan, {
      clientId: "c",
      openBrowser: async () => {},
      startServer: () => stub,
      fetchImpl: async () => { exchanged = true; return jsonResponse({}); },
    }),
    /did not come from this request/,
  );
  assert.equal(exchanged, false, "a foreign code must never be exchanged");
  assert.ok(wasClosed());
});

test("a provider refusal is reported in the provider's words", async () => {
  const plan = planConsent(gmail);
  const { stub } = fakeServer("");
  await assert.rejects(
    obtainRefreshToken(plan, {
      clientId: "c",
      openBrowser: async (url) => {
        const state = new URL(url).searchParams.get("state");
        stub.callback = Promise.resolve(new URLSearchParams({
          state, error: "access_denied", error_description: "User declined",
        }));
      },
      startServer: () => stub,
      fetchImpl: async () => jsonResponse({}),
    }),
    /User declined/,
  );
});

test("a token response without a refresh token explains why", async () => {
  const plan = planConsent(gmail);
  const { stub } = fakeServer("");
  await assert.rejects(
    obtainRefreshToken(plan, {
      clientId: "c",
      openBrowser: async (url) => {
        const state = new URL(url).searchParams.get("state");
        stub.callback = Promise.resolve(new URLSearchParams({ state, code: "c" }));
      },
      startServer: () => stub,
      fetchImpl: async () => jsonResponse({ access_token: "at" }),
    }),
    /access_type=offline/,
  );
});

test("a failed exchange does not echo the whole response body", async () => {
  // The body can contain the authorization code; only the named error fields
  // are safe to show.
  const plan = planConsent(gmail);
  const { stub } = fakeServer("");
  await assert.rejects(
    obtainRefreshToken(plan, {
      clientId: "c",
      openBrowser: async (url) => {
        const state = new URL(url).searchParams.get("state");
        stub.callback = Promise.resolve(new URLSearchParams({ state, code: "SECRET-CODE" }));
      },
      startServer: () => stub,
      fetchImpl: async () => jsonResponse(
        { error: "invalid_grant", error_description: "Bad code", code: "SECRET-CODE" },
        400,
      ),
    }),
    (error) => {
      assert.match(error.message, /Bad code/);
      assert.ok(!error.message.includes("SECRET-CODE"));
      return true;
    },
  );
});

test("a public client completes without a client secret", async () => {
  const plan = planConsent(gmail);
  const { stub } = fakeServer("");
  let tokenBody = null;
  const token = await obtainRefreshToken(plan, {
    clientId: "c",
    clientSecret: null,
    openBrowser: async (url) => {
      const state = new URL(url).searchParams.get("state");
      stub.callback = Promise.resolve(new URLSearchParams({ state, code: "c" }));
    },
    startServer: () => stub,
    fetchImpl: async (_url, init) => {
      tokenBody = new URLSearchParams(String(init.body));
      return jsonResponse({ refresh_token: "rt" });
    },
  });
  assert.equal(token, "rt");
  assert.equal(tokenBody.has("client_secret"), false);
});
