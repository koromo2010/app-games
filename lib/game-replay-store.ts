import { createHmac } from "node:crypto";
import { hodoaiResultPresentation, type HodoaiRoom } from "@/lib/hodoai-talk";
import type { KotobaSenpukuRoom } from "@/lib/kotoba-senpuku";
import type { NorthernRoom } from "@/lib/northern-branch-types";
import type { NigoichiRoom } from "@/lib/nigoichi";
import type { CodeInterceptRoom } from "@/lib/code-intercept";
import type { DaifugoRoom } from "@/lib/daifugo-room";
import { playingCardLabel } from "@/lib/playing-cards";
import type { TahoiyaRoom } from "@/lib/tahoiya-types";
import { calculateTahoiyaRoundScores, tahoiyaValidVotes } from "@/lib/tahoiya-scoring";
import type { WordWolfRoom } from "@/lib/wordwolf-room-store";
import { redisCommand, redisPipeline } from "@/lib/redis-store";
import {
  emitObservabilityEvent,
  observabilityErrorCode,
  observabilityRef,
} from "@/lib/observability";
import {
  tahoiyaReplaySummaryHighlights,
  type GameReplayDetail,
  type GameReplayGameType,
  type GameReplayListResponse,
  type GameReplaySummary,
  type GenericGameReplayDetail,
  type TahoiyaReplayDetail,
} from "@/lib/game-replay-types";
import { resolveGameReplayPolicy } from "@/lib/game-replay-policy";
import { shouldRecordGameReplay } from "@/lib/debug-replay";

type StoredReplayPlayer = { id: string; name: string };

type StoredReplayBase = {
  schemaVersion: 1;
  id: string;
  gameType: GameReplayGameType;
  finishedAt: number;
  expiresAt: number;
  round: number;
  title: string;
  players: StoredReplayPlayer[];
  resultLabels: Record<string, string>;
  shareHighlights: string[];
};

type StoredGenericReplay = StoredReplayBase & {
  gameType: Exclude<GameReplayGameType, "tahoiya">;
  overview: string;
  highlights: string[];
  scoreLabels: Record<string, string>;
};

type StoredTahoiyaReplay = StoredReplayBase & {
  gameType: "tahoiya";
  word: string;
  reading?: string;
  realDefinition: string;
  resultText: string;
  definitions: { id: string; text: string; authorId: string | null; isReal: boolean }[];
  votes: Record<string, string>;
  scores: Record<string, number>;
};

type StoredGameReplay = StoredGenericReplay | StoredTahoiyaReplay;

const replayKeyPrefix = "game-replay:v1:";
const playerIndexKeyPrefix = "player-replays:v1:";
const playerFavoritesKeyPrefix = "player-replay-favorites:v1:";
const replayFavoritersKeyPrefix = "game-replay-favoriters:v1:";
const maximumPlayerIndexSize = 500;

function replayKey(id: string) { return `${replayKeyPrefix}${id}`; }
function playerIndexKey(playerId: string) { return `${playerIndexKeyPrefix}${playerId}`; }
function playerFavoritesKey(playerId: string) { return `${playerFavoritesKeyPrefix}${playerId}`; }
function replayFavoritersKey(id: string) { return `${replayFavoritersKeyPrefix}${id}`; }

function replayId(eventId: string) {
  const secret = process.env.PLAYER_SESSION_SECRET || process.env.LLM_SESSION_SECRET;
  if (!secret) return "";
  const digest = createHmac("sha256", secret).update(`replay:${eventId}`).digest("base64url").slice(0, 24);
  return `replay_${digest}`;
}

