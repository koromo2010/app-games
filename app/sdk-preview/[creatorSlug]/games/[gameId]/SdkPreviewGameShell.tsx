"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { DebugParticipantControls } from "@/app/components/DebugParticipantControls";
import { DebugToolWindow } from "@/app/components/DebugToolWindow";
import { DrawingCanvas } from "@/app/components/DrawingCanvas";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameResultShareButton } from "@/app/components/GameResultShareButton";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import {
  GameTopMenu,
  gameTopMenuItemClass,
} from "@/app/components/GameTopMenu";
import { OnlineRoomLifecycleActions } from "@/app/components/OnlineRoomLifecycleActions";
import { PaidLlmAccessButton } from "@/app/components/PaidLlmAccessButton";
import { PlayingCard } from "@/app/components/PlayingCard";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { aiActivityFetch } from "@/lib/ai-activity-client";
import type { DrawingStroke } from "@/lib/drawing-canvas";
import { createStandardPlayingCardDeck } from "@/lib/playing-cards";
import type {
  GameSdkSettingDefinition,
  GameSdkSettingValue,
} from "@game-fields/game-sdk";
import type {
  GameSdkContentDifficulty,
  GameSdkContentSource,
} from "@game-fields/game-sdk/content-source";
import {
  GAME_SDK_MODULE_IDS,
  allGameSdkParticipantsComplete,
  assertGameSdkCanStart,
  assignGameSdkRoles,
  distributeGameSdkBalancedTeams,
  defineGameSdkStandardResultView,
  gameSdkModuleIsRequired,
  nextGameSdkEligibleSeat,
  nextGameSdkRoundStep,
  recordGameSdkParticipantValue,
  recordGameSdkVote,
  requiredGameSdkModuleIds,
  tallyGameSdkVotes,
  type GameSdkModuleGroup,
  type GameSdkModuleProfile,
  type GameSdkStandardResultView,
} from "@game-fields/game-sdk/modules";
import {
  normalizeGameSdkLlmRequest,
  type GameSdkLlmRequest,
  type GameSdkLlmResponse,
} from "@game-fields/game-sdk/llm";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  resolveRequiredSdkPreviewModules,
  type SdkPreviewModuleSurface,
} from "./sdk-preview-module-registry";
import {
  createSdkPreviewSettingValues,
  formatSdkPreviewSettingValue,
  sdkPreviewNumericSettingValue,
  sdkPreviewSettingByRole,
  SdkPreviewSettingsControl,
} from "./SdkPreviewSettingsControl";

type PreviewPhase = "lobby" | "playing" | "result";
type PreviewSurface = "entry" | PreviewPhase;
const SDK_PREVIEW_MINIMUM_PLAYERS = 1;
type PreviewPlayer = {
  id: string;
  name: string;
  role: "host" | "player";
  dummy: boolean;
};
type PreviewLogEntry = {
  id: number;
  label: string;
  at: string;
};
type PreviewViewerSelectorProps = {
  players: readonly PreviewPlayer[];
  selectedViewerId: string;
  showSpectator: boolean;
  onChange: (viewerId: string) => void;
};
type PreviewCommand =
  | "room:hydrate"
  | "settings:sync"
  | "timer:sync"
  | "debug:toggle"
  | "dummy:add"
  | "dummy:remove"
  | "viewer:set"
  | "phase:set"
  | "game:start"
  | "game:abort"
  | "game:auto-progress"
  | "game:rematch";

type Props = {
  backHref: string;
  creatorSlug: string;
  gameId: string;
  runtimeUrl: string;
  title: string;
  moduleProfile: GameSdkModuleProfile;
  settingDefinitions: readonly GameSdkSettingDefinition[];
};

const commandClass = "rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45";
const panelClass = "rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl shadow-slate-950/10";
const primaryClass = "rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500";
const secondaryClass = "rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45";
const moduleGroupLabels: Record<GameSdkModuleGroup, string> = {
  platform: "Platform固定",
  shell: "共通画面・Room",
  flow: "進行部品",
  resource: "共通リソース",
};
const previewCards = createStandardPlayingCardDeck().slice(0, 4);

async function generatePreviewLlm(
  creatorSlug: string,
  gameId: string,
  request: unknown,
) {
  const normalizedRequest = normalizeGameSdkLlmRequest(
    request as GameSdkLlmRequest,
  );
  const response = await aiActivityFetch(
    "SDKゲームがAI回答を生成中",
    "/api/sdk-preview/llm",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creatorSlug,
        gameId,
        request: normalizedRequest,
      }),
    },
  );
  const payload = await response.json().catch(() => null) as {
    response?: GameSdkLlmResponse;
    error?: unknown;
  } | null;
  if (!response.ok || !payload?.response) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "GAME_SDK_LLM_FAILED",
    );
  }
  return payload.response;
}

async function requestPreviewContentSource(
  creatorSlug: string,
  gameId: string,
  operation: keyof GameSdkContentSource,
  request: unknown,
) {
  const response = await fetch("/api/sdk-preview/content-source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      creatorSlug,
      gameId,
      operation,
      request,
    }),
  });
  const payload = await response.json().catch(() => null) as {
    response?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok || !payload || !("response" in payload)) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "GAME_SDK_CONTENT_FAILED",
    );
  }
  return payload.response;
}

function previewTimestamp() {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function previewNow() {
  return Date.now();
}

function createPreviewRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return `GF${String((values[0] % 90) + 10)}`;
}

