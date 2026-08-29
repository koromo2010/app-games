import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import postcss from "postcss";
import {
  assertGameManifest,
  type GameSdkManifest,
} from "../../../packages/game-sdk/src/index.ts";
import {
  canonicalT131A4Json,
  t131A4JsonDocument,
  type T131A4ArtifactLocator,
  type T131A4CurrentFormatFile,
} from "./creator-artifact-reconstruction.ts";

export const t131A4AuthoringMockAdapterVersion =
  "game-fields-t131-a4-authoring-mock-adapter-v3" as const;

type LegacyManifestInput = {
  gameId: string;
  title: string;
  description: string;
  manifest: unknown;
  modulePolicy: unknown;
  sdkContractVersion: number | null;
  locator: T131A4ArtifactLocator;
};

type SourceProfile = {
  revision: string;
  primarySelector: string;
  observableSelector: string;
  inProgressSelector: string;
  completionSelector: string;
  visibleSelectors: readonly [string, string, string, string];
  interaction: "click" | "submit";
  inputSelector?: string;
};

const sourceProfiles: Readonly<Record<string, SourceProfile>> = Object.freeze({
  "rock-paper-scissors": {
    revision: "2168e8954c1cc0e6664d5e38b4b878e797cd7ff0",
    primarySelector: "[data-choice=\"rock\"]",
    observableSelector: "[data-game-status]",
    inProgressSelector: "[data-choice-area]",
    completionSelector: "[data-celebration]",
    visibleSelectors: ["[data-player-hand]", "[data-ai-hand]", "[data-history]", "[data-round]"],
    interaction: "click",
  },
  "bloom-kingdom": {
    revision: "40e329f1abfc1b39ee879643ac12a369097b9183",
    primarySelector: "[data-card=\"peony\"]",
    observableSelector: "[data-card=\"peony\"]",
    inProgressSelector: "#hand-title",
    completionSelector: "#garden-title",
    visibleSelectors: ["#decree-title", "#garden-title", "#hand-title", "[data-card=\"lily\"]"],
    interaction: "click",
  },
  "realm-rumble": {
    revision: "e7f7a346f60029a974ee266f4063b6bffd20007f",
    primarySelector: "#reroll",
    observableSelector: "#status",
    inProgressSelector: "#phase-label",
    completionSelector: "#history",
    visibleSelectors: ["#map", "#dice", "#players", "#history"],
    interaction: "click",
  },
  "secret-letter-court": {
    revision: "d2eadd55c2bbb50d9201d41a2e54c6ee84718069",
    primarySelector: "[data-card-index=\"1\"]",
    observableSelector: "[data-card-index=\"1\"]",
    inProgressSelector: "[data-game-status]",
    completionSelector: "[data-discard-pile]",
    visibleSelectors: [".players", "[data-card-index=\"0\"]", ".history", ".roles"],
    interaction: "click",
  },
  "spies-of-the-kingdom": {
    revision: "32a7586835f7a730e6f82fe044bbcc95dd76b9b6",
    primarySelector: "[data-role=\"soldier\"]",
    observableSelector: "[data-role=\"soldier\"]",
    inProgressSelector: "[data-phase]",
    completionSelector: "[data-scores]",
    visibleSelectors: ["[data-round]", "[data-status]", "[data-ready]", "[data-seal]"],
    interaction: "click",
  },
  "word-scale": {
    revision: "77c4e7538a29180a06b2c5c6995844d4a70663a0",
    primarySelector: "[data-game-action=\"primary\"]",
    observableSelector: "#hint",
    inProgressSelector: "[data-game-status]",
    completionSelector: "[data-score]",
    visibleSelectors: ["[data-low]", "[data-high]", "[data-secret]", "[data-hint-list]"],
    interaction: "submit",
    inputSelector: "#hint",
  },
});

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function textFile(locator: T131A4ArtifactLocator, path: string) {
  const file = locator.files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`A4_LEGACY_MOCK_SOURCE_FILE_MISSING:${path}`);
  return new TextDecoder("utf-8", { fatal: true }).decode(file.content);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function parsePlayerRange(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const range = /([1-9])\s*[〜～~-]\s*([1-9])\s*人/.exec(value);
    if (range) return { minimum: Number(range[1]), maximum: Number(range[2]) };
    const exact = /([1-9])\s*人用/.exec(value);
    if (exact) return { minimum: Number(exact[1]), maximum: Number(exact[1]) };
  }
  return null;
}

