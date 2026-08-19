import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_SDK_MODULE_CATALOG,
  createInitialGameSdkModuleProfile,
  updateGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import { validateGameSdkModuleUsage } from "@game-fields/game-sdk/module-usage";
import {
  gameSdkModuleContractDigest,
  bindGamePackageAuthoringManifest,
  sharedGameSourceSha256,
} from "../apps/sdk-portal/lib/module-authoring-contract.ts";

const binding = {
  environment: "development" as const,
  moduleProfileRevision: "11111111-1111-4111-8111-111111111111",
  moduleContractDigest: "a".repeat(64),
  sdkPackageVersion: "0.2.0",
  sdkContractVersion: 2,
};

function definition(id: typeof GAME_SDK_MODULE_CATALOG[number]["id"]) {
  return GAME_SDK_MODULE_CATALOG.find((item) => item.id === id)!;
}

function cardSource() {
  return `
import {
  createStandardPlayingCardDeck,
  shufflePlayingCards,
  dealPlayingCardsRoundRobin,
  presentPlayingCardHands,
} from "@game-fields/game-sdk/playing-cards";
import {
  PlayingCardView,
  PlayingCardHand,
  PlayingCardBackStack,
} from "@game-fields/game-sdk/playing-cards-react";
declare function moduleRuntimeEvidence(value: string): void;
const deck = createStandardPlayingCardDeck();
const shuffled = shufflePlayingCards(deck, () => 0);
const dealt = dealPlayingCardsRoundRobin(shuffled, ["a", "b"]);
const presented = presentPlayingCardHands(dealt.hands, "a");
export const BabaCardTable = () => <main>
  <PlayingCardView card={presented.a.cards?.[0]} />
  <PlayingCardHand cards={presented.a.cards ?? []} />
  <PlayingCardBackStack count={dealt.stock.length} />
</main>;
moduleRuntimeEvidence("baba-playing-cards");
`;
}

function playingCardsFixture(source = cardSource()) {
  const cards = definition("playing-cards");
  return {
    contract: {
      ...binding,
      requiredModuleIds: [cards.id],
      disabledModuleIds: [],
      requiredModules: [cards],
      disabledModules: [],
    },
    binding,
    moduleUsage: [{
      id: cards.id,
      delivery: cards.delivery,
      status: "used",
      packageExportsUsed: [...cards.packageExports],
      publicApisUsed: [...cards.publicApis],
      sourcePaths: ["source/game-client.tsx"],
      runtimeEvidence: ["baba-playing-cards"],
      nonReimplementationEvidence: ["SDK deck helpers and React card components are imported directly."],
    }],
    files: { "source/game-client.tsx": source },
  };
}

test("Baba-style card source passes only with SDK card data and React UI APIs", () => {
  const audit = validateGameSdkModuleUsage(playingCardsFixture());
  assert.deepEqual(audit.requiredModuleIds, ["playing-cards"]);
  assert.deepEqual(audit.moduleUsage[0]?.packageExportsUsed, [
    "@game-fields/game-sdk/playing-cards",
    "@game-fields/game-sdk/playing-cards-react",
  ]);
});

test("Baba-style source binds required turn, secret and outcome helpers with cards", () => {
  const definitions = [
    definition("playing-cards"),
    definition("turn-order"),
    definition("secret-presentation"),
    definition("standard-outcome"),
  ];
  const source = `${cardSource()}
import {
  nextGameSdkEligibleSeat,
  gameSdkPlayerSeat,
  gameSdkPlayerSeats,
  defineGameSdkStandardResult,
} from "@game-fields/game-sdk/modules";
const players = [{ id: "baba" }, { id: "child" }];
export const currentSeat = gameSdkPlayerSeat(players, "baba");
export const visibleSeats = gameSdkPlayerSeats(players, ["baba"]);
export const nextSeat = nextGameSdkEligibleSeat(players.map((player) => player.id), currentSeat);
export const result = defineGameSdkStandardResult({
  winnerIds: ["baba"],
  rankings: [
    { participantId: "baba", rank: 1, score: 1 },
    { participantId: "child", rank: 2, score: 0 },
  ],
  reason: "first-empty-hand",
}, { participantIds: ["baba", "child"] });
moduleRuntimeEvidence("baba-turn-order");
moduleRuntimeEvidence("baba-secret-presentation");
moduleRuntimeEvidence("baba-standard-outcome");`;
  const evidenceById = {
    "playing-cards": {
      packageExportsUsed: [...definitions[0]!.packageExports],
      publicApisUsed: [...definitions[0]!.publicApis],
      runtimeEvidence: ["baba-playing-cards"],
    },
    "turn-order": {
      packageExportsUsed: [...definitions[1]!.packageExports],
      publicApisUsed: [...definitions[1]!.publicApis],
      runtimeEvidence: ["baba-turn-order"],
    },
    "secret-presentation": {
      packageExportsUsed: [...definitions[2]!.packageExports],
      publicApisUsed: [...definitions[2]!.publicApis],
      runtimeEvidence: ["baba-secret-presentation"],
    },
    "standard-outcome": {
      packageExportsUsed: [...definitions[3]!.packageExports],
      publicApisUsed: [...definitions[3]!.publicApis],
      runtimeEvidence: ["baba-standard-outcome"],
    },
  } as const;
  const audit = validateGameSdkModuleUsage({
    contract: {
      ...binding,
      requiredModuleIds: definitions.map((item) => item.id),
      disabledModuleIds: [],
      requiredModules: definitions,
      disabledModules: [],
    },
    binding,
    moduleUsage: definitions.map((item) => ({
      id: item.id,
      delivery: item.delivery,
      status: "used",
      ...evidenceById[item.id as keyof typeof evidenceById],
      sourcePaths: ["source/game-client.tsx"],
      nonReimplementationEvidence: [`official-sdk:${item.id}`],
    })),
    files: { "source/game-client.tsx": source },
  });
  assert.deepEqual(audit.requiredModuleIds, definitions.map((item) => item.id));
});

