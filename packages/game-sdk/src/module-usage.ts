import type {
  GameSdkModuleDefinition,
  GameSdkModuleDelivery,
  GameSdkModuleId,
} from "./modules/profile.js";

export type GameSdkModuleBinding = {
  environment: "production" | "development";
  moduleProfileRevision: string;
  moduleContractDigest: string;
  sdkPackageVersion: string;
  sdkContractVersion: number;
};

export type GameSdkModuleUsageEvidence = {
  id: GameSdkModuleId;
  delivery: GameSdkModuleDelivery;
  status: "used" | "delegated-to-platform";
  packageExportsUsed: string[];
  publicApisUsed: string[];
  sourcePaths: string[];
  runtimeEvidence: string[];
  nonReimplementationEvidence: string[];
};

export type GameSdkModuleUsageProblem = {
  moduleId: string | null;
  path: string;
  reason: string;
  expected: string;
  actual: string;
};

/** Public contract for MCP, documentation and runtime validation. */
export const GAME_SDK_MODULE_USAGE_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "delivery", "status", "packageExports", "publicApis", "sourcePaths", "observableRuntimeMarker", "nonReimplementationEvidence"],
  properties: {
    id: { type: "string" },
    delivery: { type: "string", enum: ["platform-owned", "platform-resource", "sdk-package"] },
    status: { type: "string", enum: ["used", "delegated-to-platform"] },
    packageExports: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 128, uniqueItems: true },
    publicApis: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 128, uniqueItems: true },
    sourcePaths: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 128, uniqueItems: true },
    observableRuntimeMarker: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 128, uniqueItems: true },
    nonReimplementationEvidence: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 128, uniqueItems: true },
  },
} as const;

export class GameSdkModuleUsageValidationError extends Error {
  constructor(readonly code: string, readonly problems: readonly GameSdkModuleUsageProblem[]) {
    const first = problems[0];
    super([
      code,
      first?.moduleId,
      first && first.path !== "moduleUsage" ? first.path : undefined,
    ].filter(Boolean).join(":"));
  }
}

export type GameSdkModuleUsageAudit = {
  binding: GameSdkModuleBinding;
  requiredModuleIds: readonly GameSdkModuleId[];
  disabledModuleIds: readonly GameSdkModuleId[];
  moduleUsage: readonly GameSdkModuleUsageEvidence[];
};

export type GameSdkModuleUsageContract = GameSdkModuleBinding & {
  requiredModuleIds: readonly GameSdkModuleId[];
  disabledModuleIds: readonly GameSdkModuleId[];
  disabledModules: readonly GameSdkModuleDefinition[];
  requiredModules: readonly GameSdkModuleDefinition[];
};

function fail(code: string, moduleId?: string, path = "moduleUsage", expected = "valid module usage evidence", actual = "invalid") : never {
  throw new GameSdkModuleUsageValidationError(code, [{
    moduleId: moduleId ?? null,
    path,
    reason: code,
    expected,
    actual,
  }]);
}

function stringArray(value: unknown, code: string, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || value.length > 128) fail(code);
  const strings = value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.length > 240) fail(code);
    return item.trim();
  });
  if (new Set(strings).size !== strings.length) fail(code);
  return strings;
}

