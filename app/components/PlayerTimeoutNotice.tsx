import type { PlayerTimeoutFields } from "@/lib/player-timeout-policy";

type PlayerTimeoutNoticeProps = PlayerTimeoutFields & {
  currentPlayerId: string;
  disabled?: boolean;
  onRecover: () => void;
};

export function PlayerTimeoutNotice({ playerTimeouts, playerTimeoutNotice, currentPlayerId, disabled = false, onRecover }: PlayerTimeoutNoticeProps) {
  const reduced = playerTimeouts[currentPlayerId]?.reducedTime === true;
  if (!playerTimeoutNotice && !reduced) return null;
  return (
    <section aria-live="polite" className="rounded-xl border border-amber-300/35 bg-amber-300/10 p-4 text-amber-50">
      {playerTimeoutNotice && <p className="text-sm font-bold">{playerTimeoutNotice.message}</p>}
      {reduced && (
        <button type="button" disabled={disabled} onClick={onRecover} className="mt-3 rounded-lg bg-amber-300 px-4 py-2 text-sm font-black text-amber-950 disabled:opacity-50">
          復帰して通常の持ち時間に戻す
        </button>
      )}
    </section>
  );
}
