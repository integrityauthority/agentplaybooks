import { getBlogPost, getBlogPosts } from "@/lib/blog-server";
import { getLocale } from "next-intl/server";
import BlogPostClient from "../BlogPostClient";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getRequestBaseUrl } from "@/lib/request-base-url";
import { absoluteUrl } from "@/lib/site-url";

type PageProps = {
    params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const resolvedParams = await params;
    const locale = await getLocale();
    const baseUrl = await getRequestBaseUrl();
    const post = await getBlogPost(resolvedParams.slug, locale, baseUrl);

    if (!post) {
        return {
            title: "Post Not Found",
        };
    }

    // The canonical is built from the configured origin, never from the request
    // host: a preview or alternate domain must point back at the real URL rather
    // than declaring itself canonical.
    const url = absoluteUrl(`/blog/${resolvedParams.slug}`);

    return {
        title: `${post.title} - Blog`,
        description: post.description,
        alternates: { canonical: url },
        openGraph: {
            title: post.title,
            description: post.description,
            url,
            type: "article",
            publishedTime: post.date,
            ...(post.author ? { authors: [post.author] } : {}),
        },
    };
}

// Use request-aware rendering so locale and content can follow cookies.
export const dynamic = "force-dynamic";

export default async function BlogPostPage({ params }: PageProps) {
    const resolvedParams = await params;
    const locale = await getLocale();
    const baseUrl = await getRequestBaseUrl();
    const [currentPost, posts] = await Promise.all([
        getBlogPost(resolvedParams.slug, locale, baseUrl),
        getBlogPosts(locale, baseUrl)
    ]);

    if (!currentPost) {
        notFound();
    }

    return <BlogPostClient posts={posts} currentPost={currentPost} />;
}
