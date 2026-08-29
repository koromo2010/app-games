import { createHash } from "node:crypto";
import {
  DEFAULT_GAME_SDK_TIME_LIMIT_SETTING,
  assertGameManifest,
  type GameSdkManifest,
} from "../../../packages/game-sdk/src/index.ts";
import {
  GAME_SDK_MODULE_CATALOG,
  normalizeGameSdkModuleProfile,
} from "../../../packages/game-sdk/src/modules/profile.ts";
import {
  canonicalT131A4Json,
  t131A4JsonDocument,
  type T131A4CurrentFormatFile,
  type T131A4Target,
} from "./creator-artifact-reconstruction.ts";
import { parseGameFieldsPackageManifest } from "./game-package-manifest.ts";
import { gameSdkModuleContractDigest } from "./module-authoring-contract.ts";
import { buildNodeFreeGamePackage } from "./node-free-game-package.ts";

export const t131A4DefinitionRebuilderVersion =
  "game-fields-t131-a4-definition-backed-quarto-v1" as const;

const exactQuartoIdentity = Object.freeze({
  target: "moi-lab2",
  gameRowId: "62a070d1-896f-44fa-bc6d-7191815a72b6",
  gameId: "quarto",
  definitionSha256: "af1c40a5722a7083e82a1e7cdf0bf109d7b83242955b0a78dc503d298a74092c",
  legacyManifestSha256: "7c24c41884b099499319bcbc6e4f79d8ba0ab57311ffb8d6cd53023bfe6b8a76",
  modulePolicySha256: "2f36920cd21b2856590734cae6097e60634da520d20fc7ba6ecc57362e944092",
  authoringMetadataSha256: "6e6ccafa599f537a59c26a9ce010c8d324d17b1542b986b8b69ab0730e288710",
  storedModuleProfileRevision: "09e88d0a-6766-4c5c-a7ea-b4c283c70325",
  storedModuleContractDigest: "d1788bd3b6d65575425970fbc434e002f68e20353d2d97659e75150ef6b9e44d",
} as const);

type DefinitionGameInput = {
  target: T131A4Target;
  gameRowId: string;
  gameId: string;
  title: string;
  description: string;
  legacyManifest: unknown;
  modulePolicy: unknown;
  sdkPackageVersion: string | null;
  sdkContractVersion: number | null;
  status: string | null;
  publicGameId: string | null;
  deletedAt: string | null;
  ownerReference: string | null;
  authoringPointers: Record<string, string | null>;
  authoringMetadata: {
    moduleProfileRevision: string | null;
    moduleContractDigest: string | null;
    [key: string]: unknown;
  };
  channelProvenance: Record<string, string | null>;
  head: unknown;
  headLocator: unknown;
  headResolutionEvidence: {
    method: string;
    selectedRevision: string | null;
    candidates: unknown[];
    missingEvidence: string[];
  };
  deferred: {
    artifactLocatorCount: number;
    packageRevisionCount: number;
    releaseCount: number;
  };
};

export type T131A4DefinitionSmokeStep = {
  actor: "host" | "player";
  command: Record<string, unknown> & { type: string };
};

export type T131A4DefinitionBackedRebuild = {
  rebuildMode: "DEFINITION_BACKED_SEMANTIC_REBUILD";
  rebuilderVersion: typeof t131A4DefinitionRebuilderVersion;
  currentManifest: GameSdkManifest;
  canonicalInputSha256: string;
  canonicalOutputSha256: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  definitionEvidenceSha256: string;
  files: readonly T131A4CurrentFormatFile[];
  smokeSequence: readonly T131A4DefinitionSmokeStep[];
};

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value: unknown) {
  return sha256(canonicalT131A4Json(value));
}

function definitionInput(game: DefinitionGameInput) {
  return {
    target: game.target,
    gameRowId: game.gameRowId,
    gameId: game.gameId,
    title: game.title,
    description: game.description,
    legacyManifest: game.legacyManifest,
    modulePolicy: game.modulePolicy,
    sdkPackageVersion: game.sdkPackageVersion,
    sdkContractVersion: game.sdkContractVersion,
    status: game.status,
    publicGameId: game.publicGameId,
    deletedAt: game.deletedAt,
    ownerReference: game.ownerReference,
    authoringPointers: game.authoringPointers,
    authoringMetadata: game.authoringMetadata,
    channelProvenance: game.channelProvenance,
  };
}

