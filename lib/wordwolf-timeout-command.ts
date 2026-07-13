import type { Room } from "@/lib/wordwolf-game-types";

const abstainVoteId = "__abstain__";
const timeoutText = "時間切れ";
export function wordWolfTimeoutGraceMs() {
  const configured = Number(process.env.WORDWOLF_TIMEOUT_GRACE_MS);
  return Number.isFinite(configured) && configured >= 0 && configured <= 10000 ? Math.floor(configured) : 5000;
}
const wolfIds = (room: Room) => room.wolfIds.length ? room.wolfIds : room.wolfId ? [room.wolfId] : [];
const runoffCandidates = (room: Room) => room.runoffCandidateIds?.length ? room.players.filter((player) => room.runoffCandidateIds?.includes(player.id)) : room.players;
const cluePlayers = (room: Room) => room.runoffCandidateIds?.length ? runoffCandidates(room) : room.players;
const voteVoters = (room: Room) => room.runoffCandidateIds?.length ? room.players.filter((player) => !room.runoffCandidateIds?.includes(player.id)) : room.players;

export function wordWolfDeadlineAt(room: Room) {
  if (!room.currentTurnStartedAt || room.turnTimeLimitSeconds <= 0) return null;
  const multiplier = room.phase === "vote" || room.phase === "wolfGuess" ? 2 : room.phase === "clue" ? 1 : 0;
  return multiplier ? room.currentTurnStartedAt + room.turnTimeLimitSeconds * multiplier * 1000 : null;
}

function timeoutClue(room: Room, now: number): Room {
  const participants = cluePlayers(room);
  const missing = room.clueMode === "simultaneous"
    ? participants.filter((player) => !room.clues.some((clue) => clue.round === room.currentRound && clue.playerId === player.id))
    : [room.players[room.currentTurnIndex]].filter(Boolean);
  if (!missing.length) return room;
  const clues = [...room.clues, ...missing.map((player) => ({ playerId: player.id, round: room.currentRound, text: timeoutText, at: now }))];
  const complete = participants.every((player) => clues.some((clue) => clue.round === room.currentRound && clue.playerId === player.id));
  if (!complete) {
    const currentIndex = participants.findIndex((player) => player.id === room.players[room.currentTurnIndex]?.id);
    const next = participants[(currentIndex + 1) % participants.length];
    return { ...room, clues, currentTurnIndex: Math.max(0, room.players.findIndex((player) => player.id === next?.id)), currentTurnStartedAt: now };
  }
  const runoff = Boolean(room.runoffCandidateIds?.length); const lastRound = room.currentRound >= room.roundsTotal;
  return { ...room, clues, currentTurnIndex: 0, currentRound: !runoff && !lastRound ? room.currentRound + 1 : room.currentRound, phase: runoff || lastRound ? "vote" : "clue", currentTurnStartedAt: now };
}

function timeoutVote(room: Room, now: number): Room {
  const votes = { ...room.votes }; for (const player of voteVoters(room)) if (!votes[player.id]) votes[player.id] = abstainVoteId;
  const candidates = runoffCandidates(room);
  const counts = candidates.map((player) => ({ id: player.id, count: Object.values(votes).filter((id) => id === player.id).length }));
  const max = Math.max(0, ...counts.map((item) => item.count));
  const top = max ? counts.filter((item) => item.count === max).map((item) => item.id) : [];
  const voteHistory = [...room.voteHistory, { round: room.voteHistory.length + 1, votes, candidateIds: candidates.map((player) => player.id), at: now }];
  if (top.length > 1) {
    const extraRound = room.currentRound + 1;
    const hasRunoffVoters = room.players.some((player) => !top.includes(player.id));
    return { ...room, phase: "clue", votes: {}, voteHistory, runoffCandidateIds: hasRunoffVoters ? top : null, currentRound: extraRound, currentTurnIndex: 0, currentTurnStartedAt: now };
  }
  const accusedId = top[0] ?? null;
  if (room.gameMode === "may-no-wolf" && wolfIds(room).length === 0) {
    const loser = room.players.find((player) => player.id === accusedId)?.name ?? "プレイヤー";
    return { ...room, phase: "result", votes, voteHistory, runoffCandidateIds: null, accusedId, currentTurnStartedAt: null, winner: "players", resultText: accusedId ? `狼はいませんでした。投票で選ばれた${loser}の負けです。` : "狼はいませんでした。投票が割れたため決着はつきません。" };
  }
  if (accusedId && wolfIds(room).includes(accusedId)) return { ...room, phase: "wolfGuess", votes, voteHistory, runoffCandidateIds: null, accusedId, currentTurnStartedAt: now };
  return { ...room, phase: "result", votes, voteHistory, runoffCandidateIds: null, accusedId, currentTurnStartedAt: null, winner: "wolf", resultText: accusedId ? "投票で狼を当てられませんでした。狼の勝利です。" : "投票が割れました。狼の勝利です。" };
}

export function applyWordWolfTimeout(room: Room, now = Date.now()) {
  const deadline = wordWolfDeadlineAt(room);
  if (!deadline || now < deadline + wordWolfTimeoutGraceMs()) return null;
  if (room.phase === "clue") return timeoutClue(room, now);
  if (room.phase === "vote") return timeoutVote(room, now);
  if (room.phase === "wolfGuess") return { ...room, phase: "result" as const, currentTurnStartedAt: null, wolfGuess: timeoutText, winner: "village" as const, resultText: "逆転回答は時間切れです。村側の勝利です。" };
  return null;
}
