import fs from "node:fs";

const framePath = "app/components/GameSdkFrame.tsx";
let frame = fs.readFileSync(framePath, "utf8");

frame = frame.replace(
`import { useGameSdkDebugControlTarget } from "@/app/hooks/use-game-sdk-debug-control-target";`,
`import { useGameSdkDebugControlTarget } from "@/app/hooks/use-game-sdk-debug-control-target";
import { useGameSdkDebugScenario } from "@/app/hooks/use-game-sdk-debug-scenario";`
);

frame = frame.replace(
`  const debugControl = useGameSdkDebugControlTarget<PackageRoom>({\n    getRoom: () => roomRef.current,\n    readRoomAsDebugViewer: (code, viewer) => (\n      runtime.readRoomAsDebugViewer(code, viewer)\n    ),\n    postRoomSnapshot,\n    onViewerError: () => {\n      setMessage("選択した閲覧視点を取得できないため、本人視点へ戻しました。");\n    },\n  });\n  const {\n    actorSeat: debugActorSeat,\n    canSend: debugCanSend,\n    postRoom,\n    reset: resetDebugControl,\n    selectTarget: selectDebugTarget,\n    source: debugSwitchSource,\n    viewer: debugViewer,\n    wrapCommand: wrapDebugCommand,\n  } = debugControl;`,
`  const [debugActorSeat, setDebugActorSeat] = useState<number | null>(null);\n  const debugControl = useGameSdkDebugControlTarget<PackageRoom>({\n    getRoom: () => roomRef.current,\n    readRoomAsDebugViewer: (code, viewer) => (\n      runtime.readRoomAsDebugViewer(code, viewer)\n    ),\n    postRoomSnapshot,\n    onViewerError: () => {\n      setDebugActorSeat(null);\n      setMessage("選択した閲覧視点を取得できないため、本人視点へ戻しました。");\n    },\n  });\n  const {\n    canSend: debugCanSend,\n    postRoom,\n    reset: resetDebugViewer,\n    selectTarget: selectDebugTarget,\n    source: debugSwitchSource,\n    viewer: debugViewer,\n  } = debugControl;\n  const resetDebugControl = useCallback(() => {\n    setDebugActorSeat(null);\n    return resetDebugViewer();\n  }, [resetDebugViewer]);`
);

frame = frame.replace(
`  const sendPackageCommand = useCallback(async (command: SafeCommand) => (\n    send(wrapDebugCommand(command))\n  ), [send, wrapDebugCommand]);\n\n  const selectDebugViewer = useCallback((viewer: DebugViewer) => {\n    selectDebugTarget(\n      viewer === "self"\n        ? { mode: "self" }\n        : viewer === "spectator"\n          ? { mode: "spectator" }\n          : { mode: "viewer", seat: viewer },\n    );\n  }, [selectDebugTarget]);\n\n  const selectDebugActor = useCallback((seat: number | null) => {\n    if (seat !== null) {\n      const target = roomRef.current?.view.common.players[seat];\n      if (!target?.isDummy) {\n        setMessage("操作対象にはダミープレイヤーだけを選択できます。");\n        return;\n      }\n    }\n    selectDebugTarget(seat === null ? { mode: "self" } : { mode: "dummy", seat });\n  }, [selectDebugTarget]);`,
`  const debugActorViewerMismatch = debugViewer === "self"\n    || debugViewer === "spectator"\n      ? debugActorSeat !== null\n      : debugActorSeat !== debugViewer;\n\n  const sendPackageCommand = useCallback(async (command: SafeCommand) => {\n    if (debugActorViewerMismatch) {\n      throw new Error("DEBUG_ACTOR_VIEWER_MISMATCH");\n    }\n    return send(\n      debugActorSeat !== null && !command.type.startsWith("room/")\n        ? {\n            type: "room/debug-act-as-dummy",\n            seat: debugActorSeat,\n            command,\n          }\n        : command,\n    );\n  }, [debugActorSeat, debugActorViewerMismatch, send]);\n\n  const selectDebugViewer = useCallback((viewer: DebugViewer) => {\n    if (viewer === "self") {\n      setDebugActorSeat(null);\n      selectDebugTarget({ mode: "self" });\n      return;\n    }\n    if (viewer === "spectator") {\n      setDebugActorSeat(null);\n      selectDebugTarget({ mode: "spectator" });\n      return;\n    }\n    const target = roomRef.current?.view.common.players[viewer];\n    setDebugActorSeat(target?.isDummy ? viewer : null);\n    selectDebugTarget({ mode: "viewer", seat: viewer });\n  }, [selectDebugTarget]);\n\n  const selectDebugActor = useCallback((seat: number | null) => {\n    if (seat !== null) {\n      const target = roomRef.current?.view.common.players[seat];\n      if (!target?.isDummy) {\n        setMessage("操作対象にはダミープレイヤーだけを選択できます。");\n        return;\n      }\n    }\n    setDebugActorSeat(seat);\n  }, []);`
);

