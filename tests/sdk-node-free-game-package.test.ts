import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildNodeFreeGamePackage } from "../apps/sdk-portal/lib/node-free-game-package.ts";
import { myFirstGameManifest } from "../sdk/starter-template/src/manifest.ts";

function starterFiles() {
  const files = [
    "index.html",
    "styles.css",
    "mock.js",
    "preview.json",
    "source/app-set.ts",
    "source/contracts.ts",
    "source/manifest.ts",
    "source/server-module.ts",
    "source/game-client.tsx",
    "source/prototype-adapter.ts",
  ];
  return Object.fromEntries(files.map((file) => {
    const source = file.startsWith("source/")
      ? `sdk/starter-template/src/${file.slice("source/".length)}`
      : `sdk/starter-template/mock/${file}`;
    return [file, readFileSync(source, "utf8")];
  }));
}

const moduleBinding = {
  environment: "development" as const,
  moduleProfileRevision: "11111111-1111-4111-8111-111111111111",
  moduleContractDigest: "a".repeat(64),
  sdkPackageVersion: "0.2.0",
  sdkContractVersion: 2,
};

test("Node-free builder creates a hash-pinned package from starter source", async () => {
  const files = await buildNodeFreeGamePackage({
    gameId: "my-first-game",
    manifest: myFirstGameManifest,
    files: starterFiles(),
    moduleBinding,
  });
  const paths = new Set(files.map((file) => file.path));
  assert.equal(paths.has("server.bundle.js"), true);
  assert.equal(paths.has("game-fields-package.json"), true);
  const manifest = JSON.parse(files.find((file) => file.path === "game-fields-package.json")!.content);
  assert.match(manifest.server.bundleSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.server.appSetSourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.authoring.moduleProfileRevision, moduleBinding.moduleProfileRevision);
  assert.match(manifest.authoring.sharedSourceSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(files.prototypeFiles["mock.js"], files.find((file) => file.path === "mock.js")?.content);
});

test("Node-free builder rejects creator imports outside the public SDK", async () => {
  const files = starterFiles();
  files["source/server-module.ts"] = 'import "node:fs";\n' + files["source/server-module.ts"];
  await assert.rejects(buildNodeFreeGamePackage({
    gameId: "my-first-game",
    manifest: myFirstGameManifest,
    files,
    moduleBinding,
  }), /GAME_SDK_NODE_FREE_IMPORT_FORBIDDEN/);
});

test("Node-free builder bundles a card game using SDK data helpers and React card UI", async () => {
  const files = starterFiles();
  files["source/game-client.tsx"] = `
import { createRoot } from "react-dom/client";
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
export function mountGameClient(adapter: unknown) {
  void adapter;
  const root = document.querySelector("[data-game-slot]");
  if (!root) throw new Error("CARD_ROOT_REQUIRED");
  const deck = createStandardPlayingCardDeck();
  const shuffled = shufflePlayingCards(deck, () => 0);
  const dealt = dealPlayingCardsRoundRobin(shuffled, ["baba", "child"], { cardsPerPlayer: 5 });
  const visible = presentPlayingCardHands(dealt.hands, "baba");
  createRoot(root).render(<section>
    <PlayingCardView card={visible.baba.cards?.[0]} />
    <PlayingCardHand cards={visible.baba.cards ?? []} />
    <PlayingCardBackStack count={dealt.stock.length} />
  </section>);
}`;
  const built = await buildNodeFreeGamePackage({
    gameId: "my-first-game",
    manifest: myFirstGameManifest,
    files,
    moduleBinding,
  });
  assert.ok(built.prototypeFiles["mock.js"]?.includes("CARD_ROOT_REQUIRED"));
  assert.ok(built.find((file) => file.path === "mock.js")?.content.includes("CARD_ROOT_REQUIRED"));
});
