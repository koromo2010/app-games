"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { useEffect, useRef, useState } from "react";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import {
  GameTopMenu,
  gameTopMenuItemClass,
} from "@/app/components/GameTopMenu";
import {
  GAME_SDK_MODULE_IDS,
  gameSdkModuleIsRequired,
  requiredGameSdkModuleIds,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";

type PreviewPhase = "lobby" | "playing" | "result";

type Props = {
  backHref: string;
  runtimeUrl: string;
  title: string;
  moduleProfile: GameSdkModuleProfile;
};

const commandClass = "rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-bold hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45";

export function SdkPreviewGameShell({
  backHref,
  runtimeUrl,
  title,
  moduleProfile,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<PreviewPhase>("lobby");
  const [moduleListOpen, setModuleListOpen] = useState(false);
  const requiredModuleIds = requiredGameSdkModuleIds(moduleProfile);
  const moduleRequired = (id: Parameters<typeof gameSdkModuleIsRequired>[1]) => (
    gameSdkModuleIsRequired(moduleProfile, id)
  );

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; state?: { phase?: unknown } } | null;
      if (data?.type !== "game-fields:state") return;
      if (data.state?.phase === "lobby" || data.state?.phase === "playing" || data.state?.phase === "result") {
        setPhase(data.state.phase);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const send = (name: "game:start" | "game:abort" | "game:auto-progress" | "game:rematch") => {
    frameRef.current?.contentWindow?.postMessage({ type: "game-fields:command", name }, "*");
  };

  return <main className={`min-h-screen bg-slate-950 text-white ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="SDK DEVELOPMENT" title={title}>
      <Link href={backHref} className={commandClass}>広場へ戻る</Link>
      {phase === "lobby" && moduleRequired("phase-flow") && moduleRequired("start-guard") && <button type="button" className={commandClass} onClick={() => send("game:start")}>ゲーム開始</button>}
      {phase === "playing" && moduleRequired("debug") && <>
        <button type="button" className={commandClass} onClick={() => send("game:auto-progress")}>自動進行</button>
        <button type="button" className={commandClass} onClick={() => send("game:abort")}>進行中断</button>
      </>}
      {phase === "result" && moduleRequired("rematch") && <button type="button" className={commandClass} onClick={() => send("game:rematch")}>再戦</button>}
      <GameTopMenu>
        <button
          type="button"
          data-menu-close="true"
          className={gameTopMenuItemClass}
          onClick={() => setModuleListOpen(true)}
        >
          <span>共通モジュール</span>
          <span>{requiredModuleIds.length}/{GAME_SDK_MODULE_IDS.length} 必須</span>
        </button>
        <Link
          href={backHref}
          data-menu-close="true"
          className={gameTopMenuItemClass}
        >
          広場へ戻る
        </Link>
      </GameTopMenu>
    </GameTopBanner>
    <iframe ref={frameRef} className="block h-[calc(100vh-132px)] min-h-[640px] w-full border-0 bg-white sm:h-[calc(100vh-82px)]" src={runtimeUrl} title={`${title}のゲーム固有領域`} sandbox="allow-scripts allow-modals allow-pointer-lock" referrerPolicy="no-referrer" allow="fullscreen" />
    {moduleListOpen && (
      <div
        className="fixed inset-0 z-[9997] grid place-items-center bg-slate-950/75 p-4"
        onClick={() => setModuleListOpen(false)}
      >
        <section
          role="dialog"
          aria-label="共通モジュール一覧"
          className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl border border-cyan-300/30 bg-slate-950 p-5 text-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-cyan-200">Platform module profile</p>
              <h2 className="mt-1 text-xl font-black">必須 {requiredModuleIds.length}/{GAME_SDK_MODULE_IDS.length}</h2>
            </div>
            <button type="button" className={commandClass} onClick={() => setModuleListOpen(false)}>閉じる</button>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {GAME_SDK_MODULE_IDS.map((id) => {
              const decision = moduleProfile[id];
              return (
                <div key={id} className={`rounded-lg border px-3 py-2 text-xs ${decision.mode === "required" ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-50" : "border-slate-400/20 bg-slate-400/5 text-slate-300"}`}>
                  <strong className="font-mono">{id}</strong>
                  <span className="ml-2">{decision.mode === "required" ? "必須" : "対象外"}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    )}
  </main>;
}
