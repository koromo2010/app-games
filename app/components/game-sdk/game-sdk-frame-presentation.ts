import {
  normalizeGameSdkModuleProfile,
  type GameSdkModuleId,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
// NOTE: these two are relative (not `@/...`) imports on purpose. This file is
// imported directly by tests/game-sdk-shell-contract.test.ts, which runs
// under plain `node --experimental-strip-types --test` — that runtime does
// not read tsconfig's `paths` (`@/*"` is TypeScript/Next.js-only path
// mapping), so a `@/lib/...` value import would fail to resolve outside of
// Next's bundler. Relative imports work in both. `lib/game-sdk-result-presentation.ts`
// and `lib/game-sdk-debug-control-target.ts` have no further `@/...` imports
// themselves, so this is safe all the way down.
import {
  gameSdkResultHighlights,
  gameSdkResultReasonText,
} from "../../../lib/game-sdk-result-presentation.ts";
import { gameSdkDebugAutoFollowTarget } from "../../../lib/game-sdk-debug-control-target.ts";
import type { GameSdkDebugRoom } from "../GameSdkShellHeader.tsx";
import type {
  CommonView,
  DebugAutoProgressTarget,
  DebugViewer,
  PackageRoom,
  SafeCommand,
} from "./game-sdk-frame-types.ts";
import { appPhase } from "./game-sdk-frame-shared.ts";

/**
 * Pure presentation helpers extracted out of GameSdkFrame.tsx so that
 * `tests/game-sdk-shell-contract.test.ts` and `tests/sdk-preview-source.test.ts`
 * can assert on real return values instead of grepping GameSdkFrame.tsx source.
 *
 * None of these functions change behavior versus the pre-split GameSdkFrame.tsx;
 * they are 1:1 extractions of inline expressions that used to live inside the
 * component body.
 */

export type GameSdkShareLocale = "ja" | "en";

export type GameSdkStandardResult = NonNullable<CommonView["standardResult"]>;

/**
 * Mirrors the previous inline `resultShareText` computation for the case where
 * a standard result is available (`room.phase === "result" && standardResult`).
 * The caller is still responsible for the `phase === "result"` gate — see
 * `buildGameSdkShareText` below, which reproduces the full original branch.
 */
export function buildGameSdkResultShareText(input: {
  title: string;
  locale: GameSdkShareLocale;
  playerCount: number;
  result: GameSdkStandardResult;
}): string {
  const { title, locale, playerCount, result } = input;
  const resultReason = gameSdkResultReasonText(result, locale);
  const resultHighlights = gameSdkResultHighlights(result, locale);
  return [
    locale === "en"
      ? `Played ${title} with ${playerCount} player(s).`
      : `${title}を${playerCount}人でプレイしました。`,
    `${locale === "en" ? "Finished" : "終了理由"}: ${resultReason}`,
    ...result.rankings.slice(0, 3).map((ranking) => (
      locale === "en"
        ? `#${ranking.rank} PLAYER${ranking.seat + 1}: ${ranking.score}pt`
        : `${ranking.rank}位 PLAYER${ranking.seat + 1}: ${ranking.score}pt`
    )),
    ...resultHighlights.map((highlight) => `・${highlight}`),
  ].join("\n");
}

/** Full replacement for the original inline `resultShareText` ternary. */
export function buildGameSdkShareText(input: {
  phase: string;
  title: string;
  locale: GameSdkShareLocale;
  playerCount: number;
  result: GameSdkStandardResult | undefined;
}): string {
  if (input.phase === "result" && input.result) {
    return buildGameSdkResultShareText({
      title: input.title,
      locale: input.locale,
      playerCount: input.playerCount,
      result: input.result,
    });
  }
  return `${input.title}をプレイしました。`;
}

/**
 * Mirrors the original inline chain:
 *   usesLlm && moduleRequired("llm") && moduleRequired("ai-activity")
 * which decided whether `send`/`autoProgressDebug` wrapped their operation in
 * `withAiActivity(...)`.
 */
export function shouldTrackGameSdkAiActivity(input: {
  usesLlm: boolean;
  moduleProfile: GameSdkModuleProfile;
}): boolean {
  return (
    input.usesLlm
    && input.moduleProfile.llm.mode !== "disabled"
    && input.moduleProfile["ai-activity"].mode === "required"
  );
}

/**
 * Mirrors the Room-derived fields that used to be inlined at the top of the
 * `debugRoom={...}` object literal in GameSdkFrame.tsx (`code: room.code`,
 * `revision: room.revision`, `phase: room.phase`). GameSdkShellHeader never
 * fetches Room state on its own — everything it needs is passed in through
 * this (and the rest of the `debugRoom` object built in GameSdkDebugPanel).
 */
export function buildGameSdkHeaderProps(
  room: Pick<PackageRoom, "code" | "revision" | "phase">,
): { code: string; revision: number; phase: string } {
  return {
    code: room.code,
    revision: room.revision,
    phase: room.phase,
  };
}

/**
 * Mirrors the prop mapping currently inlined in
 * `app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx` when it renders
 * `<GameSdkFrame supportsReplay={game.manifest.supportsReplay} .../>` for a
 * formal package definition. NOTE: page.tsx itself has not been changed to
 * call this function (that page is out of scope for the GameSdkFrame.tsx
 * split) — this function exists so the *mapping logic* can be asserted
 * directly instead of via source regex. If this mapping ever changes in
 * page.tsx, this function (and its test) must be updated to match.
 */
export function gameSdkFramePropsFromPreviewDefinition(definition: {
  manifest: {
    rules?: ReadonlyArray<{ ja: string; en: string }>;
    supportsReplay: boolean;
    supportsSpectators: boolean;
    usesLlm: boolean;
  };
  modulePolicy: GameSdkModuleProfile;
}): {
  rules: string[];
  moduleProfile: GameSdkModuleProfile;
  supportsReplay: boolean;
  supportsSpectators: boolean;
  usesLlm: boolean;
} {
  return {
    rules: (definition.manifest.rules ?? []).map((rule) => rule.ja),
    moduleProfile: normalizeGameSdkModuleProfile(definition.modulePolicy),
    supportsReplay: definition.manifest.supportsReplay,
    supportsSpectators: definition.manifest.supportsSpectators,
    usesLlm: definition.manifest.usesLlm,
  };
}

/**
 * Pure extraction of the `debugRoom={moduleRequired("debug") &&
 * common?.permissions.canDebug ? { ... } : null}` object-literal construction
 * that used to live inline in GameSdkFrame.tsx's JSX. `GameSdkDebugPanel.tsx`
 * calls this and passes the result straight through to
 * `GameSdkShellHeader`'s unchanged `debugRoom` prop — this function is what
 * `tests/game-sdk-shell-contract.test.ts` exercises directly (constructing a
 * fake room/common/mock run+send and asserting on the returned handlers and
 * fields) instead of grepping GameSdkFrame.tsx source, since this repo's test
 * runner (`node --experimental-strip-types --test`) has no React
 * rendering/DOM test dependency installed.
 */
export function buildGameSdkDebugRoom(input: {
  room: PackageRoom;
  common: Pick<
    CommonView,
    "permissions" | "players" | "maximumPlayers"
  > | undefined;
  moduleRequired: (id: GameSdkModuleId) => boolean;
  supportsSpectators: boolean;
  debugAutoFollow: boolean;
  debugOwnerSeat: number | null | undefined;
  debugActorSeat: number | null;
  debugViewer: DebugViewer;
  debugSwitchSource: GameSdkDebugRoom["switchSource"];
  pending: boolean;
  message: string;
  run: (operation: () => Promise<PackageRoom>) => Promise<PackageRoom | null>;
  send: (command: SafeCommand) => Promise<PackageRoom>;
  autoProgressDebug: (target: DebugAutoProgressTarget) => Promise<PackageRoom>;
  simulateDebugInputError: () => Promise<void>;
  onToggleAutoFollow: (enabled: boolean) => void;
  onSelectActor: (seat: number | null) => void;
  onSelectViewer: (viewer: DebugViewer) => void;
}): GameSdkDebugRoom | null {
  const { room, common, moduleRequired } = input;
  if (!moduleRequired("debug") || !common?.permissions.canDebug) return null;

  return {
    ...buildGameSdkHeaderProps(room),
    appPhase: appPhase(room),
    autoFollowEnabled: input.debugAutoFollow,
    autoFollowOwnerSeat: input.debugOwnerSeat ?? null,
    autoFollowWarning: input.debugAutoFollow
      && input.debugOwnerSeat !== null
      && input.debugOwnerSeat !== undefined
      && !gameSdkDebugAutoFollowTarget(input.debugOwnerSeat, common.players)
        ? "SEAT " + (input.debugOwnerSeat + 1) + " は実ユーザーのため、操作対象を自動変更できません。"
        : "",
    canActAsDummy: common.permissions.canDebugActAsDummy === true,
    canAutoProgress: common.permissions.canDebugAutoProgress === true,
    canUseSpectatorView: (
      input.supportsSpectators
      && moduleRequired("spectators")
    ),
    disabled: room.phase !== "lobby",
    selectedActorSeat: input.debugActorSeat,
    selectedViewer: input.debugViewer,
    isSubmitting: input.pending,
    maximumPlayers: common.maximumPlayers,
    onAddDummy: async () => {
      await input.run(() => input.send({
        type: "room/debug-add-dummy",
      }));
    },
    onRemoveDummy: async (seat) => {
      await input.run(() => input.send({
        type: "room/debug-remove-dummy",
        seat,
      }));
    },
    onAutoProgress: async (target) => {
      await input.run(() => input.autoProgressDebug(target));
    },
    onToggleAutoFollow: input.onToggleAutoFollow,
    onSelectActor: input.onSelectActor,
    onSelectViewer: input.onSelectViewer,
    onSetConnected: async (seat, connected) => {
      await input.run(() => input.send({
        type: "room/debug-set-connected",
        seat,
        connected,
      }));
    },
    onSimulateInputError: input.simulateDebugInputError,
    onSimulateTimeout: async () => {
      await input.run(() => input.send({
        type: "room/debug-simulate-timeout",
      }));
    },
    players: common.players,
    statusMessage: input.message,
    switchSource: input.debugSwitchSource,
  };
}
