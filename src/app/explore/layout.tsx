import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

// The explore page itself is a client component, so it cannot export metadata.
// Without this layout the route inherited the root layout's title verbatim and
// was indistinguishable from the homepage.
export const metadata: Metadata = {
    title: "Explore public skills, MCP servers, and playbooks | AgentPlaybooks",
    description:
        "Browse public agent skills, personas, and MCP server definitions. Install them into Claude Code, Cursor, Codex, Antigravity, or Hermes with one command.",
    alternates: { canonical: absoluteUrl("/explore") },
    openGraph: {
        title: "Explore public agent skills and MCP servers",
        description:
            "Browse public agent skills, personas, and MCP server definitions, and install them into any agent client.",
        url: absoluteUrl("/explore"),
        type: "website",
    },
};

export default function ExploreLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <>{children}</>;
}
