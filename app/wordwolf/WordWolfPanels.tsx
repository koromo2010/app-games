import type { Room } from "@/lib/wordwolf-game-types";
import { mutedPanelClass } from "./styles";
import { abstainVoteId } from "./game-flow";

export function VoteHistoryPanel({ room }: { room: Room }) {
  if (room.voteHistory.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">Vote results</p>
      <h3 className="mt-1 text-lg font-black text-slate-950">{"\u6295\u7968\u7d50\u679c"}</h3>
      <div className="mt-3 space-y-3">
        {room.voteHistory.map((round) => (
          <div key={`${round.round}-${round.at}`} className="rounded-lg bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-950">{round.round}{"\u56de\u76ee"}</p>
              <p className="text-xs font-semibold text-slate-500">
                {round.candidateIds.length < room.players.length ? "\u6c7a\u9078" : "\u521d\u56de"}
              </p>
            </div>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              {Object.entries(round.votes).map(([voterId, targetId]) => {
                const voter = room.players.find((player) => player.id === voterId);
                const target = room.players.find((player) => player.id === targetId);
                const targetName = targetId === abstainVoteId ? "\u6295\u7968\u305b\u305a" : target?.name ?? "Unknown";
                return (
                  <div key={`${round.round}-${voterId}`} className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-700">
                    <dt className="inline font-semibold text-slate-950">{voter?.name ?? "Unknown"}</dt>
                    <dd className="inline"> {"\u2192"} {targetName}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClueLogPanel({ room }: { room: Room }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/[0.96] p-3 shadow-[0_12px_34px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase text-cyan-700">Timeline</p>
          <h2 className="text-lg font-black text-slate-950">{"\u767a\u8a00\u30ed\u30b0"}</h2>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {room.clues.length} posts
        </span>
      </div>
      <div className="mt-3 grid gap-1.5">
        {room.clues.length === 0 ? (
          <p className={`${mutedPanelClass} px-3 py-4 text-center text-sm text-slate-500`}>
            {"\u307e\u3060\u6295\u7a3f\u306f\u3042\u308a\u307e\u305b\u3093\u3002"}
          </p>
        ) : (
          room.clues.map((clue) => {
            const player = room.players.find((item) => item.id === clue.playerId);
            return (
              <div
                key={`${clue.playerId}-${clue.round}-${clue.at}`}
                className="grid gap-2 rounded border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-sm sm:grid-cols-[88px_1fr]"
              >
                <div className="flex min-w-0 items-center gap-1.5 sm:block">
                  <p className="truncate text-xs font-bold text-slate-950">{player?.name ?? "Unknown"}</p>
                  <p className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 sm:mt-1 sm:inline-block">
                    {clue.round}{"\u5468\u76ee"}
                  </p>
                </div>
                <p className="min-w-0 whitespace-pre-wrap break-words leading-5 text-slate-700">{clue.text}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
