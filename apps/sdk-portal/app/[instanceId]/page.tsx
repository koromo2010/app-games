import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import {
  createSdkPreviewAccountLinkCode,
  getSdkAccountSession,
} from "@/lib/account-session";
import { normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";

export default async function PreviewInstancePage({ params }: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  const slug = normalizeInstanceSlug(instanceId);
  if (validateInstanceSlug(slug)) notFound();
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(`/${slug}`)}`,
    );
  }
  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  const linkCode = createSdkPreviewAccountLinkCode({
    playerId: account.playerId,
    playerName: account.playerName,
    audience: new URL(appBaseUrl).origin,
    creatorSlug: slug,
  });
  const previewUrl = `${appBaseUrl}/sdk-preview/${slug}#${new URLSearchParams({
    sdkPreviewLink: linkCode,
  }).toString()}`;
  return <main className="platform-preview-shell">
    <iframe className="platform-preview-frame" src={previewUrl} title={`${slug}のGame Fields開発環境`} allow="fullscreen" />
  </main>;
}