function cleanText(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function cleanLines(lines: unknown[], maximumLines = 100) {
  return lines.map((line) => cleanText(line, 300)).filter(Boolean).slice(0, maximumLines);
}

function isReplayGameType(value: unknown): value is GameReplayGameType {
  return value === "wordwolf"
    || value === "tahoiya"
    || value === "northern-branch"
    || value === "hodoai"
    || value === "kotoba-senpuku"
    || value === "nigoichi"
    || value === "code-intercept"
    || value === "daifugo"
    || value === "wordwolf-sdk"
    || (
      typeof value === "string"
      && /^sdk:[a-z][a-z0-9-]{1,63}$/.test(value)
    );
}

function parseStoredReplay(value: unknown): StoredGameReplay | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredReplayBase> & {
      word?: unknown;
      reading?: unknown;
      realDefinition?: unknown;
      resultText?: unknown;
      definitions?: unknown[];
      votes?: Record<string, string>;
      scores?: Record<string, number>;
      overview?: unknown;
      highlights?: unknown[];
      scoreLabels?: Record<string, string>;
    };
    if (
      parsed.schemaVersion !== 1
      || !isReplayGameType(parsed.gameType)
      || typeof parsed.id !== "string"
      || typeof parsed.finishedAt !== "number"
      || typeof parsed.expiresAt !== "number"
      || !Array.isArray(parsed.players)
    ) return null;

    // 旧たほい屋プレイバックにも読み取り互換を残す。
    if (parsed.gameType === "tahoiya") {
      if (!Array.isArray(parsed.definitions) || !parsed.scores || typeof parsed.scores !== "object") return null;
      const scores = parsed.scores;
      return {
        ...(parsed as StoredTahoiyaReplay),
        title: cleanText(parsed.title, 120) || cleanText(parsed.word, 120),
        realDefinition: cleanText(parsed.realDefinition, 1200),
        resultText: cleanText(parsed.resultText, 2000),
        votes: parsed.votes && typeof parsed.votes === "object" ? parsed.votes : {},
        resultLabels: parsed.resultLabels && typeof parsed.resultLabels === "object"
          ? parsed.resultLabels
          : Object.fromEntries(parsed.players.map((player) => [player.id, `${scores[player.id] ?? 0}点`])),
        shareHighlights: Array.isArray(parsed.shareHighlights) ? cleanLines(parsed.shareHighlights, 3) : [],
      };
    }

    if (!Array.isArray(parsed.highlights) || !parsed.scoreLabels || typeof parsed.scoreLabels !== "object") return null;
    return {
      ...(parsed as StoredGenericReplay),
      title: cleanText(parsed.title, 120) || "プレイバック",
      resultLabels: parsed.resultLabels && typeof parsed.resultLabels === "object" ? parsed.resultLabels : {},
      shareHighlights: Array.isArray(parsed.shareHighlights) ? cleanLines(parsed.shareHighlights, 3) : [],
    };
  } catch {
    return null;
  }
}

function isParticipant(replay: StoredGameReplay, playerId: string) {
  return replay.players.some((player) => player.id === playerId);
}

function replaySummary(replay: StoredGameReplay, playerId: string, favorite: boolean): GameReplaySummary {
  const shareHighlights = replay.gameType === "tahoiya"
    ? tahoiyaReplaySummaryHighlights({
      definitions: replay.definitions,
      playerId,
      realDefinition: replay.realDefinition,
      scores: replay.scores,
      votes: replay.votes,
    })
    : replay.shareHighlights;
  return {
    id: replay.id,
    gameType: replay.gameType,
    finishedAt: replay.finishedAt,
    expiresAt: replay.expiresAt,
    favorite,
    title: replay.title,
    resultLabel: cleanText(replay.resultLabels[playerId], 80) || "プレイ完了",
    playerCount: replay.players.length,
    round: replay.round,
    shareHighlights: cleanLines(shareHighlights, 3),
  };
}

function makeReplayBase(
  eventId: string,
  gameType: GameReplayGameType,
  finishedAt: number,
  round: number,
  title: string,
  players: StoredReplayPlayer[],
  resultLabels: Record<string, string>,
  shareHighlights: string[],
): StoredReplayBase {
  const policy = resolveGameReplayPolicy();
  return {
    schemaVersion: 1,
    id: replayId(eventId),
    gameType,
    finishedAt,
    expiresAt: finishedAt + policy.retentionDays * 24 * 60 * 60 * 1000,
    round,
    title: cleanText(title, 120) || "プレイバック",
    players: players.map((player) => ({ id: cleanText(player.id, 160), name: cleanText(player.name, 40) || "Unknown" })),
    resultLabels: Object.fromEntries(Object.entries(resultLabels).map(([id, label]) => [id, cleanText(label, 80)])),
    shareHighlights: cleanLines(shareHighlights, 3),
  };
}

async function storeReplay(replay: StoredGameReplay, roomCode: string) {
  if (!replay.id) return false;
  const remainingSeconds = Math.max(1, Math.ceil((replay.expiresAt - Date.now()) / 1000));
  try {
    const created = await redisCommand<"OK" | null>(["SET", replayKey(replay.id), JSON.stringify(replay), "NX", "EX", String(remainingSeconds)]);
    await redisPipeline(replay.players.flatMap((player) => [
      ["ZADD", playerIndexKey(player.id), String(replay.finishedAt), replay.id],
      ["ZREMRANGEBYRANK", playerIndexKey(player.id), "0", String(-(maximumPlayerIndexSize + 1))],
    ]));
    if (created === "OK") {
      emitObservabilityEvent("info", "replay.record", {
        game: replay.gameType,
        operation: "record-replay",
        roomRef: observabilityRef("room", roomCode),
        eventRef: observabilityRef("event", replay.id),
        round: replay.round,
        playerCount: replay.players.length,
        affectedCount: 1,
        outcome: "success",
      });
    }
    return created === "OK";
  } catch (error) {
    emitObservabilityEvent("error", "replay.record", {
      game: replay.gameType,
      operation: "record-replay",
      roomRef: observabilityRef("room", roomCode),
      eventRef: observabilityRef("event", replay.id),
      round: replay.round,
      outcome: "failed",
      errorCode: observabilityErrorCode(error),
    });
    return false;
  }
}

