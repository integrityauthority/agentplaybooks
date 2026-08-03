import type { Metadata } from "next";
import LandingPageClient from "./LandingPageClient";
import { absoluteUrl } from "@/lib/site-url";

// A thin server component so the homepage can declare its own canonical. The
// page body is a client component (animations, translations) and a client
// component cannot export metadata.
export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl("/") },
};

export default function HomePage() {
  return <LandingPageClient />;
}