test("module usage gate rejects missing imports, unused APIs, runtime evidence and bespoke cards", () => {
  assert.throws(() => validateGameSdkModuleUsage(playingCardsFixture(
    cardSource().replace(/import \{[\s\S]*?\} from "@game-fields\/game-sdk\/playing-cards-react";/, ""),
  )), /REQUIRED_SDK_MODULE_IMPORT_MISSING:playing-cards/);
  assert.throws(() => validateGameSdkModuleUsage(playingCardsFixture(
    cardSource().replace("shufflePlayingCards(deck, () => 0)", "deck.slice()"),
  )), /REQUIRED_MODULE_API_UNUSED:playing-cards:shufflePlayingCards/);
  assert.throws(() => validateGameSdkModuleUsage(playingCardsFixture(
    cardSource().replace('moduleRuntimeEvidence("baba-playing-cards");', ""),
  )), /REQUIRED_MODULE_RUNTIME_EVIDENCE_MISSING:playing-cards/);
  assert.throws(() => validateGameSdkModuleUsage(playingCardsFixture(
    `${cardSource()}\ntype PlayingCard = { rank: string };`,
  )), /BESPOKE_RESOURCE_REIMPLEMENTATION:playing-cards/);
});

test("platform resources reject direct external access and platform-owned modules require exact delegation", () => {
  const content = definition("content-source");
  assert.throws(() => validateGameSdkModuleUsage({
    contract: {
      ...binding,
      requiredModuleIds: [content.id],
      disabledModuleIds: [],
      requiredModules: [content],
      disabledModules: [],
    },
    binding,
    moduleUsage: [{
      id: content.id,
      delivery: content.delivery,
      status: "used",
      packageExportsUsed: [...content.packageExports],
      publicApisUsed: ["GameSdkContentSource.drawWords"],
      sourcePaths: ["source/app-set.ts"],
      runtimeEvidence: ["content-draw"],
      nonReimplementationEvidence: ["Injected interface only."],
    }],
    files: {
      "source/app-set.ts": `import type { GameSdkContentSource } from "@game-fields/game-sdk/content-source";
declare function moduleRuntimeEvidence(value: string): void;
export const draw = (source: GameSdkContentSource) => source.drawWords({ count: 1 });
moduleRuntimeEvidence("content-draw");
fetch("https://example.test/words");`,
    },
  }), /BESPOKE_RESOURCE_REIMPLEMENTATION:content-source:direct-external-access/);

  const authentication = definition("authentication");
  const delegated = {
    contract: {
      ...binding,
      requiredModuleIds: [authentication.id],
      disabledModuleIds: [],
      requiredModules: [authentication],
      disabledModules: [],
    },
    binding,
    moduleUsage: [{
      id: authentication.id,
      delivery: authentication.delivery,
      status: "delegated-to-platform",
      packageExportsUsed: [],
      publicApisUsed: [],
      sourcePaths: ["source/app-set.ts"],
      runtimeEvidence: ["platform-host:authentication"],
      nonReimplementationEvidence: ["platform-delegation:authentication"],
    }],
    files: { "source/app-set.ts": "export const game = {};" },
  };
  assert.doesNotThrow(() => validateGameSdkModuleUsage(delegated));
  delegated.moduleUsage[0]!.nonReimplementationEvidence = ["trust me"];
  assert.throws(() => validateGameSdkModuleUsage(delegated), /PLATFORM_MODULE_REIMPLEMENTED:authentication/);
});

