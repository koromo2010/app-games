"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type RoomResultActionsProps = {
  canReturnToRoom: boolean;
  disabled?: boolean;
  isHost: boolean;
  isRoomDissolved?: boolean;
  onDissolve?: () => unknown | Promise<unknown>;
  onReturnToRoom: () => unknown | Promise<unknown>;
  returnHref?: string;
};

export function RoomResultActions({
  canReturnToRoom,
  disabled = false,
  isHost,
  isRoomDissolved = false,
  onDissolve,
  onReturnToRoom,
  returnHref = "/games",
}: RoomResultActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"lobby" | "room" | "dissolve" | null>(null);
  const isPending = pendingAction !== null;

  const runPendingAction = async (action: "room" | "dissolve", callback: () => unknown | Promise<unknown>) => {
    setPendingAction(action);
    try {
      await callback();
    } finally {
      setPendingAction(null);
    }
  };

  const goToGameLobby = () => {
    setPendingAction("lobby");
    router.push(returnHref);
  };

  const pendingLabel = (label: string) => <span className="inline-flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />{label}</span>;

  return (
    <div className={`mt-5 grid gap-3 ${isHost && !isRoomDissolved ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      <button
        type="button"
        disabled={isPending}
        onClick={goToGameLobby}
        className="rounded-xl bg-amber-300 px-4 py-3 text-center font-black text-slate-950 transition hover:bg-amber-200"
      >
        {pendingAction === "lobby" ? pendingLabel("広場へ移動中…") : "広場へ戻る"}
      </button>
      <button
        type="button"
        disabled={disabled || isPending || !canReturnToRoom || isRoomDissolved}
        onClick={() => void runPendingAction("room", onReturnToRoom)}
        className="rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-3 font-black text-cyan-900 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70"
      >
        {pendingAction === "room" ? pendingLabel("部屋に戻っています…") : isRoomDissolved ? "部屋に戻れません" : canReturnToRoom ? "部屋に戻る" : "ホストが戻るまで待つ"}
      </button>
      {isHost && !isRoomDissolved && onDissolve && <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => void runPendingAction("dissolve", onDissolve)}
        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
      >
        {pendingAction === "dissolve" ? pendingLabel("解散しています…") : "部屋を解散"}
      </button>}
    </div>
  );
}
