"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type SessionState = "checking" | "ready" | "required" | "failed";

export function SdkPreviewSessionGate({
  children,
  creatorSlug,
  portalHref,
}: {
  children: ReactNode;
  creatorSlug: string;
  portalHref: string;
}) {
  const [state, setState] = useState<SessionState>("checking");

  useEffect(() => {
    let cancelled = false;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const linkCode = fragment.get("sdkPreviewLink")?.trim() ?? "";
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }

    const verify = async () => {
      const exchange = await fetch("/api/sdk-preview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          creatorSlug,
          ...(linkCode ? { linkCode } : {}),
        }),
      });
      if (!exchange.ok) return exchange;
      if (!linkCode) return exchange;
      return fetch("/api/sdk-preview/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ creatorSlug }),
      });
    };

    void verify()
      .then((response) => {
        if (cancelled) return;
        setState(response.ok
          ? "ready"
          : response.status === 401
            ? "required"
            : "failed");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [creatorSlug]);

  if (state === "ready") return children;
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-white/15 bg-white/5 p-6 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">
          SDK Preview
        </p>
        {state === "checking" ? (
          <>
            <h1 className="mt-3 text-2xl font-black">認証を確認しています</h1>
            <p className="mt-2 text-sm text-slate-300">
              SDK Portalの連携セッションを、Preview専用権限へ安全に交換しています。
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-black">
              {state === "required" ? "SDK Portalでの再ログインが必要です" : "認証を確認できませんでした"}
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              SDK Portalからこの制作者ページを開き直してください。
            </p>
            <a
              href={portalHref}
              target="_top"
              className="mt-5 inline-flex rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950"
            >
              SDK Portalへ戻る
            </a>
          </>
        )}
      </section>
    </main>
  );
}
