import type { OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";

export type OnlineRoomSpectatorAccess = {
  enabled: boolean;
  canManage: boolean;
  requiresPassphrase: boolean;
};

export type OnlineRoomSpectatorPlayer = {
  seatId: string;
  label: string;
  isHost: boolean;
  status?: string;
  metric?: string;
};

export type OnlineRoomSpectatorSnapshot = {
  game: OnlineRoomRealtimeGame;
  gameTitle: string;
  code: string;
  phase: string;
  phaseLabel: string;
  revision: number;
  updatedAt: number;
  players: OnlineRoomSpectatorPlayer[];
  facts: Array<{ label: string; value: string }>;
};

type CommonPlayer = { id: string; isDummy?: boolean; teamId?: string };
type CommonRoom = {
  code: string;
  hostId: string;
  phase: string;
  players: CommonPlayer[];
  revision: number;
  updatedAt: number;
  [key: string]: unknown;
};

const gameTitles: Record<OnlineRoomRealtimeGame, string> = {
  wordwolf: "ワードウルフ",
  tahoiya: "たほい屋",
  hodoai: "ワードスケール",
  "kotoba-senpuku": "ワードソナー",
  nigoichi: "ワードアウト",
  "northern-branch": "ノーザンブランチ",
  "code-intercept": "コードインターセプト",
  daifugo: "大富豪",
};

const phaseLabels: Record<string, string> = {
  lobby: "ロビー",
  clue: "ヒント入力",
  vote: "投票",
  wolfGuess: "逆転回答",
  writing: "偽説明入力",
  voting: "投票",
  arrange: "並べ替え",
  secret: "秘密語入力",
  battle: "対戦中",
  guess: "予想",
  playing: "対戦中",
  finished: "終了",
  "code-length": "暗号桁数選択",
  answer: "回答",
  "round-result": "ラウンド結果",
  "game-result": "最終結果",
  result: "結果",
};

function numberRecord(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, number>;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function objectRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function safeInteger(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

/**
 * Builds a deliberately small broadcast view. It never spreads the stored room,
 * so newly-added secret fields cannot silently enter spectator responses.
 */
export function presentOnlineRoomForSpectator(game: OnlineRoomRealtimeGame, room: CommonRoom): OnlineRoomSpectatorSnapshot {
  const aliases = new Map(room.players.map((player, index) => [player.id, `P${index + 1}`]));
  const totalScores = numberRecord(room.totalScores);
  const gameState = objectRecord(room.game);
  const gamePlayers = array(gameState.players).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
  const gamePlayerById = new Map(gamePlayers.flatMap((player) => typeof player.id === "string" ? [[player.id, player] as const] : []));
  const hands = objectRecord(gameState.hands);
  const finishOrder = array(gameState.finishOrder).filter((id): id is string => typeof id === "string");
  const exposedIds = new Set(array(room.exposedIds).filter((id): id is string => typeof id === "string"));

  const players = room.players.map((player, index): OnlineRoomSpectatorPlayer => {
    let status: string | undefined;
    let metric: string | undefined;
    if (game === "daifugo") {
      const rank = finishOrder.indexOf(player.id);
      status = rank >= 0 ? `${rank + 1}位で上がり` : gameState.currentPlayerId === player.id ? "手番" : undefined;
      metric = `${array(hands[player.id]).length}枚`;
    } else if (game === "northern-branch") {
      const state = gamePlayerById.get(player.id);
      if (state) {
        metric = `${safeInteger(state.points)}点・手札${safeInteger(state.handCount, array(state.hand).length)}枚`;
        status = gamePlayers[safeInteger(gameState.activePlayerIndex)]?.id === player.id ? "手番" : undefined;
      }
    } else if (game === "kotoba-senpuku") {
      metric = `${totalScores[player.id] ?? 0}点`;
      status = exposedIds.has(player.id) ? "脱落" : undefined;
    } else if (game === "nigoichi" || game === "tahoiya") {
      metric = `${totalScores[player.id] ?? 0}点`;
    } else if (game === "code-intercept") {
      status = player.teamId === "red" ? "赤チーム" : player.teamId === "blue" ? "青チーム" : undefined;
    }
    return {
      seatId: aliases.get(player.id) ?? `P${index + 1}`,
      label: player.isDummy ? `ダミー${index + 1}` : `PLAYER ${index + 1}`,
      isHost: player.id === room.hostId,
      status,
      metric,
    };
  });

  const facts: Array<{ label: string; value: string }> = [];
  const addNumber = (label: string, value: unknown, suffix = "") => {
    if (typeof value === "number" && Number.isFinite(value)) facts.push({ label, value: `${value}${suffix}` });
  };
  if (game === "wordwolf") {
    addNumber("ラウンド", room.currentRound);
    facts.push({ label: "ヒント提出", value: `${array(room.clues).length}件` });
    facts.push({ label: "投票済み", value: `${Object.keys(objectRecord(room.votes)).length}人` });
  } else if (game === "tahoiya") {
    addNumber("ラウンド", room.round);
    facts.push({ label: "偽説明提出", value: `${Object.keys(objectRecord(room.fakeDefinitions)).length}人` });
    facts.push({ label: "投票済み", value: `${Object.keys(objectRecord(room.votes)).length}人` });
    if (room.phase === "result" && typeof room.word === "string") facts.push({ label: "今回のお題", value: room.word.slice(0, 80) });
  } else if (game === "hodoai") {
    addNumber("ラウンド", room.round);
    addNumber("合計得点", room.totalPoints, "点");
    const theme = objectRecord(room.theme);
    if (typeof theme.title === "string") facts.push({ label: "お題", value: theme.title.slice(0, 80) });
  } else if (game === "kotoba-senpuku") {
    addNumber("ラウンド", room.round);
    addNumber("手番", room.turnNumber);
    const calledKana = array(room.calledKana).filter((value): value is string => typeof value === "string");
    if (calledKana.length) facts.push({ label: "探知済み", value: calledKana.join("・").slice(0, 120) });
  } else if (game === "nigoichi") {
    addNumber("ゲーム", room.gameNumber);
    facts.push({ label: "連想語提出", value: `${Object.keys(objectRecord(room.associations)).length}人` });
    facts.push({ label: "予想済み", value: `${Object.keys(objectRecord(room.guesses)).length}人` });
  } else if (game === "northern-branch") {
    addNumber("ターン", gameState.turn);
    facts.push({ label: "市場", value: `${array(gameState.offers).length}件` });
  } else if (game === "code-intercept") {
    addNumber("ラウンド", room.roundNumber);
    const teams = array(room.teams).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
    for (const team of teams) {
      if ((team.id === "red" || team.id === "blue") && typeof team.points === "number") facts.push({ label: team.id === "red" ? "赤チーム" : "青チーム", value: `${team.points}点` });
    }
  } else if (game === "daifugo") {
    addNumber("手番数", gameState.turnNumber);
    const table = objectRecord(gameState.table);
    facts.push({ label: "場", value: typeof table.label === "string" ? table.label : "流れています" });
  }

  return {
    game,
    gameTitle: gameTitles[game],
    code: room.code,
    phase: room.phase,
    phaseLabel: phaseLabels[room.phase] ?? room.phase,
    revision: room.revision,
    updatedAt: room.updatedAt,
    players,
    facts,
  };
}
