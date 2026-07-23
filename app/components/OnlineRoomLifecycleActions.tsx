"use client";

import { useAppLocale } from "@/app/components/AppLocaleProvider";
import { RoomResultActions } from "@/app/components/RoomResultActions";

export type OnlineRoomLifecycleSurface = "lobby" | "playing" | "result";

type OnlineRoomLifecycleActionsProps = {
  surface: OnlineRoomLifecycleSurface;
  canReturnToRoom?: boolean;
  disabled?: boolean;
  isHost: boolean;
  isRoomDissolved?: boolean;
  lobbyDissolveClassName?: string;
  onDissolve?: () => unknown | Promise<unknown>;
  onReturnToRoom?: () => unknown | Promise<unknown>;
  returnHref?: string;
};

export function OnlineRoomLifecycleActions({
  surface,
  canReturnToRoom = false,
  disabled = false,
  isHost,
  isRoomDissolved = false,
  lobbyDissolveClassName = "rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 font-black text-rose-800 transition hover:bg-rose-100 disabled:opacity-50",
  onDissolve,
  onReturnToRoom,
  returnHref,
}: OnlineRoomLifecycleActionsProps) {
  const { t } = useAppLocale();

  if (surface === "playing") return null;

  if (surface === "lobby") {
    if (!isHost || !onDissolve) return null;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onDissolve()}
        className={lobbyDissolveClassName}
      >
        {t("game.dissolve")}
      </button>
    );
  }

  if (!onReturnToRoom) return null;
  return (
    <RoomResultActions
      canReturnToRoom={canReturnToRoom}
      disabled={disabled}
      isHost={isHost}
      isRoomDissolved={isRoomDissolved}
      onReturnToRoom={onReturnToRoom}
      onDissolve={isHost ? onDissolve : undefined}
      returnHref={returnHref}
    />
  );
}
