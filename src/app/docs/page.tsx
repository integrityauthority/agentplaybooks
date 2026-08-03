import type { Metadata } from "next";
import DocsPageClient from "./DocsPageClient";
import { getDocTitle, normalizeDocSlug } from "./docs-data";
import { getDocContent } from "@/lib/docs-server";
import { getLocale } from "next-intl/server";
import { absoluteUrl } from "@/lib/site-url";

type DocsPageProps = {
  searchParams?: Promise<{ page?: string }>;
};

// `?page=` serves the same documents as `/docs/<slug>`, so the canonical always
// points at the clean path. Without this the query-string form competes with the
// real URL for the same content.
export const metadata: Metadata = {
  title: "Documentation — AgentPlaybooks",
  description:
    "Guides, concepts, and API reference for keeping agent skills, MCP servers, instructions, and memory portable across AI platforms.",
  alternates: { canonical: absoluteUrl("/docs") },
  openGraph: {
    title: "AgentPlaybooks Documentation",
    description: "Guides, concepts, and API reference for portable agent configuration.",
    url: absoluteUrl("/docs"),
    type: "website",
  },
};

export default async function DocsPage({ searchParams }: DocsPageProps) {
  const resolvedParams = await searchParams;
  const slug = normalizeDocSlug(resolvedParams?.page || "readme");
  const title = getDocTitle(slug);
  const locale = await getLocale();
  const content = await getDocContent(slug, locale);

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <DocsPageClient initialSlug={slug} initialContent={content || undefined} />
    </>
  );
}
