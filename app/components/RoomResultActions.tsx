"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { confirmResultLobbyNavigation } from "./room-navigation-confirmation";
import { useAppLocale } from "./AppLocaleProvider";

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
  const { t } = useAppLocale();
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"lobby" | "room" | "dissolve" | null>(null);
  const pendingActionRef = useRef(false);
  const isPending = pendingAction !== null;

  const runPendingAction = async (action: "room" | "dissolve", callback: () => unknown | Promise<unknown>) => {
    if (pendingActionRef.current) return;
    pendingActionRef.current = true;
    setPendingAction(action);
    try {
      await callback();
    } finally {
      pendingActionRef.current = false;
      setPendingAction(null);
    }
  };

  const goToGameLobby = () => {
    if (pendingActionRef.current) return;
    if (!confirmResultLobbyNavigation(() => window.confirm(t("game.resultLobbyConfirm")))) return;
    pendingActionRef.current = true;
    setPendingAction("lobby");
    router.push(returnHref);
  };

  const pendingLabel = (label: string) => <span className="inline-flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />{label}</span>;

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        disabled={disabled || isPending || !canReturnToRoom || isRoomDissolved}
        onClick={() => void runPendingAction("room", onReturnToRoom)}
        className="rounded-xl border border-cyan-200 bg-cyan-300 px-5 py-4 text-lg font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-70 sm:col-span-2"
      >
        {pendingAction === "room" ? pendingLabel(t("game.returning")) : isRoomDissolved ? t("game.returnUnavailable") : canReturnToRoom ? t("game.returnRoom") : t("game.waitHostReturn")}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={goToGameLobby}
        className={`rounded-xl border border-slate-400/60 bg-slate-100 px-4 py-3 text-center font-bold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 ${isHost && !isRoomDissolved && onDissolve ? "" : "sm:col-span-2"}`}
      >
        {pendingAction === "lobby" ? pendingLabel(t("game.movingLobby")) : t("game.backLobby")}
      </button>
      {isHost && !isRoomDissolved && onDissolve && <button
        type="button"
        disabled={disabled || isPending}
        onClick={() => void runPendingAction("dissolve", onDissolve)}
        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
      >
        {pendingAction === "dissolve" ? pendingLabel(t("game.dissolving")) : t("game.dissolve")}
      </button>}
    </div>
  );
}
