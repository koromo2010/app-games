"use client";

import { useRouter } from "next/navigation";

export function InviteRoomJoiner({ roomCode }: { roomCode: string; player: unknown }) {
  const router = useRouter();
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[.18em] text-amber-300">LEGACY INVITE</p>
        <h1 className="mt-3 text-2xl font-black">部屋 {roomCode}</h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">
          この旧形式リンクは招待先を一意に証明できないため、参加処理を行いません。ホストから新しい招待リンクを受け取ってください。
        </p>
        <button className="mt-6 rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950" type="button" onClick={() => router.replace("/games")}>
          ゲーム広場へ戻る
        </button>
      </section>
    </main>
  );
}