frame = frame.replace(
`  const autoProgressDebug = useCallback(async (\n    target: DebugAutoProgressTarget,\n  ) => {\n    const initial = roomRef.current;\n    if (!initial) throw new Error("ROOM_REQUIRED");\n    const initialOuterPhase = initial.phase;\n    const initialAppPhase = appPhase(initial);\n    const maximumSteps = target === "step"\n      ? 1\n      : target === "phase" && initialAppPhase !== null\n        ? 64\n        : target === "phase"\n          ? 1\n          : 160;\n    const perform = async () => {\n      let next = initial;\n      for (let step = 0; step < maximumSteps; step += 1) {\n        next = (await runtime.sendCommand(next.code, {\n          expectedRevision: next.revision,\n          command: { type: "room/debug-auto-progress" },\n        })).room;\n        if (\n          target === "step"\n          || (target === "result" && next.phase === "result")\n          || (\n            target === "phase"\n            && (\n              initialAppPhase === null\n              || next.phase !== initialOuterPhase\n              || appPhase(next) !== initialAppPhase\n            )\n          )\n        ) {\n          setMessage(\n            target === "step"\n              ? "DEBUG自動進行で1手進めました。"\n              : target === "phase"\n                ? initialAppPhase === null\n                  ? "Appの状態名が非公開のため、安全に1手進めました。"\n                  : \`次の状態まで進めました（\${appPhase(next) ?? next.phase}）。\`\n                : "DEBUG自動進行で結果まで完走しました。",\n          );\n          return next;\n        }\n      }\n      throw new Error("DEBUG_AUTO_PROGRESS_LIMIT");\n    };\n    return usesLlm\n      && moduleRequired("llm")\n      && moduleRequired("ai-activity")\n      ? withAiActivity("SDKゲームのDEBUG自動進行", perform)\n      : perform();\n  }, [moduleRequired, runtime, usesLlm]);`,
`  const debugScenario = useGameSdkDebugScenario<PackageRoom>({\n    getRoom: () => roomRef.current,\n    sendStep: async (current) => (await runtime.sendCommand(current.code, {\n      expectedRevision: current.revision,\n      command: { type: "room/debug-auto-progress" },\n    })).room,\n    onRoom: attachLatestRoom,\n    onComplete: (result) => {\n      setMessage(\n        result.reason === "cancelled"\n          ? \`DEBUG自動進行を中止しました（\${result.steps.length}手）。\`\n          : result.reason === "deadline"\n            ? \`DEBUG自動進行は時間上限で停止しました（\${result.steps.length}手）。\`\n            : result.reason === "step-limit"\n              ? \`DEBUG自動進行は手数上限で停止しました（\${result.steps.length}手）。\`\n              : result.reason === "unchanged-revision"\n                ? "Room revisionが進まなかったため、安全に停止しました。"\n                : result.reason === "room-changed"\n                  ? "対象Roomが変わったため、安全に停止しました。"\n                  : \`DEBUG自動進行を完了しました（\${result.steps.length}手・\${(result.durationMs / 1_000).toFixed(1)}秒）。\`,\n      );\n    },\n    onError: handleRuntimeError,\n  });\n\n  const autoProgressDebug = useCallback(async (\n    target: "step" | "phase" | "result" | "steps",\n    count?: number,\n  ) => {\n    const scenarioTarget = target === "steps"\n      ? { kind: "steps" as const, count: count ?? 1 }\n      : { kind: target };\n    const perform = () => debugScenario.run(scenarioTarget, {\n      maximumSteps: target === "steps" ? count : undefined,\n      deadlineMs: target === "result" ? 60_000 : 30_000,\n    });\n    return usesLlm\n      && moduleRequired("llm")\n      && moduleRequired("ai-activity")\n      ? withAiActivity("SDKゲームのDEBUG自動進行", perform)\n      : perform();\n  }, [debugScenario, moduleRequired, usesLlm]);`
);

