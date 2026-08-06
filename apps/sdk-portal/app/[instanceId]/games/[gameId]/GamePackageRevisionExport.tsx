import type { OwnedGamePackageRevision } from "@/lib/instance-registry";
import {
  creatorGameFormalRoomPath,
  creatorGamePreviewPath,
} from "@/lib/creator-game-route-contract";

function runtimeUse(channel: OwnedGamePackageRevision["channel"]) {
  if (channel === "candidate") return "現在の提出候補。Preview／正式Room確認で選択中";
  if (channel === "development") return "dev採用Runtimeで選択中";
  if (channel === "stable") return "stable Runtimeで選択中";
  return "保存履歴。現在のRuntimeでは未選択";
}

export function GamePackageRevisionExport({ instanceId, gameId, revisions, placement = "fixed" }: { instanceId: string; gameId: string; revisions: OwnedGamePackageRevision[]; placement?: "fixed" | "inline" }) {
  return <aside className={`package-export package-export--${placement}`} aria-label="Runtime packageの履歴と取得">
    <header>
      <strong>Runtime package（実行・検査用履歴）</strong>
      <span>固定revisionの実行成果物です。完全な編集用ソースは保証されません。</span>
      <span>取得: 可能 · 更新: 内容変更時に新revisionを追加 · 個別revision削除: 不可</span>
      <span>過去revisionは開始済みRoomの固定契約と監査証跡を守るため保持します。</span>
    </header>
    <div>{revisions.length === 0 ? <p>取得できるrevisionはありません。</p> : revisions.map((revision) => <section key={revision.revision}>
      <div><b>{revision.channel ?? "保存済み"}</b><time>{new Date(revision.createdAt).toLocaleString("ja-JP")}</time></div>
      <small>対象revision</small>
      <code title={revision.revision}>{revision.revision}</code>
      <small>{runtimeUse(revision.channel)}</small>
      <small>package {revision.packageRootSha256 ?? "unavailable"}</small>
      <small>server {revision.serverBundleSha256 ?? "unavailable"}</small>
      <small>AppSet {revision.appSetSourceSha256 ?? "unavailable"}</small>
      <div className="package-export__actions">
        <a href={creatorGamePreviewPath({ creatorSlug: instanceId, gameId, revision: revision.revision })}>このrevisionをPreview</a>
        <a href={creatorGameFormalRoomPath({ creatorSlug: instanceId, gameId, revision: revision.revision })}>正式Roomで確認</a>
        <a href={`/api/instances/${encodeURIComponent(instanceId)}/games/${encodeURIComponent(gameId)}/exports/${revision.revision}`}>検査済みパッケージを取得</a>
      </div>
    </section>)}</div>
  </aside>;
}
