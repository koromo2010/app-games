export const reducedPlayerTimeLimitSeconds = 5;
export const consecutiveTimeoutLimit = 2;

export type PlayerTimeoutStatus = {
  consecutiveTimeouts: number;
  reducedTime: boolean;
};

export type PlayerTimeoutStatuses = Record<string, PlayerTimeoutStatus>;

export type PlayerTimeoutNotice = {
  id: string;
  playerId: string;
  kind: "reduced" | "recovered";
  message: string;
  createdAt: number;
};

export type PlayerTimeoutFields = {
  playerTimeouts: PlayerTimeoutStatuses;
  playerTimeoutNotice: PlayerTimeoutNotice | null;
};

function normalizedStatus(value: unknown): PlayerTimeoutStatus {
  const parsed = value && typeof value === "object" ? value as Partial<PlayerTimeoutStatus> : {};
  const consecutiveTimeouts = Number.isFinite(parsed.consecutiveTimeouts)
    ? Math.max(0, Math.min(consecutiveTimeoutLimit, Math.floor(parsed.consecutiveTimeouts!)))
    : 0;
  return { consecutiveTimeouts, reducedTime: parsed.reducedTime === true || consecutiveTimeouts >= consecutiveTimeoutLimit };
}

export function normalizePlayerTimeoutFields(value: unknown, playerIds: string[]): PlayerTimeoutFields {
  const parsed = value && typeof value === "object" ? value as Partial<PlayerTimeoutFields> : {};
  const source = parsed.playerTimeouts && typeof parsed.playerTimeouts === "object" ? parsed.playerTimeouts : {};
  const playerTimeouts = Object.fromEntries(playerIds.map((id) => [id, normalizedStatus(source[id])]));
  const notice = parsed.playerTimeoutNotice;
  const playerTimeoutNotice = notice && typeof notice === "object"
    && typeof notice.id === "string"
    && playerIds.includes(String(notice.playerId))
    && (notice.kind === "reduced" || notice.kind === "recovered")
    && typeof notice.message === "string"
    && typeof notice.createdAt === "number"
    ? { id: notice.id.slice(0, 120), playerId: String(notice.playerId), kind: notice.kind, message: notice.message.slice(0, 160), createdAt: notice.createdAt }
    : null;
  return { playerTimeouts, playerTimeoutNotice };
}

export function playerTimeLimitSeconds(baseSeconds: number, statuses: PlayerTimeoutStatuses, playerId: string) {
  return statuses[playerId]?.reducedTime ? reducedPlayerTimeLimitSeconds : baseSeconds;
}

export function recordPlayerActivity<T extends PlayerTimeoutFields>(fields: T, playerId: string): T {
  const current = fields.playerTimeouts[playerId] ?? { consecutiveTimeouts: 0, reducedTime: false };
  if (current.reducedTime || current.consecutiveTimeouts === 0) return fields;
  return { ...fields, playerTimeouts: { ...fields.playerTimeouts, [playerId]: { consecutiveTimeouts: 0, reducedTime: false } } } as T;
}

export function recordPlayerTimeout<T extends PlayerTimeoutFields>(fields: T, playerId: string, playerName: string, now = Date.now()): T {
  const current = fields.playerTimeouts[playerId] ?? { consecutiveTimeouts: 0, reducedTime: false };
  if (current.reducedTime) return fields;
  const consecutiveTimeouts = Math.min(consecutiveTimeoutLimit, current.consecutiveTimeouts + 1);
  const reducedTime = consecutiveTimeouts >= consecutiveTimeoutLimit;
  return {
    ...fields,
    playerTimeouts: { ...fields.playerTimeouts, [playerId]: { consecutiveTimeouts, reducedTime } },
    playerTimeoutNotice: reducedTime ? {
      id: `${playerId}:reduced:${now}`,
      playerId,
      kind: "reduced",
      message: `${playerName}さんが2回連続で時間切れになりました。復帰するまで本人の持ち時間を5秒に短縮します。`,
      createdAt: now,
    } : fields.playerTimeoutNotice,
  } as T;
}

export function recoverPlayerTimeout<T extends PlayerTimeoutFields>(fields: T, playerId: string, playerName: string, now = Date.now()): T | null {
  if (!fields.playerTimeouts[playerId]?.reducedTime) return null;
  return {
    ...fields,
    playerTimeouts: { ...fields.playerTimeouts, [playerId]: { consecutiveTimeouts: 0, reducedTime: false } },
    playerTimeoutNotice: {
      id: `${playerId}:recovered:${now}`,
      playerId,
      kind: "recovered",
      message: `${playerName}さんが復帰しました。通常の持ち時間に戻します。`,
      createdAt: now,
    },
  } as T;
}