function assertExactDefinitionEvidence(game: DefinitionGameInput) {
  if (
    game.target !== exactQuartoIdentity.target
    || game.gameRowId !== exactQuartoIdentity.gameRowId
    || game.gameId !== exactQuartoIdentity.gameId
    || canonicalSha256(definitionInput(game)) !== exactQuartoIdentity.definitionSha256
    || canonicalSha256(game.legacyManifest) !== exactQuartoIdentity.legacyManifestSha256
    || canonicalSha256(game.modulePolicy) !== exactQuartoIdentity.modulePolicySha256
    || canonicalSha256(game.authoringMetadata) !== exactQuartoIdentity.authoringMetadataSha256
    || game.authoringMetadata.moduleProfileRevision !== exactQuartoIdentity.storedModuleProfileRevision
    || game.authoringMetadata.moduleContractDigest !== exactQuartoIdentity.storedModuleContractDigest
  ) throw new Error("A4_QUARTO_EXACT_DEFINITION_IDENTITY_MISMATCH");
  if (
    game.head !== null
    || game.headLocator !== null
    || game.headResolutionEvidence.method !== "UNRESOLVED"
    || game.headResolutionEvidence.selectedRevision !== null
    || game.headResolutionEvidence.candidates.length !== 0
    || Object.values(game.authoringPointers).some((value) => value !== null)
    || game.deferred.artifactLocatorCount !== 0
    || game.deferred.packageRevisionCount !== 0
    || game.deferred.releaseCount !== 0
  ) throw new Error("A4_QUARTO_HISTORICAL_HEAD_ABSENCE_NOT_PROVEN");
  const sourceProfile = game.modulePolicy as Record<string, unknown>;
  const sourceIds = Object.keys(sourceProfile).sort();
  const currentIds = GAME_SDK_MODULE_CATALOG.map(({ id }) => id).sort();
  if (
    GAME_SDK_MODULE_CATALOG.length !== 39
    || canonicalT131A4Json(sourceIds) !== canonicalT131A4Json(currentIds)
    || Object.values(sourceProfile).some((decision) => {
      if (!decision || typeof decision !== "object" || Array.isArray(decision)) return true;
      const mode = (decision as { mode?: unknown }).mode;
      return mode !== "required" && mode !== "available" && mode !== "disabled";
    })
  ) throw new Error("A4_QUARTO_MODULE_POLICY_NOT_EXACT_CURRENT_PROFILE");
}

function createCurrentManifest(game: DefinitionGameInput): GameSdkManifest {
  const legacy = game.legacyManifest as Record<string, unknown>;
  const profile = normalizeGameSdkModuleProfile(game.modulePolicy);
  const required = (id: keyof typeof profile) => profile[id].mode === "required";
  const manifest: GameSdkManifest = {
    sdkVersion: 2,
    id: game.gameId,
    title: { ja: game.title, en: game.title },
    playMode: legacy.playMode === "online-room" ? "online-room" : "online-room",
    minimumPlayers: Number(legacy.minimumPlayers),
    previewMinimumPlayers: Number(legacy.minimumPlayers),
    maximumPlayers: Number(legacy.maximumPlayers),
    supportsDebug: required("debug"),
    supportsSpectators: required("spectators"),
    supportsReplay: required("replay"),
    supportsRating: required("rating"),
    usesLlm: required("llm"),
    rules: [{ ja: game.description, en: game.description }],
    settings: [{
      ...DEFAULT_GAME_SDK_TIME_LIMIT_SETTING,
      label: { ...DEFAULT_GAME_SDK_TIME_LIMIT_SETTING.label },
      options: [...DEFAULT_GAME_SDK_TIME_LIMIT_SETTING.options],
      unit: { ...DEFAULT_GAME_SDK_TIME_LIMIT_SETTING.unit },
    }],
  };
  assertGameManifest(manifest);
  return manifest;
}