export type StandardPlatformGameReplayInput = {
  gameType: Exclude<GameReplayGameType, "tahoiya">;
  eventId: string;
  roomCode: string;
  finishedAt: number;
  gameNumber: number;
  title: string;
  players: StoredReplayPlayer[];
  winnerIds: string[];
  rankings: Array<{
    participantId: string;
    rank: number;
    score: number;
  }>;
  reason: string;
};

/** Stores only the common, player-safe result contract for SDK playback. */
export async function recordStandardPlatformGameReplay(
  input: StandardPlatformGameReplayInput,
) {
  const winnerIds = new Set(input.winnerIds);
  const playerNames = new Map(
    input.players.map((player) => [player.id, player.name]),
  );
  const resultLabels = Object.fromEntries(input.rankings.map((ranking) => [
    ranking.participantId,
    winnerIds.has(ranking.participantId)
      ? `勝利・${ranking.score}点`
      : `${ranking.rank}位・${ranking.score}点`,
  ]));
  const base = makeReplayBase(
    input.eventId,
    input.gameType,
    input.finishedAt,
    input.gameNumber,
    input.title,
    input.players,
    resultLabels,
    [
      input.reason,
      ...input.rankings
        .slice()
        .sort((left, right) => left.rank - right.rank)
        .slice(0, 2)
        .map((ranking) => (
          `${ranking.rank}位 ${playerNames.get(ranking.participantId) ?? "Unknown"}`
        )),
    ],
  );
  return storeReplay({
    ...base,
    gameType: input.gameType,
    overview: cleanText(input.reason, 300) || "ゲーム終了",
    highlights: cleanLines(input.rankings.map((ranking) => (
      `${ranking.rank}位 ${playerNames.get(ranking.participantId) ?? "Unknown"}・${ranking.score}点`
    ))),
    scoreLabels: resultLabels,
  }, input.roomCode);
}

function wordWolfIds(room: WordWolfRoom) {
  return room.wolfIds.length > 0 ? room.wolfIds : room.wolfId ? [room.wolfId] : [];
}

function wordWolfWon(room: WordWolfRoom, playerId: string) {
  if (room.winner === "players") return room.accusedId ? playerId !== room.accusedId : true;
  if (room.winner === "village") return !wordWolfIds(room).includes(playerId);
  return wordWolfIds(room).includes(playerId);
}

export async function recordWordWolfReplay(room: WordWolfRoom) {
  if (room.phase !== "result" || !room.winner || !shouldRecordGameReplay(room)) return false;
  const wolves = new Set(wordWolfIds(room));
  const names = new Map(room.players.map((player) => [player.id, player.name]));
  const roleLabel = (id: string) => wolves.size === 0 ? "人狼なし" : wolves.has(id) ? "人狼" : "村人";
  const resultLabels = Object.fromEntries(room.players.map((player) => [
    player.id,
    `${wordWolfWon(room, player.id) ? "勝利" : "敗北"}・${roleLabel(player.id)}`,
  ]));
  const winnerLabel = room.winner === "village" ? "村人陣営の勝利" : room.winner === "wolf" ? "人狼陣営の勝利" : "人狼なしを見抜いた人の勝利";
  const details = [
    cleanText(room.resultText, 300),
    `村人のお題: ${cleanText(room.villageWord, 100)}`,
    wolves.size > 0 ? `人狼のお題: ${cleanText(room.wolfWord, 100)}` : "今回は人狼なし",
    `配役: ${room.players.map((player) => `${player.name}=${roleLabel(player.id)}`).join("、")}`,
    ...room.clues.map((clue) => `発言 ${clue.round}: ${names.get(clue.playerId) ?? "Unknown"}「${clue.text}」`),
    ...room.voteHistory.map((vote) => `投票 ${vote.round}: ${Object.entries(vote.votes).map(([from, to]) => `${names.get(from) ?? "Unknown"}→${names.get(to) ?? "Unknown"}`).join("、")}`),
  ];
  const base = makeReplayBase(
    `wordwolf:${room.code}:${room.createdAt}:${room.gameNumber}`,
    "wordwolf",
    room.updatedAt || Date.now(),
    room.gameNumber,
    `第${room.gameNumber}ゲーム`,
    room.players,
    resultLabels,
    [
      `${room.currentRound}ラウンドの会話`,
      room.voteHistory.length > 1 ? "投票は決選投票へ" : "投票1回で決着",
      winnerLabel,
    ],
  );
  return storeReplay({
    ...base,
    gameType: "wordwolf",
    overview: winnerLabel,
    highlights: cleanLines(details),
    scoreLabels: resultLabels,
  }, room.code);
}

