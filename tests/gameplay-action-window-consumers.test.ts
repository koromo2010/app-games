import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("all built-in GamePhaseTimer consumers provide Room generation and phase scope", async () => {
  const paths = [
    "app/hodoai-talk/HodoaiPlayPanels.tsx",
    "app/code-intercept/CodeInterceptDesktopLayout.tsx",
    "app/nigoichi/NigoichiDesktopLayout.tsx",
    "app/daifugo/DaifugoDesktopLayout.tsx",
    "app/northern-branch/NorthernBranchDesktopLayout.tsx",
    "app/kotoba-senpuku/KotobaSenpukuDesktopLayout.tsx",
  ];
  for (const path of paths) {
    const source = await read(path);
    const timers = source.match(/<GamePhaseTimer\b[^>]*\/>/g) ?? [];
    assert.ok(timers.length > 0, `${path}: timer consumer exists`);
    for (const timer of timers) {
      assert.match(timer, /scope=\{\{/u, `${path}: scoped action window`);
      assert.match(timer, /roomCode:/u, `${path}: Room scoped`);
      assert.match(timer, /generation:/u, `${path}: generation scoped`);
      assert.match(timer, /phase:/u, `${path}: phase scoped`);
    }
  }
});

test("deadline consumers do not calculate action windows from device Date.now or duplicate synchronizedNow scheduling", async () => {
  const paths = [
    "app/wordwolf/use-wordwolf-phase-clock.ts",
    "app/tahoiya/use-tahoiya-controller.ts",
    "app/hodoai-talk/HodoaiPlayPanels.tsx",
    "app/nigoichi/use-nigoichi-controller.ts",
    "app/code-intercept/use-code-intercept-controller.ts",
    "app/kotoba-senpuku/use-kotoba-senpuku-controller.ts",
    "app/northern-branch/use-northern-branch-controller.ts",
    "app/components/GamePhaseTimer.tsx",
    "app/components/game-sdk/GameSdkIframeBridge.tsx",
    "app/sdk-games/[gameId]/ApprovedSdkGameShell.tsx",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.doesNotMatch(source, /synchronizedNow\s*\(/u, `${path}: shared hook owns projection`);
  }
  assert.doesNotMatch(await read("app/wordwolf/use-wordwolf-phase-clock.ts"), /Date\.now\s*\(/u);
  const legacyPreview = await read("app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewGameShell.tsx");
  assert.match(legacyPreview, /function previewNow\(\)[\s\S]*?getServerClockSnapshot\(\)/u);
  assert.doesNotMatch(legacyPreview, /function previewNow\(\)\s*\{\s*return Date\.now\(\)/u);
});

test("WordWolf clue/vote/guess share at-most-once dispatch and terminal authoritative expiry", async () => {
  const actions = await read("app/wordwolf/use-wordwolf-game-actions.ts");
  for (const key of ["submit-clue", "cast-vote", "submit-wolf-guess"]) {
    assert.match(actions, new RegExp("actionKey: `" + key + ":"), `${key}: stable dispatch key`);
  }
  assert.match(actions, /dispatchManual\s*\(/u);
  assert.match(actions, /wordWolfCommandErrorDisposition/u);
  const client = await read("app/wordwolf/wordwolf-room-api-client.ts");
  assert.match(client, /WORDWOLF_COMMAND_AFTER_DEADLINE/u);
  assert.match(client, /authoritative-expired/u);
  const route = await read("app/api/wordwolf/commands/route.ts");
  assert.match(route, /errorCode: error\.message/u);
});

test("entered draft adoption and matching manual action share the common dispatch gate", async () => {
  const consumers = [
    ["app/hodoai-talk/HodoaiPlayPanels.tsx", "submit-timeout-clues"],
    ["app/nigoichi/use-nigoichi-controller.ts", "submit-timeout-associations"],
    ["app/code-intercept/use-code-intercept-controller.ts", "submit-timeout-clues"],
    ["app/kotoba-senpuku/use-kotoba-senpuku-controller.ts", "challenge-word"],
    ["app/tahoiya/use-tahoiya-game-actions.ts", "submit-definition"],
  ] as const;
  for (const [path, timeoutAction] of consumers) {
    const source = await read(path);
    assert.match(source, /dispatchManual\s*\(/u, `${path}: common at-most-once gate`);
    assert.match(source, new RegExp(timeoutAction), `${path}: migrated draft/manual consumer`);
  }
});

test("inventory covers every registered built-in game plus common and SDK surfaces", async () => {
  const registry = JSON.parse(await read("config/game-registry.json")) as Array<{ id: string }>;
  const inventory = await read("docs/GAMEPLAY_ACTION_WINDOW.md");
  for (const game of registry) {
    const label = game.id === "hodoai"
      ? "Word Scale"
      : game.id === "kotoba-senpuku"
        ? "Word Sonar"
        : game.id === "nigoichi"
          ? "Word Out"
          : game.id === "northern-branch"
            ? "Northern Branch"
            : game.id === "code-intercept"
              ? "Code Intercept"
              : game.id === "daifugo"
                ? "Daifugo"
                : game.id === "wordwolf"
                  ? "WordWolf"
                  : game.id === "tahoiya"
                    ? "Tahoiya"
                    : "Canvas";
    assert.match(inventory, new RegExp(`\\| ${label}`), `${game.id}: inventoried`);
  }
  assert.match(inventory, /SDK Frame \/ Preview Frame/u);
  assert.match(inventory, /Approved SDK shell/u);
  assert.match(inventory, /Legacy SDK authoring Preview shell/u);
  assert.match(inventory, /Common built-in Room timer/u);
});
