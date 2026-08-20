import crypto from "node:crypto";
import http from "node:http";

/**
 * The one-time consent step for a user-scoped connection.
 *
 * Federation can renew a refresh token forever, but it cannot obtain the first
 * one: that needs a browser and a redirect target, neither of which a Worker
 * has. So it happens here, once, and only the resulting refresh token is stored.
 *
 * The flow is authorization code + PKCE against a loopback redirect, which is
 * what providers expect from a native client and what avoids putting a client
 * secret in the authorize request.
 */

/** Base64url without padding, as the PKCE spec requires. */
function base64url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A verifier/challenge pair. S256 only: the spec permits `plain`, but a plain
 * challenge is the verifier, so anything that can read the authorize request can
 * replay it.
 */
export function pkcePair(randomBytes = crypto.randomBytes) {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge, method: "S256" };
}

export function randomState(randomBytes = crypto.randomBytes) {
  return base64url(randomBytes(16));
}

/**
 * The URL to open in the browser.
 *
 * `scope` is space-delimited per the spec. Provider-specific extras arrive
 * through `extraParams` rather than being special-cased here — Google needs
 * access_type=offline or it silently issues no refresh token at all, which is
 * the kind of thing that belongs in the catalogue next to the provider, not in
 * this function.
 */
export function buildAuthorizeUrl({
  authorizationUrl,
  clientId,
  redirectUri,
  scopes = [],
  state,
  challenge,
  extraParams = {},
}) {
  if (!authorizationUrl) throw new Error("The connection template has no authorization_url.");
  if (!clientId) throw new Error("A client_id is required to ask for consent.");
  const url = new URL(authorizationUrl);
  const params = url.searchParams;
  params.set("response_type", "code");
  params.set("client_id", clientId);
  params.set("redirect_uri", redirectUri);
  params.set("state", state);
  params.set("code_challenge", challenge);
  params.set("code_challenge_method", "S256");
  if (scopes.length > 0) params.set("scope", scopes.join(" "));
  for (const [key, value] of Object.entries(extraParams)) params.set(key, value);
  return url.toString();
}

/**
 * What a redirect back from the provider means.
 *
 * The state check is the reason this is a function rather than three lines
 * inline: a callback whose state does not match is not this flow's callback, and
 * accepting its code would be accepting a code someone else chose.
 */
export function interpretCallback(query, expectedState) {
  const state = query.get("state");
  if (state !== expectedState) {
    return { ok: false, reason: "state-mismatch", message: "The redirect did not come from this request." };
  }
  const error = query.get("error");
  if (error) {
    const description = query.get("error_description");
    return { ok: false, reason: error, message: description || `The provider refused: ${error}.` };
  }
  const code = query.get("code");
  if (!code) {
    return { ok: false, reason: "no-code", message: "The redirect carried no authorization code." };
  }
  return { ok: true, code };
}

/**
 * Start the loopback listener and report the port it took, without waiting for
 * the redirect. The port has to be known first: it goes into redirect_uri, which
 * goes into the authorize URL, which is what the browser opens.
 *
 * Bound to 127.0.0.1 rather than a wildcard: the redirect carries an
 * authorization code, and nothing off this machine has any business delivering
 * one. It answers exactly one callback and then closes, so a later request
 * cannot be mistaken for this flow.
 */
export function startCallbackServer({ path = "/callback", timeoutMs = 300_000, createServer = http.createServer } = {}) {
  let resolveCallback;
  let rejectCallback;
  const callback = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  let settled = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname !== path) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Consent received. You can close this tab and return to the terminal.\n");
    if (!settled) {
      settled = true;
      resolveCallback(url.searchParams);
      server.close();
    }
  });

  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectCallback(new Error("Timed out waiting for the provider to redirect back."));
      server.close();
    }
  }, timeoutMs);
  if (typeof timer.unref === "function") timer.unref();

  const ready = new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });

  return {
    ready,
    callback: callback.finally(() => clearTimeout(timer)),
    close: () => {
      clearTimeout(timer);
      server.close();
    },
  };
}
