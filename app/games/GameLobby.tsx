"use client";

import Link from "next/link";
import { useState } from "react";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
  makeRandomAvatarColor,
  normalizePlayerName,
  pickRandomDefaultAvatarImage,
  readPlayerSession,
  savePlayerSession,
  clearPlayerSession,
} from "@/lib/player-session";

const games = [
  {
    title: "ワードウルフ",
    status: "Playable",
    href: "/wordwolf",
    players: "3-6人",
    time: "5-15分",
    summary: "似ているけど違うお題を持つ狼を、会話と投票で探すゲーム。",
    accent: "from-cyan-300 to-amber-200",
  },
  {
    title: "準備中",
    status: "Next",
    href: null,
    players: "-",
    time: "-",
    summary: "次に追加するゲームをここへ並べられる枠です。",
    accent: "from-slate-300 to-slate-100",
  },
  {
    title: "準備中",
    status: "Idea",
    href: null,
    players: "-",
    time: "-",
    summary: "ルール検証中のゲームやプロトタイプをカード化できます。",
    accent: "from-violet-300 to-rose-200",
  },
];

export function GameLobby() {
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return "";
    return readPlayerSession()?.name ?? "";
  });
  const [avatarColor, setAvatarColor] = useState(() => {
    if (typeof window === "undefined") return fallbackAvatarColor;
    return readPlayerSession()?.avatarColor ?? makeRandomAvatarColor();
  });
  const [avatarImage, setAvatarImage] = useState<string | null>(() => {
    if (typeof window === "undefined") return defaultAvatarImage;
    return readPlayerSession()?.avatarImage || pickRandomDefaultAvatarImage();
  });
  const [message, setMessage] = useState("");
  const isLoggedIn = Boolean(name.trim());

  const saveProfile = () => {
    const loginName = normalizePlayerName(name);

    savePlayerSession({
      name: loginName,
      avatarColor,
      avatarImage,
    });
    setName(loginName);
    setMessage("ログインしました。");
  };

  const logout = () => {
    clearPlayerSession();
    localStorage.removeItem("wordwolf-last-room");
    localStorage.removeItem("wordwolf-last-player");
    setName("");
    setAvatarColor(makeRandomAvatarColor());
    setAvatarImage(pickRandomDefaultAvatarImage());
    setMessage("ログアウトしました。");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#111827_55%,#3f2b12_100%)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <p className="text-xs font-semibold uppercase text-cyan-200">Game shelf</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-normal sm:text-4xl">ゲームロビー</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                ここでプレイヤー登録をして、遊ぶゲームを選びます。
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2">
              <span
                className="h-8 w-8 rounded-full border border-white/60 bg-cover bg-center"
                style={{
                  backgroundColor: avatarColor,
                  backgroundImage: `url(${avatarImage || defaultAvatarImage})`,
                }}
                aria-hidden="true"
              />
              <span className="max-w-[160px] truncate text-sm font-semibold text-cyan-50">
                {isLoggedIn ? name : "未登録"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-700">Player</p>
              <h2 className="text-lg font-bold text-slate-950">プレイヤー登録</h2>
            </div>
            {isLoggedIn && (
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                ログアウト
              </button>
            )}
          </div>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            プレイヤー名
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveProfile();
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
              placeholder="空欄なら自動生成"
            />
          </label>

          <button
            type="button"
            onClick={saveProfile}
            className="mt-4 w-full rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-500"
          >
            ログイン
          </button>

          {message && (
            <p className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">
              {message}
            </p>
          )}
        </aside>

        <div className="grid gap-4 md:grid-cols-3">
          {games.map((game) => {
            const card = (
              <article className="h-full rounded-lg border border-white/10 bg-white/[0.96] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
                <div className={`h-24 rounded-lg bg-gradient-to-br ${game.accent}`} />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black text-slate-950">{game.title}</h2>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {game.status}
                  </span>
                </div>
                <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{game.summary}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-slate-100 px-3 py-2">
                    <p className="text-xs text-slate-500">人数</p>
                    <p className="font-bold text-slate-950">{game.players}</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-3 py-2">
                    <p className="text-xs text-slate-500">目安</p>
                    <p className="font-bold text-slate-950">{game.time}</p>
                  </div>
                </div>
                <div className="mt-4">
                  {game.href ? (
                    <span className={`inline-flex rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${
                      isLoggedIn ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-500"
                    }`}>
                      {isLoggedIn ? "遊ぶ" : "登録してから遊ぶ"}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400">
                      準備中
                    </span>
                  )}
                </div>
              </article>
            );

            if (!game.href) {
              return (
                <div key={`${game.title}-${game.status}`} className="block opacity-80">
                  {card}
                </div>
              );
            }

            return isLoggedIn ? (
              <Link key={game.title} href={game.href} className="block">
                {card}
              </Link>
            ) : (
              <button
                key={game.title}
                type="button"
                onClick={() => setMessage("先にプレイヤー登録を保存してください。")}
                className="block text-left"
              >
                {card}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