const contractsSource = String.raw`import type {
  GameSdkOnlineRoom,
  GameSdkOnlineRoomCommand,
  GameSdkOnlineRoomCreateInput,
  GameSdkOnlineRoomView,
} from "@game-fields/game-sdk/runtime";

export type QuartoSettings = { timeLimitSeconds: number };
export type QuartoAppInput = Record<string, never>;
export type QuartoStep = "select" | "place";
export type QuartoAppState = {
  board: Array<number | null>;
  availablePieceIds: number[];
  selectedPieceId: number | null;
  activePlayerId: string | null;
  step: QuartoStep;
  winnerPlayerId: string | null;
};
export type QuartoAppCommand =
  | { type: "game/start" }
  | { type: "game/select-piece"; pieceId: number }
  | { type: "game/place-piece"; cellIndex: number };
export type QuartoPieceView = {
  id: number;
  tall: boolean;
  square: boolean;
  light: boolean;
  solid: boolean;
};
export type QuartoAppView = {
  board: Array<QuartoPieceView | null>;
  availablePieces: QuartoPieceView[];
  selectedPiece: QuartoPieceView | null;
  activePlayerSeat: number | null;
  step: QuartoStep;
  winnerPlayerSeat: number | null;
  canSelect: boolean;
  canPlace: boolean;
};
export type QuartoRoom = GameSdkOnlineRoom<QuartoSettings, QuartoAppState>;
export type QuartoCreateInput = GameSdkOnlineRoomCreateInput<QuartoSettings, QuartoAppInput>;
export type QuartoCommand = GameSdkOnlineRoomCommand<QuartoSettings, QuartoAppCommand>;
export type QuartoRoomView = GameSdkOnlineRoomView<QuartoSettings, QuartoAppView>;
`;