function tahoiyaRoundScores(room: TahoiyaRoom) {
  return calculateTahoiyaRoundScores(room);
}

export async function recordTahoiyaReplay(room: TahoiyaRoom) {
  if (room.phase !== "result" || !shouldRecordGameReplay(room) || !room.word || room.options.length === 0) return false;
  const votes = tahoiyaValidVotes(room);
  const scores = tahoiyaRoundScores({ ...room, votes });
  const realOption = room.options.find((option) => option.isReal);
  const realVotes = realOption ? Object.values(votes).filter((id) => id === realOption.id).length : 0;
  const fooledVotes = Object.keys(votes).length - realVotes;
  const base = makeReplayBase(
    `tahoiya:${room.code}:${room.createdAt}:${room.round}`,
    "tahoiya",
    room.updatedAt || Date.now(),
    room.round,
    cleanText(room.word, 120),
    room.players,
    Object.fromEntries(room.players.map((player) => [player.id, `${scores[player.id] ?? 0}点`])),
    [`本物を見抜いたのは${realVotes}人`, `偽説明に集まった票は${fooledVotes}票`, `全${room.options.length}個の説明から選択`],
  );
  return storeReplay({
    ...base,
    gameType: "tahoiya",
    word: cleanText(room.word, 120),
    reading: cleanText(room.reading, 160) || undefined,
    realDefinition: cleanText(room.realDefinition, 1200),
    resultText: cleanText(room.resultText, 2000),
    definitions: room.options.map((option) => ({
      id: cleanText(option.id, 100),
      text: cleanText(option.text, 1200),
      authorId: option.authorId,
      isReal: option.isReal,
    })),
    votes,
    scores: Object.fromEntries(room.players.map((player) => [player.id, Math.max(0, Math.floor(scores[player.id] ?? 0))])),
  }, room.code);
}

export async function recordHodoaiReplay(room: HodoaiRoom) {
  if (room.phase !== "result" || room.round < room.roundsTotal || !shouldRecordGameReplay(room)) return false;
  const players = room.players.filter((player) => !player.isDummy);
  const maxPoints = 3;
  const result = room.history.at(-1);
  const resultLabel = `${room.totalPoints}/${maxPoints}点`;
  const presentation = result ? hodoaiResultPresentation(result, room.players) : null;
  const details = result ? [
    ...result.clueRounds.map((clueRound) => `ことば${clueRound.round}「${clueRound.theme.title}」`),
    `最終並び: ${result.points}/3点・並べ違い${result.inversions}組`,
    ...(presentation?.rows.map((row) => `${row.rank}. ${row.playerName}（カード${row.cardNumber}）「${row.expressions.join(" / ")}」→数字${row.value}`) ?? []),
  ] : [];
  const base = makeReplayBase(
    `hodoai:${room.code}:${room.createdAt}:${room.gameNumber ?? 1}`,
    "hodoai",
    room.updatedAt || Date.now(),
    room.gameNumber ?? 1,
    `同じカードでことば${room.roundsTotal}回`,
    players,
    Object.fromEntries(players.map((player) => [player.id, resultLabel])),
    [`チーム得点 ${resultLabel}`, result?.inversions === 0 ? "全カードの並びが完全一致" : `並び違い${result?.inversions ?? 0}組`, `全${room.roundsTotal}テーマに挑戦`],
  );
  return storeReplay({ ...base, gameType: "hodoai", overview: `協力して${resultLabel}を獲得`, highlights: cleanLines(details), scoreLabels: Object.fromEntries(players.map((player) => [player.id, resultLabel])) }, room.code);
}

