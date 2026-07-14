import {
  canRenderGameAd,
  gameAdSlotId,
  normalizeGameAdsMode,
  type GameAdSurface,
} from "@/lib/game-advertising";

type GameAdSlotProps = {
  gameId: string;
  surface: GameAdSurface | null;
  disabled?: boolean;
  className?: string;
};

/**
 * Stable, provider-neutral mount point for future ads.
 * Off by default. Preview reserves the final layout; live exposes one central render target.
 */
export function GameAdSlot({ gameId, surface, disabled = false, className = "" }: GameAdSlotProps) {
  const mode = normalizeGameAdsMode(process.env.NEXT_PUBLIC_GAME_ADS_MODE);
  if (!surface || !canRenderGameAd(mode, surface, disabled)) return null;

  const slotId = gameAdSlotId(gameId, surface);
  return (
    <aside
      aria-label="広告"
      data-game-ad-slot={slotId}
      data-game-ad-surface={surface}
      className={`mx-auto my-4 min-h-24 w-[calc(100%-2rem)] max-w-6xl rounded-xl border border-dashed border-white/15 bg-slate-950/55 px-4 py-3 text-slate-300 ${className}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Advertisement</p>
      {mode === "preview" ? (
        <div className="grid min-h-14 place-items-center text-center text-xs font-semibold text-slate-500">
          広告表示予定エリア・{slotId}
        </div>
      ) : (
        <div data-game-ad-render-target={slotId} className="min-h-14" />
      )}
    </aside>
  );
}
