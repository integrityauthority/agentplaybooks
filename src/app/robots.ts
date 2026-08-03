import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// Answer-engine crawlers we explicitly welcome. The `*` rule below already
// allows them, so these entries carry no extra permission — they exist so the
// intent is unambiguous to operators reading robots.txt, and so the names stay
// in one place when vendors rename their agents.
//
// `Claude-Web` and `Anthropic-AI` used to be listed here and are retired names;
// Anthropic now crawls as `ClaudeBot`, fetches user-requested pages as
// `Claude-User`, and indexes for search as `Claude-SearchBot`. `Google-Extended`
// and `Applebot-Extended` are not crawlers at all but AI-usage opt-in tokens —
// allowing them is what keeps this content eligible for Gemini and Apple
// grounding.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Public playbook and MCP endpoints are intentionally crawlable so AI
        // clients can retrieve shared playbooks (for example,
        // /api/playbooks/:id and /.well-known/skills/). Only the authenticated
        // app is closed.
        disallow: ["/dashboard", "/login", "/invite/"],
      },
      {
        userAgent: AI_CRAWLERS,
        allow: "/",
        disallow: ["/dashboard", "/login", "/invite/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
