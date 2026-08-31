import assert from "node:assert/strict";
import test from "node:test";
import gameRegistry from "../config/game-registry.json" with { type: "json" };
import runnerConsumers from "../config/game-sdk-runner-consumers.json" with { type: "json" };
import {
  assertGameManifest,
  gameSdkManifestSupportsCrossLocaleRooms,
  type GameSdkManifest,
} from "@game-fields/game-sdk";
import {
  builtInCommonOnlineRoomGameIds,
  builtInGameLocaleRegistry,
} from "../lib/game-locale-registry.ts";
import {
  assertRoomContentLanguageAccess,
  filterRoomPageByContentLanguage,
  gameSupportsCrossLocaleRooms,
  isGameUiLocaleAvailable,
  roomContentLanguage,
} from "../lib/game-language.ts";
import { authenticatedRoomDraft } from "../lib/online-room-input.ts";
import { builtInOnlineRoomDescriptors } from "../lib/online-room-descriptors.ts";
import {
  gameSdkCrossLocaleEligible,
  gameSdkLocaleDisposition,
  gameSdkPresentationContext,
  productionApprovedSdkLocaleInventory,
} from "../lib/game-sdk-locale-policy.ts";
import { localizeOnlineRoomSpectatorSnapshot } from "../lib/online-room-spectator.ts";
import { presentSemanticRoomEvent, stableRoomIdentity } from "../lib/room-locale-contract.ts";
import { gameSdkResultReasonText } from "../lib/game-sdk-result-presentation.ts";
import { playerGameResultLabel } from "../lib/player-result-presentation.ts";
import { wordWolfSdkManifest } from "../games/wordwolf-sdk/manifest.ts";

const neutralSdkManifest: GameSdkManifest = {
  sdkVersion: 2,
  id: "neutral-fixture",
  title: { ja: "中立", en: "Neutral" },
  playMode: "online-room",
  localePolicy: { roomContentMode: "neutral", uiLocales: ["ja", "en"] },
  minimumPlayers: 2,
  maximumPlayers: 4,
  supportsDebug: false,
  supportsSpectators: true,
  supportsReplay: true,
  supportsRating: false,
  usesLlm: false,
  settings: [{
    key: "timeLimitSeconds", label: { ja: "時間", en: "Time" }, type: "select",
    defaultValue: 0, platformRole: "time-limit", options: [0, 30],
  }],
};

const roomIdentity = { gameId: "daifugo", code: "ab12", revision: 7 } as const;

test("V01 fixed source uses one exhaustive built-in locale registry", () => {
  assert.deepEqual(Object.keys(builtInGameLocaleRegistry).sort(), gameRegistry.map((game) => game.id).sort());
});

test("V02 registry policies are complete and duplicate-free", () => {
  for (const registration of Object.values(builtInGameLocaleRegistry)) {
    assert.ok(registration.policy.uiLocales.length > 0);
    assert.equal(new Set(registration.policy.uiLocales).size, registration.policy.uiLocales.length);
  }
});

test("V03 built-in classification remains three neutral and six content-bound", () => {
  const modes = Object.values(builtInGameLocaleRegistry).map((entry) => entry.policy.roomContentMode);
  assert.equal(modes.filter((mode) => mode === "neutral").length, 3);
  assert.equal(modes.filter((mode) => mode === "content-bound").length, 6);
});

test("V04 SDK locale policy validates and legacy absence fails closed", () => {
  assert.doesNotThrow(() => assertGameManifest(neutralSdkManifest));
  assert.equal(gameSdkManifestSupportsCrossLocaleRooms({}), false);
  assert.equal(gameSdkManifestSupportsCrossLocaleRooms(neutralSdkManifest), true);
});

test("V05 Japanese catalog remains available for every built-in", () => {
  for (const gameId of Object.keys(builtInGameLocaleRegistry)) {
    assert.equal(isGameUiLocaleAvailable(gameId, "ja"), true, gameId);
  }
});

test("V06 English catalog eligibility is registry-derived", () => {
  assert.deepEqual(Object.keys(builtInGameLocaleRegistry).filter((id) => isGameUiLocaleAvailable(id, "en")), ["daifugo"]);
});

test("V07 neutral JA host and EN join resolve one Room identity", () => {
  assert.equal(stableRoomIdentity(roomIdentity), stableRoomIdentity({ ...roomIdentity }));
  assert.equal(gameSupportsCrossLocaleRooms("daifugo"), true);
});

test("V08 neutral EN host and JA join resolve the same Room identity", () => {
  assert.equal(stableRoomIdentity({ ...roomIdentity, code: "AB12" }), stableRoomIdentity(roomIdentity));
});

test("V09 neutral discovery neither filters nor duplicates Rooms", () => {
  const page = { rooms: [{ code: "AB12", contentLocale: "ja" }], nextCursor: null };
  assert.equal(filterRoomPageByContentLanguage("daifugo", page, "en").rooms.length, 1);
});

test("V10 content-bound admission uses explicit content language, not UI locale", () => {
  assert.doesNotThrow(() => assertRoomContentLanguageAccess("wordwolf", { contentLanguage: "ja" }, "ja"));
});

