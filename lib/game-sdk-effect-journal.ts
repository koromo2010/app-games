import { createHash, randomUUID } from "node:crypto";
import type {
  GameSdkPortableEffectRequest,
  GameSdkPortableEffectResult,
} from "@game-fields/game-sdk/portable-server";
import { multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import { redisCommand } from "./redis-store.ts";
import {
  resolveGameFieldsEnvironment,
  type GameFieldsEnvironment,
} from "./game-fields-environment.ts";
import {
  emitObservabilityEvent,
  observabilityRef,
} from "./observability/index.ts";

const maximumEffectRecordBytes = 1024 * 1024;

type EffectJournalRecord =
  | {
      status: "pending";
      fingerprint: string;
      claimToken: string;
      createdAt: number;
    }
  | {
      status: "completed";
      fingerprint: string;
      result: GameSdkPortableEffectResult;
      createdAt: number;
      completedAt: number;
    };

export type GameSdkEffectJournalInput = {
  runtimeId: string;
  packageRevision: string;
  roomCode: string;
  requestId: string;
  effect: GameSdkPortableEffectRequest;
};

export type GameSdkEffectJournal = {
  execute(
    input: GameSdkEffectJournalInput,
    operation: () => Promise<GameSdkPortableEffectResult>,
  ): Promise<GameSdkPortableEffectResult>;
};

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function journalKey(
  input: GameSdkEffectJournalInput,
  environment: GameFieldsEnvironment,
) {
  return `game-sdk-effect:v2:${environment}:${digest({
    runtimeId: input.runtimeId,
    packageRevision: input.packageRevision,
    roomCode: input.roomCode,
    requestId: input.requestId,
    effectId: input.effect.id,
  })}`;
}

function parseRecord(raw: string): EffectJournalRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("GAME_SDK_EFFECT_JOURNAL_INVALID");
  }
  if (!value || typeof value !== "object") {
    throw new Error("GAME_SDK_EFFECT_JOURNAL_INVALID");
  }
  const record = value as Partial<EffectJournalRecord>;
  if (
    (record.status !== "pending" && record.status !== "completed")
    || typeof record.fingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(record.fingerprint)
    || typeof record.createdAt !== "number"
  ) {
    throw new Error("GAME_SDK_EFFECT_JOURNAL_INVALID");
  }
  if (
    record.status === "pending"
    && (
      typeof record.claimToken !== "string"
      || !record.claimToken
    )
  ) {
    throw new Error("GAME_SDK_EFFECT_JOURNAL_INVALID");
  }
  if (
    record.status === "completed"
    && (
      !record.result
      || typeof record.result !== "object"
      || typeof record.result.ok !== "boolean"
      || typeof record.completedAt !== "number"
    )
  ) {
    throw new Error("GAME_SDK_EFFECT_JOURNAL_INVALID");
  }
  return record as EffectJournalRecord;
}

function waitForConcurrentEffect() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

export function createRedisGameSdkEffectJournal(
  environmentInput?: GameFieldsEnvironment,
): GameSdkEffectJournal {
  const environment = resolveGameFieldsEnvironment(environmentInput);
  return {
    async execute(input, operation) {
      const key = journalKey(input, environment);
      const fingerprint = digest(input.effect);
      const claimToken = randomUUID();
      const pending: EffectJournalRecord = {
        status: "pending",
        fingerprint,
        claimToken,
        createdAt: Date.now(),
      };
      const pendingJson = JSON.stringify(pending);
      const claimed = await redisCommand<"OK" | null>([
        "SET",
        key,
        pendingJson,
        "NX",
        "EX",
        String(multiplayerRoomTtlSeconds),
      ]);
      if (claimed !== "OK") {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const raw = await redisCommand<string | null>(["GET", key]);
          if (!raw) throw new Error("GAME_SDK_EFFECT_JOURNAL_MISSING");
          const current = parseRecord(raw);
          if (current.fingerprint !== fingerprint) {
            throw new Error("GAME_SDK_EFFECT_ID_CONFLICT");
          }
          if (current.status === "completed") {
            emitObservabilityEvent("info", "game-sdk.effect", {
              game: `sdk:${input.runtimeId}`,
              operation: input.effect.operation,
              packageRevision: input.packageRevision,
              roomRef: observabilityRef("room", input.roomCode),
              commandRef: observabilityRef("command", input.requestId),
              effectRef: observabilityRef("effect", input.effect.id),
              applied: false,
              outcome: "ignored",
            });
            return structuredClone(current.result);
          }
          if (attempt < 3) await waitForConcurrentEffect();
        }
        throw new Error("GAME_SDK_EFFECT_INDETERMINATE");
      }

      emitObservabilityEvent("info", "game-sdk.effect", {
        game: `sdk:${input.runtimeId}`,
        operation: input.effect.operation,
        packageRevision: input.packageRevision,
        roomRef: observabilityRef("room", input.roomCode),
        commandRef: observabilityRef("command", input.requestId),
        effectRef: observabilityRef("effect", input.effect.id),
        outcome: "started",
      });
      const result = await operation();
      const completed: EffectJournalRecord = {
        status: "completed",
        fingerprint,
        result: structuredClone(result),
        createdAt: pending.createdAt,
        completedAt: Date.now(),
      };
      const completedJson = JSON.stringify(completed);
      if (Buffer.byteLength(completedJson, "utf8") > maximumEffectRecordBytes) {
        throw new Error("GAME_SDK_EFFECT_RESULT_TOO_LARGE");
      }
      const saved = await redisCommand<number>([
        "EVAL",
        "local current=redis.call('GET',KEYS[1]); if not current then return -1 end; local decoded=cjson.decode(current); if decoded.status~='pending' or decoded.claimToken~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
        "1",
        key,
        claimToken,
        completedJson,
        String(multiplayerRoomTtlSeconds),
      ]);
      if (saved !== 1) throw new Error("GAME_SDK_EFFECT_INDETERMINATE");
      emitObservabilityEvent(
        result.ok ? "info" : "warn",
        "game-sdk.effect",
        {
          game: `sdk:${input.runtimeId}`,
          operation: input.effect.operation,
          packageRevision: input.packageRevision,
          roomRef: observabilityRef("room", input.roomCode),
          commandRef: observabilityRef("command", input.requestId),
          effectRef: observabilityRef("effect", input.effect.id),
          applied: true,
          outcome: result.ok ? "success" : "failed",
          ...(!result.ok ? { errorCode: result.error } : {}),
        },
      );
      return structuredClone(result);
    },
  };
}
