import fs from "node:fs";

const framePath = "app/components/GameSdkFrame.tsx";
let frame = fs.readFileSync(framePath, "utf8");

frame = frame.replace(
`  const debugControl = useGameSdkDebugControlTarget<PackageRoom>({\n    getRoom: () => roomRef.current,\n    readRoomAsDebugViewer: (code, viewer) => (\n      runtime.readRoomAsDebugViewer(code, viewer)\n    ),\n    postRoomSnapshot,\n    onViewerError: () => {\n      setMessage("選択した閲覧視点を取得できないため、本人視点へ戻しました。");\n    },\n  });\n  const {\n    actorSeat: debugActorSeat,\n    canSend: debugCanSend,\n    postRoom,\n    reset: resetDebugControl,\n    selectTarget: selectDebugTarget,\n    viewer: debugViewer,\n    wrapCommand: wrapDebugCommand,\n  } = debugControl;`,
`  const [debugActorSeat, setDebugActorSeat] = useState<number | null>(null);\n  const debugControl = useGameSdkDebugControlTarget<PackageRoom>({\n    getRoom: () => roomRef.current,\n    readRoomAsDebugViewer: (code, viewer) => (\n      runtime.readRoomAsDebugViewer(code, viewer)\n    ),\n    postRoomSnapshot,\n    onViewerError: () => {\n      setDebugActorSeat(null);\n      setMessage("選択した閲覧視点を取得できないため、本人視点へ戻しました。");\n    },\n  });\n  const {\n    canSend: debugCanSend,\n    postRoom,\n    reset: resetDebugViewer,\n    selectTarget: selectDebugTarget,\n    viewer: debugViewer,\n  } = debugControl;\n  const resetDebugControl = useCallback(() => {\n    setDebugActorSeat(null);\n    return resetDebugViewer();\n  }, [resetDebugViewer]);`
);

frame = frame.replace(
`  const sendPackageCommand = useCallback(async (command: SafeCommand) => (\n    send(wrapDebugCommand(command))\n  ), [send, wrapDebugCommand]);\n\n  const selectDebugViewer = useCallback((viewer: DebugViewer) => {\n    selectDebugTarget(\n      viewer === "self"\n        ? { mode: "self" }\n        : viewer === "spectator"\n          ? { mode: "spectator" }\n          : { mode: "viewer", seat: viewer },\n    );\n  }, [selectDebugTarget]);\n\n  const selectDebugActor = useCallback((seat: number | null) => {\n    if (seat !== null) {\n      const target = roomRef.current?.view.common.players[seat];\n      if (!target?.isDummy) {\n        setMessage("操作対象にはダミープレイヤーだけを選択できます。");\n        return;\n      }\n    }\n    selectDebugTarget(seat === null ? { mode: "self" } : { mode: "dummy", seat });\n  }, [selectDebugTarget]);`,
`  const debugActorViewerMismatch = debugViewer === "self"\n    || debugViewer === "spectator"\n      ? debugActorSeat !== null\n      : debugActorSeat !== debugViewer;\n\n  const sendPackageCommand = useCallback(async (command: SafeCommand) => {\n    if (debugActorViewerMismatch) {\n      throw new Error("DEBUG_ACTOR_VIEWER_MISMATCH");\n    }\n    return send(\n      debugActorSeat !== null && !command.type.startsWith("room/")\n        ? {\n            type: "room/debug-act-as-dummy",\n            seat: debugActorSeat,\n            command,\n          }\n        : command,\n    );\n  }, [debugActorSeat, debugActorViewerMismatch, send]);\n\n  const selectDebugViewer = useCallback((viewer: DebugViewer) => {\n    if (viewer === "self") {\n      setDebugActorSeat(null);\n      selectDebugTarget({ mode: "self" });\n      return;\n    }\n    if (viewer === "spectator") {\n      setDebugActorSeat(null);\n      selectDebugTarget({ mode: "spectator" });\n      return;\n    }\n    const target = roomRef.current?.view.common.players[viewer];\n    setDebugActorSeat(target?.isDummy ? viewer : null);\n    selectDebugTarget({ mode: "viewer", seat: viewer });\n  }, [selectDebugTarget]);\n\n  const selectDebugActor = useCallback((seat: number | null) => {\n    if (seat !== null) {\n      const target = roomRef.current?.view.common.players[seat];\n      if (!target?.isDummy) {\n        setMessage("操作対象にはダミープレイヤーだけを選択できます。");\n        return;\n      }\n    }\n    setDebugActorSeat(seat);\n  }, []);`
);

frame = frame.replace(
`            error: error instanceof GameSdkHttpClientRuntimeError\n              ? error.code\n              : error instanceof Error && error.message === "DEBUG_ACTOR_SWITCH_PENDING"\n                ? "DEBUG_ACTOR_SWITCH_PENDING"\n                : "GAME_SDK_COMMAND_REJECTED",`,
`            error: error instanceof GameSdkHttpClientRuntimeError\n              ? error.code\n              : error instanceof Error && (\n                  error.message === "DEBUG_ACTOR_SWITCH_PENDING"\n                  || error.message === "DEBUG_ACTOR_VIEWER_MISMATCH"\n                )\n                ? error.message\n                : "GAME_SDK_COMMAND_REJECTED",`
);

frame = frame.replace(
`           selectedActorSeat: debugActorSeat,\n           selectedViewer: debugViewer,`,
`           actorViewerMismatch: debugActorViewerMismatch,\n           selectedActorSeat: debugActorSeat,\n           selectedViewer: debugViewer,`
);

if (!frame.includes("actorViewerMismatch: debugActorViewerMismatch")) {
  throw new Error("GameSdkFrame patch did not apply");
}
fs.writeFileSync(framePath, frame);

const headerPath = "app/components/GameSdkShellHeader.tsx";
let header = fs.readFileSync(headerPath, "utf8");
header = header.replace(
`export type GameSdkDebugRoom = {\n  appPhase: string | null;`,
`export type GameSdkDebugRoom = {\n  actorViewerMismatch: boolean;\n  appPhase: string | null;`
);
header = header.replace(
`      <p className="mt-1 text-[10px] leading-4 text-cyan-800">\n        playing中は、選択したダミーとしてゲーム内の合法手を送信できます。\n      </p>`,
`      <p className="mt-1 text-[10px] leading-4 text-cyan-800">\n        ダミーの閲覧視点を選ぶと、操作対象も同じプレイヤーへ自動追従します。\n      </p>\n      {debugRoom.actorViewerMismatch && (\n        <p\n          role="alert"\n          className="mt-2 rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-[10px] font-black leading-4 text-amber-900"\n        >\n          閲覧中のプレイヤーと操作対象が異なります。画面に見えている手札とは別のプレイヤーとして操作されるため、ゲーム操作を停止しています。\n        </p>\n      )}`
);
if (!header.includes("debugRoom.actorViewerMismatch")) {
  throw new Error("GameSdkShellHeader patch did not apply");
}
fs.writeFileSync(headerPath, header);