function PreviewViewerSelector({
  players,
  selectedViewerId,
  showSpectator,
  onChange,
}: PreviewViewerSelectorProps) {
  const choices = [
    ...players.map((player) => ({ id: player.id, label: player.name })),
    ...(showSpectator ? [{ id: "spectator", label: "観戦者" }] : []),
  ];

  return (
    <fieldset data-sdk-preview-viewer-selector>
      <legend className="text-xs font-bold text-slate-700">閲覧視点</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {choices.map((choice) => {
          const selected = choice.id === selectedViewerId;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(choice.id)}
              className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
                selected
                  ? "border-cyan-500 bg-cyan-100 text-cyan-950 shadow-sm"
                  : "border-slate-300 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50"
              }`}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SdkPreviewGameShell({
  backHref,
  creatorSlug,
  gameId,
  runtimeUrl,
  title,
  moduleProfile,
  settingDefinitions,
}: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const logSequenceRef = useRef(0);
  const [surface, setSurface] = useState<PreviewSurface>("entry");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("GF01");
  const [players, setPlayers] = useState<PreviewPlayer[]>([
    { id: "host", name: "あなた", role: "host", dummy: false },
  ]);
  const [viewerId, setViewerId] = useState("host");
  const [revision, setRevision] = useState(0);
  const [settingValues, setSettingValues] = useState(
    () => createSdkPreviewSettingValues(settingDefinitions),
  );
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [frameHeight, setFrameHeight] = useState(680);
  const [message, setMessage] = useState("");
  const [moduleListOpen, setModuleListOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [gameAdapterReady, setGameAdapterReady] = useState(false);
  const [logs, setLogs] = useState<PreviewLogEntry[]>([]);
  const [labRound, setLabRound] = useState(1);
  const [labTurn, setLabTurn] = useState(0);
  const [labResult, setLabResult] = useState("共通進行部品は操作テストできます。");
  const [contentSample, setContentSample] = useState("サンプル未取得");
  const [contentSamplePending, setContentSamplePending] = useState(false);
  const [contentDifficulty, setContentDifficulty] =
    useState<GameSdkContentDifficulty>("normal");
  const [llmSample, setLlmSample] = useState("AIサンプル未生成");
  const [llmSamplePending, setLlmSamplePending] = useState(false);
  const [drawingStrokes, setDrawingStrokes] = useState<DrawingStroke[]>([]);
  const [standardResult, setStandardResult] =
    useState<GameSdkStandardResultView | null>(null);

  const requiredModuleIds = requiredGameSdkModuleIds(moduleProfile);
  const resolvedModules = useMemo(
    () => resolveRequiredSdkPreviewModules(moduleProfile),
    [moduleProfile],
  );
  const moduleRequired = (
    id: Parameters<typeof gameSdkModuleIsRequired>[1],
  ) => gameSdkModuleIsRequired(moduleProfile, id);
  const phase: PreviewPhase = surface === "entry" ? "lobby" : surface;
  const dummyPlayers = players.filter((player) => player.dummy);
  const configuredMaximumPlayers = sdkPreviewNumericSettingValue(
    settingDefinitions,
    settingValues,
    "maximum-players",
  );
  const maximumPlayers = Math.max(
    1,
    Math.min(50, Math.floor(configuredMaximumPlayers ?? 12)),
  );
  const hasMaximumPlayersSetting = Boolean(
    sdkPreviewSettingByRole(settingDefinitions, "maximum-players"),
  );
  const rounds = Math.max(
    1,
    Math.floor(
      sdkPreviewNumericSettingValue(
        settingDefinitions,
        settingValues,
        "round-count",
      ) ?? 3,
    ),
  );
  const timeLimitSeconds = Math.max(
    0,
    Math.floor(
      sdkPreviewNumericSettingValue(
        settingDefinitions,
        settingValues,
        "time-limit",
      ) ?? 60,
    ),
  );

  const appendLog = (label: string) => {
    logSequenceRef.current += 1;
    setLogs((current) => [{
      id: logSequenceRef.current,
      label,
      at: previewTimestamp(),
    }, ...current].slice(0, 24));
  };

  const bumpRevision = (label: string) => {
    setRevision((current) => current + 1);
    appendLog(label);
  };

  const send = (name: PreviewCommand, payload: Record<string, unknown> = {}) => {
    frameRef.current?.contentWindow?.postMessage({
      type: "game-fields:command",
      name,
      payload,
    }, "*");
  };

  const hydrateFrame = (
    nextPlayers = players,
    nextRoomCode = roomCode,
    nextViewerId = viewerId,
  ) => {
    send("room:hydrate", {
      roomCode: nextRoomCode,
      viewerId: nextViewerId,
      players: nextPlayers,
    });
    send("settings:sync", { settings: settingValues });
    send("timer:sync", {
      durationSeconds: timeLimitSeconds,
      startedAt: phase === "playing" ? startedAt : null,
    });
    send("phase:set", { phase });
  };

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as {
        type?: unknown;
        resource?: unknown;
        requestId?: unknown;
        request?: unknown;
        command?: unknown;
        height?: unknown;
        state?: {
          phase?: unknown;
          gameAdapterReady?: unknown;
          standardResult?: unknown;
        };
      } | null;
      if (
        data?.type === "game-fields:frame-size"
        && typeof data.height === "number"
        && Number.isFinite(data.height)
      ) {
        setFrameHeight(Math.min(12000, Math.max(320, Math.ceil(data.height))));
        return;
      }
      if (
        data?.type === "game-fields:resource-request"
        && data.resource === "content-source"
        && typeof data.requestId === "string"
      ) {
        const requestId = data.requestId.slice(0, 120);
        const target = frameRef.current?.contentWindow;
        if (!gameSdkModuleIsRequired(moduleProfile, "content-source")) {
          target?.postMessage({
            type: "game-fields:resource-response",
            resource: "content-source",
            requestId,
            ok: false,
            error: "GAME_SDK_CONTENT_MODULE_REQUIRED",
          }, "*");
          return;
        }
        const envelope = data.request
          && typeof data.request === "object"
          && !Array.isArray(data.request)
          ? data.request as {
              operation?: unknown;
              request?: unknown;
            }
          : null;
        const operation = (
          envelope?.operation === "drawWords"
          || envelope?.operation === "drawWordPairs"
          || envelope?.operation === "findDefinitions"
        )
          ? envelope.operation
          : null;
        if (!operation) {
          target?.postMessage({
            type: "game-fields:resource-response",
            resource: "content-source",
            requestId,
            ok: false,
            error: "GAME_SDK_CONTENT_INPUT_REQUIRED",
          }, "*");
          return;
        }
        void requestPreviewContentSource(
          creatorSlug,
          gameId,
          operation,
          envelope?.request,
        ).then((response) => {
          target?.postMessage({
            type: "game-fields:resource-response",
            resource: "content-source",
            requestId,
            ok: true,
            response,
          }, "*");
        }).catch((error: unknown) => {
          target?.postMessage({
            type: "game-fields:resource-response",
            resource: "content-source",
            requestId,
            ok: false,
            error: error instanceof Error
              ? error.message
              : "GAME_SDK_CONTENT_FAILED",
          }, "*");
        });
        return;
      }
      if (
        data?.type === "game-fields:resource-request"
        && data.resource === "llm"
        && typeof data.requestId === "string"
      ) {
        const requestId = data.requestId.slice(0, 120);
        const target = frameRef.current?.contentWindow;
        if (!gameSdkModuleIsRequired(moduleProfile, "llm")) {
          target?.postMessage({
            type: "game-fields:resource-response",
            resource: "llm",
            requestId,
            ok: false,
            error: "GAME_SDK_LLM_MODULE_REQUIRED",
          }, "*");
          return;
        }
        void generatePreviewLlm(
          creatorSlug,
          gameId,
          data.request,
        ).then((response) => {
          target?.postMessage({
            type: "game-fields:resource-response",
            resource: "llm",
            requestId,
            ok: true,
            response,
          }, "*");
        }).catch((error: unknown) => {
          target?.postMessage({
            type: "game-fields:resource-response",
            resource: "llm",
            requestId,
            ok: false,
            error: error instanceof Error
              ? error.message
              : "GAME_SDK_LLM_FAILED",
          }, "*");
        });
        return;
      }
      if (data?.type !== "game-fields:state") return;
      if (data.command === "timer:turn-complete") {
        setStartedAt(previewNow());
      }
      if (data.command === "timer:expired") {
        logSequenceRef.current += 1;
        setLogs((current) => [{
          id: logSequenceRef.current,
          label: "制限時間に到達し、ゲーム固有の時間切れ処理を実行",
          at: previewTimestamp(),
        }, ...current].slice(0, 24));
        setMessage("制限時間に到達しました。ゲーム固有Runtimeの時間切れ処理を確認してください。");
      }
      if (typeof data.state?.gameAdapterReady === "boolean") {
        setGameAdapterReady(data.state.gameAdapterReady);
      }
      if (data.command === "result:submitted") {
        try {
          setStandardResult(defineGameSdkStandardResultView(
            data.state?.standardResult as GameSdkStandardResultView,
            { participantCount: players.length },
          ));
          setMessage("");
        } catch {
          setStandardResult(null);
          setMessage("ゲーム固有Runtimeから受け取った結果形式が正しくありません。");
        }
      }
      if (
        surface !== "entry"
        && (
          data.state?.phase === "lobby"
          || data.state?.phase === "playing"
          || data.state?.phase === "result"
        )
      ) {
        setSurface(data.state.phase);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [creatorSlug, gameId, moduleProfile, players.length, surface]);

  const enterRoom = (input: {
    code: string;
    members: PreviewPlayer[];
    action: string;
  }) => {
    setRoomCode(input.code);
    setPlayers(input.members);
    setViewerId("host");
    setSurface("lobby");
    setFrameHeight(680);
    setRevision(1);
    setMessage("");
    setStartedAt(previewNow());
    setStandardResult(null);
    appendLog(input.action);
  };

  const createRoom = () => {
    enterRoom({
      code: createPreviewRoomCode(),
      members: [{ id: "host", name: "あなた", role: "host", dummy: false }],
      action: "部屋を作成",
    });
  };

  const joinRoom = () => {
    const normalized = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(normalized)) {
      setMessage("部屋コードは英数字4文字で入力してください。");
      return;
    }
    enterRoom({
      code: normalized,
      members: [
        { id: "host", name: "あなた", role: "host", dummy: false },
        { id: "michel", name: "Michel", role: "player", dummy: false },
        { id: "sora", name: "Sora", role: "player", dummy: false },
      ],
      action: `部屋 ${normalized} へ参加`,
    });
  };

  const startGame = () => {
    if (!gameAdapterReady) {
      setMessage("ゲーム固有Runtimeへ接続できていません。隔離PreviewのCSS・JavaScript読込を確認してください。");
      appendLog("ゲーム固有Runtime未接続のため開始を拒否");
      return;
    }
    try {
      assertGameSdkCanStart({
        actorId: "host",
        hostId: "host",
        phase,
        participantCount: players.length,
        minimumPlayers: SDK_PREVIEW_MINIMUM_PLAYERS,
      });
    } catch {
      setMessage("ゲームを開始できません。参加者とフェーズを確認してください。");
      return;
    }
    setMessage("");
    setStandardResult(null);
    const nextStartedAt = previewNow();
    setStartedAt(nextStartedAt);
    send("timer:sync", {
      durationSeconds: timeLimitSeconds,
      startedAt: nextStartedAt,
    });
    setSurface("playing");
    send("game:start");
    bumpRevision("ゲーム開始");
  };

  const abortGame = () => {
    send("game:abort");
    setSurface("lobby");
    setStartedAt(previewNow());
    setStandardResult(null);
    bumpRevision("ゲームを中断してロビーへ復帰");
  };

  const finishGame = () => {
    send("phase:set", { phase: "result" });
    setSurface("result");
    bumpRevision("共通結果へ遷移");
  };

  const returnToRoom = () => {
    send("game:rematch");
    setSurface("lobby");
    setFrameHeight(680);
    setStartedAt(previewNow());
    bumpRevision("同じ参加者で部屋へ復帰");
  };

  const dissolveRoom = () => {
    setSurface("entry");
    setRoomCode("");
    setPlayers([{ id: "host", name: "あなた", role: "host", dummy: false }]);
    setRevision(0);
    setStandardResult(null);
    setMessage("部屋を解散しました。");
    appendLog("部屋を解散");
  };

  const addDummy = () => {
    if (players.length >= maximumPlayers) return;
    const nextNumber = dummyPlayers.length + 1;
    const nextPlayers = [...players, {
      id: `dummy-${nextNumber}`,
      name: `ダミー${String(nextNumber).padStart(2, "0")}`,
      role: "player" as const,
      dummy: true,
    }];
    setPlayers(nextPlayers);
    send("room:hydrate", { roomCode, viewerId, players: nextPlayers });
    bumpRevision("ダミー参加者を追加");
  };

  const removeDummy = (participantId: string) => {
    const nextPlayers = players.filter((player) => player.id !== participantId);
    const nextViewer = nextPlayers.some((player) => player.id === viewerId)
      ? viewerId
      : "host";
    setPlayers(nextPlayers);
    setViewerId(nextViewer);
    send("room:hydrate", {
      roomCode,
      viewerId: nextViewer,
      players: nextPlayers,
    });
    bumpRevision("ダミー参加者を削除");
  };

  const changeViewer = (nextViewerId: string) => {
    setViewerId(nextViewerId);
    send("viewer:set", { viewerId: nextViewerId });
    appendLog(`閲覧視点を ${nextViewerId === "spectator" ? "観戦者" : nextViewerId} へ変更`);
  };

  const changeSetting = (
    definition: GameSdkSettingDefinition,
    value: GameSdkSettingValue,
  ) => {
    const nextValues = {
      ...settingValues,
      [definition.key]: value,
    };
    setSettingValues(nextValues);
    send("settings:sync", { settings: nextValues });
    if (
      definition.platformRole === "time-limit"
      && typeof value === "number"
    ) {
      send("timer:sync", {
        durationSeconds: value,
        startedAt: surface === "playing" ? startedAt : null,
      });
    }
    bumpRevision(`${definition.label.ja}を更新`);
  };

  const runFlowLab = (kind: "round" | "turn" | "collect" | "vote" | "assign") => {
    if (kind === "round") {
      const next = nextGameSdkRoundStep({
        currentRound: labRound,
        totalRounds: rounds,
        repeatPhase: "playing",
        completedPhase: "result",
      });
      setLabRound(next.complete ? 1 : next.round);
      setLabResult(next.complete ? "最終ラウンドを検出し、結果へ遷移しました。" : `ラウンド${next.round}へ進みました。`);
      return;
    }
    if (kind === "turn") {
      const nextSeat = nextGameSdkEligibleSeat(
        players.map((player) => player.id),
        labTurn,
      );
      setLabTurn(nextSeat);
      setLabResult(`次の手番はseat ${nextSeat + 1}です。`);
      return;
    }
    if (kind === "collect") {
      const ids = players.map((player) => player.id);
      let collected: Partial<Record<string, string>> = {};
      for (const id of ids) {
        collected = recordGameSdkParticipantValue(
          collected,
          id,
          `${id}の提出`,
          { participantIds: ids },
        );
      }
      setLabResult(allGameSdkParticipantsComplete(ids, (id) => Boolean(collected[id]))
        ? `${ids.length}人全員の文章・選択を収集しました。`
        : "未提出者がいます。");
      return;
    }
    if (kind === "vote") {
      const ids = players.map((player) => player.id);
      if (ids.length < 2) {
        setLabResult("投票テストには2人以上必要です。");
        return;
      }
      const votes = recordGameSdkVote({}, ids[0]!, ids[1]!, {
        voterIds: ids,
        targetIds: ids,
      });
      const tally = tallyGameSdkVotes(votes, ids);
      setLabResult(`投票を集計しました。最多 ${tally.maximumVotes}票、先頭seat ${ids.indexOf(tally.leaderIds[0]!) + 1}。`);
      return;
    }
    const ids = players.map((player) => player.id);
    const roles = assignGameSdkRoles(ids, { leader: 1 }, "member", () => 0);
    const teams = distributeGameSdkBalancedTeams(ids, ["red", "blue"], () => 0);
    setLabResult(`役職 ${Object.keys(roles).length}人、チーム ${new Set(Object.values(teams.assignments)).size}組を割り当てました。`);
  };

  const testLlmActivity = async () => {
    if (llmSamplePending) return;
    setLlmSamplePending(true);
    try {
      const response = await generatePreviewLlm(
        creatorSlug,
        gameId,
        {
          task: "preview-connection-check",
          prompt: "Game Fields SDKの共通AI接続確認です。「接続できました」と日本語だけで短く答えてください。",
          promptVersion: "sdk-preview-connection-v1",
          quality: "standard",
          timeoutMs: 15000,
        } satisfies GameSdkLlmRequest,
      );
      setLlmSample(response.text);
      setLabResult(
        `共通LLM adapterから${response.generation.provider}の回答を取得しました。`,
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setLabResult(
        code === "GAME_SDK_LLM_UNAVAILABLE"
          ? "利用できるAI APIがありません。プレイヤーメニューの「API」から接続してください。"
          : "共通LLMから回答を取得できませんでした。API接続と利用上限を確認してください。",
      );
    } finally {
      setLlmSamplePending(false);
    }
  };

  const testContentSource = async () => {
    if (contentSamplePending) return;
    setContentSamplePending(true);
    try {
      const payload = await requestPreviewContentSource(
        creatorSlug,
        gameId,
        "drawWords",
        {
          pool: "general-words",
          difficulty: contentDifficulty,
          count: 1,
        },
      ) as Array<{ surface?: unknown; difficulty?: unknown }>;
      const word = Array.isArray(payload) ? payload[0] : null;
      const surface = typeof word?.surface === "string"
        ? word.surface.trim()
        : "";
      if (!surface) throw new Error("SDK_CONTENT_SAMPLE_FAILED");
      const actualDifficulty = typeof word?.difficulty === "string"
        ? word.difficulty
        : contentDifficulty;
      setContentSample(`${surface}（返却難易度: ${actualDifficulty}）`);
      setLabResult(`共通単語DBから「${contentDifficulty}」設定で候補を取得しました。`);
    } catch {
      setLabResult("共通単語DBから素材を取得できませんでした。ログインと接続設定を確認してください。");
    } finally {
      setContentSamplePending(false);
    }
  };

  const settingsItems = settingDefinitions.map((definition) => ({
    label: definition.label.ja,
    value: formatSdkPreviewSettingValue(
      definition,
      settingValues[definition.key] ?? definition.defaultValue,
    ),
  }));

  const groupedModules = (["platform", "shell", "flow", "resource"] as const).map((group) => ({
    group,
    modules: resolvedModules.filter((module) => module.group === group),
  }));

  return (
    <main className={`min-h-screen bg-slate-950 text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="SDK DEVELOPMENT" title={title}>
        <button type="button" className={commandClass} onClick={() => setPlayerMenuOpen(true)}>
          <span className="mr-2 inline-block h-5 w-5 rounded-full bg-cyan-300 align-middle" aria-hidden="true" />
          あなた
        </button>
        {surface !== "entry" && moduleRequired("debug") && (
          <button type="button" className={commandClass} onClick={() => setDebugOpen(true)}>
            {debugEnabled ? "DEBUG · ON" : "DEBUG"}
          </button>
        )}
        <button type="button" className={commandClass} onClick={() => setRulesOpen(true)}>ルール</button>
        <GameTopMenu>
          <button
            type="button"
            data-menu-close="true"
            className={gameTopMenuItemClass}
            onClick={() => setModuleListOpen(true)}
          >
            <span>共通モジュール</span>
            <span>{requiredModuleIds.length}/{GAME_SDK_MODULE_IDS.length} 接続</span>
          </button>
          <Link href={backHref} data-menu-close="true" className={gameTopMenuItemClass}>
            制作者の広場へ戻る
          </Link>
        </GameTopMenu>
      </GameTopBanner>

      {surface === "entry" && (
        <section className="mx-auto grid max-w-6xl gap-5 px-4 py-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]" data-sdk-preview-surface="entry">
          <div className={panelClass}>
            <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-700">Online room</p>
            <h2 className="mt-2 text-3xl font-black">プレイする部屋を選ぶ</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              ここから先はSDK基本セットが所有します。ゲーム固有packageは部屋や参加者を作らず、プレイ領域だけを提供します。
            </p>
            <button type="button" className={`${primaryClass} mt-6 w-full`} onClick={createRoom}>新しい部屋を作る</button>
            <div className="my-5 flex items-center gap-3 text-xs font-bold text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              または部屋へ参加
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={joinCode}
                maxLength={4}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                className="rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg font-black uppercase outline-none focus:border-cyan-500"
                aria-label="部屋コード"
              />
              <button type="button" className={secondaryClass} onClick={joinRoom}>コードで参加</button>
            </div>
            {message && <p className="mt-3 text-sm font-bold text-rose-700" role="status">{message}</p>}
          </div>

          <div className="space-y-4">
            <div className={panelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">Available room</p>
                  <h3 className="mt-1 text-xl font-black">{title} テスト部屋</h3>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                  {hasMaximumPlayersSetting ? `2 / ${maximumPlayers}` : "2人"}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-100 p-3"><dt className="text-xs text-slate-500">部屋コード</dt><dd className="mt-1 font-mono font-black">GF01</dd></div>
                <div className="rounded-lg bg-slate-100 p-3"><dt className="text-xs text-slate-500">状態</dt><dd className="mt-1 font-black">参加受付中</dd></div>
              </dl>
              <button type="button" className={`${secondaryClass} mt-4 w-full`} onClick={() => {
                setJoinCode("GF01");
                joinRoom();
              }}>この部屋へ参加</button>
            </div>
            {moduleRequired("ads") && (
              <GameAdSlot gameId={gameId} surface="game-entry" disabled={debugEnabled} className="w-full" />
            )}
          </div>
        </section>
      )}

      {(surface === "lobby" || surface === "playing") && (
        <section
          className={`mx-auto grid w-full gap-5 px-4 py-6 ${surface === "lobby" ? "max-w-6xl lg:grid-cols-[340px_minmax(0,1fr)]" : "max-w-[1600px] lg:grid-cols-[minmax(0,1fr)_280px]"}`}
          data-sdk-preview-surface={surface}
        >
          <aside className={`space-y-4 ${surface === "playing" ? "lg:order-2" : "lg:order-1"}`}>
            <div className={panelClass}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.16em] text-cyan-700">Room {roomCode}</p>
                  <h2 className="mt-1 text-2xl font-black">{surface === "lobby" ? "ゲーム開始前" : "プレイ中"}</h2>
                </div>
                <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-800">rev {revision}</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <strong>参加者</strong>
                <span>
                  {hasMaximumPlayersSetting
                    ? `${players.length} / ${maximumPlayers}人`
                    : `${players.length}人`}
                </span>
              </div>
              <ul className="mt-2 space-y-2">
                {players.map((player, seat) => (
                  <li key={player.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${player.id === viewerId ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}>
                    <span className="font-bold">{surface === "playing" ? `SEAT ${seat + 1} · ` : ""}{player.name}{player.dummy ? "（ダミー）" : ""}</span>
                    <span className="text-[10px] font-black uppercase text-slate-500">{player.role === "host" ? "HOST" : "PLAYER"}</span>
                  </li>
                ))}
              </ul>
              {surface === "lobby" && moduleRequired("start-guard") && (
                <button type="button" className={`${primaryClass} mt-4 w-full`} onClick={startGame}>ゲーム開始</button>
              )}
              {message && <p className="mt-3 text-sm font-bold text-rose-700" role="status">{message}</p>}
            </div>

            {surface === "lobby" && moduleRequired("room-settings") && (
              <div className={`${panelClass} space-y-4`}>
                <SdkPreviewSettingsControl
                  definitions={settingDefinitions}
                  values={settingValues}
                  onChange={changeSetting}
                />
                <RoomConfigSummary items={settingsItems} />
              </div>
            )}

            {surface === "playing" && (
              <div className={panelClass}>
                <RoomConfigSummary items={settingsItems} title="現在の部屋設定" />
              </div>
            )}

            {surface === "lobby" && (
              <OnlineRoomLifecycleActions
                surface="lobby"
                isHost
                onDissolve={moduleRequired("dissolution") ? dissolveRoom : undefined}
              />
            )}
          </aside>

          <div className={`space-y-4 ${surface === "playing" ? "lg:order-1" : "lg:order-2"}`}>
            <div className={surface === "playing" ? "grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 md:grid-cols-[1fr_auto_auto] md:items-center" : "hidden"}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-cyan-300 px-3 py-1 font-black text-slate-950">Room {roomCode}</span>
                <span className="font-bold">{players.length}人</span>
                <span className="text-slate-400">rev {revision} · 視点 {viewerId === "spectator" ? "観戦者" : viewerId}</span>
              </div>
              {moduleRequired("standard-outcome") && (
                <button type="button" className={commandClass} onClick={finishGame}>結果画面を確認</button>
              )}
            </div>
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl shadow-black/30">
              <header className={surface === "lobby" ? "flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 text-slate-950" : "hidden"}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-500">Game-specific slot</p>
                  <strong>ゲーム固有画面の確認</strong>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${gameAdapterReady ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                  {gameAdapterReady ? "ゲーム固有Runtime接続済み" : "ゲーム固有Runtime未接続"}
                </span>
              </header>
              <iframe
                ref={frameRef}
                className="block min-h-[320px] w-full border-0 bg-white"
                style={{ height: `${frameHeight}px` }}
                src={runtimeUrl}
                title={`${title}のゲーム固有領域`}
                sandbox="allow-scripts allow-modals allow-pointer-lock"
                referrerPolicy="no-referrer"
                allow="fullscreen"
                onLoad={() => hydrateFrame()}
              />
            </section>
            {surface === "lobby" && moduleRequired("ads") && (
              <GameAdSlot gameId={gameId} surface="room-lobby" disabled={debugEnabled} />
            )}
          </div>
        </section>
      )}

      {surface === "result" && (
        <section className="mx-auto grid max-w-5xl gap-5 px-4 py-7 lg:grid-cols-[minmax(0,1fr)_340px]" data-sdk-preview-surface="result">
          <div className={`${panelClass} overflow-hidden`}>
            <p className="text-xs font-black uppercase tracking-[.18em] text-amber-700">Standard result</p>
            <h2 className="mt-2 text-4xl font-black">ゲーム終了</h2>
            <p className="mt-2 text-slate-600">ゲーム固有の勝敗を共通結果形式へ投影した確認用表示です。</p>
            {standardResult ? (
              <>
                <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                  終了理由: {standardResult.reason}
                </p>
                <ol className="mt-6 space-y-3">
                  {standardResult.rankings.map((ranking) => {
                    const won = standardResult.winnerSeats.includes(ranking.seat);
                    return (
                      <li key={ranking.seat} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${won ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                        <div className="flex items-center gap-3">
                          <span className={`grid h-9 w-9 place-items-center rounded-full font-black ${won ? "bg-amber-300 text-amber-950" : "bg-slate-200"}`}>{ranking.rank}</span>
                          <strong>{ranking.displayName}{ranking.isSelf ? "（あなた）" : ""}</strong>
                        </div>
                        <span className="font-mono font-black">{ranking.score} pt</span>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                ゲーム固有Runtimeから共通結果データが送られていません。仮順位・仮得点は生成しません。
              </div>
            )}
            <OnlineRoomLifecycleActions
              surface="result"
              canReturnToRoom
              isHost
              onReturnToRoom={returnToRoom}
              onDissolve={moduleRequired("dissolution") ? dissolveRoom : undefined}
              returnHref={backHref}
            />
          </div>

          <aside className="space-y-4">
            {(moduleRequired("stats") || moduleRequired("rating") || moduleRequired("replay")) && (
              <div className={panelClass}>
                <p className="text-xs font-black uppercase tracking-[.16em] text-violet-700">Platform records</p>
                <dl className="mt-3 space-y-3 text-sm">
                  {moduleRequired("stats") && <div className="flex justify-between gap-3"><dt className="text-slate-500">戦績</dt><dd className="font-black">1戦を保存予定</dd></div>}
                  {moduleRequired("rating") && <div className="flex justify-between gap-3"><dt className="text-slate-500">レーティング</dt><dd className="font-black">+16 preview</dd></div>}
                  {moduleRequired("replay") && <div className="flex justify-between gap-3"><dt className="text-slate-500">プレイバック</dt><dd className="font-black">本人向け記録</dd></div>}
                </dl>
              </div>
            )}
            {moduleRequired("result-share") && (
              <GameResultShareButton
                title={`${title}の結果`}
                text={`${title}を${players.length}人でプレイしました。`}
                url={backHref}
              />
            )}
            {moduleRequired("ads") && (
              <GameAdSlot gameId={gameId} surface="result" disabled={debugEnabled} />
            )}
          </aside>
        </section>
      )}

      {playerMenuOpen && (
        <div className="fixed inset-0 z-[9998] bg-slate-950/70 p-4" onClick={() => setPlayerMenuOpen(false)}>
          <section className="ml-auto mt-20 w-full max-w-sm rounded-2xl bg-white p-5 text-slate-950 shadow-2xl" role="dialog" aria-label="プレイヤーメニュー" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 rounded-full bg-cyan-300" aria-hidden="true" />
              <div><strong className="text-lg">あなた</strong><p className="text-xs text-slate-500">SDK確認用アカウント</p></div>
            </div>
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              認証済みセッション · 所有者権限 · 表示用IDはゲームslotへ渡しません
            </div>
            {moduleRequired("llm") && (
              <div className="mt-3">
                <PaidLlmAccessButton variant="menu" />
              </div>
            )}
            <Link href="/users/me" className={`${secondaryClass} mt-3 block text-center`}>マイページを確認</Link>
            <button type="button" className={`${secondaryClass} mt-2 w-full`} onClick={() => setPlayerMenuOpen(false)}>閉じる</button>
          </section>
        </div>
      )}

      {debugOpen && (
        <DebugToolWindow
          initialPosition={{ top: 88, left: 12 }}
          onClose={() => setDebugOpen(false)}
          persistentContent={debugEnabled ? (
            <PreviewViewerSelector
              players={players}
              selectedViewerId={viewerId}
              showSpectator={moduleRequired("spectators")}
              onChange={changeViewer}
            />
          ) : undefined}
        >
          <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-950">
            <div className="flex justify-between gap-3"><strong>部屋同期</strong><span>Preview bridge</span></div>
            <div className="mt-1 flex justify-between gap-3 font-mono text-[11px]"><span>revision {revision}</span><span>{roomCode || "NO ROOM"}</span></div>
          </div>
          <button
            type="button"
            onClick={() => {
              setDebugEnabled((current) => !current);
              appendLog("デバッグモードを切替");
            }}
            className={`mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold ${debugEnabled ? "border-cyan-300 bg-cyan-50 text-cyan-950" : "border-slate-300 bg-slate-50 text-slate-700"}`}
          >
            <span>デバッグモード</span><span>{debugEnabled ? "ON" : "OFF"}</span>
          </button>
          {debugEnabled && (
            <>
              <DebugParticipantControls
                participants={dummyPlayers}
                disabled={surface !== "lobby"}
                addDisabled={players.length >= maximumPlayers}
                onAdd={addDummy}
                onRemove={removeDummy}
                run={async (action) => { await action(); }}
              />
              {surface === "playing" && (
                <button type="button" className={`${secondaryClass} mt-3 w-full`} onClick={() => {
                  send("game:auto-progress");
                  appendLog("ダミーで自動進行");
                }}>ダミーで自動進行</button>
              )}
              {surface === "playing" && <button type="button" className="mt-2 w-full rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 font-black text-rose-700" onClick={abortGame}>ゲームを中断</button>}
              <button type="button" className={`${secondaryClass} mt-3 w-full`} onClick={() => setModuleListOpen(true)}>共通モジュール実体を確認</button>
              <section className="mt-3 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-black text-slate-700">安全な操作ログ</p>
                {logs.length === 0 ? <p className="mt-2 text-xs text-slate-400">まだ操作はありません。</p> : (
                  <ol className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {logs.map((entry) => <li key={entry.id} className="flex justify-between gap-3 text-[11px] text-slate-600"><span>{entry.label}</span><time>{entry.at}</time></li>)}
                  </ol>
                )}
              </section>
            </>
          )}
        </DebugToolWindow>
      )}

      {moduleListOpen && (
        <div className="fixed inset-0 z-[9997] overflow-y-auto bg-slate-950/90 p-4" onClick={() => setModuleListOpen(false)}>
          <section role="dialog" aria-label="共通モジュール一覧" className="mx-auto my-6 w-full max-w-5xl rounded-2xl border border-cyan-300/30 bg-slate-950 p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-cyan-200">Executable platform composition</p>
                <h2 className="mt-1 text-2xl font-black">必須 {requiredModuleIds.length}/{GAME_SDK_MODULE_IDS.length} · 実体接続済み {resolvedModules.length}</h2>
                <p className="mt-1 text-xs text-slate-400">IDだけでなく、下記の本体部品・SDK helper・Preview adapterへ解決しています。</p>
              </div>
              <button type="button" className={commandClass} onClick={() => setModuleListOpen(false)}>閉じる</button>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              {groupedModules.map(({ group, modules }) => (
                <section key={group} className="rounded-xl border border-white/10 bg-white/[.04] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black">{moduleGroupLabels[group]}</h3>
                    <span className="text-xs text-slate-400">{modules.length}件</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {modules.map((module) => (
                      <article key={module.id} className="rounded-lg border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-2" data-sdk-preview-module={module.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <strong className="text-sm">{module.label}</strong>
                            <code className="ml-2 text-[10px] text-cyan-200">{module.id}</code>
                          </div>
                          <span className="shrink-0 rounded-full bg-emerald-300/15 px-2 py-0.5 text-[10px] font-black text-emerald-200">接続済み</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-300">{module.implementation.source}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{module.implementation.surfaces.map((surfaceName: SdkPreviewModuleSurface) => surfaceName).join(" · ")}</p>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <section className="mt-6 rounded-xl border border-violet-300/20 bg-violet-300/[.06] p-4">
              <h3 className="text-lg font-black">共通進行部品の操作テスト</h3>
              <p className="mt-1 text-sm text-slate-300">{labResult}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-5">
                <button type="button" className={commandClass} onClick={() => runFlowLab("round")}>次ラウンド</button>
                <button type="button" className={commandClass} onClick={() => runFlowLab("turn")}>次の手番</button>
                <button type="button" className={commandClass} onClick={() => runFlowLab("collect")}>提出収集</button>
                <button type="button" className={commandClass} onClick={() => runFlowLab("vote")}>投票集計</button>
                <button type="button" className={commandClass} onClick={() => runFlowLab("assign")}>役職・チーム</button>
              </div>
            </section>

            <section className="mt-6 grid gap-4 lg:grid-cols-3">
              {(moduleRequired("content-source") || moduleRequired("llm")) && (
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-4">
                  <h3 className="font-black">コンテンツ・LLM</h3>
                  <p className="mt-2 rounded-lg bg-black/20 p-3 text-sm text-cyan-100">{contentSample}</p>
                  {moduleRequired("content-source") && (
                    <label className="mt-3 block text-xs font-bold text-slate-200">
                      単語難易度
                      <select
                        value={contentDifficulty}
                        onChange={(event) => setContentDifficulty(
                          event.target.value as GameSdkContentDifficulty,
                        )}
                        className="mt-1 w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        <option value="easy">簡単</option>
                        <option value="normal">普通</option>
                        <option value="hard">難しい</option>
                      </select>
                    </label>
                  )}
                  {moduleRequired("llm") && (
                    <p className="mt-2 rounded-lg bg-black/20 p-3 text-sm text-violet-100">
                      {llmSample}
                    </p>
                  )}
                  {moduleRequired("content-source") && <button
                    type="button"
                    className={`${commandClass} mt-3 w-full`}
                    disabled={contentSamplePending}
                    onClick={() => void testContentSource()}
                  >
                    {contentSamplePending ? "取得中…" : "素材を取得"}
                  </button>}
                  {moduleRequired("llm") && <button
                    type="button"
                    className={`${commandClass} mt-2 w-full`}
                    disabled={llmSamplePending}
                    onClick={() => void testLlmActivity()}
                  >
                    {llmSamplePending ? "AI回答を生成中…" : "AI APIを実際に呼ぶ"}
                  </button>}
                </div>
              )}

              {moduleRequired("playing-cards") && (
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-4">
                  <h3 className="font-black">共通トランプ</h3>
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                    {previewCards.map((card) => <PlayingCard key={card.id} card={card} size="sm" />)}
                  </div>
                </div>
              )}

              {moduleRequired("drawing") && (
                <div className="rounded-xl border border-white/10 bg-white/[.04] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black">共通描画</h3>
                    <button type="button" className="text-xs font-bold text-cyan-200" onClick={() => setDrawingStrokes([])}>消去</button>
                  </div>
                  <div className="mt-3 h-44 overflow-hidden rounded-lg border border-slate-300 bg-white">
                    <DrawingCanvas
                      strokes={drawingStrokes}
                      color="#0891b2"
                      width={4}
                      opacity={1}
                      tool="pen"
                      onStrokeComplete={(stroke) => setDrawingStrokes((current) => [...current, stroke])}
                    />
                  </div>
                </div>
              )}
            </section>
          </section>
        </div>
      )}

      <GameRulesDialog open={rulesOpen} title={`${title}のルール`} onClose={() => setRulesOpen(false)}>
        <p>このダイアログはSDK基本セットの共通ルール表示です。具体的な勝敗・操作説明はゲーム固有packageから差し込みます。</p>
        <ol className="mt-4 list-decimal space-y-2 pl-5">
          <li>制作者の広場からゲームを選び、部屋を作成または参加します。</li>
          <li>参加者と部屋設定を全員で確認し、ホストがゲームを開始します。</li>
          <li>ゲーム固有slotでプレイした後、共通結果・再戦・解散導線へ戻ります。</li>
        </ol>
      </GameRulesDialog>
    </main>
  );
}