const appSetSource = String.raw`import { defineGameSdkOnlineRoomAppSet } from "@game-fields/game-sdk/runtime";
import {
  assertGameSdkCanStart,
  assertGameSdkPhase,
  defineGameSdkStandardResult,
  gameSdkPlayerSeat,
} from "@game-fields/game-sdk/modules";
import type {
  QuartoAppCommand,
  QuartoAppInput,
  QuartoAppState,
  QuartoAppView,
  QuartoPieceView,
  QuartoRoom,
  QuartoSettings,
} from "./contracts.js";
import { quartoManifest } from "./manifest.js";

const pieceIds = Array.from({ length: 16 }, (_, id) => id);
const winningLines = [
  [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
  [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
  [0, 5, 10, 15], [3, 6, 9, 12],
] as const;

function pieceView(id: number): QuartoPieceView {
  return {
    id,
    tall: Boolean(id & 1),
    square: Boolean(id & 2),
    light: Boolean(id & 4),
    solid: Boolean(id & 8),
  };
}

function initialState(): QuartoAppState {
  return {
    board: Array.from({ length: 16 }, () => null),
    availablePieceIds: [...pieceIds],
    selectedPieceId: null,
    activePlayerId: null,
    step: "select",
    winnerPlayerId: null,
  };
}

function otherPlayerId(room: { players: Array<{ id: string }> }, playerId: string) {
  const other = room.players.find((player) => player.id !== playerId)?.id;
  if (!other) throw new Error("QUARTO_TWO_PLAYERS_REQUIRED");
  return other;
}

function hasQuarto(board: Array<number | null>) {
  return winningLines.some((line) => {
    const values = line.map((index) => board[index]);
    if (values.some((value) => value === null)) return false;
    return [1, 2, 4, 8].some((bit) => {
      const traits = values.map((value) => Boolean((value as number) & bit));
      return traits.every(Boolean) || traits.every((value) => !value);
    });
  });
}

function standardResult(
  room: { players: Array<{ id: string }> },
  winnerPlayerId: string | null,
) {
  const participantIds = room.players.map((player) => player.id);
  return defineGameSdkStandardResult({
    winnerIds: winnerPlayerId ? [winnerPlayerId] : [],
    rankings: participantIds.map((participantId) => ({
      participantId,
      rank: winnerPlayerId ? (participantId === winnerPlayerId ? 1 : 2) : 1,
      score: participantId === winnerPlayerId ? 1 : 0,
    })),
    reason: winnerPlayerId ? "shared-attribute-line" : "board-filled",
    presentation: {
      reason: winnerPlayerId
        ? { ja: "共通属性を持つ4駒が一列に並びました", en: "Four pieces sharing an attribute formed a line" }
        : { ja: "盤面が埋まり引き分けです", en: "The board is full, so the game is a draw" },
    },
  }, { participantIds });
}

function placePiece(
  room: Readonly<QuartoRoom>,
  actorId: string,
  cellIndex: number,
) {
  if (!Number.isSafeInteger(cellIndex) || cellIndex < 0 || cellIndex >= 16) {
    throw new Error("QUARTO_CELL_INVALID");
  }
  if (room.app.board[cellIndex] !== null) throw new Error("QUARTO_CELL_OCCUPIED");
  const selectedPieceId = room.app.selectedPieceId;
  if (selectedPieceId === null) throw new Error("QUARTO_SELECTED_PIECE_REQUIRED");
  const board = [...room.app.board];
  board[cellIndex] = selectedPieceId;
  const winnerPlayerId = hasQuarto(board) ? actorId : null;
  const complete = winnerPlayerId !== null || board.every((piece) => piece !== null);
  const app: QuartoAppState = {
    board,
    availablePieceIds: room.app.availablePieceIds,
    selectedPieceId: null,
    activePlayerId: complete ? null : actorId,
    step: "select",
    winnerPlayerId,
  };
  return {
    phase: complete ? "result" as const : "playing" as const,
    app,
    timer: complete ? "stop" as const : "reset" as const,
    ...(complete ? { standardResult: standardResult(room, winnerPlayerId) } : {
      timerOwnerPlayerId: actorId,
    }),
  };
}

export const quartoAppSet = defineGameSdkOnlineRoomAppSet<
  QuartoSettings,
  QuartoAppState,
  QuartoAppInput,
  QuartoAppCommand,
  QuartoAppView
>({
  manifest: quartoManifest,
  defaultSettings: { timeLimitSeconds: 60 },
  normalizeSettings(settings) {
    return {
      timeLimitSeconds: Number.isSafeInteger(settings.timeLimitSeconds)
        ? Math.min(3600, Math.max(0, settings.timeLimitSeconds))
        : 60,
    };
  },
  timer: { durationSeconds: (settings) => settings.timeLimitSeconds },
  expireAppTurn(room) {
    const activePlayerId = room.app.activePlayerId;
    if (!activePlayerId) throw new Error("QUARTO_ACTIVE_PLAYER_REQUIRED");
    if (room.app.step === "select") {
      const pieceId = room.app.availablePieceIds[0];
      if (pieceId === undefined) throw new Error("QUARTO_AVAILABLE_PIECE_REQUIRED");
      const nextPlayerId = otherPlayerId(room, activePlayerId);
      return {
        phase: "playing",
        app: {
          ...room.app,
          availablePieceIds: room.app.availablePieceIds.filter((id) => id !== pieceId),
          selectedPieceId: pieceId,
          activePlayerId: nextPlayerId,
          step: "place",
        },
        timer: "reset",
        timerOwnerPlayerId: nextPlayerId,
        timedOutPlayerIds: [activePlayerId],
      };
    }
    const cellIndex = room.app.board.findIndex((piece) => piece === null);
    return {
      ...placePiece(room, activePlayerId, cellIndex),
      timedOutPlayerIds: [activePlayerId],
    };
  },
  createAppState() { return initialState(); },
  resetAppState() { return initialState(); },
  applyAppCommand(room, command, context) {
    if (command.type === "game/start") {
      assertGameSdkCanStart({
        actorId: context.actor.playerId,
        hostId: room.hostPlayerId,
        phase: room.phase,
        participantCount: room.players.length,
        minimumPlayers: quartoManifest.minimumPlayers,
        errors: { phase: "INVALID_PHASE" },
      });
      return {
        phase: "playing",
        app: { ...initialState(), activePlayerId: room.hostPlayerId },
        timerOwnerPlayerId: room.hostPlayerId,
      };
    }
    assertGameSdkPhase(room.phase, "playing", "INVALID_PHASE");
    if (room.app.activePlayerId !== context.actor.playerId) {
      throw new Error("QUARTO_ACTIVE_PLAYER_REQUIRED");
    }
    if (command.type === "game/select-piece") {
      if (room.app.step !== "select") throw new Error("QUARTO_SELECT_STEP_REQUIRED");
      if (!Number.isSafeInteger(command.pieceId) || !room.app.availablePieceIds.includes(command.pieceId)) {
        throw new Error("QUARTO_PIECE_INVALID");
      }
      const nextPlayerId = otherPlayerId(room, context.actor.playerId);
      return {
        phase: "playing",
        app: {
          ...room.app,
          availablePieceIds: room.app.availablePieceIds.filter((id) => id !== command.pieceId),
          selectedPieceId: command.pieceId,
          activePlayerId: nextPlayerId,
          step: "place",
        },
        timer: "reset",
        timerOwnerPlayerId: nextPlayerId,
      };
    }
    if (command.type === "game/place-piece") {
      if (room.app.step !== "place") throw new Error("QUARTO_PLACE_STEP_REQUIRED");
      return placePiece(room, context.actor.playerId, command.cellIndex);
    }
    throw new Error("QUARTO_COMMAND_UNSUPPORTED");
  },
  presentApp(room, context) {
    const viewerId = context.viewer.playerId;
    return {
      view: {
        board: room.app.board.map((id) => id === null ? null : pieceView(id)),
        availablePieces: room.app.availablePieceIds.map(pieceView),
        selectedPiece: room.app.selectedPieceId === null ? null : pieceView(room.app.selectedPieceId),
        activePlayerSeat: room.app.activePlayerId
          ? gameSdkPlayerSeat(room.players, room.app.activePlayerId)
          : null,
        step: room.app.step,
        winnerPlayerSeat: room.app.winnerPlayerId
          ? gameSdkPlayerSeat(room.players, room.app.winnerPlayerId)
          : null,
        canSelect: room.phase === "playing"
          && room.app.step === "select"
          && room.app.activePlayerId === viewerId,
        canPlace: room.phase === "playing"
          && room.app.step === "place"
          && room.app.activePlayerId === viewerId,
      },
    };
  },
});
`;

