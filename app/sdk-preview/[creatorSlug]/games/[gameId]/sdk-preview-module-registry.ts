import {
  GAME_SDK_MODULE_CATALOG,
  normalizeGameSdkModuleProfile,
  type GameSdkModuleGroup,
  type GameSdkModuleId,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";

export type SdkPreviewModuleSurface =
  | "platform"
  | "entry"
  | "lobby"
  | "playing"
  | "result"
  | "module-lab";

export type SdkPreviewModuleImplementation = {
  kind: "platform-adapter" | "shared-component" | "sdk-helper";
  source: string;
  surfaces: readonly SdkPreviewModuleSurface[];
};

/**
 * This is the executable coverage registry for the SDK-dev preview.
 *
 * The catalog describes policy. This registry describes which concrete
 * Platform implementation is composed for every policy ID. Keeping the two
 * separate prevents a new required ID from silently becoming a label-only
 * checkbox in the preview.
 */
export const SDK_PREVIEW_MODULE_IMPLEMENTATIONS = {
  authentication: {
    kind: "platform-adapter",
    source: "SDK owner preview session",
    surfaces: ["platform"],
  },
  "account-session": {
    kind: "platform-adapter",
    source: "preview actor and viewer state",
    surfaces: ["platform", "lobby"],
  },
  authorization: {
    kind: "platform-adapter",
    source: "host, phase and viewer permission guards",
    surfaces: ["lobby", "playing", "result"],
  },
  persistence: {
    kind: "platform-adapter",
    source: "revisioned preview room snapshot",
    surfaces: ["lobby", "playing", "result"],
  },
  observability: {
    kind: "platform-adapter",
    source: "sanitized preview action log",
    surfaces: ["module-lab"],
  },
  "common-navigation": {
    kind: "shared-component",
    source: "AppLink and creator lounge route",
    surfaces: ["platform", "entry", "result"],
  },
  "player-menu": {
    kind: "shared-component",
    source: "preview player menu",
    surfaces: ["platform"],
  },
  "common-shell": {
    kind: "shared-component",
    source: "GameTopBanner and SDK common room shell",
    surfaces: ["entry", "lobby", "playing", "result"],
  },
  "online-room": {
    kind: "platform-adapter",
    source: "room create, join, leave and participant preview",
    surfaces: ["entry", "lobby"],
  },
  "room-sync": {
    kind: "platform-adapter",
    source: "revision state and isolated iframe bridge",
    surfaces: ["lobby", "playing", "result"],
  },
  "room-settings": {
    kind: "shared-component",
    source: "RoomConfigSummary and RoomTimeLimitControl",
    surfaces: ["lobby"],
  },
  debug: {
    kind: "shared-component",
    source: "DebugToolWindow and DebugParticipantControls",
    surfaces: ["lobby", "playing", "result"],
  },
  timer: {
    kind: "shared-component",
    source: "Preview preset timer state and common time-limit policy",
    surfaces: ["lobby", "playing"],
  },
  result: {
    kind: "shared-component",
    source: "SDK common result panel",
    surfaces: ["result"],
  },
  rematch: {
    kind: "shared-component",
    source: "OnlineRoomLifecycleActions",
    surfaces: ["result"],
  },
  dissolution: {
    kind: "shared-component",
    source: "OnlineRoomLifecycleActions",
    surfaces: ["lobby", "result"],
  },
  stats: {
    kind: "platform-adapter",
    source: "preview standard-result projection",
    surfaces: ["result"],
  },
  rating: {
    kind: "platform-adapter",
    source: "preview rating projection",
    surfaces: ["result"],
  },
  replay: {
    kind: "platform-adapter",
    source: "preview replay summary",
    surfaces: ["result"],
  },
  "result-share": {
    kind: "shared-component",
    source: "GameResultShareButton",
    surfaces: ["result"],
  },
  spectators: {
    kind: "platform-adapter",
    source: "viewer-safe spectator perspective",
    surfaces: ["playing", "module-lab"],
  },
  "ai-activity": {
    kind: "shared-component",
    source: "AiActivityVital in GameTopBanner",
    surfaces: ["platform", "module-lab"],
  },
  ads: {
    kind: "shared-component",
    source: "GameAdSlot（配信なし・進行中・DEBUGは描画しない）",
    surfaces: ["entry", "lobby", "result"],
  },
  "start-guard": {
    kind: "sdk-helper",
    source: "assertGameSdkCanStart",
    surfaces: ["lobby"],
  },
  "phase-flow": {
    kind: "sdk-helper",
    source: "SDK preview phase reducer",
    surfaces: ["lobby", "playing", "result"],
  },
  rounds: {
    kind: "sdk-helper",
    source: "nextGameSdkRoundStep",
    surfaces: ["playing", "module-lab"],
  },
  "turn-order": {
    kind: "sdk-helper",
    source: "nextGameSdkEligibleSeat",
    surfaces: ["playing", "module-lab"],
  },
  "collect-text": {
    kind: "sdk-helper",
    source: "recordGameSdkParticipantValue",
    surfaces: ["module-lab"],
  },
  "collect-choice": {
    kind: "sdk-helper",
    source: "recordGameSdkParticipantValue",
    surfaces: ["module-lab"],
  },
  vote: {
    kind: "sdk-helper",
    source: "recordGameSdkVote and tallyGameSdkVotes",
    surfaces: ["module-lab"],
  },
  "role-assignment": {
    kind: "sdk-helper",
    source: "assignGameSdkRoles",
    surfaces: ["module-lab"],
  },
  "team-assignment": {
    kind: "sdk-helper",
    source: "distributeGameSdkBalancedTeams",
    surfaces: ["module-lab"],
  },
  "secret-presentation": {
    kind: "sdk-helper",
    source: "gameSdkPlayerSeat and viewer projection",
    surfaces: ["playing", "module-lab"],
  },
  "standard-outcome": {
    kind: "sdk-helper",
    source: "defineGameSdkStandardResult",
    surfaces: ["result"],
  },
  "content-source": {
    kind: "platform-adapter",
    source: "read-only PostgreSQL content-source adapter",
    surfaces: ["module-lab"],
  },
  llm: {
    kind: "platform-adapter",
    source: "shared LLM gateway preview adapter",
    surfaces: ["module-lab"],
  },
  "playing-cards": {
    kind: "shared-component",
    source: "PlayingCard and shared deck helpers",
    surfaces: ["module-lab"],
  },
  drawing: {
    kind: "shared-component",
    source: "DrawingCanvas and shared stroke helpers",
    surfaces: ["module-lab"],
  },
} as const satisfies Record<GameSdkModuleId, SdkPreviewModuleImplementation>;

export type ResolvedSdkPreviewModule = {
  id: GameSdkModuleId;
  group: GameSdkModuleGroup;
  label: string;
  description: string;
  implementation: SdkPreviewModuleImplementation;
};

export function resolveRequiredSdkPreviewModules(
  profile: GameSdkModuleProfile,
): ResolvedSdkPreviewModule[] {
  const normalized = normalizeGameSdkModuleProfile(profile);
  return GAME_SDK_MODULE_CATALOG.flatMap((definition) => {
    if (normalized[definition.id].mode !== "required") return [];
    const implementation = SDK_PREVIEW_MODULE_IMPLEMENTATIONS[definition.id];
    if (!implementation) {
      throw new Error(`SDK_PREVIEW_REQUIRED_MODULE_UNIMPLEMENTED:${definition.id}`);
    }
    return [{
      ...definition,
      implementation,
    }];
  });
}
