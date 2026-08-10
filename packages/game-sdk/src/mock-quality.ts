export type GameSdkMockRepresentativeState = {
  id: string;
  role: "in-progress" | "completion" | "additional";
  label: string;
};

export type GameSdkMockPrimaryAction = {
  id: string;
  targetId: string;
  observableResultId: string;
};

export type GameSdkMockQualityEvidence = {
  representativeStates: readonly GameSdkMockRepresentativeState[];
  visibleGameSpecificElements: readonly string[];
  primaryActions: readonly GameSdkMockPrimaryAction[];
  completionState: {
    stateId: string;
    visibleResultIds: readonly string[];
  };
  mockOnlyDataSource: "fixed-fixture" | "mock-local-state";
  coreLoopSequence: readonly string[];
  resetAction: GameSdkMockPrimaryAction;
};

export type GameSdkMockQualityResult = {
  gameId: string;
  title: string;
  evidence: GameSdkMockQualityEvidence;
};

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const COMMON_SHELL_MARKERS = [
  "data-screen=\"lobby\"",
  "data-screen=\"entry\"",
  "data-screen=\"room\"",
  "data-gf-player-list",
  "data-gf-debug-panel",
  "GAME FIELDS SDK PREVIEW",
];
const PLACEHOLDER_PATTERN = /(?:ここにゲーム|ゲーム固有操作|新しいゲーム|GAME-SPECIFIC UI|lorem ipsum)/i;

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, code: string, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(code);
  }
  return value.trim();
}

