import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://agentplaybooks.ai"),
  title: "AgentPlaybooks - Your Agents. Your Skills. Any Platform.",
  description: "A vendor-neutral home for AI agent skills, personas, MCP servers, project instructions, and memory. Keep your setup portable and in sync across platforms without vendor lock-in.",
  keywords: [
    "AI agent", "agent rules", "AI chores", "skills store", "agent memory",
    "Anthropic skills", "skills.md", "MCP protocol", "MCP server",
    "GPT actions", "ChatGPT custom GPT", "Claude projects", "Gemini gems",
    "cursor rules", "AI automation", "agent playbook", "AI personas",
    "robot skills", "AI toolkit", "agent configuration", "JSON schema",
    "OpenAPI", "platform-independent AI", "AI vault", "agent marketplace",
    "subagent", "jack is", "skill download", "i know kungfu"
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [
      { url: "/apple-icon.svg", type: "image/svg+xml" },
    ],
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "AgentPlaybooks - Your Agents. Your Skills. Any Platform.",
    description: "Your vendor-neutral home for agent rules, skills, personas, MCP servers, and memory. Switch platforms without losing your setup.",
    type: "website",
    siteName: "AgentPlaybooks",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AgentPlaybooks - AI Agent Skills Store",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentPlaybooks - AI Agent Skills Store",
    description: "Store AI agent rules, skills, MCP servers, and memory in a portable, vendor-neutral vault for ChatGPT, Claude, Gemini, Cursor, Codex, and more.",
    images: ["/twitter-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://agentplaybooks.ai",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AgentPlaybooks",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f1a",
};

import { ThemeProvider } from "@/components/theme-provider";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          defaultTheme="system"
          storageKey="agentplaybooks-theme"
        >
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