test("the platform-standard content source rejects bespoke external data access even when unused", () => {
  assert.throws(() => validateGameSdkModuleUsage({
    contract: {
      ...binding,
      requiredModuleIds: [],
      availableModuleIds: ["content-source"],
      disabledModuleIds: [],
      requiredModules: [],
      availableModules: [definition("content-source")],
      disabledModules: [],
    },
    binding,
    moduleUsage: [],
    files: {
      "source/app-set.ts": 'export const loadWords = () => fetch("https://example.test/words");',
    },
  }), /BESPOKE_RESOURCE_REIMPLEMENTATION:content-source:direct-external-access/);
});

test("disabled modules and bespoke SDK-helper replacements fail closed", () => {
  const vote = definition("vote");
  assert.throws(() => validateGameSdkModuleUsage({
    contract: {
      ...binding,
      requiredModuleIds: [],
      disabledModuleIds: [vote.id],
      requiredModules: [],
      disabledModules: [vote],
    },
    binding,
    moduleUsage: [],
    files: {
      "source/app-set.ts": 'import { recordGameSdkVote } from "@game-fields/game-sdk/modules";\nvoid recordGameSdkVote;',
    },
  }), /DISABLED_MODULE_USED:vote/);

  const turn = definition("turn-order");
  assert.doesNotThrow(() => validateGameSdkModuleUsage({
    contract: {
      ...binding,
      requiredModuleIds: [turn.id],
      disabledModuleIds: [vote.id],
      requiredModules: [turn],
      disabledModules: [vote],
    },
    binding,
    moduleUsage: [{
      id: turn.id,
      delivery: turn.delivery,
      status: "used",
      packageExportsUsed: [...turn.packageExports],
      publicApisUsed: [...turn.publicApis],
      sourcePaths: ["source/app-set.ts"],
      runtimeEvidence: ["turn-order"],
      nonReimplementationEvidence: ["official-sdk:turn-order"],
    }],
    files: {
      "source/app-set.ts": `import { nextGameSdkEligibleSeat } from "@game-fields/game-sdk/modules";
declare function moduleRuntimeEvidence(value: string): void;
void nextGameSdkEligibleSeat([], -1);
moduleRuntimeEvidence("turn-order");`,
    },
  }));

  assert.throws(() => validateGameSdkModuleUsage({
    contract: {
      ...binding,
      requiredModuleIds: [turn.id],
      disabledModuleIds: [],
      requiredModules: [turn],
      disabledModules: [],
    },
    binding,
    moduleUsage: [{
      id: turn.id,
      delivery: turn.delivery,
      status: "used",
      packageExportsUsed: [...turn.packageExports],
      publicApisUsed: [...turn.publicApis],
      sourcePaths: ["source/app-set.ts"],
      runtimeEvidence: ["turn-order"],
      nonReimplementationEvidence: ["official-sdk:turn-order"],
    }],
    files: {
      "source/app-set.ts": `import { nextGameSdkEligibleSeat } from "@game-fields/game-sdk/modules";
declare function moduleRuntimeEvidence(value: string): void;
void nextGameSdkEligibleSeat([], -1);
function nextTurn() { return 0; }
moduleRuntimeEvidence("turn-order");`,
    },
  }), /BESPOKE_RESOURCE_REIMPLEMENTATION:turn-order/);
});

test("module contract and shared source digests change on semantic boundaries", () => {
  const initial = createInitialGameSdkModuleProfile();
  const reviewed = updateGameSdkModuleProfile(initial, {
    vote: { mode: "disabled" },
  });
  const stable = gameSdkModuleContractDigest({
    moduleProfile: initial,
    environment: "production",
  });
  assert.equal(stable, gameSdkModuleContractDigest({
    moduleProfile: initial,
    environment: "production",
  }));
  assert.notEqual(stable, gameSdkModuleContractDigest({
    moduleProfile: reviewed,
    environment: "production",
  }));
  assert.notEqual(stable, gameSdkModuleContractDigest({
    moduleProfile: initial,
    environment: "development",
  }));
  assert.notEqual(
    sharedGameSourceSha256({ "source/a.ts": "export const a = 1;" }),
    sharedGameSourceSha256({ "source/a.ts": "export const a = 2;" }),
  );
});

test("formal package manifest receives the exact approved authoring binding", () => {
  const files = bindGamePackageAuthoringManifest([{
    path: "game-fields-package.json",
    encoding: "utf-8",
    content: '{"schemaVersion":1,"gameId":"baba"}',
  }], {
    environment: binding.environment,
    moduleProfileRevision: binding.moduleProfileRevision,
    moduleContractDigest: binding.moduleContractDigest,
    prototypeRevision: "b".repeat(40),
    sharedSourceSha256: "c".repeat(64),
  });
  const manifest = JSON.parse((files[0] as { content: string }).content);
  assert.equal(manifest.authoring.moduleProfileRevision, binding.moduleProfileRevision);
  assert.equal(manifest.authoring.prototypeRevision, "b".repeat(40));
});
