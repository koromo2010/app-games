import { normalizeTahoiyaRoom } from "@/lib/tahoiya-room-normalizer";
import {
  parseTahoiyaReplayForSalvage,
  tahoiyaDecoyEventsFromReplay,
  tahoiyaDecoyEventsFromRoom,
  type TahoiyaDecoyCandidateEventInput,
} from "@/lib/tahoiya-decoy-candidate-core";
import { recordTahoiyaDecoyCandidateEvent } from "@/lib/tahoiya-decoy-candidate-store";
import { redisCommand } from "@/lib/redis-store";

const scanCount = 100;
type SalvagePhase = "replay" | "room";

export type TahoiyaDecoySalvageCursor = `${SalvagePhase}:${string}`;

export type TahoiyaDecoySalvageBatchResult = {
  nextCursor: TahoiyaDecoySalvageCursor;
  done: boolean;
  scannedKeys: number;
  tahoiyaRounds: number;
  candidatesFound: number;
  importedEvents: number;
};

function parseCursor(value: string): { phase: SalvagePhase; redisCursor: string } | null {
  const match = /^(replay|room):(\d+)$/.exec(value);
  return match ? { phase: match[1] as SalvagePhase, redisCursor: match[2] } : null;
}

function scanPattern(phase: SalvagePhase) {
  return phase === "replay" ? "game-replay:v1:*" : "tahoiya:room:*";
}

function parseRoomEvents(raw: unknown) {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const room = normalizeTahoiyaRoom(JSON.parse(raw));
    return room ? tahoiyaDecoyEventsFromRoom(room) : [];
  } catch {
    return [];
  }
}

async function storeEvents(events: TahoiyaDecoyCandidateEventInput[]) {
  let imported = 0;
  for (const event of events) {
    if (await recordTahoiyaDecoyCandidateEvent(event)) imported += 1;
  }
  return imported;
}

export async function salvageTahoiyaDecoyCandidateBatch(cursor: string): Promise<TahoiyaDecoySalvageBatchResult> {
  const parsedCursor = parseCursor(cursor);
  if (!parsedCursor) throw new Error("TAHOIYA_DECOY_SALVAGE_CURSOR_INVALID");
  const scan = await redisCommand<[string | number, string[]]>([
    "SCAN", parsedCursor.redisCursor, "MATCH", scanPattern(parsedCursor.phase), "COUNT", String(scanCount),
  ]);
  const redisCursor = String(scan?.[0] ?? "0");
  const keys = Array.isArray(scan?.[1]) ? scan[1] : [];
  const raws = keys.length > 0
    ? await redisCommand<Array<string | null>>(["MGET", ...keys])
    : [];

  let tahoiyaRounds = 0;
  let candidatesFound = 0;
  let importedEvents = 0;
  for (const raw of raws) {
    let events: TahoiyaDecoyCandidateEventInput[] = [];
    if (parsedCursor.phase === "replay") {
      const replay = parseTahoiyaReplayForSalvage(raw);
      if (!replay) continue;
      events = tahoiyaDecoyEventsFromReplay(replay);
    } else {
      events = parseRoomEvents(raw);
      if (events.length === 0) continue;
    }
    tahoiyaRounds += 1;
    candidatesFound += events.length;
    importedEvents += await storeEvents(events);
  }

  if (redisCursor !== "0") {
    return {
      nextCursor: `${parsedCursor.phase}:${redisCursor}`,
      done: false,
      scannedKeys: keys.length,
      tahoiyaRounds,
      candidatesFound,
      importedEvents,
    };
  }
  if (parsedCursor.phase === "replay") {
    return {
      nextCursor: "room:0",
      done: false,
      scannedKeys: keys.length,
      tahoiyaRounds,
      candidatesFound,
      importedEvents,
    };
  }
  return {
    nextCursor: "room:0",
    done: true,
    scannedKeys: keys.length,
    tahoiyaRounds,
    candidatesFound,
    importedEvents,
  };
}
