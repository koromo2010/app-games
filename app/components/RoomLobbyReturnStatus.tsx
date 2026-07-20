import type { RoomLobbyReturnState } from "@/lib/room-lobby-return";

type Player = { id: string; name: string };
type Props = {
  state?: RoomLobbyReturnState;
  players: readonly Player[];
  hostId: string;
  isHost: boolean;
  onRemoveWaitingPlayer: (player: Player) => void;
  variant?: "dark" | "light";
};

export function RoomLobbyReturnStatus({ state, players, hostId, isHost, onRemoveWaitingPlayer, variant = "dark" }: Props) {
  if (!state) return null;
  const returnedPlayerIds = new Set(state.returnedPlayerIds);
  const returnedCount = players.filter((player) => returnedPlayerIds.has(player.id)).length;
  const dark = variant === "dark";
  return <div className={`mt-3 rounded-xl border p-3 ${dark ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-50" : "border-cyan-200 bg-cyan-50 text-cyan-950"}`}>
    <div className="flex items-center justify-between gap-3 text-sm font-black"><span>{state.reason === "debug-abort" ? "中断後の復帰確認" : "前の結果からの復帰確認"}</span><span>{returnedCount}/{players.length}人</span></div>
    <p className={`mt-1 text-xs leading-5 ${dark ? "text-cyan-100/80" : "text-cyan-800"}`}>全員が戻ると次のゲームを開始できます。戻ってこない参加者はホストが退出扱いにできます。</p>
    <div className="mt-2 flex flex-wrap gap-2">{players.map((player) => {
      const returned = returnedPlayerIds.has(player.id);
      return <span key={player.id} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${returned ? dark ? "bg-emerald-300/15 text-emerald-100" : "bg-emerald-100 text-emerald-800" : dark ? "bg-amber-300/15 text-amber-100" : "bg-amber-100 text-amber-800"}`}>
        <span>{player.name}・{returned ? "戻りました" : "復帰待ち"}</span>
        {isHost && player.id !== hostId && !returned && <button type="button" onClick={() => onRemoveWaitingPlayer(player)} className={`rounded px-1.5 py-0.5 font-black ${dark ? "bg-rose-200 text-rose-950" : "bg-white text-rose-700"}`}>退出</button>}
      </span>;
    })}</div>
  </div>;
}