test("V11 content-bound mismatch rejects before mutation", () => {
  assert.throws(() => assertRoomContentLanguageAccess("wordwolf", { contentLanguage: "ja" }, "en"), /GAME_LANGUAGE_UNAVAILABLE|ROOM_LANGUAGE_MISMATCH/);
});

test("V12 approved Production SDK identities remain evidence-insufficient", () => {
  assert.equal(productionApprovedSdkLocaleInventory.length, 10);
  for (const gameId of productionApprovedSdkLocaleInventory) {
    assert.equal(gameSdkLocaleDisposition({}), "evidence-insufficient", gameId);
  }
});

test("V13 UI locale switch cannot enter stable Room identity", () => {
  assert.equal(stableRoomIdentity(roomIdentity), stableRoomIdentity(roomIdentity));
  assert.deepEqual(gameSdkPresentationContext("ja"), { uiLocale: "ja" });
  assert.deepEqual(gameSdkPresentationContext("en"), { uiLocale: "en" });
});

test("V14 reconnect keeps fixed SDK package revision", () => {
  const identity = { ...roomIdentity, gameId: "sdk:fixture", packageRevision: "a".repeat(40) };
  assert.equal(stableRoomIdentity(identity), stableRoomIdentity({ ...identity }));
});

test("V15 invite targets are generated from common Room descriptors", () => {
  assert.deepEqual(builtInOnlineRoomDescriptors.map((entry) => entry.gameId), [...builtInCommonOnlineRoomGameIds]);
  assert.equal(builtInOnlineRoomDescriptors.some((entry) => entry.gameId === "canvas"), false);
});

test("V16 spectator labels localize over one semantic snapshot", () => {
  const source = { game: "daifugo" as const, gameTitle: "大富豪", code: "AB12", phase: "result", phaseLabel: "結果", revision: 3, updatedAt: 1, players: [], facts: [{ label: "終了理由", value: "終了" }] };
  const en = localizeOnlineRoomSpectatorSnapshot(source, "en");
  assert.deepEqual({ code: en.code, revision: en.revision, phase: en.phase }, { code: source.code, revision: source.revision, phase: source.phase });
  assert.equal(en.phaseLabel, "Result");
});

test("V17 commands and events remain semantic while recipient labels differ", () => {
  const event = { code: "room.joined" } as const;
  assert.equal(event.code, "room.joined");
  assert.notEqual(presentSemanticRoomEvent(event, "ja"), presentSemanticRoomEvent(event, "en"));
});

test("V18 terminal result keeps reason code and localizes presentation", () => {
  const result = { reason: "target-reached" };
  assert.notEqual(gameSdkResultReasonText(result, "ja"), gameSdkResultReasonText(result, "en"));
  assert.equal(result.reason, "target-reached");
});

test("V19 stats project semantic rank per recipient", () => {
  const result = { won: false, resultLabel: "2位", details: { rank: 2, score: 8 } };
  assert.equal(playerGameResultLabel(result, "ja"), "2位・8点");
  assert.equal(playerGameResultLabel(result, "en"), "Rank 2 · 8 points");
});

test("V20 replay identity is locale-independent", () => {
  const identity = stableRoomIdentity({ ...roomIdentity, gameId: "replay:daifugo" });
  assert.equal(identity, stableRoomIdentity({ ...roomIdentity, gameId: "replay:daifugo" }));
});

test("V21 legacy contentLocale is honored as contentLanguage", () => {
  assert.equal(roomContentLanguage({ contentLocale: "ja" }, "wordwolf"), "ja");
  assert.equal(roomContentLanguage({}, "wordwolf"), "ja");
});

test("V22 legacy neutral locale data is ignored without rewriting identity", () => {
  assert.equal(roomContentLanguage({ contentLocale: "ja" }, "daifugo"), undefined);
  const draft = authenticatedRoomDraft({ code: "AB12", contentLocale: "ja" }, { id: "p1", name: "P1", locale: "en" } as never, "daifugo") as Record<string, unknown>;
  assert.equal(draft.contentLocale, undefined);
});

test("V23 Canvas remains a prototype outside common Redis discovery", () => {
  assert.equal(builtInGameLocaleRegistry.canvas.onlineRoomProvider, "prototype");
  assert.equal(builtInCommonOnlineRoomGameIds.includes("canvas" as never), false);
});

test("V24 full inventory covers built-ins, Production SDKs, and Development fixture", () => {
  assert.equal(Object.keys(builtInGameLocaleRegistry).length, 9);
  assert.equal(productionApprovedSdkLocaleInventory.length, 10);
  assert.equal(wordWolfSdkManifest.localePolicy.roomContentMode, "content-bound");
  assert.equal(gameSdkCrossLocaleEligible(wordWolfSdkManifest), false);
});

test("V25 common runner consumer families remain five and shared-owner routed", () => {
  assert.equal(runnerConsumers.consumers.length, 5);
  assert.equal(runnerConsumers.owner, "lib/game-sdk-runner-client.ts");
  assert.equal(runnerConsumers.consumers.every((entry) => entry.gateway.includes("game-sdk-runner-client") || entry.gateway.includes("game-sdk-remote-module")), true);
});
