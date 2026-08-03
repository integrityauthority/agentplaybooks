import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
    alternates: { canonical: absoluteUrl("/enterprise") },
    title: "Self-Hosted Agent Configuration for Teams | AgentPlaybooks Enterprise",
    description: "Standardize how your team works with AI. One validated source of truth for agent skills, tools, instructions, and secrets — with roles, one-time editor invites, and no credentials on disk. Self-host it on your own infrastructure.",
    keywords: [
        "enterprise AI", "self-hosted AI", "on-premise AI", "AI governance",
        "agent configuration management", "agent orchestration", "AI compliance",
        "team agent standards", "AI onboarding", "secrets management",
        "AI vendor lock-in", "SSO", "role-based access control"
    ],
    openGraph: {
        title: "Self-Hosted Agent Configuration for Teams",
        description: "One validated source of truth for your team's agent skills, tools, instructions, and secrets — self-hosted, with roles and audit.",
        type: "website",
        url: absoluteUrl("/enterprise"),
    },
};

export default function EnterpriseLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <>{children}</>;
}