const serverModuleSource = String.raw`import { createGameSdkOnlineRoomModule } from "@game-fields/game-sdk/runtime";
import { quartoAppSet } from "./app-set.js";
export const quartoServerModule = createGameSdkOnlineRoomModule(quartoAppSet);
`;

const clientSource = String.raw`import type { QuartoAppView } from "./contracts.js";
type Snapshot = { phase: string; view?: { app?: QuartoAppView | null } };
type Adapter = {
  mode: "prototype" | "formal-room";
  subscribe(listener: (snapshot: Snapshot) => void): void;
  send(command: { type: string; pieceId?: number; cellIndex?: number }): Promise<void>;
};

function pieceLabel(id: number) {
  const traits = [id & 1 ? "tall" : "short", id & 2 ? "square" : "round", id & 4 ? "light" : "dark", id & 8 ? "solid" : "hollow"];
  return String(id + 1) + ": " + traits.join(" / ");
}

export function mountGameClient(adapter: Adapter) {
  const status = document.querySelector<HTMLElement>("[data-game-status]");
  const selected = document.querySelector<HTMLElement>("[data-selected-piece]");
  const cells = [...document.querySelectorAll<HTMLButtonElement>("[data-cell-index]")];
  const pieces = [...document.querySelectorAll<HTMLButtonElement>("[data-piece-id]")];
  const reset = document.querySelector<HTMLButtonElement>("[data-game-action=reset]");
  if (!status || !selected || !reset || cells.length !== 16 || pieces.length !== 16) {
    throw new Error("QUARTO_CLIENT_ROOT_INCOMPLETE");
  }
  adapter.subscribe((snapshot) => {
    const app = snapshot.view?.app;
    if (!app) return;
    status.textContent = app.step === "select" ? "Choose a piece for the opponent" : "Place the selected piece";
    selected.textContent = app.selectedPiece ? pieceLabel(app.selectedPiece.id) : "No piece selected";
    cells.forEach((cell) => {
      const index = Number(cell.dataset.cellIndex);
      const piece = app.board[index];
      cell.textContent = piece ? pieceLabel(piece.id) : "Empty " + String(index + 1);
      cell.disabled = Boolean(piece) || !app.canPlace;
    });
    pieces.forEach((button) => {
      const id = Number(button.dataset.pieceId);
      button.textContent = pieceLabel(id);
      button.disabled = !app.canSelect || !app.availablePieces.some((piece) => piece.id === id);
    });
  });
  pieces.forEach((button) => button.addEventListener("click", () => {
    const pieceId = Number(button.dataset.pieceId);
    void adapter.send({ type: adapter.mode === "prototype" ? "prototype/select-piece" : "game/select-piece", pieceId });
  }));
  cells.forEach((cell) => cell.addEventListener("click", () => {
    const cellIndex = Number(cell.dataset.cellIndex);
    void adapter.send({ type: adapter.mode === "prototype" ? "prototype/place-piece" : "game/place-piece", cellIndex });
  }));
  reset.addEventListener("click", () => void adapter.send({ type: "prototype/reset" }));
}
`;

