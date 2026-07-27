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
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  manifest: unknown;
  modulePolicy: unknown;
  releaseKind: "promotion" | "rollback" | "legacy";
  releasedAt: string;
  isCurrent?: boolean;
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
  main?: { releases?: Release[]; history?: Release[]; error?: string | UpstreamDiagnostic };
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
            const unchanged = current?.packageRootSha256 === release.packageRootSha256
              && current.serverBundleSha256 === release.serverBundleSha256
              && current.appSetSourceSha256 === release.appSetSourceSha256;
            const action = current ? "既存mainアプリを更新" : "mainへ新規登録";
            return (
              <article key={release.lineageId} className="grid gap-4 px-5 py-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black">{release.title}</h4>
                    <span className="rounded-full bg-cyan-300/15 px-2 py-1 text-[11px] font-black text-cyan-100">{current ? "main登録済み" : "dev採用済み"}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-500">{release.lineageId} / {release.publicGameId}</p>
                  <p className="mt-2 text-xs text-slate-400">dev {short(release.revision)} → main {mainError ? "確認不可" : current ? short(current.revision) : "未登録"}</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {current && <button type="button" onClick={() => void selectHistory(release.lineageId)} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10">履歴・復元</button>}
                  <button
                    type="button"
                    disabled={unchanged || Boolean(busy) || Boolean(mainError)}
                    onClick={() => {
                      if (!window.confirm(`${release.title} のdev版 ${short(release.revision)} でmainを${current ? "更新" : "新規登録"}しますか？`)) return;
                      void act({ action: "promote", snapshot: release, lineageId: release.lineageId }, `${release.title}をmainへ反映しました。`);
                    }}
                    className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40"
                  >{mainError ? "main確認待ち" : unchanged ? "main反映済み" : busy ? "処理中…" : action}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
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
                </div>
                <button
                  type="button"
                  disabled={release.isCurrent || Boolean(busy)}
                  onClick={() => {
                    if (!window.confirm(`${short(release.revision)}へアプリだけを復元しますか？現在版も履歴に残ります。`)) return;
                    void act({ action: "rollback", lineageId: selected, releaseId: release.id }, `${release.title}を${short(release.revision)}へ復元しました。`);
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
