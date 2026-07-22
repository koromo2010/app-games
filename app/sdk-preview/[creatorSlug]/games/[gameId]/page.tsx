import Link from "next/link";
import { notFound } from "next/navigation";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";

export const dynamic = "force-dynamic";
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

function sdkPortalBaseUrl() {
  return process.env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://sdk.game-fields.com" : "https://sdk-dev.game-fields.com");
}

export default async function SdkGamePage({ params }: { params: Promise<{ creatorSlug: string; gameId: string }> }) {
  const { creatorSlug, gameId } = await params;
  if (!SLUG_PATTERN.test(creatorSlug) || !GAME_PATTERN.test(gameId)) notFound();
  const response = await fetch(`${sdkPortalBaseUrl()}/api/preview-runtime/${creatorSlug}/${gameId}`, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("SDK game runtime is unavailable.");
  const game = await response.json() as { title: string; runtimeUrl: string };
  return <main className={`min-h-screen bg-slate-950 text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="SDK DEVELOPMENT" title={game.title}>
      <Link href={`/sdk-preview/${creatorSlug}`} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-bold hover:bg-white/15">広場へ戻る</Link>
      <button type="button" className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-bold">ルール</button>
      <button type="button" className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-bold">MENU</button>
    </GameTopBanner>
    <iframe className="block h-[calc(100vh-132px)] min-h-[640px] w-full border-0 bg-white sm:h-[calc(100vh-82px)]" src={game.runtimeUrl} title={`${game.title}のゲーム固有領域`} sandbox="allow-scripts allow-modals allow-pointer-lock" referrerPolicy="no-referrer" allow="fullscreen" />
  </main>;
}
