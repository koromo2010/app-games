import type { OwnedGamePackageRevision } from "@/lib/instance-registry";

export function GamePackageRevisionExport({ instanceId, gameId, revisions }: { instanceId: string; gameId: string; revisions: OwnedGamePackageRevision[] }) {
  return <aside className="package-export" aria-label="検査済みパッケージの取得">
    <header><strong>Runtime package</strong><span>完全な編集用ソースは保証されません</span></header>
    <div>{revisions.length === 0 ? <p>取得できるrevisionはありません。</p> : revisions.map((revision) => <section key={revision.revision}>
      <div><b>{revision.channel ?? "保存済み"}</b><time>{new Date(revision.createdAt).toLocaleString("ja-JP")}</time></div>
      <code>{revision.revision}</code>
      <small>package {revision.packageRootSha256 ?? "unavailable"}</small>
      <small>server {revision.serverBundleSha256 ?? "unavailable"}</small>
      <small>AppSet {revision.appSetSourceSha256 ?? "unavailable"}</small>
      <a href={`/api/instances/${encodeURIComponent(instanceId)}/games/${encodeURIComponent(gameId)}/exports/${revision.revision}`}>検査済みパッケージを取得</a>
    </section>)}</div>
  </aside>;
}
