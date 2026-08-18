"use client";

import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Release = {
  id: string;
  lineageId: string;
  publicGameId: string;
  sourceCreatorSlug: string;
  sourceGameId: string;
  title: string;
  description: string;
  revision: string;
  sourceRevision?: string;
  sourceEnvironment?: string;
  artifactTransferred?: boolean;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  manifest: unknown;
  modulePolicy: unknown;
  releaseKind: "promotion" | "rollback" | "legacy";
  releasedAt: string;
  isCurrent?: boolean;
  decisionAction?: "approve" | "reject" | "rollback";
  decisionReason?: string;
  decisionActor?: string;
  decisionAt?: string;
};

type Decision = {
  id: string;
  lineageId: string;
  action: "approve" | "reject" | "rollback";
  revision: string;
  packageRootSha256: string;
  reason: string;
  actorRef: string;
  releaseId: string | null;
  decidedAt: string;
};

type UpstreamDiagnostic = {
  source?: string;
  endpoint?: string;
  status?: number | null;
  code?: string;
  cause?: string;
};

type Payload = {
  development?: { releases?: Release[]; error?: string | UpstreamDiagnostic };
  main?: {
    releases?: Release[];
    history?: Release[];
    decisions?: Decision[];
    error?: string | UpstreamDiagnostic;
  };
  error?: string;
  diagnostic?: UpstreamDiagnostic;
};

const short = (value: string) => value.slice(0, 8);

function diagnosticText(error: string | UpstreamDiagnostic | undefined) {
  if (!error) return "";
  if (typeof error === "string") return error;
  const status = typeof error.status === "number" ? `HTTP ${error.status}` : "通信失敗";
  return [
    `原因: ${error.code || "UNKNOWN"}`,
    `接続先: ${error.endpoint || "不明"}`,
    `状態: ${status}`,
    error.source ? `系統: ${error.source}` : "",
    error.cause ? `通信例外: ${error.cause}` : "",
  ].filter(Boolean).join("\n");
}

