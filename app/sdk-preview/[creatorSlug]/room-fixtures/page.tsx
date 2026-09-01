import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SdkPreviewSessionGate } from "@/app/sdk-preview/SdkPreviewSessionGate";
import { developmentRoomFixtureEnvironmentAvailable } from "@/lib/development-room-fixture-contract";
import { sdkPortalInternalBaseUrl } from "@/lib/sdk-dashboard-navigation";
import { sdkPreviewCreatorSlugPattern } from "@/lib/sdk-preview-runtime-source";
import { DevelopmentRoomFixtureOperatorPanel } from "./DevelopmentRoomFixtureOperatorPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Development Room fixture operator",
  robots: { index: false, follow: false },
};

export default async function DevelopmentRoomFixturePage({
  params,
}: {
  params: Promise<{ creatorSlug: string }>;
}) {
  if (!developmentRoomFixtureEnvironmentAvailable()) notFound();
  const { creatorSlug: rawCreatorSlug } = await params;
  const creatorSlug = rawCreatorSlug.trim().toLowerCase();
  if (!sdkPreviewCreatorSlugPattern.test(creatorSlug)) notFound();
  return (
    <SdkPreviewSessionGate
      creatorSlug={creatorSlug}
      portalHref={`${sdkPortalInternalBaseUrl()}/${creatorSlug}`}
    >
      <DevelopmentRoomFixtureOperatorPanel creatorSlug={creatorSlug} />
    </SdkPreviewSessionGate>
  );
}
