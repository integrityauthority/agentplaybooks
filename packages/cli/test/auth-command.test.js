import test from "node:test";
import assert from "node:assert/strict";
import { completeConsentViaServer, fetchTemplate, planConsent } from "../src/auth-command.js";

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
  assert.throws(() => planConsent({ ...gmail, authorization_url: undefined }), /authorization_url/);
  assert.throws(
    () => planConsent({
      ...gmail,
      transport_config: { auth: { ...gmail.transport_config.auth, token_url: undefined } },
    }),
    /token_url/,
  );
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

test("the code goes to our server, never to the provider's token endpoint", async () => {
  // This is the whole point of the server-side exchange: the CLI holds the code
  // and the verifier, and nothing else.
  const plan = planConsent(gmail);
  const { stub, wasClosed } = fakeServer("");
  const requests = [];

  const result = await completeConsentViaServer(plan, {
    url: "https://apb.test",
    guid: "guid-1",
    playbookKey: "apb_live_key",
    clientId: "client-abc",
    openBrowser: async (url) => {
      const state = new URL(url).searchParams.get("state");
      stub.callback = Promise.resolve(new URLSearchParams({ state, code: "THE-CODE" }));
    },
    startServer: () => stub,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse({ stored: "GMAIL_REFRESH_TOKEN", rotated: false, provider: "Gmail" });
    },
  });

  assert.equal(requests.length, 1, "exactly one request, and it is to us");
  assert.equal(requests[0].url, "https://apb.test/api/playbooks/guid-1/secrets/oauth-exchange");
  // Nothing was sent to Google.
  assert.ok(!requests.some((r) => String(r.url).includes("googleapis.com")));

  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.template_id, "gmail");
  assert.equal(body.code, "THE-CODE");
  assert.ok(body.code_verifier);
  assert.match(body.redirect_uri, /^http:\/\/127\.0\.0\.1:41234\/callback$/);
  // The client secret is not ours to send.
  assert.equal("client_secret" in body, false);
  // The token URL is the server's to decide, from the catalogue.
  assert.equal("token_url" in body, false);

  assert.equal(result.stored, "GMAIL_REFRESH_TOKEN");
  assert.ok(wasClosed(), "the loopback server must not be left listening");
});

test("a mismatched state stops the flow before the server is called", async () => {
  const plan = planConsent(gmail);
  const { stub } = fakeServer("state=NOT-OURS&code=abc");
  let called = false;
  await assert.rejects(
    completeConsentViaServer(plan, {
      url: "https://apb.test",
      guid: "g",
      playbookKey: "k",
      clientId: "c",
      openBrowser: async () => {},
      startServer: () => stub,
      fetchImpl: async () => { called = true; return jsonResponse({}); },
    }),
    /did not come from this request/,
  );
  assert.equal(called, false, "a foreign code must never be forwarded");
});

test("the server's error is passed through rather than paraphrased", async () => {
  // The useful case is the client secret not being in the vault yet, where the
  // server's message names the command to run.
  const plan = planConsent(gmail);
  const { stub } = fakeServer("");
  await assert.rejects(
    completeConsentViaServer(plan, {
      url: "https://apb.test",
      guid: "g",
      playbookKey: "k",
      clientId: "c",
      openBrowser: async (url) => {
        const state = new URL(url).searchParams.get("state");
        stub.callback = Promise.resolve(new URLSearchParams({ state, code: "c" }));
      },
      startServer: () => stub,
      fetchImpl: async () => jsonResponse(
        { error: "'GOOGLE_CLIENT_SECRET' is not in this playbook's vault. Store it first: agentplaybooks secrets push GOOGLE_CLIENT_SECRET" },
        400,
      ),
    }),
    /secrets push GOOGLE_CLIENT_SECRET/,
  );
});

test("a rotation is reported as such", async () => {
  const plan = planConsent(gmail);
  const { stub } = fakeServer("");
  const result = await completeConsentViaServer(plan, {
    url: "https://apb.test",
    guid: "g",
    playbookKey: "k",
    clientId: "c",
    openBrowser: async (url) => {
      const state = new URL(url).searchParams.get("state");
      stub.callback = Promise.resolve(new URLSearchParams({ state, code: "c" }));
    },
    startServer: () => stub,
    fetchImpl: async () => jsonResponse({ stored: "GMAIL_REFRESH_TOKEN", rotated: true }),
  });
  assert.equal(result.rotated, true);
});
