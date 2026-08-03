/**
 * The site's one canonical origin.
 *
 * Before this file the origin was spelled out in four places with two different
 * defaults — `agentplaybooks.ai` in the root layout and robots, `apbks.com` in
 * the sitemap. That is not a cosmetic inconsistency: a canonical tag and a
 * sitemap that disagree about the host tell a crawler the two hosts are
 * separate sites competing for the same content.
 *
 * `agentplaybooks.ai` is the brand and therefore the canonical host.
 * `apbks.com` stays useful as a short domain for links — and because canonical
 * tags are built from this constant rather than from the request host, a page
 * served from apbks.com still points search engines at agentplaybooks.ai, so
 * the two never compete for the same content. A 301 from the short domain makes
 * that consolidation stronger but is not required for correctness.
 *
 * Set `NEXT_PUBLIC_APP_URL` in the deployment environment. The fallback exists
 * only so a local build works.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agentplaybooks.ai").replace(
  /\/$/,
  "",
);

/** Absolute URL for a root-relative path, for canonical tags and OG metadata. */
export function absoluteUrl(path = "/"): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
