import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  createSdkPreviewAccountLinkCode,
  getSdkAccountSession,
} from "@/lib/account-session";
import {
  normalizeInstanceSlug,
  resolveCreatorOwner,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import { resolveSdkSession } from "@/lib/sdk-owner-classification";
import { logSdkSessionLookupFailure } from "@/lib/sdk-owner-observability";
import { CreatorAccountReconnect } from "../CreatorAccountReconnect";
import { CreatorOwnershipIssue } from "../CreatorOwnershipIssue";
import { CreatorPreviewFrame } from "../CreatorPreviewFrame";

export default async function PreviewInstancePage({ params }: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  const slug = normalizeInstanceSlug(instanceId);
  if (validateInstanceSlug(slug)) notFound();
  let session;
  try {
    session = await resolveSdkSession(getSdkAccountSession);
  } catch (error) {
    logSdkSessionLookupFailure(error);
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  if (session.status === "session_missing") {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(`/${slug}`)}`,
    );
  }
  const account = session.account;
  let owner;
  try {
    owner = await resolveCreatorOwner(slug, account.playerId);
  } catch {
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  if (owner.status === "owner_mismatch") {
    return <CreatorAccountReconnect returnTo={`/${slug}`} />;
  }
  if (owner.status !== "authorized") {
    return <CreatorOwnershipIssue kind="record_inconsistency" />;
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
    <CreatorPreviewFrame
      creatorSlug={slug}
      previewUrl={previewUrl}
      previewOrigin={new URL(appBaseUrl).origin}
    />
    <nav className="creator-preview-actions" aria-label="制作者用メニュー">
      <span>CREATOR</span>
      <Link href="/support">サポート</Link>
      <Link href="/dashboard">マイゲーム・編集</Link>
    </nav>
  </main>;
}