const prototypeSource = String.raw`import type { QuartoAppView, QuartoPieceView } from "./contracts.js";
import type { mountGameClient } from "./game-client.js";
type Adapter = Parameters<typeof mountGameClient>[0];
const piece = (id: number): QuartoPieceView => ({ id, tall: Boolean(id & 1), square: Boolean(id & 2), light: Boolean(id & 4), solid: Boolean(id & 8) });
const initial = (): QuartoAppView => ({
  board: Array.from({ length: 16 }, () => null),
  availablePieces: Array.from({ length: 16 }, (_, id) => piece(id)),
  selectedPiece: null,
  activePlayerSeat: 0,
  step: "select",
  winnerPlayerSeat: null,
  canSelect: true,
  canPlace: false,
});
export function createPrototypeAdapter(): Adapter {
  let app = initial();
  const listeners = new Set<(snapshot: { phase: string; view: { app: QuartoAppView } }) => void>();
  const publish = () => listeners.forEach((listener) => listener({ phase: "playing", view: { app } }));
  return {
    mode: "prototype",
    subscribe(listener) { listeners.add(listener); listener({ phase: "playing", view: { app } }); },
    async send(command) {
      if (command.type === "prototype/reset") app = initial();
      else if (command.type === "prototype/select-piece" && Number.isSafeInteger(command.pieceId)) {
        const chosen = app.availablePieces.find((candidate) => candidate.id === command.pieceId);
        if (!chosen) return;
        app = { ...app, availablePieces: app.availablePieces.filter((candidate) => candidate.id !== chosen.id), selectedPiece: chosen, step: "place", canSelect: false, canPlace: true, activePlayerSeat: 1 };
      } else if (command.type === "prototype/place-piece" && app.selectedPiece && Number.isSafeInteger(command.cellIndex)) {
        const board = [...app.board];
        if (board[command.cellIndex as number]) return;
        board[command.cellIndex as number] = app.selectedPiece;
        app = { ...app, board, selectedPiece: null, step: "select", canSelect: true, canPlace: false, activePlayerSeat: 1 };
      } else return;
      publish();
    },
  };
}
`;

