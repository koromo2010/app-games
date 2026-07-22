import { notFound } from "next/navigation";
import { normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";

export default async function PreviewInstancePage({ params }: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  const slug = normalizeInstanceSlug(instanceId);
  if (validateInstanceSlug(slug)) notFound();
  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  return <main className="platform-preview-shell">
    <iframe className="platform-preview-frame" src={`${appBaseUrl}/sdk-preview/${slug}`} title={`${slug}のGame Fields開発環境`} allow="fullscreen" />
  </main>;
}
