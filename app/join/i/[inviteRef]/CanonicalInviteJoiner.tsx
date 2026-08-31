"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function CanonicalInviteJoiner({ inviteRef }: { inviteRef: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("招待先を確認しています…");
  const [passphrase, setPassphrase] = useState("");
  const [needsInput, setNeedsInput] = useState(false);
  const join = useCallback(async (value = "") => {
    setMessage("部屋に参加しています…");
    const response = await fetch(`/api/room-invites/${inviteRef}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: value }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; href?: string };
    if (response.status === 401 || payload.error?.includes("PASSPHRASE")) {
      setNeedsInput(true);
      setMessage("この部屋には合言葉が必要です。");
      return;
    }
    if (!response.ok || !payload.href) throw new Error(payload.error ?? "ROOM_INVITE_JOIN_FAILED");
    router.replace(payload.href);
  }, [inviteRef, router]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void join().catch(() => setMessage("招待先が失効したか、部屋が更新されています。"));
  }, [join]);
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">GAME FIELDS INVITE</p>
        <h1 className="mt-3 text-2xl font-black">招待された部屋</h1>
        <p className="mt-4 text-sm leading-7 text-slate-300">{message}</p>
        {needsInput && <form className="mt-5" onSubmit={(event) => {
          event.preventDefault();
          void join(passphrase).catch(() => setMessage("合言葉を確認してください。"));
        }}>
          <input className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3" value={passphrase} onChange={(event) => setPassphrase(event.target.value.slice(0, 40))} placeholder="合言葉" autoComplete="off" />
          <button className="mt-3 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950" type="submit">参加する</button>
        </form>}
      </section>
    </main>
  );
}
