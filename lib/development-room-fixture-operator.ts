import { createHash } from "node:crypto";
import type { AppLocale } from "./app-locale.ts";
import {
  developmentRoomFixtureActorDigest,
  developmentRoomFixtureCandidateRounds,
  developmentRoomFixtureFilteredRoomsPerSurface,
  developmentRoomFixtureNamespace,
  developmentRoomFixturePublicIdentity,
  developmentRoomFixtureReceiptTtlSeconds,
  developmentRoomFixtureRoomTtlSeconds,
  developmentRoomFixtureScenario,
  developmentRoomFixtureTargetMaximum,
  type DevelopmentRoomFixturePublicReceipt,
  normalizeDevelopmentRoomFixtureOperationId,
} from "./development-room-fixture-contract.ts";
import {
  type DevelopmentRoomFixtureAppendInput,
  type DevelopmentRoomFixtureBaseline,
  type DevelopmentRoomFixtureKind,
  type DevelopmentRoomFixtureOperation,
  type DevelopmentRoomFixtureStorage,
  type DevelopmentRoomFixtureSurface,
  type DevelopmentRoomFixtureTarget,
  type DevelopmentRoomFixtureVerification,
  RedisDevelopmentRoomFixtureStorage,
} from "./development-room-fixture-storage.ts";
import { normalizeHodoaiRoom } from "./hodoai-room-normalizer.ts";
import { multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import { onlineRoomPlayerLimits } from "./online-room-policy.ts";
import { normalizeRoomInstanceId } from "./room-invite-target.ts";

const builtInSurface = "built-in:hodoai" as const;
const sdkSurface = "sdk-preview:link-lines" as const;
const builtInIndexKey = "hodoai:rooms";
const builtInRoomKey = (code: string) => `hodoai:room:${code}`;
const maximumVerificationScanPages = 32;
const hodoaiTechnicalPlayerLimit = onlineRoomPlayerLimits.hodoai;

export type DevelopmentSdkRoomFixtureTemplate = {
  runtimeId: string;
  runtimeContract: {
    packageRevision: string;
    packageRootSha256: string;
    runtimeVersion: string;
    sdkContractVersion: number;
    roomSchemaVersion: number;
    resourceProtocolVersion: number;
    clientBridgeVersion: number;
  };
  maximumPlayers: number;
  hostPlayerId: string;
  room: Record<string, unknown> & {
    code: string;
    revision: number;
    phase: string;
  };
};

export type DevelopmentRoomFixtureOperatorOptions = {
  storage?: DevelopmentRoomFixtureStorage;
  now?: () => number;
  loadSdkTemplate: (input: {
    creatorSlug: string;
    operationId: string;
    request: Request;
  }) => Promise<DevelopmentSdkRoomFixtureTemplate>;
};

type MaterializeInput = {
  creatorSlug: string;
  playerId: string;
  operationId: string;
  request: Request;
};

type OperationIdentity = Omit<MaterializeInput, "request">;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeErrorCode(error: unknown) {
  const value = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{2,99}$/.test(value)
    ? value
    : "DEVELOPMENT_ROOM_FIXTURE_FAILED";
}

function operationKey(creatorSlug: string, operationId: string) {
  return `development-room-fixture:v1:${creatorSlug}:${developmentRoomFixtureNamespace}:${operationId}`;
}

function roomCode(seed: string) {
  const value = Number.parseInt(sha256(seed).slice(0, 8), 16) % (36 ** 4);
  return value.toString(36).toUpperCase().padStart(4, "0");
}

function roomIdentity(seed: string) {
  return `t185-${sha256(seed).slice(0, 48)}`;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fullPlayers(
  seedPlayer: Record<string, unknown>,
  count: number,
  identity: string,
) {
  return Array.from({ length: count }, (_, index) => ({
    ...deepClone(seedPlayer),
    id: index === 0 && typeof seedPlayer.id === "string"
      ? seedPlayer.id
      : `t185-${identity.slice(-20)}-${index}`,
    name: `T-185 fixture ${index + 1}`,
    displayName: `T-185 fixture ${index + 1}`,
    seat: index,
  }));
}

function builtInLocale(kind: DevelopmentRoomFixtureKind, ordinal: number): AppLocale {
  if (kind === "joinable-en") return "en";
  if (kind === "joinable-ja") return "ja";
  return ordinal % 2 === 0 ? "ja" : "en";
}

function builtInRoomRaw(
  target: DevelopmentRoomFixtureTarget,
  now: number,
  ordinal: number,
) {
  const full = target.kind === "full" || target.kind === "locale-mismatch";
  const started = target.kind === "started";
  const expired = target.kind === "expired";
  const locale = builtInLocale(target.kind, ordinal);
  const hostId = `t185-${target.publicIdentity.slice(0, 32)}`;
  const firstPlayer = {
    id: hostId,
    name: "T-185 fixture",
    joinedAt: now,
    avatarColor: "#22d3ee",
  };
  const room = {
    code: target.code,
    roomInstanceId: target.roomIdentity,
    contentLocale: locale,
    revision: 1,
    hostId,
    sorterId: hostId,
    passphrase: "",
    phase: started ? "clue" : "lobby",
    players: full
      ? fullPlayers(firstPlayer, hodoaiTechnicalPlayerLimit, target.roomIdentity)
      : [firstPlayer],
    gameNumber: 1,
    gameStartedAt: started ? now : null,
    roundsTotal: 3,
    cardsPerPlayer: 1,
    clueTimeLimitSeconds: 0,
    arrangeTimeLimitSeconds: 0,
    debugMode: false,
    debugReplayEnabled: false,
    round: 1,
    theme: null,
    cards: [],
    values: {},
    clues: {},
    clueHistory: [],
    order: [],
    totalPoints: 0,
    scorePerfect: 3,
    scoreOne: 2,
    scoreFew: 1,
    scoreFewMax: 3,
    history: [],
    debugLog: [],
    phaseStartedAt: started ? now : null,
    createdAt: now,
    updatedAt: expired
      ? now - (multiplayerRoomTtlSeconds * 1_000) - 60_000
      : now,
  };
  if (!normalizeHodoaiRoom(room) || !normalizeRoomInstanceId(room.roomInstanceId)) {
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_BUILT_IN_ROOM_INVALID");
  }
  return JSON.stringify(room);
}

function sdkRoomRaw(
  target: DevelopmentRoomFixtureTarget,
  now: number,
  template: DevelopmentSdkRoomFixtureTemplate,
) {
  const room = deepClone(template.room) as Record<string, unknown> & {
    code: string;
    revision: number;
    phase: string;
    players?: Array<Record<string, unknown>>;
  };
  room.code = target.code;
  room.phase = target.kind === "started" ? "playing" : "lobby";
  if (target.kind === "full") {
    const seed = Array.isArray(room.players) && room.players[0]
      ? room.players[0]
      : { id: template.hostPlayerId, name: "T-185 fixture", seat: 0 };
    room.players = fullPlayers(
      seed,
      template.maximumPlayers,
      target.roomIdentity,
    );
  }
  const expired = target.kind === "expired";
  const runtimeContract = target.kind === "package-mismatch"
    ? { ...template.runtimeContract, packageRevision: "0".repeat(40) }
    : template.runtimeContract;
  return JSON.stringify({
    schemaVersion: 2,
    gameId: template.runtimeId,
    code: target.code,
    revision: room.revision,
    phase: room.phase,
    hostPlayerId: template.hostPlayerId,
    creationRequestId: target.roomIdentity,
    createdAt: now,
    updatedAt: expired
      ? now - (multiplayerRoomTtlSeconds * 1_000) - 60_000
      : now,
    runtimeContract,
    settingsSnapshot: "settings" in room ? room.settings : {},
    commandReceipts: [],
    resultOutbox: [],
    room,
  });
}

function targetKind(surface: DevelopmentRoomFixtureSurface, ordinal: number) {
  const kinds: DevelopmentRoomFixtureKind[] = surface === builtInSurface
    ? ["expired", "started", "full", "locale-mismatch"]
    : ["expired", "started", "full", "package-mismatch"];
  return kinds[ordinal % kinds.length]!;
}

function builtInRoomVisible(raw: string | null, locale: AppLocale, now: number) {
  if (!raw) return false;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }
  const room = normalizeHodoaiRoom(parsed);
  return Boolean(
    room
    && now - room.updatedAt <= multiplayerRoomTtlSeconds * 1_000
    && room.phase === "lobby"
    && room.players.length < hodoaiTechnicalPlayerLimit
    && (room.players.length + 1) * room.cardsPerPlayer <= 121
    && room.contentLocale === locale,
  );
}

function sdkRoomVisible(
  raw: string | null,
  template: DevelopmentSdkRoomFixtureTemplate,
  now: number,
) {
  if (!raw) return false;
  try {
    const record = JSON.parse(raw) as {
      phase?: unknown;
      updatedAt?: unknown;
      runtimeContract?: { packageRevision?: unknown };
      room?: { players?: unknown[] };
    };
    return typeof record.updatedAt === "number"
      && now - record.updatedAt <= multiplayerRoomTtlSeconds * 1_000
      && record.phase === "lobby"
      && record.runtimeContract?.packageRevision
        === template.runtimeContract.packageRevision
      && Array.isArray(record.room?.players)
      && record.room.players.length < template.maximumPlayers;
  } catch {
    return false;
  }
}

function publicReceipt(
  operation: DevelopmentRoomFixtureOperation,
  idempotentReplay: boolean,
): DevelopmentRoomFixturePublicReceipt {
  const builtInTargets = operation.targets.filter((target) => target.surface === builtInSurface);
  const sdkTargets = operation.targets.filter((target) => target.surface === sdkSurface);
  const cleanupTargets = operation.targets.filter((target) => target.cleaned).length;
  return {
    schemaVersion: 1,
    namespace: developmentRoomFixtureNamespace,
    operationId: operation.operationId,
    scenario: developmentRoomFixtureScenario,
    state: operation.state,
    idempotentReplay,
    createdAt: operation.createdAt,
    expiresAt: operation.expiresAt,
    counts: {
      builtInTargets: builtInTargets.length,
      sdkTargets: sdkTargets.length,
      cleanupTargets,
      remainingTargets: operation.targets.length - cleanupTargets,
    },
    targetIdentities: operation.targets.map((target) => target.publicIdentity).sort(),
    ...(operation.verification ? { verification: operation.verification } : {}),
    ...(operation.errorCode ? { errorCode: operation.errorCode } : {}),
  };
}

export class DevelopmentRoomFixtureOperator {
  private readonly storage: DevelopmentRoomFixtureStorage;
  private readonly now: () => number;
  private readonly loadSdkTemplate: DevelopmentRoomFixtureOperatorOptions["loadSdkTemplate"];

  constructor(options: DevelopmentRoomFixtureOperatorOptions) {
    this.storage = options.storage ?? new RedisDevelopmentRoomFixtureStorage();
    this.now = options.now ?? Date.now;
    this.loadSdkTemplate = options.loadSdkTemplate;
  }

  private assertOwner(operation: DevelopmentRoomFixtureOperation, playerId: string) {
    if (operation.actorDigest !== developmentRoomFixtureActorDigest(playerId)) {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_FORBIDDEN");
    }
  }

  private makeTarget(
    surface: DevelopmentRoomFixtureSurface,
    kind: DevelopmentRoomFixtureKind,
    operationId: string,
    ordinal: number,
    usedCodes: Set<string>,
  ) {
    for (let salt = 0; salt < 32; salt += 1) {
      const seed = `${operationId}:${surface}:${kind}:${ordinal}:${salt}`;
      const code = roomCode(seed);
      if (usedCodes.has(code)) continue;
      const identity = roomIdentity(seed);
      usedCodes.add(code);
      return {
        surface,
        code,
        roomIdentity: identity,
        publicIdentity: developmentRoomFixturePublicIdentity({
          surface,
          roomIdentity: identity,
        }),
        kind,
        cleaned: false,
      } satisfies DevelopmentRoomFixtureTarget;
    }
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_CODE_SPACE_EXHAUSTED");
  }

  private appendInput(
    operation: DevelopmentRoomFixtureOperation,
    target: DevelopmentRoomFixtureTarget,
    ordinal: number,
    template: DevelopmentSdkRoomFixtureTemplate,
  ): DevelopmentRoomFixtureAppendInput {
    const surface = operation.surfaces[target.surface];
    return {
      target,
      indexKey: surface.indexKey,
      roomKey: `${surface.roomKeyPrefix}${target.code}`,
      raw: target.surface === builtInSurface
        ? builtInRoomRaw(target, this.now(), ordinal)
        : sdkRoomRaw(target, this.now(), template),
      roomTtlSeconds: developmentRoomFixtureRoomTtlSeconds,
    };
  }

  private async appendTargets(
    key: string,
    operation: DevelopmentRoomFixtureOperation,
    surface: DevelopmentRoomFixtureSurface,
    kinds: DevelopmentRoomFixtureKind[],
    ordinalBase: number,
    usedCodes: Set<string>,
    template: DevelopmentSdkRoomFixtureTemplate,
  ) {
    const targets = kinds.map((kind, index) => this.makeTarget(
      surface,
      kind,
      operation.operationId,
      ordinalBase + index,
      usedCodes,
    ));
    const inputs = targets.map((target, index) => this.appendInput(
      operation,
      target,
      ordinalBase + index,
      template,
    ));
    const results = await this.storage.append(key, inputs);
    for (let index = 0; index < results.length; index += 1) {
      if (results[index] === "created") {
        operation.targets.push(targets[index]!);
        continue;
      }
      let replacementOrdinal = ordinalBase + kinds.length + index;
      for (let attempt = 0; attempt < 32; attempt += 1) {
        const replacement = this.makeTarget(
          surface,
          kinds[index]!,
          operation.operationId,
          replacementOrdinal,
          usedCodes,
        );
        replacementOrdinal += kinds.length;
        const [saved] = await this.storage.append(key, [this.appendInput(
          operation,
          replacement,
          replacementOrdinal,
          template,
        )]);
        if (saved === "created") {
          operation.targets.push(replacement);
          break;
        }
        if (attempt === 31) {
          throw new Error("DEVELOPMENT_ROOM_FIXTURE_CODE_COLLISION_LIMIT");
        }
      }
    }
    if (operation.targets.length > developmentRoomFixtureTargetMaximum) {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_TARGET_LIMIT");
    }
    return targets;
  }

  private async scanSurface(
    operation: DevelopmentRoomFixtureOperation,
    surface: DevelopmentRoomFixtureSurface,
  ) {
    const definition = operation.surfaces[surface];
    const pages: Array<{ codes: string[]; values: Array<string | null> }> = [];
    let cursor = "0";
    const seen = new Set([cursor]);
    for (let count = 0; count < maximumVerificationScanPages; count += 1) {
      const page = await this.storage.scanPage(
        definition.indexKey,
        (code) => `${definition.roomKeyPrefix}${code}`,
        cursor,
      );
      pages.push({ codes: page.codes, values: page.values });
      if (page.nextCursor === null) return pages;
      if (seen.has(page.nextCursor)) {
        throw new Error("DEVELOPMENT_ROOM_FIXTURE_SCAN_CURSOR_INVALID");
      }
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_SCAN_LIMIT");
  }

  private async analyze(
    operation: DevelopmentRoomFixtureOperation,
    template: DevelopmentSdkRoomFixtureTemplate,
  ) {
    const now = this.now();
    const [builtInPages, sdkPages, builtInMembers, sdkMembers] = await Promise.all([
      this.scanSurface(operation, builtInSurface),
      this.scanSurface(operation, sdkSurface),
      this.storage.indexMembers(operation.surfaces[builtInSurface].indexKey),
      this.storage.indexMembers(operation.surfaces[sdkSurface].indexKey),
    ]);
    const builtInFirst = builtInPages[0] ?? { codes: [], values: [] };
    const sdkFirst = sdkPages[0] ?? { codes: [], values: [] };
    const builtInFirstVisible = builtInFirst.values.some((raw) => (
      builtInRoomVisible(raw, "ja", now) || builtInRoomVisible(raw, "en", now)
    ));
    const sdkFirstVisible = sdkFirst.values.some((raw) => sdkRoomVisible(raw, template, now));
    const laterBuiltIn = new Map<string, string | null>();
    for (const page of builtInPages.slice(1)) {
      page.codes.forEach((code, index) => laterBuiltIn.set(code, page.values[index] ?? null));
    }
    const laterSdk = new Map<string, string | null>();
    for (const page of sdkPages.slice(1)) {
      page.codes.forEach((code, index) => laterSdk.set(code, page.values[index] ?? null));
    }
    const firstBuiltInCodes = new Set(builtInFirst.codes);
    const firstSdkCodes = new Set(sdkFirst.codes);
    const joinableTargetsInFirst = operation.targets.filter((target) => (
      target.kind.startsWith("joinable-")
      && (
        (target.surface === builtInSurface && firstBuiltInCodes.has(target.code))
        || (target.surface === sdkSurface && firstSdkCodes.has(target.code))
      )
    ));
    const hasLater = (kind: DevelopmentRoomFixtureKind) => operation.targets.some((target) => {
      if (target.kind !== kind) return false;
      const raw = target.surface === builtInSurface
        ? laterBuiltIn.get(target.code)
        : laterSdk.get(target.code);
      if (raw === undefined) return false;
      if (kind === "joinable-ja") return builtInRoomVisible(raw, "ja", now);
      if (kind === "joinable-en") return builtInRoomVisible(raw, "en", now);
      return sdkRoomVisible(raw, template, now);
    });
    return {
      joinableTargetsInFirst,
      verification: {
        builtInIndexMembers: builtInMembers.length,
        sdkIndexMembers: sdkMembers.length,
        builtInFirstStoragePageFiltered: builtInPages.length > 1 && !builtInFirstVisible,
        sdkFirstStoragePageFiltered: sdkPages.length > 1 && !sdkFirstVisible,
        builtInLaterJoinableJa: hasLater("joinable-ja"),
        builtInLaterJoinableEn: hasLater("joinable-en"),
        sdkLaterJoinable: hasLater("joinable-sdk"),
      } satisfies DevelopmentRoomFixtureVerification,
    };
  }

  private verificationReady(verification: DevelopmentRoomFixtureVerification) {
    return verification.builtInIndexMembers > 24
      && verification.sdkIndexMembers > 24
      && verification.builtInFirstStoragePageFiltered
      && verification.sdkFirstStoragePageFiltered
      && verification.builtInLaterJoinableJa
      && verification.builtInLaterJoinableEn
      && verification.sdkLaterJoinable;
  }

  private async markTargetStarted(
    key: string,
    operation: DevelopmentRoomFixtureOperation,
    target: DevelopmentRoomFixtureTarget,
    template: DevelopmentSdkRoomFixtureTemplate,
  ) {
    target.kind = "started";
    const definition = operation.surfaces[target.surface];
    const raw = target.surface === builtInSurface
      ? builtInRoomRaw(target, this.now(), 0)
      : sdkRoomRaw(target, this.now(), template);
    await this.storage.replaceTarget(
      key,
      target,
      `${definition.roomKeyPrefix}${target.code}`,
      raw,
      developmentRoomFixtureRoomTtlSeconds,
      "started",
    );
  }

  async materialize(input: MaterializeInput) {
    const operationId = normalizeDevelopmentRoomFixtureOperationId(input.operationId);
    const key = operationKey(input.creatorSlug, operationId);
    const existing = await this.storage.read(key);
    if (existing) {
      this.assertOwner(existing, input.playerId);
      if (existing.state === "materializing" || existing.state === "cleaning") {
        throw new Error("DEVELOPMENT_ROOM_FIXTURE_OPERATION_IN_PROGRESS");
      }
      return publicReceipt(existing, true);
    }

    const template = await this.loadSdkTemplate({
      creatorSlug: input.creatorSlug,
      operationId,
      request: input.request,
    });
    const sdkRoomPrefix = `game-sdk-runtime:v2:candidate-preview:${template.runtimeId}:room:`;
    const sdkIndexKey = `game-sdk-runtime:v2:candidate-preview:${template.runtimeId}:rooms`;
    const [builtInBaseline, sdkBaseline] = await Promise.all([
      this.storage.captureBaseline(builtInSurface, builtInIndexKey, builtInRoomKey),
      this.storage.captureBaseline(
        sdkSurface,
        sdkIndexKey,
        (code) => `${sdkRoomPrefix}${code}`,
      ),
    ]);
    const createdAt = this.now();
    const operation: DevelopmentRoomFixtureOperation = {
      schemaVersion: 1,
      namespace: developmentRoomFixtureNamespace,
      operationId,
      scenario: developmentRoomFixtureScenario,
      creatorSlug: input.creatorSlug,
      actorDigest: developmentRoomFixtureActorDigest(input.playerId),
      state: "materializing",
      createdAt,
      expiresAt: createdAt + developmentRoomFixtureReceiptTtlSeconds * 1_000,
      surfaces: {
        [builtInSurface]: {
          indexKey: builtInIndexKey,
          roomKeyPrefix: "hodoai:room:",
        },
        [sdkSurface]: {
          indexKey: sdkIndexKey,
          roomKeyPrefix: sdkRoomPrefix,
        },
      },
      baselines: {
        [builtInSurface]: builtInBaseline,
        [sdkSurface]: sdkBaseline,
      },
      targets: [],
    };
    const begun = await this.storage.begin(key, operation);
    if (!begun.created) {
      this.assertOwner(begun.operation, input.playerId);
      if (begun.operation.state === "materializing" || begun.operation.state === "cleaning") {
        throw new Error("DEVELOPMENT_ROOM_FIXTURE_OPERATION_IN_PROGRESS");
      }
      return publicReceipt(begun.operation, true);
    }

    const usedCodes = {
      [builtInSurface]: new Set(builtInBaseline.indexMembers),
      [sdkSurface]: new Set(sdkBaseline.indexMembers),
    };
    try {
      const builtInKinds = Array.from(
        { length: developmentRoomFixtureFilteredRoomsPerSurface },
        (_, index) => targetKind(builtInSurface, index),
      );
      const sdkKinds = Array.from(
        { length: developmentRoomFixtureFilteredRoomsPerSurface },
        (_, index) => targetKind(sdkSurface, index),
      );
      await this.appendTargets(
        key,
        operation,
        builtInSurface,
        builtInKinds,
        0,
        usedCodes[builtInSurface],
        template,
      );
      await this.appendTargets(
        key,
        operation,
        sdkSurface,
        sdkKinds,
        0,
        usedCodes[sdkSurface],
        template,
      );

      for (let round = 0; round < developmentRoomFixtureCandidateRounds; round += 1) {
        const required: Array<[DevelopmentRoomFixtureSurface, DevelopmentRoomFixtureKind]> = [];
        if (!operation.targets.some((target) => target.kind === "joinable-ja")) {
          required.push([builtInSurface, "joinable-ja"]);
        }
        if (!operation.targets.some((target) => target.kind === "joinable-en")) {
          required.push([builtInSurface, "joinable-en"]);
        }
        if (!operation.targets.some((target) => target.kind === "joinable-sdk")) {
          required.push([sdkSurface, "joinable-sdk"]);
        }
        if (required.length === 0) {
          required.push(
            [builtInSurface, "started"],
            [sdkSurface, "started"],
          );
        }
        for (const [index, [surface, kind]] of required.entries()) {
          await this.appendTargets(
            key,
            operation,
            surface,
            [kind],
            developmentRoomFixtureFilteredRoomsPerSurface + round * 4 + index,
            usedCodes[surface],
            template,
          );
        }

        const analysis = await this.analyze(operation, template);
        for (const target of analysis.joinableTargetsInFirst) {
          await this.markTargetStarted(key, operation, target, template);
        }
        if (
          analysis.joinableTargetsInFirst.length === 0
          && this.verificationReady(analysis.verification)
        ) {
          operation.state = "ready";
          operation.verification = analysis.verification;
          const ready = await this.storage.replace(key, ["materializing"], operation);
          if (ready.state !== "ready") {
            throw new Error("DEVELOPMENT_ROOM_FIXTURE_READY_TRANSITION_FAILED");
          }
          return publicReceipt(ready, false);
        }
      }
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_SCENARIO_NOT_READY");
    } catch (error) {
      const latest = await this.storage.read(key).catch(() => null);
      if (latest?.state === "materializing") {
        latest.state = "partial";
        latest.errorCode = safeErrorCode(error);
        await this.storage.replace(key, ["materializing"], latest).catch(() => undefined);
      }
      throw error;
    }
  }

  async status(input: OperationIdentity) {
    const operationId = normalizeDevelopmentRoomFixtureOperationId(input.operationId);
    const operation = await this.storage.read(operationKey(input.creatorSlug, operationId));
    if (!operation) return null;
    this.assertOwner(operation, input.playerId);
    return publicReceipt(operation, true);
  }

  private async baselineUnchanged(
    operation: DevelopmentRoomFixtureOperation,
  ) {
    const entries = await Promise.all(([
      builtInSurface,
      sdkSurface,
    ] as const).map(async (surface) => {
      const definition = operation.surfaces[surface];
      const current = await this.storage.captureBaseline(
        surface,
        definition.indexKey,
        (code) => `${definition.roomKeyPrefix}${code}`,
      );
      return current.digest === operation.baselines[surface].digest;
    }));
    return entries.every(Boolean);
  }

  async cleanup(input: OperationIdentity) {
    const operationId = normalizeDevelopmentRoomFixtureOperationId(input.operationId);
    const key = operationKey(input.creatorSlug, operationId);
    let operation = await this.storage.read(key);
    if (!operation) throw new Error("DEVELOPMENT_ROOM_FIXTURE_NOT_FOUND");
    this.assertOwner(operation, input.playerId);
    if (operation.state === "cleaned") return publicReceipt(operation, true);
    if (!["ready", "partial", "materializing"].includes(operation.state)) {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_CLEANUP_STATE_INVALID");
    }
    const previousState = operation.state;
    operation = await this.storage.replace(key, [previousState], {
      ...operation,
      state: "cleaning",
      errorCode: undefined,
    });
    if (operation.state !== "cleaning") {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_CLEANUP_STATE_INVALID");
    }
    const pending = operation.targets.filter((target) => !target.cleaned);
    const results = await this.storage.cleanup(key, pending.map((target) => {
      const definition = operation.surfaces[target.surface];
      return {
        target,
        indexKey: definition.indexKey,
        roomKey: `${definition.roomKeyPrefix}${target.code}`,
      };
    }));
    if (results.some((result) => result === "identity-mismatch")) {
      const latest = await this.storage.read(key) ?? operation;
      latest.state = "partial";
      latest.errorCode = "DEVELOPMENT_ROOM_FIXTURE_CLEANUP_IDENTITY_MISMATCH";
      await this.storage.replace(key, ["cleaning"], latest);
      throw new Error(latest.errorCode);
    }
    const latest = await this.storage.read(key);
    if (!latest) throw new Error("DEVELOPMENT_ROOM_FIXTURE_RECEIPT_INVALID");
    const remainingChecks = await Promise.all(latest.targets.flatMap((target) => {
      const definition = latest.surfaces[target.surface];
      return [
        this.storage.roomValue(`${definition.roomKeyPrefix}${target.code}`).then(Boolean),
        this.storage.indexHas(definition.indexKey, target.code),
      ];
    }));
    const remaining = remainingChecks.filter(Boolean).length;
    const baselineUnchanged = remaining === 0 && await this.baselineUnchanged(latest);
    if (remaining !== 0 || !baselineUnchanged) {
      latest.state = "partial";
      latest.errorCode = remaining !== 0
        ? "DEVELOPMENT_ROOM_FIXTURE_CLEANUP_REMAINING"
        : "DEVELOPMENT_ROOM_FIXTURE_BASELINE_CHANGED";
      await this.storage.replace(key, ["cleaning"], latest);
      throw new Error(latest.errorCode);
    }
    latest.state = "cleaned";
    latest.errorCode = undefined;
    latest.verification = {
      ...(latest.verification ?? {
        builtInIndexMembers: latest.baselines[builtInSurface].indexMembers.length,
        sdkIndexMembers: latest.baselines[sdkSurface].indexMembers.length,
        builtInFirstStoragePageFiltered: false,
        sdkFirstStoragePageFiltered: false,
        builtInLaterJoinableJa: false,
        builtInLaterJoinableEn: false,
        sdkLaterJoinable: false,
      }),
      baselineUnchanged: true,
    };
    const cleaned = await this.storage.replace(key, ["cleaning"], latest);
    return publicReceipt(cleaned, false);
  }
}

export type {
  DevelopmentRoomFixtureBaseline,
  DevelopmentRoomFixtureOperation,
};