frame = frame.replace(
`            error: error instanceof GameSdkHttpClientRuntimeError\n              ? error.code\n              : error instanceof Error && error.message === "DEBUG_ACTOR_SWITCH_PENDING"\n                ? "DEBUG_ACTOR_SWITCH_PENDING"\n                : "GAME_SDK_COMMAND_REJECTED",`,
`            error: error instanceof GameSdkHttpClientRuntimeError\n              ? error.code\n              : error instanceof Error && (\n                  error.message === "DEBUG_ACTOR_SWITCH_PENDING"\n                  || error.message === "DEBUG_ACTOR_VIEWER_MISMATCH"\n                )\n                ? error.message\n                : "GAME_SDK_COMMAND_REJECTED",`
);

frame = frame.replace(
`           selectedActorSeat: debugActorSeat,\n           selectedViewer: debugViewer,`,
`           actorViewerMismatch: debugActorViewerMismatch,\n           selectedActorSeat: debugActorSeat,\n           selectedViewer: debugViewer,`
);

frame = frame.replace(
`           onAutoProgress: async (target) => {\n             await run(() => autoProgressDebug(target));\n           },`,
`           autoProgress: debugScenario.progress,\n           onAutoProgress: autoProgressDebug,\n           onCancelAutoProgress: debugScenario.cancel,`
);

frame = frame.replace(
`           isSubmitting: pending,`,
`           isSubmitting: pending || debugScenario.progress.running,`
);

frame = frame.replace(
`type DebugAutoProgressTarget = "step" | "phase" | "result";\n`,
``
);

if (!frame.includes("autoProgress: debugScenario.progress")) {
  throw new Error("GameSdkFrame scenario integration did not apply");
}
fs.writeFileSync(framePath, frame);

const headerPath = "app/components/GameSdkShellHeader.tsx";
let header = fs.readFileSync(headerPath, "utf8");
header = header.replace(
`import { DebugParticipantControls } from "./DebugParticipantControls";`,
`import { DebugParticipantControls } from "./DebugParticipantControls";\nimport { GameSdkDebugScenarioControls } from "./GameSdkDebugScenarioControls";\nimport type { DebugScenarioProgress } from "@/app/hooks/use-game-sdk-debug-scenario";`
);
header = header.replace(
`export type GameSdkDebugRoom = {\n  appPhase: string | null;`,
`export type GameSdkDebugRoom = {\n  actorViewerMismatch: boolean;\n  appPhase: string | null;\n  autoProgress: DebugScenarioProgress;`
);
header = header.replace(
`  onAutoProgress: (\n    target: "step" | "phase" | "result",\n  ) => void | Promise<void>;`,
`  onAutoProgress: (\n    target: "step" | "phase" | "result" | "steps",\n    count?: number,\n  ) => void | Promise<void>;\n  onCancelAutoProgress: () => void;`
);
header = header.replace(
`      <p className="mt-1 text-[10px] leading-4 text-cyan-800">\n        playing中は、選択したダミーとしてゲーム内の合法手を送信できます。\n      </p>`,
`      <p className="mt-1 text-[10px] leading-4 text-cyan-800">\n        ダミーの閲覧視点を選ぶと、操作対象も同じプレイヤーへ自動追従します。\n      </p>\n      {debugRoom.actorViewerMismatch && (\n        <p\n          role="alert"\n          className="mt-2 rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-[10px] font-black leading-4 text-amber-900"\n        >\n          閲覧中のプレイヤーと操作対象が異なります。画面に見えている手札とは別のプレイヤーとして操作されるため、ゲーム操作を停止しています。\n        </p>\n      )}`
);
header = header.replace(
`              <DebugToolButton\n                disabled={!debugRoom.canAutoProgress || debugRoom.isSubmitting}\n                onClick={() => void debugRoom.onAutoProgress("step")}\n              >\n                1手だけ自動進行\n              </DebugToolButton>\n              <DebugToolButton\n                disabled={!debugRoom.canAutoProgress || debugRoom.isSubmitting}\n                onClick={() => void debugRoom.onAutoProgress("phase")}\n              >\n                次の主要状態まで進める\n              </DebugToolButton>\n              <DebugToolButton\n                disabled={!debugRoom.canAutoProgress || debugRoom.isSubmitting}\n                onClick={() => void debugRoom.onAutoProgress("result")}\n              >\n                結果まで自動進行\n              </DebugToolButton>`,
`              <GameSdkDebugScenarioControls\n                canRun={debugRoom.canAutoProgress && !debugRoom.isSubmitting}\n                progress={debugRoom.autoProgress}\n                onRun={debugRoom.onAutoProgress}\n                onCancel={debugRoom.onCancelAutoProgress}\n              />`
);

if (!header.includes("GameSdkDebugScenarioControls")) {
  throw new Error("GameSdkShellHeader scenario integration did not apply");
}
fs.writeFileSync(headerPath, header);

// Workflow trigger marker: scenario integration v1.
