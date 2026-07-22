import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreatorGamePreview, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";
import { createPreviewRuntimeUrl } from "@/lib/preview-links";
import { AccountMenu } from "../../../account-menu";

export const dynamic = "force-dynamic";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export default async function GameMockPage({ params }: {
  params: Promise<{ instanceId: string; gameId: string }>;
}) {
  const raw = await params;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  if (validateInstanceSlug(instanceId) || !GAME_PATTERN.test(gameId)) notFound();

  const game = await getCreatorGamePreview(instanceId, gameId).catch(() => null);
  if (!game) notFound();

  let previewUrl: string;
  try {
    previewUrl = createPreviewRuntimeUrl({ instanceId, gameId, revision: game.mockRevision });
  } catch {
    return (
      <main className="mock-review-error">
        <section>
          <p className="eyebrow">PREVIEW UNAVAILABLE</p>
          <h1>モック表示の準備中です</h1>
          <p>隔離プレビューの接続設定後に、この同じURLから確認できます。</p>
          <Link className="secondary-action" href={`/${instanceId}`}>制作者の広場へ戻る</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mock-review-shell">
      <header className="mock-review-header">
        <Link className="brand" href={`/${instanceId}`}>
          <span className="brand-mark" aria-hidden="true">GF</span>
          <span>Game Fields <strong>SDK</strong></span>
        </Link>
        <div className="mock-review-title">
          <span>CLIENT MOCK</span>
          <strong>{game.title}</strong>
        </div>
        <div className="header-account-area mock-account-area">
          <span className="isolated-badge">ISOLATED PREVIEW</span>
          <AccountMenu />
        </div>
      </header>
      <iframe
        className="mock-review-frame"
        src={previewUrl}
        title={`${game.title}の画面モック`}
        sandbox="allow-scripts allow-modals allow-pointer-lock"
        referrerPolicy="no-referrer"
        allow="fullscreen"
      />
    </main>
  );
}