function id(value: unknown, code: string) {
  const normalized = text(value, code, 64);
  if (!ID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function uniqueIds(values: unknown, code: string, minimum: number) {
  if (!Array.isArray(values) || values.length < minimum || values.length > 32) {
    throw new Error(code);
  }
  const normalized = values.map((value) => id(value, code));
  if (new Set(normalized).size !== normalized.length) throw new Error(code);
  return normalized;
}

function sourceContains(source: string, marker: string) {
  return source.includes(marker);
}

export function validateGameSdkMockQuality(input: {
  files: Readonly<Record<string, string>>;
}): GameSdkMockQualityResult {
  const html = input.files["index.html"];
  const css = input.files["styles.css"];
  const script = input.files["mock.js"];
  const previewJson = input.files["preview.json"];
  if (
    typeof html !== "string"
    || typeof css !== "string"
    || typeof script !== "string"
    || typeof previewJson !== "string"
  ) {
    throw new Error("GAME_SDK_MOCK_REQUIRED_FILE_MISSING");
  }
  if (html.length > 256_000 || css.length > 256_000 || script.length > 512_000) {
    throw new Error("GAME_SDK_MOCK_FILE_TOO_LARGE");
  }
  for (const marker of COMMON_SHELL_MARKERS) {
    if (html.includes(marker)) throw new Error(`GAME_SDK_MOCK_COMMON_SHELL_DUPLICATED:${marker}`);
  }
  if (!html.includes("data-game-slot") || !/<(?:button|input|select)\b/i.test(html)) {
    throw new Error("GAME_SDK_MOCK_GAME_ROOT_INCOMPLETE");
  }
  const gameSlot = html.match(/<main\b[^>]*data-game-slot[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
  const visibleText = gameSlot.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (visibleText.length < 40 || PLACEHOLDER_PATTERN.test(visibleText)) {
    throw new Error("GAME_SDK_MOCK_PLACEHOLDER_OR_EMPTY_SHELL");
  }

  let metadata: Record<string, unknown>;
  try {
    metadata = record(JSON.parse(previewJson), "GAME_SDK_MOCK_PREVIEW_INVALID");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("GAME_SDK_")) throw error;
    throw new Error("GAME_SDK_MOCK_PREVIEW_INVALID");
  }
  const gameId = id(metadata.gameId, "GAME_SDK_MOCK_GAME_ID_INVALID");
  const title = text(metadata.title, "GAME_SDK_MOCK_TITLE_INVALID", 120);
  const rawEvidence = record(
    metadata.reviewEvidence,
    "GAME_SDK_MOCK_REVIEW_EVIDENCE_REQUIRED",
  );
  const rawStates = rawEvidence.representativeStates;
  if (!Array.isArray(rawStates) || rawStates.length < 2 || rawStates.length > 12) {
    throw new Error("GAME_SDK_MOCK_REPRESENTATIVE_STATES_REQUIRED");
  }
  const representativeStates = rawStates.map((value) => {
    const state = record(value, "GAME_SDK_MOCK_REPRESENTATIVE_STATE_INVALID");
    const role = state.role as GameSdkMockRepresentativeState["role"];
    if (role !== "in-progress" && role !== "completion" && role !== "additional") {
      throw new Error("GAME_SDK_MOCK_REPRESENTATIVE_STATE_INVALID");
    }
    return {
      id: id(state.id, "GAME_SDK_MOCK_REPRESENTATIVE_STATE_INVALID"),
      role,
      label: text(state.label, "GAME_SDK_MOCK_REPRESENTATIVE_STATE_INVALID"),
    };
  });
  if (!representativeStates.some((state) => state.role === "in-progress")
    || !representativeStates.some((state) => state.role === "completion")) {
    throw new Error("GAME_SDK_MOCK_IN_PROGRESS_AND_COMPLETION_REQUIRED");
  }
  const visibleGameSpecificElements = uniqueIds(
    rawEvidence.visibleGameSpecificElements,
    "GAME_SDK_MOCK_VISIBLE_ELEMENTS_REQUIRED",
    4,
  );
  const rawActions = rawEvidence.primaryActions;
  if (!Array.isArray(rawActions) || rawActions.length < 1 || rawActions.length > 12) {
    throw new Error("GAME_SDK_MOCK_PRIMARY_ACTION_REQUIRED");
  }
  const primaryActions = rawActions.map((value) => {
    const action = record(value, "GAME_SDK_MOCK_PRIMARY_ACTION_INVALID");
    return {
      id: id(action.id, "GAME_SDK_MOCK_PRIMARY_ACTION_INVALID"),
      targetId: id(action.targetId, "GAME_SDK_MOCK_PRIMARY_ACTION_INVALID"),
      observableResultId: id(
        action.observableResultId,
        "GAME_SDK_MOCK_PRIMARY_ACTION_INVALID",
      ),
    };
  });
  const completion = record(
    rawEvidence.completionState,
    "GAME_SDK_MOCK_COMPLETION_STATE_REQUIRED",
  );
  const completionState = {
    stateId: id(completion.stateId, "GAME_SDK_MOCK_COMPLETION_STATE_REQUIRED"),
    visibleResultIds: uniqueIds(
      completion.visibleResultIds,
      "GAME_SDK_MOCK_COMPLETION_STATE_REQUIRED",
      1,
    ),
  };
  const mockOnlyDataSource = rawEvidence.mockOnlyDataSource;
  if (mockOnlyDataSource !== "fixed-fixture" && mockOnlyDataSource !== "mock-local-state") {
    throw new Error("GAME_SDK_MOCK_DATA_SOURCE_INVALID");
  }
  const coreLoopSequence = uniqueIds(
    rawEvidence.coreLoopSequence,
    "GAME_SDK_PROTOTYPE_CORE_LOOP_REQUIRED",
    3,
  );
  const rawResetAction = record(
    rawEvidence.resetAction,
    "GAME_SDK_PROTOTYPE_RESET_REQUIRED",
  );
  const resetAction = {
    id: id(rawResetAction.id, "GAME_SDK_PROTOTYPE_RESET_REQUIRED"),
    targetId: id(rawResetAction.targetId, "GAME_SDK_PROTOTYPE_RESET_REQUIRED"),
    observableResultId: id(
      rawResetAction.observableResultId,
      "GAME_SDK_PROTOTYPE_RESET_REQUIRED",
    ),
  };

  const observableSource = `${html}\n${script}`;
  const requiredMarkers = [
    ...representativeStates.map((state) => state.id),
    ...visibleGameSpecificElements,
    ...primaryActions.flatMap((action) => [
      action.id,
      action.targetId,
      action.observableResultId,
    ]),
    completionState.stateId,
    ...completionState.visibleResultIds,
    ...coreLoopSequence,
    resetAction.id,
    resetAction.targetId,
    resetAction.observableResultId,
  ];
  for (const marker of new Set(requiredMarkers)) {
    if (!sourceContains(observableSource, marker)) {
      throw new Error(`GAME_SDK_MOCK_DECLARED_EVIDENCE_NOT_VISIBLE:${marker}`);
    }
  }

  return {
    gameId,
    title,
    evidence: {
      representativeStates,
      visibleGameSpecificElements,
      primaryActions,
      completionState,
      mockOnlyDataSource,
      coreLoopSequence,
      resetAction,
    },
  };
}