export async function recordNorthernBranchReplay(room: NorthernRoom) {
  if (room.phase !== "finished" || !room.game?.winnerId || !shouldRecordGameReplay(room)) return false;
  const players = room.players.filter((player) => !player.isDummy);
  const gamePlayers = new Map(room.game.players.map((player) => [player.id, player]));
  const winner = gamePlayers.get(room.game.winnerId);
  const resultLabels = Object.fromEntries(players.map((player) => [player.id, player.id === room.game?.winnerId ? "勝利" : `${gamePlayers.get(player.id)?.points ?? 0}点`]));
  const base = makeReplayBase(
    `northern-branch:${room.code}:${room.createdAt}:${room.gameNumber}`,
    "northern-branch",
    room.updatedAt || Date.now(),
    room.gameNumber,
    `第${room.gameNumber}ゲーム`,
    players,
    resultLabels,
    [`${room.game.turn}ターンで決着`, `勝者は${winner?.points ?? 0}勝利点`, `建物は合計${room.game.players.reduce((sum, player) => sum + player.buildings.length, 0)}棟`],
  );
  const scoreLabels = Object.fromEntries(players.map((player) => {
    const gamePlayer = gamePlayers.get(player.id);
    return [player.id, `${gamePlayer?.points ?? 0}点・建物${gamePlayer?.buildings.length ?? 0}棟`];
  }));
  return storeReplay({ ...base, gameType: "northern-branch", overview: `${winner?.name ?? "商会"}が勝利`, highlights: cleanLines(room.game.log.slice(-80)), scoreLabels }, room.code);
}

export async function recordKotobaSenpukuReplay(room: KotobaSenpukuRoom) {
  if (room.phase !== "result" || room.round < room.roundsTotal || !shouldRecordGameReplay(room)) return false;
  const players = room.players.filter((player) => !player.isDummy);
  const winnerIds = room.history.at(-1)?.winnerIds ?? (room.history.at(-1)?.winnerId ? [room.history.at(-1)!.winnerId!] : []);
  const winners = players.filter((player) => winnerIds.includes(player.id));
  const winnerLabel = winners.map((player) => player.name).join("・") || "勝者なし";
  const resultLabels = Object.fromEntries(players.map((player) => [player.id, winnerIds.includes(player.id) ? "勝利" : "脱落"]));
  const names = new Map(room.players.map((player) => [player.id, player.name]));
  const totalScans = room.history.reduce((sum, round) => sum + round.calledKana.length, 0);
  const details = room.history.flatMap((round) => {
    const roundWinners = new Set(round.winnerIds ?? (round.winnerId ? [round.winnerId] : []));
    const eventLines = round.events.map((event) => {
      const actorName = names.get(event.actorId) ?? "Unknown";
      if (event.type === "scan") {
        const hitNames = event.hitIds.map((id) => names.get(id) ?? "Unknown").join("、");
        const eliminatedNames = event.eliminatedIds.map((id) => names.get(id) ?? "Unknown").join("、");
        return `第${event.turn}手: ${actorName}が「${event.kana}」を探知 → ${hitNames ? `${hitNames}に命中` : "命中なし"}${eliminatedNames ? `／${eliminatedNames}の秘密語が全公開となり脱落` : ""}`;
      }
      if (event.type === "challenge") {
        const targetName = names.get(event.targetId) ?? "Unknown";
        const answer = event.guess ? `秘密語を「${event.guess}」と回答` : "秘密語を直接回答";
        return `第${event.turn}手: ${actorName}が${targetName}の${answer} → ${event.correct ? `正解、${targetName}が脱落` : "不正解"}`;
      }
      return `第${event.turn}手: ${actorName}が時間切れ`;
    });
    return [
      `お題「${round.theme.title}」`,
      ...(eventLines.length > 0 ? eventLines : [`探知された文字（順番）: ${round.calledKana.join("・") || "なし"}`]),
      ...Object.entries(round.secrets).map(([id, secret]) => `${names.get(id) ?? "Unknown"} — 秘密語「${secret}」／${roundWinners.has(id) ? "勝利" : "脱落"}`),
    ];
  });
  const latestRound = room.history.at(-1);
  const winnerSecrets = winners.map((player) => `${player.name}「${latestRound?.secrets[player.id] ?? ""}」`).join("、");
  const base = makeReplayBase(
    `kotoba-senpuku:${room.code}:${room.createdAt}:${room.gameNumber}`,
    "kotoba-senpuku",
    room.updatedAt || Date.now(),
    room.gameNumber,
    latestRound ? `「${latestRound.theme.title}」` : `第${room.gameNumber}ゲーム`,
    players,
    resultLabels,
    [`${winnerSecrets || winnerLabel}が勝利`, `探知した文字は合計${totalScans}個`, `${players.length}人で最後の1人まで対戦`],
  );
  const scoreLabels = Object.fromEntries(players.map((player) => [player.id, winnerIds.includes(player.id) ? "勝利" : "脱落"]));
  return storeReplay({ ...base, gameType: "kotoba-senpuku", overview: `${winnerSecrets || winnerLabel}が最後まで残って勝利`, highlights: cleanLines(details), scoreLabels }, room.code);
}