function includesImport(source: string, packageExport: string) {
  return new RegExp(`(?:from\\s*|import\\s*)["']${packageExport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(source);
}

function tokenCount(source: string, token: string) {
  const matches = source.match(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"));
  return matches?.length ?? 0;
}

function apiToken(api: string) {
  return api.split(".").at(-1) ?? api;
}

const PROHIBITED_REIMPLEMENTATION_PATTERNS: Partial<Record<GameSdkModuleId, RegExp[]>> = {
  "common-shell": [/data-screen=["'](?:lobby|room|settings)["']/i, /data-gf-player-list/i],
  "online-room": [/function\s+(?:create|join|leave)Room\b/i],
  "room-settings": [/data-(?:room-)?settings-panel/i],
  "turn-order": [/function\s+(?:nextPlayer|advanceTurn|nextTurn)\b/i],
  "secret-presentation": [/function\s+(?:revealSecret|sanitizeHand|projectSecret)\b/i],
  "standard-outcome": [/function\s+(?:buildResult|calculateWinner|standardResult)\b/i],
  "playing-cards": [/type\s+(?:Card|PlayingCard)\s*=/i, /function\s+(?:createDeck|shuffleDeck|dealCards)\b/i],
};

export function validateGameSdkModuleUsage(input: {
  contract: GameSdkModuleUsageContract;
  binding: unknown;
  moduleUsage: unknown;
  files: Readonly<Record<string, string>>;
}): GameSdkModuleUsageAudit {
  if (!input.binding || typeof input.binding !== "object" || Array.isArray(input.binding)) {
    fail("MODULE_CONTRACT_BINDING_MISSING");
  }
  const binding = input.binding as Partial<GameSdkModuleBinding>;
  for (const field of [
    "environment",
    "moduleProfileRevision",
    "moduleContractDigest",
    "sdkPackageVersion",
    "sdkContractVersion",
  ] as const) {
    if (binding[field] !== input.contract[field]) {
      fail("MODULE_PROFILE_STALE", undefined, field);
    }
  }
  if (!Array.isArray(input.moduleUsage)) fail("MODULE_USAGE_MATRIX_INCOMPLETE", undefined, "moduleUsage", "array containing one row per required module", typeof input.moduleUsage);
  const rows = input.moduleUsage as Array<Record<string, unknown>>;
  const requiredSet = new Set(input.contract.requiredModuleIds);
  const ids = rows.map((row) => row?.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  const invalid = ids.find((id) => typeof id !== "string" || !requiredSet.has(id as GameSdkModuleId));
  const missing = [...requiredSet].filter((id) => !ids.includes(id));
  if (rows.length !== requiredSet.size || duplicate !== undefined || invalid !== undefined || missing.length) {
    const problems: GameSdkModuleUsageProblem[] = [
      ...missing.map((id) => ({ moduleId: id, path: "moduleUsage", reason: "REQUIRED_MODULE_MISSING", expected: "exactly one row", actual: "missing" })),
      ...(duplicate !== undefined ? [{ moduleId: typeof duplicate === "string" ? duplicate : null, path: "moduleUsage[].id", reason: "DUPLICATE_MODULE_ID", expected: "unique required module id", actual: String(duplicate) }] : []),
      ...(invalid !== undefined ? [{ moduleId: typeof invalid === "string" ? invalid : null, path: "moduleUsage[].id", reason: "UNKNOWN_OR_DISABLED_MODULE", expected: "a required module id", actual: String(invalid) }] : []),
    ];
    throw new GameSdkModuleUsageValidationError("MODULE_USAGE_MATRIX_INCOMPLETE", problems);
  }
  const allSource = Object.entries(input.files)
    .filter(([path]) => /^(?:source\/|index\.html$|mock\.js$)/.test(path))
    .map(([path, content]) => `/* ${path} */\n${content}`)
    .join("\n");
  const normalizedRows = input.contract.requiredModules.map((definition) => {
    const raw = rows.find((row) => row.id === definition.id)!;
    if (raw.delivery !== definition.delivery) {
      fail("MODULE_USAGE_MATRIX_INCOMPLETE", definition.id, "delivery");
    }
    // The shorter names are the public MCP contract.  Legacy names remain
    // accepted on input while existing creators migrate.
    const packageExportsUsed = stringArray(raw.packageExports ?? raw.packageExportsUsed, "MODULE_USAGE_MATRIX_INCOMPLETE");
    const publicApisUsed = stringArray(raw.publicApis ?? raw.publicApisUsed, "MODULE_USAGE_MATRIX_INCOMPLETE");
    const sourcePaths = stringArray(raw.sourcePaths, "MODULE_USAGE_MATRIX_INCOMPLETE", 1);
    const runtimeEvidence = stringArray(raw.observableRuntimeMarker ?? raw.runtimeEvidence, "REQUIRED_MODULE_RUNTIME_EVIDENCE_MISSING", 1);
    const nonReimplementationEvidence = stringArray(raw.nonReimplementationEvidence, "MODULE_USAGE_MATRIX_INCOMPLETE", 1);
    for (const sourcePath of sourcePaths) {
      if (typeof input.files[sourcePath] !== "string") {
        fail("MODULE_USAGE_MATRIX_INCOMPLETE", definition.id, `source:${sourcePath}`);
      }
    }
    const citedSource = sourcePaths
      .map((sourcePath) => `/* ${sourcePath} */\n${input.files[sourcePath]}`)
      .join("\n");
    if (definition.delivery === "platform-owned") {
      if (
        raw.status !== "delegated-to-platform"
        || packageExportsUsed.length
        || publicApisUsed.length
        || nonReimplementationEvidence.length !== 1
        || nonReimplementationEvidence[0] !== `platform-delegation:${definition.id}`
      ) {
        fail("PLATFORM_MODULE_REIMPLEMENTED", definition.id, "delegation");
      }
    } else {
      if (raw.status !== "used") fail("REQUIRED_MODULE_API_UNUSED", definition.id, "status");
      if (packageExportsUsed.length === 0) fail("REQUIRED_SDK_MODULE_IMPORT_MISSING", definition.id);
      for (const packageExport of packageExportsUsed) {
        if (!definition.packageExports.includes(packageExport) || !includesImport(citedSource, packageExport)) {
          fail("REQUIRED_SDK_MODULE_IMPORT_MISSING", definition.id, packageExport);
        }
      }
      if (publicApisUsed.length === 0) fail("REQUIRED_MODULE_API_UNUSED", definition.id);
      for (const api of publicApisUsed) {
        const qualifiedParts = api.split(".");
        const used = qualifiedParts.length > 1
          ? tokenCount(citedSource, qualifiedParts[0]!) >= 2
            && tokenCount(citedSource, apiToken(api)) >= 1
          : tokenCount(citedSource, apiToken(api)) >= 2;
        if (!definition.publicApis.includes(api) || !used) {
          fail("REQUIRED_MODULE_API_UNUSED", definition.id, api);
        }
      }
      if (
        definition.delivery === "platform-resource"
        && /\b(?:fetch|XMLHttpRequest|WebSocket)\s*(?:\(|\.)|https?:\/\/|\bprocess\.env\b|\b(?:DATABASE|REDIS|API)_KEY\b/.test(allSource)
      ) {
        fail("BESPOKE_RESOURCE_REIMPLEMENTATION", definition.id, "direct-external-access");
      }
    }
    for (const evidence of runtimeEvidence) {
      if (definition.delivery === "platform-owned") {
        if (evidence !== `platform-host:${definition.id}`) {
          fail("REQUIRED_MODULE_RUNTIME_EVIDENCE_MISSING", definition.id, evidence);
        }
      } else if (!citedSource.includes(`data-module-runtime="${evidence}"`)
        && !citedSource.includes(`moduleRuntimeEvidence("${evidence}")`)
        && !citedSource.includes(`moduleRuntimeEvidence('${evidence}')`)) {
        fail("REQUIRED_MODULE_RUNTIME_EVIDENCE_MISSING", definition.id, evidence);
      }
    }
    for (const pattern of PROHIBITED_REIMPLEMENTATION_PATTERNS[definition.id] ?? []) {
      if (pattern.test(allSource)) {
        fail(
          definition.delivery === "platform-owned"
            ? "PLATFORM_MODULE_REIMPLEMENTED"
            : "BESPOKE_RESOURCE_REIMPLEMENTATION",
          definition.id,
          pattern.source,
        );
      }
    }
    if (definition.id === "playing-cards") {
      const dataExport = "@game-fields/game-sdk/playing-cards";
      const reactExport = "@game-fields/game-sdk/playing-cards-react";
      if (!packageExportsUsed.includes(dataExport) || !packageExportsUsed.includes(reactExport)) {
        fail("REQUIRED_SDK_MODULE_IMPORT_MISSING", definition.id, "data-and-react");
      }
      const dataApis = new Set([
        "createStandardPlayingCardDeck", "shufflePlayingCards",
        "dealPlayingCardsRoundRobin", "presentPlayingCardHands",
      ]);
      const reactApis = new Set(["PlayingCardView", "PlayingCardHand", "PlayingCardBackStack"]);
      if (!publicApisUsed.some((api) => dataApis.has(api)) || !publicApisUsed.some((api) => reactApis.has(api))) {
        fail("REQUIRED_MODULE_API_UNUSED", definition.id, "data-and-react");
      }
    }
    return {
      id: definition.id,
      delivery: definition.delivery,
      status: raw.status as "used" | "delegated-to-platform",
      packageExportsUsed,
      publicApisUsed,
      sourcePaths,
      runtimeEvidence,
      nonReimplementationEvidence,
    };
  });

  const requiredPackageExports = new Set(
    input.contract.requiredModules.flatMap((definition) => definition.packageExports),
  );
  const requiredPublicApis = new Set(
    input.contract.requiredModules.flatMap((definition) => definition.publicApis),
  );
  for (const definition of input.contract.disabledModules) {
    for (const packageExport of definition.packageExports) {
      if (!requiredPackageExports.has(packageExport) && includesImport(allSource, packageExport)) {
        fail("DISABLED_MODULE_USED", definition.id, packageExport);
      }
    }
    for (const api of definition.publicApis) {
      if (!requiredPublicApis.has(api) && tokenCount(allSource, apiToken(api)) > 0) {
        fail("DISABLED_MODULE_USED", definition.id, api);
      }
    }
    for (const pattern of PROHIBITED_REIMPLEMENTATION_PATTERNS[definition.id] ?? []) {
      if (pattern.test(allSource)) {
        fail("DISABLED_MODULE_USED", definition.id, pattern.source);
      }
    }
  }
  return {
    binding: binding as GameSdkModuleBinding,
    requiredModuleIds: input.contract.requiredModuleIds,
    disabledModuleIds: input.contract.disabledModuleIds,
    moduleUsage: normalizedRows,
  };
}
