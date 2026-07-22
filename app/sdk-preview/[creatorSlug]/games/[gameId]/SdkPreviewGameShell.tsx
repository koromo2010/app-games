"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";

type PreviewPhase = "lobby" | "playing" | "result";

type Props = {
  backHref: string;
  runtimeUrl: string;
  title: string;
};

const commandClass = "rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-bold hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45";

export function SdkPreviewGameShell({ backHref, runtimeUrl, title }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<PreviewPhase>("lobby");

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
      {phase === "lobby" && <button type="button" className={commandClass} onClick={() => send("game:start")}>ゲーム開始</button>}
      {phase === "playing" && <>
        <button type="button" className={commandClass} onClick={() => send("game:auto-progress")}>自動進行</button>
        <button type="button" className={commandClass} onClick={() => send("game:abort")}>進行中断</button>
      </>}
      {phase === "result" && <button type="button" className={commandClass} onClick={() => send("game:rematch")}>再戦</button>}
      <button type="button" className={commandClass}>ルール</button>
      <button type="button" className={commandClass}>MENU</button>
    </GameTopBanner>
    <iframe ref={frameRef} className="block h-[calc(100vh-132px)] min-h-[640px] w-full border-0 bg-white sm:h-[calc(100vh-82px)]" src={runtimeUrl} title={`${title}のゲーム固有領域`} sandbox="allow-scripts allow-modals allow-pointer-lock" referrerPolicy="no-referrer" allow="fullscreen" />
  </main>;
}