export async function recordNigoichiReplay(room: NigoichiRoom) {
  if (room.phase !== "result" || room.missingNumber === null || !shouldRecordGameReplay(room)) return false;
  const players = room.players.filter((player) => !player.isDummy);
  const correct = players.filter((player) => room.guesses[player.id] === room.missingNumber);
  const resultLabels = Object.fromEntries(players.map((player) => {
    const score = room.roundScores[player.id];
    return [player.id, score ? `ラウンド${score.roundScore >= 0 ? "+" : ""}${score.roundScore}点・累計${score.totalScoreAfterRound}点` : "得点なし"];
  }));
  const base = makeReplayBase(
    `nigoichi:${room.code}:${room.createdAt}:${room.gameNumber}`,
    "nigoichi",
    room.updatedAt || Date.now(),
    room.gameNumber,
    `第${room.gameNumber}ゲーム`,
    players,
    resultLabels,
    [`${players.length}人中${correct.length}人が正解`, `余りは${room.missingNumber + 1}番`, `A=${room.cardsPerPlayer}枚・M=${room.associationWordCount}語・B=${room.words.length}枚`],
  );
  const names = new Map(room.players.map((player) => [player.id, player.name]));
  const highlights = [
    `場の単語: ${room.words.map((word, index) => `${index + 1}.${word}`).join("、")}`,
    ...room.players.map((player) => {
      const hand = room.hands[player.id] ?? [];
      const associations = (room.associations[player.id] ?? []).map((clue) => `「${clue}」`).join(" / ");
      const score = room.roundScores[player.id];
      const scoreDetails = score
        ? `正解点+${score.correctBonus}・被投票-${score.receivedWrongVotes}・ラウンド${score.roundScore >= 0 ? "+" : ""}${score.roundScore}・累計${score.totalScoreAfterRound}`
        : "得点なし";
      return `${names.get(player.id) ?? "Unknown"}: ${hand.map((number) => `${number + 1}.${room.words[number] ?? ""}`).join(" / ")} → 連想語${associations} → 予想${(room.guesses[player.id] ?? -1) + 1}番 → ${scoreDetails}`;
    }),
  ];
  return storeReplay({ ...base, gameType: "nigoichi", overview: `${players.length}人中${correct.length}人が正解・得点を累計`, highlights: cleanLines(highlights), scoreLabels: resultLabels }, room.code);
}

export async function recordCodeInterceptReplay(room: CodeInterceptRoom) {
  if (room.phase !== "game-result" || !room.winner || !shouldRecordGameReplay(room)) return false;
  const players = room.players.filter((player) => !player.isDummy);
  const winnerLabel = room.winner === "draw" ? "同時決着で引き分け" : `${room.winner === "red" ? "赤" : "青"}チームの勝利`;
  const resultLabels = Object.fromEntries(players.map((player) => {
    const team = room.teams.find((item) => item.id === player.teamId);
    const result = room.winner === "draw" ? "引き分け" : room.winner === player.teamId ? "勝利" : "敗北";
    return [player.id, `${result}・${team?.name ?? "チーム"}残り${team?.points ?? 0}点`];
  }));
  const base = makeReplayBase(
    `code-intercept:${room.code}:${room.createdAt}:${room.gameNumber}`,
    "code-intercept",
    room.updatedAt || Date.now(),
    room.gameNumber,
    `全${room.roundNumber}ラウンド`,
    players,
    resultLabels,
    [winnerLabel, `決着まで${room.roundNumber}ラウンド`, `初期${room.initialPoints}点・伝達失敗-${room.miscommunicationDamage}・傍受成功-${room.interceptionDamage}`],
  );
  const highlights = room.roundHistory.flatMap((round) => round.teams.map((team) => {
    const label = team.teamId === "red" ? "赤" : "青";
    const code = room.codeRevealMode === "all" ? `・暗号${team.secretCode.join("-")}` : "";
    return `第${round.roundNumber}ラウンド ${label}: ヒント「${team.clues.join(" / ")}」${code}・伝達${team.allyCorrect ? "成功" : "失敗"}・傍受${team.enemyIntercepted ? "された" : "回避"}・${team.pointsBefore}→${team.pointsAfter}点`;
  }));
  return storeReplay({ ...base, gameType: "code-intercept", overview: winnerLabel, highlights: cleanLines(highlights), scoreLabels: resultLabels }, room.code);
}

