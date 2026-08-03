import type { Metadata } from "next";
import DocsPageClient from "../DocsPageClient";
import { docsEntries, getDocTitle, normalizeDocSlug } from "../docs-data";
import { getDocContent } from "@/lib/docs-server";
import { getLocale } from "next-intl/server";
import { absoluteUrl } from "@/lib/site-url";

type DocSlugPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: DocSlugPageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = normalizeDocSlug(rawSlug || "readme");
  const title = getDocTitle(slug);
  const description =
    docsEntries.find((entry) => normalizeDocSlug(entry.slug) === slug)?.description ??
    "AgentPlaybooks documentation";
  const url = absoluteUrl(`/docs/${slug}`);

  return {
    title: `${title} — AgentPlaybooks Docs`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article" },
  };
}

export default async function DocSlugPage({ params }: DocSlugPageProps) {
  const { slug: rawSlug } = await params;
  const slug = normalizeDocSlug(rawSlug || "readme");
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
