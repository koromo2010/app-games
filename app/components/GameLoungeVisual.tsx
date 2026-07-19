import Image from "next/image";

export function GameLoungeVisual({ gameId, className = "" }: { gameId: string; className?: string }) {
  return (
    <div aria-hidden="true" className={`relative isolate h-40 overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-[0_20px_60px_rgba(2,6,23,0.35)] sm:h-52 ${className}`}>
      <Image
        src={`/game-visuals/${gameId}.webp`}
        alt=""
        fill
        priority
        unoptimized
        sizes="(min-width: 1280px) 1200px, (min-width: 768px) 90vw, 100vw"
        className="object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-white/10" />
      <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}