function observedPlayerCapacity(html: string) {
  const { document } = parseHTML(html);
  return Math.max(
    document.querySelectorAll("[data-hint-list] > article").length,
    document.querySelectorAll(".players > .player").length,
    document.querySelectorAll("[data-seat]").length,
  );
}

export type T131A4ManifestConversion = {
  mode: "CURRENT_MANIFEST_PRESERVED" | "LEGACY_MANIFEST_DETERMINISTICALLY_CONVERTED";
  currentManifest: GameSdkManifest;
  evidence: {
    schemaVersion: 1;
    converterVersion: typeof t131A4AuthoringMockAdapterVersion;
    legacyManifestSha256: string;
    currentManifestSha256: string;
    fieldSources: Record<string, string>;
  };
};

export function convertT131A4LegacyMockManifest(input: LegacyManifestInput): T131A4ManifestConversion {
  try {
    const current = input.manifest as GameSdkManifest;
    assertGameManifest(current);
    if (current.id !== input.gameId) throw new Error("id");
    return {
      mode: "CURRENT_MANIFEST_PRESERVED",
      currentManifest: current,
      evidence: {
        schemaVersion: 1,
        converterVersion: t131A4AuthoringMockAdapterVersion,
        legacyManifestSha256: sha256(canonicalT131A4Json(input.manifest)),
        currentManifestSha256: sha256(canonicalT131A4Json(current)),
        fieldSources: { all: "sdk_games.manifest/current-schema" },
      },
    };
  } catch {
    // A0 predates the current manifest schema. Conversion below remains source-bound.
  }

  const legacy = object(input.manifest);
  const preview = object(JSON.parse(textFile(input.locator, "preview.json")));
  const html = textFile(input.locator, "index.html");
  const range = parsePlayerRange(input.description, preview.description);
  const observedCapacity = observedPlayerCapacity(html);
  const minimumPlayers = positiveInteger(legacy.minimumPlayers)
    ?? positiveInteger(preview.minimumPlayers)
    ?? range?.minimum
    ?? Math.max(1, observedCapacity);
  const maximumPlayers = positiveInteger(legacy.maximumPlayers)
    ?? positiveInteger(preview.maximumPlayers)
    ?? range?.maximum
    ?? Math.max(minimumPlayers, observedCapacity);
  const previewMinimumPlayers = positiveInteger(legacy.previewMinimumPlayers)
    ?? positiveInteger(preview.previewMinimumPlayers);
  const legacyTitle = object(legacy.title);
  const fallbackTitle = input.title || String(preview.title ?? input.gameId);
  const current: GameSdkManifest = {
    sdkVersion: input.sdkContractVersion === 1 ? 1 : 2,
    id: input.gameId,
    title: {
      ja: typeof legacyTitle.ja === "string" && legacyTitle.ja.trim()
        ? legacyTitle.ja
        : fallbackTitle,
      en: typeof legacyTitle.en === "string" && legacyTitle.en.trim()
        ? legacyTitle.en
        : fallbackTitle,
    },
    playMode: legacy.playMode === "local-pass-and-play" ? "local-pass-and-play" : "online-room",
    minimumPlayers,
    ...(previewMinimumPlayers && previewMinimumPlayers <= minimumPlayers
      ? { previewMinimumPlayers }
      : {}),
    maximumPlayers,
    supportsDebug: booleanOr(legacy.supportsDebug, false),
    supportsSpectators: booleanOr(legacy.supportsSpectators, false),
    supportsReplay: booleanOr(legacy.supportsReplay, false),
    supportsRating: booleanOr(legacy.supportsRating, false),
    usesLlm: booleanOr(legacy.usesLlm, false),
    ...(Array.isArray(legacy.settings)
      ? { settings: legacy.settings as GameSdkManifest["settings"] }
      : Array.isArray(preview.settings)
        ? { settings: preview.settings as GameSdkManifest["settings"] }
        : {}),
    ...(Array.isArray(legacy.rules) ? { rules: legacy.rules as GameSdkManifest["rules"] } : {}),
  };
  assertGameManifest(current);
  const fieldSources: Record<string, string> = {
    sdkVersion: "sdk_games.sdk_contract_version",
    id: "sdk_games.game_id+preview.json.gameId",
    title: typeof legacy.title === "object" ? "sdk_games.manifest.title" : "sdk_games.title+preview.json.title",
    playMode: legacy.playMode ? "sdk_games.manifest.playMode" : "sdk_games.module_policy.online-room",
    minimumPlayers: legacy.minimumPlayers
      ? "sdk_games.manifest.minimumPlayers"
      : preview.minimumPlayers
        ? "preview.json.minimumPlayers"
        : range
          ? "sdk_games.description/player-range"
          : "index.html/visible-player-capacity",
    maximumPlayers: legacy.maximumPlayers
      ? "sdk_games.manifest.maximumPlayers"
      : preview.maximumPlayers
        ? "preview.json.maximumPlayers"
        : range
          ? "sdk_games.description/player-range"
          : "index.html/visible-player-capacity",
    featureFlags: "sdk_games.manifest/explicit-boolean-or-conservative-false",
    settings: Array.isArray(legacy.settings) ? "sdk_games.manifest.settings" : "preview.json.settings",
  };
  return {
    mode: "LEGACY_MANIFEST_DETERMINISTICALLY_CONVERTED",
    currentManifest: current,
    evidence: {
      schemaVersion: 1,
      converterVersion: t131A4AuthoringMockAdapterVersion,
      legacyManifestSha256: sha256(canonicalT131A4Json(input.manifest)),
      currentManifestSha256: sha256(canonicalT131A4Json(current)),
      fieldSources,
    },
  };
}

