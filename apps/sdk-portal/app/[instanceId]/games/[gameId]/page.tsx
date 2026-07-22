import { notFound } from "next/navigation";
import { normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export default async function CreatorGamePage({ params }: { params: Promise<{ instanceId: string; gameId: string }> }) {
  const raw = await params;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  if (validateInstanceSlug(instanceId) || !GAME_PATTERN.test(gameId)) notFound();
  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  return <main className="platform-preview-shell">
    <iframe className="platform-preview-frame" src={`${appBaseUrl}/sdk-preview/${instanceId}/games/${gameId}`} title={`${gameId}のGame Fields開発環境`} allow="fullscreen" />
  </main>;
}