export async function recordDaifugoReplay(room: DaifugoRoom) {
  if (room.phase !== "result" || !room.game || !shouldRecordGameReplay(room)) return false;
  const players = room.players.filter((player) => !player.isDummy);
  const finishOrder = room.game.finishOrder.filter((id) => players.some((player) => player.id === id));
  if (finishOrder.length !== players.length) return false;
  const resultLabels = Object.fromEntries(players.map((player) => [player.id, `${finishOrder.indexOf(player.id) + 1}位`]));
  const winner = players.find((player) => player.id === finishOrder[0]);
  const base = makeReplayBase(
    `daifugo:${room.code}:${room.createdAt}:${room.gameNumber}`,
    "daifugo",
    room.updatedAt || Date.now(),
    room.gameNumber,
    `第${room.gameNumber}ゲーム`,
    players,
    resultLabels,
    ["1位が大富豪", `${players.length}人対戦`, `${room.game.turnNumber}手で決着`],
  );
  const highlights = [
    `順位: ${finishOrder.map((id, index) => `${index + 1}位 ${players.find((player) => player.id === id)?.name ?? "Unknown"}`).join("、")}`,
    ...players.map((player) => `${player.name}の残り手札: ${(room.game!.hands[player.id] ?? []).map((card) => playingCardLabel(card)).join("、") || "なし"}`),
  ];
  return storeReplay({ ...base, gameType: "daifugo", overview: `${winner?.name ?? "Unknown"}が1位`, highlights: cleanLines(highlights), scoreLabels: resultLabels }, room.code);
}

function readableKotobaHighlights(replay: StoredGenericReplay) {
  return replay.highlights.map((line) => {
    const round = line.match(/^ROUND\s+\d+「(.+?)」:\s*スキャン\s*(.*)$/);
    if (round) return `お題「${round[1]}」／探知された文字（順番）: ${round[2] || "なし"}`;
    const player = line.match(/^(.+?):\s*(.*?)・信号\d+点・生存\d+点$/);
    if (player) {
      const storedPlayer = replay.players.find((item) => item.name === player[1]);
      const result = storedPlayer ? replay.resultLabels[storedPlayer.id] || replay.scoreLabels[storedPlayer.id] : "参加";
      return `${player[1]} — 秘密語「${player[2]}」／${result.startsWith("勝利") ? "勝利" : "脱落"}`;
    }
    return line;
  });
}

function genericDetail(replay: StoredGenericReplay, playerId: string, favorite: boolean): GenericGameReplayDetail {
  return {
    ...replaySummary(replay, playerId, favorite),
    gameType: replay.gameType,
    overview: replay.overview,
    highlights: replay.gameType === "kotoba-senpuku" ? readableKotobaHighlights(replay) : replay.highlights,
    scores: replay.players.map((player) => ({ playerName: player.name, scoreLabel: replay.resultLabels[player.id] || replay.scoreLabels[player.id] || "プレイ完了", isViewer: player.id === playerId })),
  };
}

function tahoiyaDetail(replay: StoredTahoiyaReplay, playerId: string, favorite: boolean): TahoiyaReplayDetail {
  const playerNames = new Map(replay.players.map((player) => [player.id, player.name]));
  const votesByDefinition = new Map<string, string[]>();
  for (const [voterId, definitionId] of Object.entries(replay.votes)) {
    const voters = votesByDefinition.get(definitionId) ?? [];
    voters.push(playerNames.get(voterId) ?? "Unknown");
    votesByDefinition.set(definitionId, voters);
  }
  return {
    ...replaySummary(replay, playerId, favorite),
    gameType: "tahoiya",
    reading: replay.reading,
    realDefinition: replay.realDefinition,
    resultText: replay.resultText,
    definitions: replay.definitions.map((definition) => {
      const voterNames = votesByDefinition.get(definition.id) ?? [];
      return { id: definition.id, text: definition.text, isReal: definition.isReal, authorName: definition.authorId ? playerNames.get(definition.authorId) ?? "Unknown" : null, isMine: definition.authorId === playerId, voteCount: voterNames.length, voterNames };
    }),
    scores: replay.players.map((player) => ({ playerName: player.name, points: replay.scores[player.id] ?? 0, isViewer: player.id === playerId })).sort((left, right) => right.points - left.points),
    viewerVoteDefinitionId: replay.votes[playerId],
  };
}

async function loadPlayerFavoriteIds(playerId: string) {
  const ids = await redisCommand<string[]>(["SMEMBERS", playerFavoritesKey(playerId)]);
  return new Set(Array.isArray(ids) ? ids : []);
}

