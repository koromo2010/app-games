"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlayerSession } from "@/lib/player-session";

type InviteTarget = {
  gameId: string;
  endpoint: string;
  href: string;
};

const INVITE_TARGETS: InviteTarget[] = [
  { gameId: "wordwolf", endpoint: "/api/wordwolf/rooms", href: "/wordwolf" },
  { gameId: "tahoiya", endpoint: "/api/tahoiya/rooms", href: "/tahoiya" },
  { gameId: "hodoai", endpoint: "/api/hodoai/rooms", href: "/hodoai-talk" },
  { gameId: "kotoba-senpuku", endpoint: "/api/kotoba-senpuku/rooms", href: "/kotoba-senpuku" },
  { gameId: "northern-branch", endpoint: "/api/northern-branch/rooms", href: "/northern-branch" },
  { gameId: "nigoichi", endpoint: "/api/nigoichi/rooms", href: "/nigoichi" },
  { gameId: "code-intercept", endpoint: "/api/code-intercept/rooms", href: "/code-intercept" },
  { gameId: "daifugo", endpoint: "/api/daifugo/rooms", href: "/daifugo" },
];

type RoomPayload = {
  room?: { code?: string } | null;
  rooms?: Array<{ code?: string }>;
  error?: string;
};

async function readPayload(response: Response): Promise<RoomPayload> {
  return response.json().catch(() => ({})) as Promise<RoomPayload>;
}

export function InviteRoomJoiner({
  roomCode,
  player,
}: {
  roomCode: string;
  player: PlayerSession;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("招待された部屋を確認しています…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const join = async () => {
      for (const target of INVITE_TARGETS) {
        const lookup = await fetch(target.endpoint, {
          credentials: "same-origin",
          cache: "no-store",
        }).catch(() => null);
        if (!lookup?.ok) continue;

        const available = await readPayload(lookup);
        const found = available.rooms?.some(
          (room) => room.code?.trim().toUpperCase() === roomCode,
        ) === true;
        if (!found) continue;

        setMessage("部屋に参加しています…");
        const joined = await fetch(target.endpoint, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: roomCode,
            action: {
              type: "join-room",
              player: {
                id: player.id,
                name: player.name,
                avatarColor: player.avatarColor,
                avatarImage: player.avatarImage,
              },
            },
          }),
        });
        if (!joined.ok) {
          const payload = await readPayload(joined);
          throw new Error(payload.error || "ROOM_INVITE_JOIN_FAILED");
        }

        router.replace(`${target.href}?room=${encodeURIComponent(roomCode)}`);
        return;
      }
      throw new Error("ROOM_INVITE_NOT_FOUND");
    };

    void join().catch((error: unknown) => {
      const code = error instanceof Error ? error.message : "ROOM_INVITE_JOIN_FAILED";
      setMessage(
        code === "ROOM_INVITE_NOT_FOUND"
          ? "参加できる部屋が見つかりません。コードが正しいか、部屋が終了・開始済みでないか確認してください。"
          : "部屋に参加できませんでした。満員・開始済み・別の部屋へ参加中などの可能性があります。",
      );
      setFailed(true);
    });
  }, [player, roomCode, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">GAME FIELDS INVITE</p>
        <h1 className="mt-3 text-2xl font-black">部屋 {roomCode}</h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">{message}</p>
        {failed && (
          <button
            className="mt-6 rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950"
            type="button"
            onClick={() => router.replace("/games")}
          >
            ゲーム広場へ戻る
          </button>
        )}
      </section>
    </main>
  );
}
