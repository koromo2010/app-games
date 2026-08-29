import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gameFieldsPackageRootSha256 } from "../packages/sdk-runtime-artifact/src/index.ts";
import { myFirstGameManifest } from "../sdk/starter-template/src/manifest.ts";
import { buildNodeFreeGamePackage } from "../apps/sdk-portal/lib/node-free-game-package.ts";
import {
  convertT131A4LegacyMockManifest,
  normalizeT131A4LegacyMock,
  t131A4AuthoringMockAdapterVersion,
} from "../apps/sdk-portal/lib/creator-authoring-state-legacy-mock-adapter.ts";
import {
  createT131A4WorkspaceInventory,
  defaultT131A4RuntimeSmoke,
  prepareT131A4AuthoringStateReconstruction,
  reconstructT131A4AuthoringStateFromVerifiedEntries,
  type T131A4GameInventory,
  type T131A4RuntimeSmoke,
} from "../apps/sdk-portal/lib/creator-authoring-state-reconstruction.ts";
import {
  classifyT131A4Locator,
  classifyT131A4NormalizedMock,
  type T131A4ArtifactLocator,
  type T131A4Target,
} from "../apps/sdk-portal/lib/creator-artifact-reconstruction.ts";

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function blobSha(value: Uint8Array) {
  const bytes = Buffer.from(value);
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function mockFiles(gameId: string) {
  const html = `<!doctype html><main data-game-slot>
    <h1>Local reconstructed game with enough visible authoring-state content for validation</h1>
    <section id="state-playing"><div id="board-area"></div><div id="score-area"></div>
    <div id="turn-area"></div><div id="result-area"></div></section>
    <section id="state-complete"><div id="count-updated">0</div></section>
    <button id="action-button">Act</button><button id="reset-button">Reset</button>
    <span id="increment-action"></span><span id="reset-action"></span>
    <span id="loop-start"></span><span id="loop-act"></span><span id="loop-result"></span>
  </main><script src="./mock.js"></script>`;
  const script = [
    "const result=document.getElementById('count-updated');",
    "document.getElementById('action-button').addEventListener('click',()=>{result.textContent='1'});",
    "document.getElementById('reset-button').addEventListener('click',()=>{result.textContent='0'});",
  ].join("\n");
  const preview = {
    gameId,
    title: "Fixture",
    reviewEvidence: {
      representativeStates: [
        { id: "state-playing", role: "in-progress", label: "Playing" },
        { id: "state-complete", role: "completion", label: "Complete" },
      ],
      visibleGameSpecificElements: ["board-area", "score-area", "turn-area", "result-area"],
      primaryActions: [{
        id: "increment-action",
        targetId: "action-button",
        observableResultId: "count-updated",
      }],
      completionState: { stateId: "state-complete", visibleResultIds: ["count-updated"] },
      mockOnlyDataSource: "mock-local-state",
      coreLoopSequence: ["loop-start", "loop-act", "loop-result"],
      resetAction: {
        id: "reset-action",
        targetId: "reset-button",
        observableResultId: "count-updated",
      },
    },
  };
  return new Map<string, Buffer>([
    ["index.html", Buffer.from(html)],
    ["styles.css", Buffer.from("main{display:block}")],
    ["mock.js", Buffer.from(script)],
    ["preview.json", Buffer.from(`${JSON.stringify(preview)}\n`)],
  ]);
}

function packageFiles(gameId: string) {
  const server = Buffer.from("globalThis.GameFieldsServerBundle={protocolVersion:1,async invoke(){return JSON.stringify({ok:false,error:'FIXTURE_ONLY'})}};");
  const appSet = Buffer.from("export const appSet = {};\n");
  const gameManifest = {
    id: gameId,
    sdkVersion: 2,
    title: { ja: "Fixture", en: "Fixture" },
    playMode: "online-room",
    minimumPlayers: 1,
    maximumPlayers: 4,
    supportsDebug: false,
    supportsSpectators: false,
    supportsReplay: false,
    supportsRating: false,
    usesLlm: false,
    settings: [{
      key: "timeLimitSeconds",
      label: { ja: "制限時間", en: "Time limit" },
      type: "select",
      defaultValue: 60,
      platformRole: "time-limit",
      options: [0, 60],
    }],
  };
  const packageManifest = {
    schemaVersion: 1,
    gameId,
    sdkPackageVersion: "0.2.0",
    sdkContractVersion: 2,
    manifest: gameManifest,
    client: { entry: "index.html" },
    server: {
      entry: "server.bundle.js",
      bundleSha256: sha256(server),
      appSetSource: "source/app-set.ts",
      appSetSourceSha256: sha256(appSet),
    },
  };
  return {
    gameManifest,
    files: new Map<string, Buffer>([
      ["game-fields-package.json", Buffer.from(`${JSON.stringify(packageManifest)}\n`)],
      ["index.html", Buffer.from("<!doctype html><main data-game-slot>Fixture package client</main><script src=\"./mock.js\"></script>")],
      ["mock.js", Buffer.from("globalThis.packageClientBooted=true;")],
      ["server.bundle.js", server],
      ["source/app-set.ts", appSet],
    ]),
  };
}

type LocatorFixture = {
  target: T131A4Target;
  kind: "mock" | "package";
  gameId: string;
  revision: string;
  treeSha: string;
  files: Map<string, Buffer>;
};

function archiveLocator(input: LocatorFixture) {
  const sourcePrefix = input.kind === "mock"
    ? `previews/${input.target}/${input.gameId}/mock/`
    : `packages/${input.target}/${input.gameId}/bundle/`;
  return {
    target: input.target,
    kind: input.kind,
    gameId: input.gameId,
    revision: input.revision,
    references: [input.kind === "mock" ? "sdk_games.mock_revision" : "sdk_games.package_revision"],
    commitSha: input.revision,
    treeSha: input.treeSha,
    sourcePrefix,
    files: [...input.files].map(([path, content]) => ({
      sourcePath: `${sourcePrefix}${path}`,
      archivePath: `git-artifacts/${input.target}/${input.revision}/${input.kind}/${input.gameId}/${path}`,
      mode: "100644",
      bytes: content.byteLength,
      blobSha: blobSha(content),
      contentSha256: sha256(content),
    })),
  };
}

function materializedPackageLocator(
  files: ReadonlyMap<string, Buffer>,
  revision = "4".repeat(40),
): T131A4ArtifactLocator {
  const target = "moi-lab2";
  const gameId = "rebuild-fixture";
  const sourcePrefix = `packages/${target}/${gameId}/bundle/`;
  return {
    target,
    kind: "package",
    gameId,
    originalRevision: revision,
    originalTreeSha: "c".repeat(40),
    sourcePrefix,
    references: ["sdk_games.package_revision"],
    files: [...files].map(([path, content]) => ({
      path,
      sourcePath: `${sourcePrefix}${path}`,
      archivePath: `git-artifacts/${target}/${revision}/package/${gameId}/${path}`,
      mode: "100644",
      bytes: content.byteLength,
      blobSha: blobSha(content),
      contentSha256: sha256(content),
      content,
    })),
  };
}

function materializedLegacyRockPaperScissorsLocator() {
  const target = "moi-lab2" as const;
  const gameId = "rock-paper-scissors";
  const revision = "2168e8954c1cc0e6664d5e38b4b878e797cd7ff0";
  const inlineAsset = Buffer.from("exact-a0-inline-asset");
  const files = new Map<string, Buffer>([
    ["index.html", Buffer.from(`<!doctype html><main>
      <section data-choice-area><button data-choice="rock">Rock</button></section>
      <p data-game-status>Ready</p><div data-celebration>Result</div>
      <div data-player-hand></div><div data-ai-hand></div>
      <div data-history></div><div data-round></div>
      <img src="data:image/png;base64,${inlineAsset.toString("base64")}">
      <script src="./mock.js"></script>
    </main>`)],
    ["styles.css", Buffer.from(`@import url("https://fonts.googleapis.com/css2?family=Fixture");
main{display:block;background-image:url(data:image/png;base64,${inlineAsset.toString("base64")})}
`)],
    ["mock.js", Buffer.from("document.querySelector('[data-choice=\\\"rock\\\"]').addEventListener('click',()=>{document.querySelector('[data-game-status]').textContent='Rock selected';window.GameFieldsRoom.send({type:'choose',choice:'rock'})});\n")],
    ["preview.json", Buffer.from(`${JSON.stringify({ gameId, title: "じゃんけん" })}\n`)],
  ]);
  const sourcePrefix = `previews/${target}/${gameId}/mock/`;
  const locator: T131A4ArtifactLocator = {
    target,
    kind: "mock",
    gameId,
    originalRevision: revision,
    originalTreeSha: "a".repeat(40),
    sourcePrefix,
    references: ["sdk_games.mock_revision"],
    files: [...files].map(([path, content]) => ({
      path,
      sourcePath: `${sourcePrefix}${path}`,
      archivePath: `git-artifacts/${target}/${revision}/mock/${gameId}/${path}`,
      mode: "100644",
      bytes: content.byteLength,
      blobSha: blobSha(content),
      contentSha256: sha256(content),
      content,
    })),
  };
  return { locator, files, inlineAsset };
}

function addJson(entries: Array<{ name: string; content: Buffer }>, name: string, value: unknown) {
  entries.push({ name, content: Buffer.from(`${JSON.stringify(value)}\n`) });
}

function fixtureEntries() {
  const definitions = [
    {
      target: "moi-lab2" as const,
      creatorId: "creator-moi",
      games: [
        { rowId: "row-moi-one", gameId: "moi-one", kind: "mock" as const, revision: "1".repeat(40) },
        { rowId: "row-moi-two", gameId: "moi-two", kind: "package" as const, revision: "2".repeat(40) },
      ],
    },
    {
      target: "yabobojpn-lab" as const,
      creatorId: "creator-yabo",
      games: [
        { rowId: "row-yabo-one", gameId: "yabo-one", kind: "package" as const, revision: "3".repeat(40) },
      ],
    },
  ];
  const entries: Array<{ name: string; content: Buffer }> = [];
  for (const definition of definitions) {
    const locators: ReturnType<typeof archiveLocator>[] = [];
    const gameRows: Record<string, unknown>[] = [];
    const packageRows: Record<string, unknown>[] = [];
    for (const game of definition.games) {
      const packageValue = packageFiles(game.gameId);
      const files = game.kind === "mock" ? mockFiles(game.gameId) : packageValue.files;
      const locator = archiveLocator({
        target: definition.target,
        kind: game.kind,
        gameId: game.gameId,
        revision: game.revision,
        treeSha: game.kind === "mock" ? "a".repeat(40) : "b".repeat(40),
        files,
      });
      locators.push(locator);
      for (const file of locator.files) {
        entries.push({ name: file.archivePath, content: files.get(file.sourcePath.slice(locator.sourcePrefix.length))! });
      }
      gameRows.push({
        id: game.rowId,
        creator_id: definition.creatorId,
        game_id: game.gameId,
        title: `${game.gameId} title`,
        description: "fixture",
        manifest: packageValue.gameManifest,
        module_policy: {},
        sdk_package_version: "0.2.0",
        sdk_contract_version: 2,
        status: "draft",
        mock_revision: game.kind === "mock" ? game.revision : null,
        mock_approved_revision: null,
        package_revision: game.kind === "package" ? game.revision : null,
        development_revision: null,
        stable_revision: null,
      });
      if (game.kind === "package") {
        const runtimeFiles = [...files].map(([path, content]) => ({ path, content }));
        packageRows.push({
          game_id: game.rowId,
          revision: game.revision,
          package_root_sha256: gameFieldsPackageRootSha256(runtimeFiles),
          server_bundle_sha256: sha256(files.get("server.bundle.js")!),
          app_set_source_sha256: sha256(files.get("source/app-set.ts")!),
          manifest: packageValue.gameManifest,
          sdk_package_version: "0.2.0",
          sdk_contract_version: 2,
          prototype_revision: null,
        });
      }
    }
    const fileCount = locators.reduce((total, locator) => total + locator.files.length, 0);
    addJson(entries, `git-artifacts/${definition.target}/manifest.json`, {
      formatVersion: 1,
      target: definition.target,
      status: "COMPLETE",
      locatorCount: locators.length,
      presentCount: locators.length,
      missingCount: 0,
      unavailableCount: 0,
      fileCount,
      locators,
    });
    addJson(entries, `db/${definition.target}/sdk_creators.json`, [{
      id: definition.creatorId,
      slug: definition.target,
      display_name: `${definition.target} fixture`,
      owner_player_id: definition.target === "moi-lab2" ? null : "owner-yabo",
    }]);
    addJson(entries, `db/${definition.target}/sdk_games.json`, gameRows);
    addJson(entries, `db/${definition.target}/sdk_game_package_revisions.json`, packageRows);
    addJson(entries, `db/${definition.target}/sdk_app_releases.json`, []);
  }
  return entries;
}

const passSmoke: T131A4RuntimeSmoke = async ({ game }) => ({
  manifestValidation: "PASS",
  clientBoot: "PASS",
  serverInitialization: game.head?.kind === "package" ? "PASS" : "NOT_REQUIRED",
  basicInteraction: "PASS",
  statePresentationReconciliation: game.head?.kind === "package" ? "PASS" : "NOT_REQUIRED",
  requiredAssets: "PASS",
  networkDependency: "NONE",
  blockerCodes: [],
});

test("inventory accounts for every game exactly once across both creators", () => {
  const inventory = createT131A4WorkspaceInventory(fixtureEntries());
  assert.deepEqual(inventory.map(({ target }) => target), ["moi-lab2", "yabobojpn-lab"]);
  assert.deepEqual(inventory.map(({ games }) => games.length), [2, 1]);
  assert.deepEqual(
    inventory.flatMap(({ games }) => games.map(({ gameId }) => gameId)),
    ["moi-one", "moi-two", "yabo-one"],
  );
  assert.equal(inventory.flatMap(({ games }) => games).every(({ blockerCodes }) => blockerCodes.length === 0), true);
});

test("two private workspace bundles require all games, not representative success", async () => {
  const entries = fixtureEntries();
  const releases = entries.find(({ name }) => name === "db/moi-lab2/sdk_app_releases.json")!;
  releases.content = Buffer.from(`${JSON.stringify([{
    id: "release-moi-one",
    lineage_id: "moi-lab2/moi-one",
    public_game_id: "public-moi-one",
    source_creator_slug: "moi-lab2",
    source_game_id: "moi-one",
    revision: "6".repeat(40),
    package_root_sha256: "a".repeat(64),
    server_bundle_sha256: "b".repeat(64),
    app_set_source_sha256: "c".repeat(64),
    source_environment: "production",
    release_kind: "stable",
    restored_from: null,
    is_current: true,
    source_revision: "6".repeat(40),
  }])}\n`);
  const result = await reconstructT131A4AuthoringStateFromVerifiedEntries({
    entries,
    archiveCommitment: { bytes: 12345, sha256: "f".repeat(64) },
    runtimeSmoke: passSmoke,
  });
  assert.equal(result.aggregateLedger.gameCount, 3);
  assert.equal(result.aggregateLedger.readyGameCount, 3);
  assert.equal(result.aggregateLedger.blockedGameCount, 0);
  assert.equal(result.aggregateLedger.state, "LOCAL_TWO_CLIENT_AUTHORING_STATE_RECONSTRUCTION_READY");
  assert.deepEqual(result.workspaces.map(({ gameLedger }) => gameLedger.length), [2, 1]);
  assert.equal(JSON.stringify(result.aggregateLedger).includes("title"), false);
  assert.equal(JSON.stringify(result.aggregateLedger).includes("owner-yabo"), false);
  assert.equal(result.workspaces[0].archive.includes(Buffer.from("release-moi-one")), true);
  assert.equal(result.aggregateLedgerBytes.includes(Buffer.from("release-moi-one")), false);
});

test("one blocked game preserves ready outputs and forces supervisor decision", async () => {
  const entries = fixtureEntries();
  const gameEntry = entries.find(({ name }) => name === "db/moi-lab2/sdk_games.json")!;
  const games = JSON.parse(gameEntry.content.toString("utf8"));
  games[1].package_revision = "9".repeat(40);
  gameEntry.content = Buffer.from(`${JSON.stringify(games)}\n`);
  const result = await reconstructT131A4AuthoringStateFromVerifiedEntries({
    entries,
    archiveCommitment: { bytes: 12345, sha256: "e".repeat(64) },
    runtimeSmoke: passSmoke,
  });
  assert.equal(result.aggregateLedger.readyGameCount, 2);
  assert.equal(result.aggregateLedger.blockedGameCount, 1);
  assert.equal(result.aggregateLedger.state, "AUTHORING_STATE_RECONSTRUCTION_INCOMPLETE");
  const blocked = result.workspaces[0].gameLedger.find(({ gameId }) => gameId === "moi-two")!;
  assert.equal(blocked.reconstruction, "BLOCKED");
  assert.match(blocked.blockerCodes.join("|"), /AUTHORING_HEAD_ARTIFACT_LOCATOR/);
});

test("pointerless mock candidate remains unresolved with exact cross-evidence ledger", () => {
  const entries = fixtureEntries();
  const gameEntry = entries.find(({ name }) => name === "db/moi-lab2/sdk_games.json")!;
  const games = JSON.parse(gameEntry.content.toString("utf8"));
  games[0].mock_revision = null;
  gameEntry.content = Buffer.from(`${JSON.stringify(games)}\n`);
  const inventory = createT131A4WorkspaceInventory(entries)[0].games[0]!;
  assert.equal(inventory.head, null);
  assert.equal(inventory.headResolutionEvidence.method, "UNRESOLVED");
  assert.equal(inventory.headResolutionEvidence.selectedRevision, null);
  assert.deepEqual(
    inventory.headResolutionEvidence.candidates.map(({ revision }) => revision),
    ["1".repeat(40)],
  );
  assert.match(inventory.headResolutionEvidence.missingEvidence.join("|"), /MODULE_POLICY_TO_ARTIFACT_BINDING/);
  assert.match(inventory.blockerCodes.join("|"), /AUTHORING_HEAD_NOT_UNIQUELY_PROVEN/);
});

test("package DB hashes and manifest are authoritative evidence", async () => {
  const entries = fixtureEntries();
  const packageEntry = entries.find(({ name }) => (
    name === "db/yabobojpn-lab/sdk_game_package_revisions.json"
  ))!;
  const rows = JSON.parse(packageEntry.content.toString("utf8"));
  rows[0].server_bundle_sha256 = "0".repeat(64);
  packageEntry.content = Buffer.from(`${JSON.stringify(rows)}\n`);
  const result = await reconstructT131A4AuthoringStateFromVerifiedEntries({
    entries,
    archiveCommitment: { bytes: 12345, sha256: "d".repeat(64) },
    runtimeSmoke: passSmoke,
  });
  const game = result.workspaces[1].gameLedger[0]!;
  assert.equal(game.reconstruction, "BLOCKED");
  assert.match(game.blockerCodes.join("|"), /SERVER_BUNDLE_SHA256_EVIDENCE_MISMATCH/);
});

test("third target, incomplete manifest, and missing outer archive fail closed", async () => {
  const third = fixtureEntries();
  addJson(third, "git-artifacts/yabobo/manifest.json", {});
  assert.throws(() => createT131A4WorkspaceInventory(third), /A4_EXACT_TWO_TARGET_SELECTION_MISMATCH/);

  const incomplete = fixtureEntries();
  const manifest = incomplete.find(({ name }) => name === "git-artifacts/moi-lab2/manifest.json")!;
  const value = JSON.parse(manifest.content.toString("utf8"));
  value.status = "ARTIFACT_SOURCE_NOT_LOCATED";
  manifest.content = Buffer.from(`${JSON.stringify(value)}\n`);
  assert.throws(() => createT131A4WorkspaceInventory(incomplete), /A4_TARGET_MANIFEST_MISMATCH/);

  const unsafeGameId = fixtureEntries();
  const unsafeGames = unsafeGameId.find(({ name }) => name === "db/moi-lab2/sdk_games.json")!;
  const unsafeRows = JSON.parse(unsafeGames.content.toString("utf8"));
  unsafeRows[0].game_id = "../outside";
  unsafeGames.content = Buffer.from(`${JSON.stringify(unsafeRows)}\n`);
  assert.throws(() => createT131A4WorkspaceInventory(unsafeGameId), /A4_WORKSPACE_GAME_RELATION_INVALID/);

  await assert.rejects(
    prepareT131A4AuthoringStateReconstruction({ archive: Buffer.from("not-a0") }),
    /A4_ARCHIVE_OUTER_IDENTITY_MISMATCH/,
  );
});

test("workspace bundles are reproducible and target-isolated", async () => {
  const input = {
    archiveCommitment: { bytes: 12345, sha256: "c".repeat(64) },
    runtimeSmoke: passSmoke,
  };
  const first = await reconstructT131A4AuthoringStateFromVerifiedEntries({
    entries: fixtureEntries(),
    ...input,
  });
  const second = await reconstructT131A4AuthoringStateFromVerifiedEntries({
    entries: [...fixtureEntries()].reverse(),
    ...input,
  });
  assert.deepEqual(first.workspaces.map(({ archiveSha256 }) => archiveSha256), second.workspaces.map(({ archiveSha256 }) => archiveSha256));
  assert.equal(first.workspaces[0].archive.includes(Buffer.from("yabo-one title")), false);
  assert.equal(first.workspaces[1].archive.includes(Buffer.from("moi-one title")), false);
});

test("mock client smoke launches locally and performs one observable interaction", async () => {
  const entries = fixtureEntries();
  const inventory = createT131A4WorkspaceInventory(entries)[0].games[0]!;
  const compatibility = await classifyT131A4Locator(inventory.headLocator!);
  const smoke = await defaultT131A4RuntimeSmoke({ game: inventory, files: compatibility.files });
  assert.equal(smoke.clientBoot, "PASS");
  assert.equal(smoke.basicInteraction, "PASS");
  assert.equal(smoke.requiredAssets, "PASS");
  assert.deepEqual(smoke.blockerCodes, []);
});

test("legacy mock corrective is revision-bound, lossless, current-schema, and locally smokeable", async () => {
  const source = materializedLegacyRockPaperScissorsLocator();
  const manifestConversion = convertT131A4LegacyMockManifest({
    gameId: "rock-paper-scissors",
    title: "じゃんけん",
    description: "2〜4人",
    manifest: {
      title: "じゃんけん",
      settings: [{
        key: "timeLimitSeconds",
        label: { ja: "制限時間", en: "Time limit" },
        type: "select",
        defaultValue: 60,
        platformRole: "time-limit",
        options: [0, 60],
      }],
    },
    modulePolicy: { room: true },
    sdkContractVersion: 2,
    locator: source.locator,
  });
  assert.equal(manifestConversion.mode, "LEGACY_MANIFEST_DETERMINISTICALLY_CONVERTED");
  assert.equal(manifestConversion.currentManifest.minimumPlayers, 2);
  assert.equal(manifestConversion.currentManifest.maximumPlayers, 4);
  assert.equal(manifestConversion.evidence.converterVersion, t131A4AuthoringMockAdapterVersion);

  const normalized = normalizeT131A4LegacyMock({ locator: source.locator, manifestConversion });
  assert.ok(normalized);
  const files = new Map(normalized.files.map((file) => [file.path, file.content]));
  assert.deepEqual(files.get("legacy/mock.js"), source.files.get("mock.js"));
  const assetPath = `assets/${sha256(source.inlineAsset)}.png`;
  assert.deepEqual(files.get(assetPath), source.inlineAsset);
  assert.doesNotMatch(files.get("index.html")!.toString("utf8"), /data:image\/png;base64/);
  assert.doesNotMatch(files.get("styles.css")!.toString("utf8"), /data:image\/png;base64/);
  assert.doesNotMatch(files.get("styles.css")!.toString("utf8"), /https:\/\/fonts\./);
  const adapterEvidence = JSON.parse(files.get("reconstruction-adapter.json")!.toString("utf8"));
  assert.equal(adapterEvidence.originalLogicSha256, sha256(source.files.get("mock.js")!));
  assert.equal(adapterEvidence.omittedRemoteFontBytesPresentInA0, false);
  assert.equal(adapterEvidence.inlineAssets.length, 1);
  assert.equal(adapterEvidence.omittedRemoteFonts[0].matchingA0AssetBytes, 0);
  assert.equal("reference" in adapterEvidence.omittedRemoteFonts[0], false);
  const strictCurrent = classifyT131A4NormalizedMock(source.locator, normalized.files);
  assert.equal(strictCurrent.classification, "DETERMINISTICALLY_CONVERTIBLE");

  const game = {
    target: "moi-lab2",
    gameRowId: "legacy-rps-row",
    gameId: "rock-paper-scissors",
    title: "じゃんけん",
    description: "2〜4人",
    manifest: manifestConversion.currentManifest,
    legacyManifest: { title: "じゃんけん", settings: manifestConversion.currentManifest.settings },
    manifestConversion,
    modulePolicy: { room: true },
    sdkPackageVersion: "0.2.0",
    sdkContractVersion: 2,
    status: "draft",
    publicGameId: null,
    deletedAt: null,
    authoringPointers: {
      mockRevision: source.locator.originalRevision,
      mockApprovedRevision: null,
      packageRevision: null,
      developmentRevision: null,
      stableRevision: null,
    },
    head: {
      kind: "mock",
      revision: source.locator.originalRevision,
      selectionEvidence: "sdk_games.mock_revision",
    },
    headLocator: source.locator,
    headResolutionEvidence: {
      method: "EXPLICIT_DB_POINTER",
      selectedRevision: source.locator.originalRevision,
      candidates: [],
      missingEvidence: [],
    },
    packageRevisionEvidence: null,
    ownerReference: null,
    releaseReferences: [],
    channelProvenance: {
      packageRootSha256: null,
      packageBundleSha256: null,
      packageAppSetSha256: null,
      developmentRootSha256: null,
      developmentBundleSha256: null,
      developmentAppSetSha256: null,
      stableRootSha256: null,
      stableBundleSha256: null,
      stableAppSetSha256: null,
    },
    authoringMetadata: {
      mockApprovedAt: null,
      moduleProfileRevision: null,
      moduleContractDigest: null,
      moduleProfileConfirmedAt: null,
      prototypeModuleProfileRevision: null,
      prototypeModuleContractDigest: null,
      prototypeSdkPackageVersion: null,
      prototypeSourceSha256: null,
    },
    blockerCodes: [],
    deferred: { artifactLocatorCount: 1, packageRevisionCount: 0, releaseCount: 0 },
  } satisfies T131A4GameInventory;
  const smoke = await defaultT131A4RuntimeSmoke({ game, files: normalized.files });
  assert.deepEqual(smoke.blockerCodes, []);
  assert.equal(smoke.clientBoot, "PASS");
  assert.equal(smoke.basicInteraction, "PASS");
  assert.equal(smoke.statePresentationReconciliation, "PASS");
  assert.equal(smoke.requiredAssets, "PASS");
});

test("current node-free package boots its formal client and server in local isolation", async () => {
  const sourcePaths = [
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
  const files = Object.fromEntries(sourcePaths.map((path) => [
    path,
    readFileSync(path.startsWith("source/")
      ? `sdk/starter-template/src/${path.slice("source/".length)}`
      : `sdk/starter-template/mock/${path}`, "utf8"),
  ]));
  const built = await buildNodeFreeGamePackage({
    gameId: "my-first-game",
    manifest: myFirstGameManifest,
    files,
    moduleBinding: {
      environment: "development",
      moduleProfileRevision: "11111111-1111-4111-8111-111111111111",
      moduleContractDigest: "a".repeat(64),
      sdkPackageVersion: "0.2.0",
      sdkContractVersion: 2,
    },
  });
  const currentFiles = built.map((file) => {
    const content = Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8");
    return { path: file.path, bytes: content.byteLength, sha256: sha256(content), content };
  });
  const game = {
    target: "moi-lab2",
    gameRowId: "starter-row",
    gameId: "my-first-game",
    title: "Starter",
    description: "fixture",
    manifest: myFirstGameManifest,
    legacyManifest: myFirstGameManifest,
    manifestConversion: null,
    modulePolicy: {},
    sdkPackageVersion: "0.2.0",
    sdkContractVersion: 2,
    status: "draft",
    publicGameId: null,
    deletedAt: null,
    authoringPointers: {
      mockRevision: null,
      mockApprovedRevision: null,
      packageRevision: "5".repeat(40),
      developmentRevision: null,
      stableRevision: null,
    },
    head: {
      kind: "package",
      revision: "5".repeat(40),
      selectionEvidence: "sdk_games.package_revision",
    },
    headLocator: null,
    headResolutionEvidence: {
      method: "EXPLICIT_DB_POINTER",
      selectedRevision: "5".repeat(40),
      candidates: [],
      missingEvidence: [],
    },
    packageRevisionEvidence: null,
    ownerReference: null,
    releaseReferences: [],
    channelProvenance: {
      packageRootSha256: null,
      packageBundleSha256: null,
      packageAppSetSha256: null,
      developmentRootSha256: null,
      developmentBundleSha256: null,
      developmentAppSetSha256: null,
      stableRootSha256: null,
      stableBundleSha256: null,
      stableAppSetSha256: null,
    },
    authoringMetadata: {
      mockApprovedAt: null,
      moduleProfileRevision: null,
      moduleContractDigest: null,
      moduleProfileConfirmedAt: null,
      prototypeModuleProfileRevision: null,
      prototypeModuleContractDigest: null,
      prototypeSdkPackageVersion: null,
      prototypeSourceSha256: null,
    },
    blockerCodes: [],
    deferred: { artifactLocatorCount: 0, packageRevisionCount: 0, releaseCount: 0 },
  } satisfies T131A4GameInventory;
  const smoke = await defaultT131A4RuntimeSmoke({ game, files: currentFiles });
  assert.deepEqual(smoke, {
    manifestValidation: "PASS",
    clientBoot: "PASS",
    serverInitialization: "PASS",
    basicInteraction: "PASS",
    statePresentationReconciliation: "PASS",
    requiredAssets: "PASS",
    networkDependency: "NONE",
    blockerCodes: [],
  });
  const invalid = await defaultT131A4RuntimeSmoke({
    game: { ...game, manifest: { ...myFirstGameManifest, id: "wrong-game" } },
    files: currentFiles,
  });
  assert.equal(invalid.manifestValidation, "FAIL");
  assert.match(invalid.blockerCodes.join("|"), /GAME_MANIFEST_VALIDATION_FAILED/);
});

test("complete source inputs rebuild deterministically while missing inputs fail closed", async () => {
  const rebuilt = packageFiles("rebuild-fixture");
  const sourceFiles = new Map<string, Buffer>([
    ["game-fields-package.json", Buffer.from(`${JSON.stringify({
      schemaVersion: 0,
      manifest: rebuilt.gameManifest,
      authoring: {
        environment: "development",
        moduleProfileRevision: "fixture-profile-v1",
        moduleContractDigest: "fixture-contract-digest",
        sdkPackageVersion: "0.2.0",
        sdkContractVersion: 2,
      },
    })}\n`)],
    ["index.html", Buffer.from("<!doctype html><main data-game-slot>source</main>")],
    ["styles.css", Buffer.from("main{display:block}")],
    ["mock.js", Buffer.from("globalThis.fixture=true;")],
    ["preview.json", Buffer.from("{}\n")],
    ["source/app-set.ts", Buffer.from("export const appSet = {};\n")],
    ["source/contracts.ts", Buffer.from("export {};\n")],
    ["source/manifest.ts", Buffer.from("export {};\n")],
    ["source/server-module.ts", Buffer.from("export {};\n")],
    ["source/game-client.tsx", Buffer.from("export {};\n")],
    ["source/prototype-adapter.ts", Buffer.from("export {};\n")],
  ]);
  const rebuilder = async () => [...rebuilt.files].map(([path, content]) => ({
    path,
    bytes: content.byteLength,
    sha256: sha256(content),
    content,
  }));
  const compatible = await classifyT131A4Locator(
    materializedPackageLocator(sourceFiles),
    rebuilder,
  );
  assert.equal(compatible.classification, "DETERMINISTICALLY_REBUILDABLE");
  assert.equal(compatible.files.some(({ path }) => path === "server.bundle.js"), true);

  sourceFiles.delete("source/contracts.ts");
  const unavailable = await classifyT131A4Locator(
    materializedPackageLocator(sourceFiles),
    async () => assert.fail("rebuilder must not run with incomplete source inputs"),
  );
  assert.equal(unavailable.classification, "UNAVAILABLE_FOR_FAITHFUL_RECONSTRUCTION");
  assert.equal(unavailable.files.length, 0);
});

test("operator is local-only, requires explicit ZIP selection, and exposes no artifact-only command", () => {
  const script = readFileSync("scripts/t131-a4-authoring-state-reconstruction.ts", "utf8");
  const packageJson = readFileSync("package.json", "utf8");
  assert.match(script, /USER_LOCAL_A0_ZIP_SELECTION_REQUIRED/);
  assert.match(script, /readFileSync\(args\.archive\)/);
  assert.doesNotMatch(script, /fetch\(|https?:|GitHub|token|credential|DATABASE_URL|sdkSql/);
  assert.doesNotMatch(packageJson, /t131:a4:artifacts/);
  assert.match(packageJson, /t131:a4:authoring-state/);
});