export async function listPlayerGameReplays(playerId: string, gameType: GameReplayGameType | "all" = "all", limit = 30): Promise<GameReplayListResponse> {
  const policy = resolveGameReplayPolicy();
  const [recentIds, favoriteIds] = await Promise.all([
    redisCommand<string[]>(["ZREVRANGE", playerIndexKey(playerId), "0", "199"]),
    loadPlayerFavoriteIds(playerId),
  ]);
  const ids = [...new Set([...favoriteIds, ...(Array.isArray(recentIds) ? recentIds : [])])];
  if (ids.length === 0) return { replays: [], policy, favoriteCount: favoriteIds.size };
  const raw = await redisCommand<Array<string | null>>(["MGET", ...ids.map(replayKey)]);
  const staleIds: string[] = [];
  const now = Date.now();
  const replays = ids.flatMap((id, index) => {
    const replay = parseStoredReplay(raw[index]);
    if (!replay || !isParticipant(replay, playerId)) { staleIds.push(id); return []; }
    const favorite = favoriteIds.has(id);
    if (!favorite && replay.expiresAt <= now) { staleIds.push(id); return []; }
    if (gameType !== "all" && replay.gameType !== gameType) return [];
    return [replaySummary(replay, playerId, favorite)];
  }).sort((left, right) => right.finishedAt - left.finishedAt).slice(0, Math.max(1, Math.min(100, limit)));
  if (staleIds.length > 0) {
    await redisPipeline([["ZREM", playerIndexKey(playerId), ...staleIds], ["SREM", playerFavoritesKey(playerId), ...staleIds]]).catch(() => undefined);
  }
  return { replays, policy, favoriteCount: favoriteIds.size - staleIds.filter((id) => favoriteIds.has(id)).length };
}

export async function getPlayerGameReplay(playerId: string, id: string): Promise<GameReplayDetail | null> {
  const [raw, favorite] = await Promise.all([
    redisCommand<string | null>(["GET", replayKey(id)]),
    redisCommand<number>(["SISMEMBER", playerFavoritesKey(playerId), id]),
  ]);
  const replay = parseStoredReplay(raw);
  if (!replay || !isParticipant(replay, playerId)) return null;
  const isFavorite = favorite === 1;
  if (!isFavorite && replay.expiresAt <= Date.now()) return null;
  return replay.gameType === "tahoiya" ? tahoiyaDetail(replay, playerId, isFavorite) : genericDetail(replay, playerId, isFavorite);
}

export async function setPlayerGameReplayFavorite(playerId: string, id: string, favorite: boolean) {
  const [raw, currentFavorite] = await Promise.all([
    redisCommand<string | null>(["GET", replayKey(id)]),
    redisCommand<number>(["SISMEMBER", playerFavoritesKey(playerId), id]),
  ]);
  const replay = parseStoredReplay(raw);
  if (!replay || !isParticipant(replay, playerId)) throw new Error("GAME_REPLAY_NOT_FOUND");
  if (replay.expiresAt <= Date.now() && currentFavorite !== 1) throw new Error("GAME_REPLAY_NOT_FOUND");
  const policy = resolveGameReplayPolicy();
  if (favorite) {
    const result = await redisCommand<number>([
      "EVAL",
      "if redis.call('EXISTS',KEYS[3])==0 then return -2 end; if redis.call('SISMEMBER',KEYS[1],ARGV[1])==1 then return 0 end; if redis.call('SCARD',KEYS[1])>=tonumber(ARGV[2]) then return -1 end; redis.call('SADD',KEYS[1],ARGV[1]); redis.call('SADD',KEYS[2],ARGV[3]); redis.call('PERSIST',KEYS[3]); return 1",
      "3", playerFavoritesKey(playerId), replayFavoritersKey(id), replayKey(id), id, String(policy.favoriteLimit), playerId,
    ]);
    if (result === -1) throw new Error("GAME_REPLAY_FAVORITE_LIMIT");
    if (result === -2) throw new Error("GAME_REPLAY_NOT_FOUND");
  } else {
    const remainingSeconds = Math.max(0, Math.ceil((replay.expiresAt - Date.now()) / 1000));
    await redisCommand<number>([
      "EVAL",
      "redis.call('SREM',KEYS[1],ARGV[1]); redis.call('SREM',KEYS[2],ARGV[2]); if redis.call('SCARD',KEYS[2])==0 then redis.call('DEL',KEYS[2]); if tonumber(ARGV[3])<=0 then redis.call('DEL',KEYS[3]) else redis.call('EXPIRE',KEYS[3],ARGV[3]) end end; return 1",
      "3", playerFavoritesKey(playerId), replayFavoritersKey(id), replayKey(id), id, playerId, String(remainingSeconds),
    ]);
  }
  return getPlayerGameReplay(playerId, id);
}