export function AppReleaseManagementPanel({
  onAuthExpired,
}: {
  onAuthExpired: () => void;
}) {
  const [dev, setDev] = useState<Release[]>([]);
  const [main, setMain] = useState<Release[]>([]);
  const [history, setHistory] = useState<Release[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [rollbackReasons, setRollbackReasons] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [developmentError, setDevelopmentError] = useState("");
  const [mainError, setMainError] = useState("");

  const load = useCallback(async (lineageId?: string) => {
    const response = await fetch(`/api/admin/app-releases${
      lineageId ? `?lineageId=${encodeURIComponent(lineageId)}` : ""
    }`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as Payload | null;
    if (!response.ok && !payload?.development && !payload?.main) {
      throw new Error(diagnosticText(payload?.diagnostic) || payload?.error || "APP_RELEASE_LOAD_FAILED");
    }
    setDev(payload?.development?.releases ?? []);
    setMain(payload?.main?.releases ?? []);
    setHistory(payload?.main?.history ?? []);
    setDecisions(payload?.main?.decisions ?? []);
    setDevelopmentError(diagnosticText(payload?.development?.error));
    setMainError(diagnosticText(payload?.main?.error));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => setMessage(
        `アプリ昇格情報を読み込めませんでした。\n${error instanceof Error ? error.message : "UNKNOWN"}`,
      ));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const mainByLineage = useMemo(
    () => new Map(main.map((release) => [release.lineageId, release])),
    [main],
  );
  const latestDecisionByRevision = useMemo(() => {
    const result = new Map<string, Decision>();
    for (const decision of decisions) {
      const key = `${decision.lineageId}:${decision.revision}`;
      if (!result.has(key)) result.set(key, decision);
    }
    return result;
  }, [decisions]);

  const selectHistory = async (lineageId: string) => {
    setSelected(lineageId);
    setHistory([]);
    try {
      await load(lineageId);
    } catch (error) {
      setMessage(`履歴を読み込めませんでした。\n${error instanceof Error ? error.message : "UNKNOWN"}`);
    }
  };

  const act = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/app-releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null) as Payload | null;
      if (!response.ok) {
        throw new Error(diagnosticText(payload?.diagnostic) || payload?.error || "APP_RELEASE_FAILED");
      }
      await load(selected || undefined);
      setMessage(label);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") {
        onAuthExpired();
        return;
      }
      setMessage(`${label}に失敗しました。\n${error instanceof Error ? error.message : "UNKNOWN"}`);
    } finally {
      setBusy("");
    }
  };

  const exportMainRelease = async (release: Release) => {
    setBusy(`export:${release.lineageId}`);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const query = new URLSearchParams({
        publicGameId: release.publicGameId,
        lineageId: release.lineageId,
        revision: release.revision,
        packageRootSha256: release.packageRootSha256,
        serverBundleSha256: release.serverBundleSha256,
        appSetSourceSha256: release.appSetSourceSha256,
      });
      const response = await fetch(`/api/admin/app-releases/export?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "APP_RELEASE_EXPORT_FAILED");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${release.publicGameId}-${release.revision.slice(0, 12)}-main-runtime-package.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage(`${release.title}のmain runtime packageを取得しました。`);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") {
        onAuthExpired();
        return;
      }
      setMessage(`main runtime packageの取得に失敗しました。\n${error instanceof Error ? error.message : "UNKNOWN"}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-white/[0.05]">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">dev app → main app</p>
        <h3 className="mt-1 text-xl font-black">アプリ昇格・ロールバック</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">devで採用済みのアプリ版だけをmainへ反映します。mainのゲームID・URL・公開設定は維持され、本体コードや他アプリには触れません。</p>
      </div>
      {message && <p role="status" className="m-5 whitespace-pre-line rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">{message}</p>}
      {developmentError && (
        <p role="alert" className="m-5 whitespace-pre-line rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          dev採用アプリを取得できませんでした。{`\n${developmentError}`}
        </p>
      )}
      {mainError && (
        <p role="alert" className="m-5 whitespace-pre-line rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          main現在版との比較を取得できませんでした。一覧は確認できますが、復旧するまで昇格操作はできません。{`\n${mainError}`}
        </p>
      )}
      {dev.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400">{developmentError ? "dev採用アプリの取得待ちです。" : "devで採用済みのアプリはありません。"}</p>
      ) : (
        <div className="divide-y divide-white/10">
          {dev.map((release) => {
            const current = mainByLineage.get(release.lineageId);
            const latestDecision = latestDecisionByRevision.get(
              `${release.lineageId}:${release.revision}`,
            );
            const sameSourceRevision = (current?.sourceRevision ?? current?.revision) === release.revision;
            const samePackage = current?.packageRootSha256 === release.packageRootSha256;
            const unchanged = sameSourceRevision
              && samePackage
              && current?.artifactTransferred !== false;
            const action = current ? "既存mainアプリを更新" : "mainへ新規登録";
            const reason = reasons[release.lineageId]?.trim() ?? "";
            return (
              <article key={release.lineageId} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)_auto] lg:items-end">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black">{release.title}</h4>
                    <span className="rounded-full bg-cyan-300/15 px-2 py-1 text-[11px] font-black text-cyan-100">{current ? "main登録済み" : "dev採用済み"}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">{release.lineageId} / {release.publicGameId}</p>
                  <p className="mt-2 text-xs text-slate-400">dev {short(release.revision)} → main {mainError ? "確認不可" : current ? short(current.revision) : "未登録"}</p>
                  {current && sameSourceRevision && samePackage && current.artifactTransferred === false && (
                    <p className="mt-2 text-xs font-bold text-amber-200">
                      本番package実体の再移送が必要です。同じdev版を再承認してください。
                    </p>
                  )}
                  {latestDecision && (
                    <p className={`mt-2 text-xs font-bold ${latestDecision.action === "reject" ? "text-rose-200" : "text-cyan-200"}`}>
                      直近判断: {latestDecision.action === "reject" ? "却下" : latestDecision.action === "approve" ? "承認" : "復元"}
                      ・{new Date(latestDecision.decidedAt).toLocaleString("ja-JP")}
                      ・{latestDecision.actorRef} — {latestDecision.reason}
                    </p>
                  )}
                </div>
                <label className="block text-xs font-bold text-slate-300">
                  判断理由（必須）
                  <textarea
                    value={reasons[release.lineageId] ?? ""}
                    maxLength={500}
                    disabled={unchanged || Boolean(busy) || Boolean(mainError)}
                    onChange={(event) => setReasons((values) => ({
                      ...values,
                      [release.lineageId]: event.target.value,
                    }))}
                    placeholder="承認・却下の根拠を5〜500文字で記録"
                    className="mt-1 min-h-20 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300 disabled:opacity-50"
                  />
                </label>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {current && <button type="button" onClick={() => void selectHistory(release.lineageId)} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10">履歴・復元</button>}
                  <button
                    type="button"
                    disabled={unchanged || Boolean(busy) || Boolean(mainError)}
                    onClick={() => {
                      if (reason.length < 5 || reason.length > 500) {
                        setMessage("判断理由を5〜500文字で入力してください。");
                        return;
                      }
                      if (!window.confirm(`${release.title} のdev版 ${short(release.revision)} をmain採用候補として却下しますか？`)) return;
                      void act({
                        action: "reject",
                        snapshot: release,
                        lineageId: release.lineageId,
                        reason,
                      }, `${release.title}のdev版を却下し、理由を保存しました。`);
                    }}
                    className="rounded-lg border border-rose-300/50 px-4 py-2 text-sm font-black text-rose-100 disabled:opacity-40"
                  >却下</button>
                  <button
                    type="button"
                    disabled={unchanged || Boolean(busy) || Boolean(mainError)}
                    onClick={() => {
                      if (reason.length < 5 || reason.length > 500) {
                        setMessage("判断理由を5〜500文字で入力してください。");
                        return;
                      }
                      if (!window.confirm(`${release.title} のdev版 ${short(release.revision)} でmainを${current ? "更新" : "新規登録"}しますか？`)) return;
                      void act({
                        action: "promote",
                        snapshot: release,
                        lineageId: release.lineageId,
                        reason,
                      }, `${release.title}をmainへ反映しました。`);
                    }}
                    className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40"
                  >{mainError ? "main確認待ち" : unchanged ? "main反映済み" : busy ? "処理中…" : action}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="border-t border-white/10 bg-cyan-300/[0.04] px-5 py-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">read-only operator export</p>
          <h4 className="mt-1 font-black">main現在版の検証用package取得</h4>
          <p className="mt-1 text-sm leading-6 text-slate-400">昇格・却下・復元とは独立したGET専用経路です。現在版のidentityと3つのhashを再照合してからruntime packageを生成します。</p>
        </div>
        {main.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">main現在版はありません。</p>
        ) : (
          <div className="mt-4 space-y-2">
            {main.map((release) => (
              <div key={release.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                <div>
                  <p className="font-black">{release.title}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{release.lineageId} / {release.publicGameId} / {short(release.revision)}</p>
                  <p className="mt-1 text-xs text-slate-400">source: {release.sourceEnvironment ?? "unknown"} ・ released: {new Date(release.releasedAt).toLocaleString("ja-JP")}</p>
                </div>
                <button type="button" disabled={Boolean(busy) || Boolean(mainError)} onClick={() => void exportMainRelease(release)} className="rounded-lg border border-cyan-300/50 px-3 py-2 text-sm font-black text-cyan-100 disabled:opacity-40">
                  {busy === `export:${release.lineageId}` ? "取得中…" : "検証用ZIPを取得"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="border-t border-white/10 bg-black/20 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-black">リリース履歴：{selected}</h4>
            <button type="button" onClick={() => { setSelected(""); setHistory([]); }} className="text-sm font-bold text-slate-400">閉じる</button>
          </div>
          <div className="mt-4 space-y-2">
            {history.map((release) => (
              <div key={release.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                <div>
                  <p className="font-mono text-xs">{short(release.revision)} <span className="ml-2 text-slate-500">{release.releaseKind}</span></p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(release.releasedAt).toLocaleString("ja-JP")}</p>
                  {release.decisionReason && (
                    <p className="mt-1 text-xs text-slate-300">
                      {release.decisionActor} — {release.decisionReason}
                    </p>
                  )}
                  {!release.isCurrent && (
                    <textarea
                      value={rollbackReasons[release.id] ?? ""}
                      maxLength={500}
                      disabled={Boolean(busy)}
                      onChange={(event) => setRollbackReasons((values) => ({
                        ...values,
                        [release.id]: event.target.value,
                      }))}
                      placeholder="復元理由を5〜500文字で入力"
                      aria-label={`${short(release.revision)}への復元理由`}
                      className="mt-2 min-h-16 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-amber-300 disabled:opacity-50"
                    />
                  )}
                </div>
                <button
                  type="button"
                  disabled={release.isCurrent || Boolean(busy)}
                  onClick={() => {
                    const reason = rollbackReasons[release.id]?.trim() ?? "";
                    if (reason.length < 5 || reason.length > 500) {
                      setMessage("復元理由を5〜500文字で入力してください。");
                      return;
                    }
                    if (!window.confirm(`${short(release.revision)}へアプリだけを復元しますか？現在版も履歴に残ります。`)) return;
                    void act({
                      action: "rollback",
                      lineageId: selected,
                      releaseId: release.id,
                      reason,
                    }, `${release.title}を${short(release.revision)}へ復元しました。`);
                  }}
                  className="rounded-lg border border-amber-300/40 px-3 py-2 text-sm font-black text-amber-100 disabled:opacity-40"
                >{release.isCurrent ? "現在版" : "この版へ復元"}</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