function appendEvidence(element: Element, token: string) {
  const existing = element.getAttribute("data-evidence")?.trim().split(/\s+/).filter(Boolean) ?? [];
  element.setAttribute("data-evidence", [...new Set([...existing, token])].join(" "));
}

function requireElement(document: Document, selector: string, code: string) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(code);
  return element;
}

function mimeExtension(mime: string) {
  const extensions: Record<string, string> = {
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
  };
  return extensions[mime.toLowerCase()] ?? "bin";
}

function externalizeInlineAssets(source: string) {
  const assets = new Map<string, Buffer>();
  const normalized = source.replace(
    /data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/]+={0,2})/gi,
    (_match, mime: string, encoded: string) => {
      const content = Buffer.from(encoded, "base64");
      const digest = sha256(content);
      const path = `assets/${digest}.${mimeExtension(mime)}`;
      assets.set(path, content);
      return `./${path}`;
    },
  );
  return { source: normalized, assets };
}

function omitUnrecoverableFontImports(css: string) {
  const root = postcss.parse(css, { from: undefined });
  const omitted: Array<{
    referenceBytes: number;
    referenceSha256: string;
    sourceBytes: number;
    sourceSha256: string;
    matchingA0AssetBytes: 0;
  }> = [];
  root.walkAtRules("import", (rule) => {
    const reference = /https:\/\/fonts\.(?:googleapis|gstatic)\.com\/[^"')\s]+/i.exec(rule.params)?.[0];
    if (!reference) return;
    const source = rule.toString();
    omitted.push({
      referenceBytes: Buffer.byteLength(reference, "utf8"),
      referenceSha256: sha256(reference),
      sourceBytes: Buffer.byteLength(source, "utf8"),
      sourceSha256: sha256(source),
      matchingA0AssetBytes: 0,
    });
    rule.replaceWith(postcss.comment({
      text: `${t131A4AuthoringMockAdapterVersion}: remote font omitted; A0 contains no verified font byte`,
    }));
  });
  return { css: root.toString(), omitted };
}

function adapterScript(profile: SourceProfile) {
  return [
    `/* ${t131A4AuthoringMockAdapterVersion} */`,
    "(()=>{",
    "const room=window.GameFieldsRoom;",
    "if(!room||room.__t131A4Reconstruction!==true)return;",
    "const action=document.querySelector('[data-evidence~=t131-source-primary-action]');",
    "const output=document.querySelector('[data-evidence~=t131-adapter-observable]');",
    "const reset=document.querySelector('[data-evidence~=t131-adapter-reset-target]');",
    "if(!action||!output||!reset)throw new Error('A4_RECONSTRUCTION_ADAPTER_BINDING_FAILED');",
    "const initial=output.textContent;",
    "const observedBefore=action.getAttribute('data-t131-source-action-observed');",
    "const sourceMarker=document.createElement('span');sourceMarker.hidden=true;sourceMarker.setAttribute('data-t131-source-action-marker','');",
    `const mark=()=>{output.textContent='SOURCE_ACTION_OBSERVED:${profile.interaction}';action.setAttribute('data-t131-source-action-observed','true');if(!sourceMarker.isConnected)action.append(sourceMarker)};`,
    "action.addEventListener('click',mark);",
    "reset.addEventListener('click',()=>{output.textContent=initial;sourceMarker.remove();if(observedBefore===null)action.removeAttribute('data-t131-source-action-observed');else action.setAttribute('data-t131-source-action-observed',observedBefore)});",
    "})();",
    "",
  ].join("\n");
}

export type T131A4LegacyMockAdapterResult = {
  adapterVersion: typeof t131A4AuthoringMockAdapterVersion;
  files: readonly T131A4CurrentFormatFile[];
  evidenceSha256: string;
};

export function normalizeT131A4LegacyMock(input: {
  locator: T131A4ArtifactLocator;
  manifestConversion: T131A4ManifestConversion;
}): T131A4LegacyMockAdapterResult | null {
  const profile = sourceProfiles[input.locator.gameId];
  if (!profile) return null;
  if (input.locator.kind !== "mock" || input.locator.originalRevision !== profile.revision) {
    throw new Error("A4_LEGACY_MOCK_PROFILE_IDENTITY_MISMATCH");
  }
  const rawHtml = textFile(input.locator, "index.html");
  const rawCss = textFile(input.locator, "styles.css");
  const rawScript = textFile(input.locator, "mock.js");
  const rawPreview = object(JSON.parse(textFile(input.locator, "preview.json")));
  const externalizedHtml = externalizeInlineAssets(rawHtml);
  const externalizedCss = externalizeInlineAssets(rawCss);
  const inlineAssets = new Map([
    ...externalizedHtml.assets,
    ...externalizedCss.assets,
  ]);
  const { document } = parseHTML(externalizedHtml.source);
  const root = document.querySelector("main[data-game-slot]")
    ?? document.querySelector("#game-slot")
    ?? document.querySelector("main");
  if (!root) throw new Error("A4_LEGACY_MOCK_GAME_ROOT_UNPROVEN");
  root.setAttribute("data-game-slot", "");
  const primary = requireElement(document, profile.primarySelector, "A4_LEGACY_MOCK_PRIMARY_ACTION_UNPROVEN");
  const observable = requireElement(document, profile.observableSelector, "A4_LEGACY_MOCK_OBSERVABLE_UNPROVEN");
  const inProgress = requireElement(document, profile.inProgressSelector, "A4_LEGACY_MOCK_IN_PROGRESS_STATE_UNPROVEN");
  const completion = requireElement(document, profile.completionSelector, "A4_LEGACY_MOCK_COMPLETION_STATE_UNPROVEN");
  appendEvidence(root, "t131-source-loop-start");
  appendEvidence(primary, "t131-source-primary-action");
  appendEvidence(primary, "t131-source-loop-action");
  appendEvidence(observable, "t131-source-observable");
  appendEvidence(observable, "t131-source-loop-result");
  appendEvidence(inProgress, "t131-source-state-in-progress");
  appendEvidence(completion, "t131-source-state-completion");
  profile.visibleSelectors.forEach((selector, index) => appendEvidence(
    requireElement(document, selector, "A4_LEGACY_MOCK_VISIBLE_ELEMENT_UNPROVEN"),
    `t131-source-visible-${index + 1}`,
  ));
  const existingSource = [...document.querySelectorAll("script[src]")]
    .find((element) => element.getAttribute("src")?.replace(/^\.\//, "") === "mock.js");
  if (!existingSource) throw new Error("A4_LEGACY_MOCK_SCRIPT_ENTRY_UNPROVEN");
  existingSource.setAttribute("src", "./legacy/mock.js");
  const evidence = document.createElement("section");
  evidence.hidden = true;
  evidence.setAttribute("data-t131-a4-reconstruction-evidence", t131A4AuthoringMockAdapterVersion);
  evidence.innerHTML = [
    '<output data-evidence="t131-adapter-observable">SOURCE_READY</output>',
    '<button type="button" data-evidence="t131-adapter-reset-action t131-adapter-reset-target">Reset reconstruction evidence</button>',
  ].join("");
  document.body.append(evidence);
  const adapterEntry = document.createElement("script");
  adapterEntry.setAttribute("src", "./mock.js");
  document.body.append(adapterEntry);
  const normalizedHtml = `<!doctype html>\n${document.documentElement.outerHTML}\n`;
  const css = omitUnrecoverableFontImports(externalizedCss.source);
  const reviewEvidence = {
    representativeStates: [
      { id: "t131-source-state-in-progress", role: "in-progress", label: "Source-bound in-progress state" },
      { id: "t131-source-state-completion", role: "completion", label: "Source-bound completion state" },
    ],
    visibleGameSpecificElements: [1, 2, 3, 4].map((index) => `t131-source-visible-${index}`),
    primaryActions: [{
      id: "t131-source-loop-action",
      targetId: "t131-source-primary-action",
      observableResultId: "t131-adapter-observable",
    }],
    completionState: {
      stateId: "t131-source-state-completion",
      visibleResultIds: ["t131-source-loop-result"],
    },
    mockOnlyDataSource: "mock-local-state",
    coreLoopSequence: ["t131-source-loop-start", "t131-source-loop-action", "t131-source-loop-result"],
    resetAction: {
      id: "t131-adapter-reset-action",
      targetId: "t131-adapter-reset-target",
      observableResultId: "t131-adapter-observable",
    },
  } as const;
  const normalizedPreview = {
    ...rawPreview,
    gameId: input.locator.gameId,
    title: typeof rawPreview.title === "string" ? rawPreview.title : input.locator.gameId,
    reviewEvidence,
  };
  const adapterEvidence = {
    schemaVersion: 1,
    adapterVersion: t131A4AuthoringMockAdapterVersion,
    source: {
      target: input.locator.target,
      gameId: input.locator.gameId,
      revision: input.locator.originalRevision,
      treeSha: input.locator.originalTreeSha,
      fileSha256: Object.fromEntries(input.locator.files.map((file) => [file.path, file.contentSha256])),
    },
    selectors: profile,
    manifestConversion: input.manifestConversion.evidence,
    inlineAssets: [...inlineAssets].map(([path, content]) => ({
      path,
      bytes: content.byteLength,
      sha256: sha256(content),
      byteProvenance: "SAME_GAME_A0_INLINE_DATA_URL",
    })),
    omittedRemoteFonts: css.omitted,
    omittedRemoteFontBytesPresentInA0: false,
    originalLogicPath: "legacy/mock.js",
    originalLogicSha256: sha256(rawScript),
    externalWrites: 0,
  };
  const output = new Map<string, Buffer>();
  for (const file of input.locator.files) {
    if (!["index.html", "styles.css", "mock.js", "preview.json"].includes(file.path)) {
      output.set(file.path, Buffer.from(file.content));
    }
  }
  output.set("index.html", Buffer.from(normalizedHtml, "utf8"));
  output.set("styles.css", Buffer.from(`${css.css.trimEnd()}\n`, "utf8"));
  output.set("legacy/mock.js", Buffer.from(rawScript, "utf8"));
  output.set("mock.js", Buffer.from(adapterScript(profile), "utf8"));
  output.set("preview.json", t131A4JsonDocument(normalizedPreview));
  output.set("current-manifest.json", t131A4JsonDocument(input.manifestConversion.currentManifest));
  output.set("manifest-conversion.json", t131A4JsonDocument(input.manifestConversion.evidence));
  output.set("reconstruction-adapter.json", t131A4JsonDocument(adapterEvidence));
  for (const [path, content] of inlineAssets) output.set(path, content);
  const files = [...output]
    .map(([path, content]) => ({ path, content, bytes: content.byteLength, sha256: sha256(content) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    adapterVersion: t131A4AuthoringMockAdapterVersion,
    files,
    evidenceSha256: sha256(canonicalT131A4Json(adapterEvidence)),
  };
}
