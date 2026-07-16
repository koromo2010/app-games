import { useMemo } from "react";
import { hodoaiResultPresentation, type HodoaiRoom } from "@/lib/hodoai-talk";

function formatTime(seconds: number) { return seconds === 0 ? "なし" : `${seconds}秒`; }

export function useHodoaiViewModel(room: HodoaiRoom | null, playerId: string) {
  return useMemo(() => {
    const isHost = Boolean(room && playerId === room.hostId);
    const sorter = room?.players.find((player) => player.id === room.sorterId) ?? null;
    const latestResult = room?.history.at(-1);
    return {
      isHost,
      submittedCount: room ? room.cards.filter((card) => Boolean(room.clues[card.id])).length : 0,
      sorter,
      canArrange: Boolean(room?.phase === "arrange" && room.sorterId === playerId),
      latestResult,
      latestResultRows: latestResult ? hodoaiResultPresentation(latestResult, room?.players ?? []).rows : [],
      ownCards: room?.cards.filter((card) => card.ownerId === playerId) ?? [],
      configItems: room ? [
        { label: "参加人数", value: `${room.players.length}人` },
        { label: "配るカード", value: `1人${room.cardsPerPlayer}枚` },
        { label: "ことば", value: `同じカードで${room.roundsTotal}回` },
        { label: "ヒント時間", value: formatTime(room.clueTimeLimitSeconds) },
        { label: "相談時間", value: formatTime(room.arrangeTimeLimitSeconds) },
        { label: "並べ替え役", value: room.phase === "lobby" ? "開始時にランダム" : sorter?.name ?? "未定" },
        { label: "合言葉", value: room.passphrase ? "あり" : "なし" },
        { label: "デバッグ", value: room.debugMode ? "ON" : "OFF" },
      ] : [],
    };
  }, [playerId, room]);
}
