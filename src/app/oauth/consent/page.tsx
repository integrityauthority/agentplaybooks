import type { Metadata } from "next";
import OAuthConsentClient from "./OAuthConsentClient";

export const metadata: Metadata = {
  title: "Authorize connection — AgentPlaybooks",
  robots: { index: false, follow: false },
};

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  return <OAuthConsentClient authorizationId={authorizationId} />;
}

