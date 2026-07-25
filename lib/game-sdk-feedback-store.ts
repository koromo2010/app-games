import { createHash } from "node:crypto";
import type {
  GameSdkLlmRequest,
  GameSdkLlmResponse,
} from "@game-fields/game-sdk/llm";
import type {
  GameSdkPortableEffectRequest,
  GameSdkPortableEffectResult,
} from "@game-fields/game-sdk/portable-server";
import { normalizeGameGenerationMeta } from "./game-ai-types.ts";
import {
  resolveGameFieldsEnvironment,
  type GameFieldsEnvironment,
} from "./game-fields-environment.ts";
import { multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import { redisCommand } from "./redis-store.ts";

const maximumRoomArtifacts = 8;

export type GameSdkCapturedFeedbackArtifact = {
  artifactId: string;
  artifactText: string;
  game: string;
  task: string;
  generation: NonNullable<ReturnType<typeof normalizeGameGenerationMeta>>;
  createdAt: number;
};

export type GameSdkFeedbackCaptureInput = {
  runtimeId: string;
  packageRevision: string;
  roomCode: string;
  requestId: string;
  effect: GameSdkPortableEffectRequest;
  result: GameSdkPortableEffectResult;
};

export type GameSdkFeedbackCapture = {
  capture(input: GameSdkFeedbackCaptureInput): Promise<void>;
};

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function roomListKey(
  environment: GameFieldsEnvironment,
  runtimeId: string,
  roomCode: string,
) {
  return `game-sdk-feedback:v1:${environment}:room:${digest(`${runtimeId}\0${roomCode}`)}`;
}

function artifactKey(environment: GameFieldsEnvironment, artifactId: string) {
  return `game-sdk-feedback:v1:${environment}:item:${digest(artifactId)}`;
}

function capturedArtifact(
  input: GameSdkFeedbackCaptureInput,
  publicGameId: string,
): GameSdkCapturedFeedbackArtifact | null {
  if (
    input.effect.resource !== "llm"
    || input.effect.operation !== "generate"
    || !input.result.ok
    || !input.effect.request
    || typeof input.effect.request !== "object"
    || !input.result.value
    || typeof input.result.value !== "object"
  ) return null;
  const request = input.effect.request as Partial<GameSdkLlmRequest>;
  const response = input.result.value as Partial<GameSdkLlmResponse>;
  const task = typeof request.task === "string"
    ? request.task.trim().slice(0, 80)
    : "";
  const text = typeof response.text === "string"
    ? response.text.trim().slice(0, 1_200)
    : "";
  const generation = normalizeGameGenerationMeta(response.generation);
  if (!task || !text || !generation) return null;
  const artifactId = `sdk:${publicGameId}:${digest([
    input.runtimeId,
    input.packageRevision,
    input.roomCode,
    input.requestId,
    input.effect.id,
  ].join("\0")).slice(0, 40)}`;
  return {
    artifactId,
    artifactText: text,
    game: `sdk:${publicGameId}`.slice(0, 50),
    task,
    generation,
    createdAt: Date.now(),
  };
}

export function createRedisGameSdkFeedbackCapture(
  publicGameId: string,
  environmentInput?: GameFieldsEnvironment,
): GameSdkFeedbackCapture {
  const environment = resolveGameFieldsEnvironment(environmentInput);
  return {
    async capture(input) {
      const artifact = capturedArtifact(input, publicGameId);
      if (!artifact) return;
      const listKey = roomListKey(
        environment,
        input.runtimeId,
        input.roomCode,
      );
      await redisCommand<number>([
        "EVAL",
        "redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); redis.call('LREM',KEYS[2],0,ARGV[2]); redis.call('LPUSH',KEYS[2],ARGV[2]); redis.call('LTRIM',KEYS[2],0,ARGV[4]); redis.call('EXPIRE',KEYS[2],ARGV[3]); return 1",
        "2",
        artifactKey(environment, artifact.artifactId),
        listKey,
        JSON.stringify(artifact),
        artifact.artifactId,
        String(multiplayerRoomTtlSeconds),
        String(maximumRoomArtifacts - 1),
      ]);
    },
  };
}

function parseArtifact(value: unknown): GameSdkCapturedFeedbackArtifact | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<GameSdkCapturedFeedbackArtifact>;
    const generation = normalizeGameGenerationMeta(parsed.generation);
    if (
      typeof parsed.artifactId !== "string"
      || !parsed.artifactId
      || typeof parsed.artifactText !== "string"
      || !parsed.artifactText
      || typeof parsed.game !== "string"
      || !parsed.game
      || typeof parsed.task !== "string"
      || !parsed.task
      || !generation
    ) return null;
    return {
      artifactId: parsed.artifactId.slice(0, 200),
      artifactText: parsed.artifactText.slice(0, 1_200),
      game: parsed.game.slice(0, 50),
      task: parsed.task.slice(0, 80),
      generation,
      createdAt: typeof parsed.createdAt === "number"
        ? parsed.createdAt
        : Date.now(),
    };
  } catch {
    return null;
  }
}

export async function loadGameSdkFeedbackArtifacts(input: {
  runtimeId: string;
  roomCode: string;
  environment?: GameFieldsEnvironment;
}) {
  const environment = resolveGameFieldsEnvironment(input.environment);
  const ids = await redisCommand<string[]>([
    "LRANGE",
    roomListKey(environment, input.runtimeId, input.roomCode),
    "0",
    String(maximumRoomArtifacts - 1),
  ]);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const values = await redisCommand<Array<string | null>>([
    "MGET",
    ...ids.map((id) => artifactKey(environment, id)),
  ]);
  return values
    .map(parseArtifact)
    .filter((artifact): artifact is GameSdkCapturedFeedbackArtifact => (
      artifact !== null
    ));
}