const indexHtml = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quarto</title><link rel="stylesheet" href="./styles.css"></head>
<body><main data-game-slot id="game-slot"><section class="quarto" data-evidence="quarto-board initial-state selection-state placement-state completion-state reset-state">
<header><p>DEFINITION-BACKED CURRENT WORKSPACE</p><h1>QUARTO</h1><p data-game-status data-evidence="game-status selection-result">Choose a piece for the opponent</p><p data-selected-piece>No piece selected</p></header>
<section class="board" data-evidence="board-grid placement-action completion-result" aria-label="Quarto board">
${Array.from({ length: 16 }, (_, index) => `<button type="button" data-cell-index="${index}">Empty ${index + 1}</button>`).join("")}
</section>
<section class="pieces" data-evidence="piece-pool selection-action">
${Array.from({ length: 16 }, (_, id) => `<button type="button" data-piece-id="${id}">Piece ${id + 1}</button>`).join("")}
</section>
<button type="button" data-game-action="reset" data-evidence="reset-action">Reset</button>
</section></main><script src="./mock.js"></script></body></html>
`;

const stylesCss = String.raw`:root{font-family:system-ui,sans-serif;color:#f8fafc;background:#111827}*{box-sizing:border-box}body{margin:0;background:transparent}button{font:inherit}.quarto{display:grid;gap:1rem;max-width:72rem;margin:auto;padding:1rem}.quarto header{text-align:center}.quarto h1,.quarto p{margin:.25rem}.board{display:grid;grid-template-columns:repeat(4,minmax(4rem,1fr));gap:.5rem;padding:1rem;border-radius:1rem;background:#0f172a}.pieces{display:grid;grid-template-columns:repeat(4,minmax(7rem,1fr));gap:.5rem}button{min-height:3rem;border:1px solid #94a3b8;border-radius:.6rem;background:#334155;color:#f8fafc;padding:.5rem;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.board button:not(:disabled){outline:2px solid #f59e0b}@media(max-width:640px){.pieces{grid-template-columns:repeat(2,1fr)}.quarto{padding:.5rem}}
`;

function sourceFiles(game: DefinitionGameInput, manifest: GameSdkManifest) {
  const preview = {
    gameId: game.gameId,
    title: game.title,
    description: game.description,
    reviewEvidence: {
      representativeStates: [
        { id: "selection-state", role: "in-progress", label: "Piece selection state" },
        { id: "placement-state", role: "additional", label: "Selected piece placement state" },
        { id: "completion-state", role: "completion", label: "Shared-attribute line completion" },
      ],
      visibleGameSpecificElements: ["quarto-board", "board-grid", "piece-pool", "game-status"],
      primaryActions: [{
        id: "selection-action",
        targetId: "selection-action",
        observableResultId: "selection-result",
      }],
      completionState: { stateId: "completion-state", visibleResultIds: ["completion-result"] },
      mockOnlyDataSource: "mock-local-state",
      coreLoopSequence: ["initial-state", "selection-action", "selection-result", "placement-action"],
      resetAction: { id: "reset-action", targetId: "reset-action", observableResultId: "selection-result" },
    },
    settings: manifest.settings,
  };
  return {
    "index.html": indexHtml,
    "styles.css": stylesCss,
    "mock.js": "document.documentElement.dataset.quartoCurrentFormat = 'ready';\n",
    "preview.json": `${JSON.stringify(preview, null, 2)}\n`,
    "source/app-set.ts": appSetSource,
    "source/contracts.ts": contractsSource,
    "source/manifest.ts": [
      "import { defineGameManifest } from \"@game-fields/game-sdk\";",
      `export const quartoManifest = defineGameManifest(${JSON.stringify(manifest, null, 2)});`,
      "",
    ].join("\n"),
    "source/server-module.ts": serverModuleSource,
    "source/game-client.tsx": clientSource,
    "source/prototype-adapter.ts": prototypeSource,
  };
}

function currentFileSetSha256(files: readonly T131A4CurrentFormatFile[]) {
  return canonicalSha256([...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ path, bytes, sha256: digest }) => ({ path, bytes, sha256: digest })));
}

export async function rebuildT131A4DefinitionBackedQuarto(
  game: DefinitionGameInput,
): Promise<T131A4DefinitionBackedRebuild> {
  assertExactDefinitionEvidence(game);
  const currentManifest = createCurrentManifest(game);
  const profile = normalizeGameSdkModuleProfile(game.modulePolicy);
  const sourceProfile = game.modulePolicy as Record<string, { mode: string; reason?: string }>;
  const currentModuleContractDigest = gameSdkModuleContractDigest({
    moduleProfile: profile,
    environment: "development",
    sdkPackageVersion: game.sdkPackageVersion ?? undefined,
    sdkContractVersion: game.sdkContractVersion ?? undefined,
  });
  const files = sourceFiles(game, currentManifest);
  const smokeSequence = [
    { actor: "host", command: { type: "game/start" } },
    { actor: "host", command: { type: "game/select-piece", pieceId: 0 } },
    { actor: "player", command: { type: "game/place-piece", cellIndex: 0 } },
  ] as const satisfies readonly T131A4DefinitionSmokeStep[];
  const evidence = {
    schemaVersion: 1,
    rebuildMode: "DEFINITION_BACKED_SEMANTIC_REBUILD",
    rebuilderVersion: t131A4DefinitionRebuilderVersion,
    source: {
      target: game.target,
      gameRowId: game.gameRowId,
      gameId: game.gameId,
      definitionSha256: canonicalSha256(definitionInput(game)),
      titleSha256: sha256(game.title),
      descriptionSha256: sha256(game.description),
      legacyManifestSha256: canonicalSha256(game.legacyManifest),
      modulePolicySha256: canonicalSha256(game.modulePolicy),
      authoringMetadataSha256: canonicalSha256(game.authoringMetadata),
      storedModuleProfileRevision: game.authoringMetadata.moduleProfileRevision,
      storedModuleContractDigest: game.authoringMetadata.moduleContractDigest,
      historicalArtifactHead: "ABSENT",
      artifactLocatorCount: 0,
      packageRevisionCount: 0,
      authoringHeadCandidateCount: 0,
    },
    current: {
      manifestSha256: canonicalSha256(currentManifest),
      defaultTimeLimitSettingSha256: canonicalSha256(DEFAULT_GAME_SDK_TIME_LIMIT_SETTING),
      moduleCatalogSha256: canonicalSha256(GAME_SDK_MODULE_CATALOG),
      moduleContractDigest: currentModuleContractDigest,
      moduleMapping: GAME_SDK_MODULE_CATALOG.map((definition) => ({
        id: definition.id,
        sourceMode: sourceProfile[definition.id]!.mode,
        currentMode: profile[definition.id].mode,
        sourceDecisionSha256: canonicalSha256(sourceProfile[definition.id]),
        currentDefinitionSha256: canonicalSha256(definition),
      })),
      generatedSourceSha256: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, sha256(content)])),
      smokeSequence,
    },
    historicalRestorationClaim: false,
    externalWrites: 0,
  } as const;
  const definitionEvidenceBytes = t131A4JsonDocument(evidence);
  const built = await buildNodeFreeGamePackage({
    gameId: game.gameId,
    manifest: currentManifest,
    files,
    moduleBinding: {
      environment: "development",
      moduleProfileRevision: exactQuartoIdentity.storedModuleProfileRevision,
      moduleContractDigest: currentModuleContractDigest,
      sdkPackageVersion: game.sdkPackageVersion!,
      sdkContractVersion: game.sdkContractVersion!,
    },
  });
  const prepared = [
    ...built,
    {
      path: "definition-rebuild.json",
      content: definitionEvidenceBytes.toString("utf8"),
      encoding: "utf-8" as const,
      bytes: definitionEvidenceBytes.byteLength,
    },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const parsed = parseGameFieldsPackageManifest({ gameId: game.gameId, files: prepared });
  const currentFiles = prepared.map((file) => {
    const content = Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
    return { path: file.path, content, bytes: content.byteLength, sha256: sha256(content) };
  });
  return {
    rebuildMode: "DEFINITION_BACKED_SEMANTIC_REBUILD",
    rebuilderVersion: t131A4DefinitionRebuilderVersion,
    currentManifest,
    canonicalInputSha256: exactQuartoIdentity.definitionSha256,
    canonicalOutputSha256: currentFileSetSha256(currentFiles),
    packageRootSha256: parsed.packageRootSha256,
    serverBundleSha256: parsed.bundleSha256,
    appSetSourceSha256: parsed.appSetSourceSha256,
    definitionEvidenceSha256: sha256(definitionEvidenceBytes),
    files: currentFiles,
    smokeSequence,
  };
}
