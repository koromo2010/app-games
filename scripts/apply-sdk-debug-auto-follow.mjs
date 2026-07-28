import fs from "node:fs";

function replaceOrThrow(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(before, after);
}

const libPath = "lib/game-sdk-debug-control-target.ts";
let lib = fs.readFileSync(libPath, "utf8");
lib = replaceOrThrow(lib,
`export type GameSdkDebugControlState = {\n  generation: number;\n  target: GameSdkDebugControlTarget;\n  status: "ready" | "switching";\n};`,
`export type GameSdkDebugSwitchSource = "manual" | "auto-follow" | "reset";\n\nexport type GameSdkDebugControlState = {\n  generation: number;\n  target: GameSdkDebugControlTarget;\n  status: "ready" | "switching";\n  source: GameSdkDebugSwitchSource;\n};`, "state source");
lib = replaceOrThrow(lib,
`  status: "ready",\n};`,
`  status: "ready",\n  source: "reset",\n};`, "initial source");
lib = replaceOrThrow(lib,
`export function beginGameSdkDebugControlSwitch(\n  state: Readonly<GameSdkDebugControlState>,\n  target: GameSdkDebugControlTarget,\n): GameSdkDebugControlState {\n  return {\n    generation: state.generation + 1,\n    target,\n    status: target.mode === "self" ? "ready" : "switching",\n  };\n}`,
`export function beginGameSdkDebugControlSwitch(\n  state: Readonly<GameSdkDebugControlState>,\n  target: GameSdkDebugControlTarget,\n  source: GameSdkDebugSwitchSource = "manual",\n): GameSdkDebugControlState {\n  return {\n    generation: state.generation + 1,\n    target,\n    status: target.mode === "self" ? "ready" : "switching",\n    source,\n  };\n}`,
"switch source");
lib = replaceOrThrow(lib,
`    target: { mode: "self" },\n    status: "ready",\n  };\n}`,
`    target: { mode: "self" },\n    status: "ready",\n    source: "reset",\n  };\n}`,
"reset source");
lib += `\n\nexport function gameSdkDebugAutoFollowTarget(\n  ownerSeat: number | null | undefined,\n  players: readonly Readonly<{\n    seat: number;\n    isHost: boolean;\n    isSelf: boolean;\n    isDummy: boolean;\n  }>[],\n): GameSdkDebugControlTarget | null {\n  if (ownerSeat === null || ownerSeat === undefined) return null;\n  const player = players.find((candidate) => candidate.seat === ownerSeat);\n  if (!player) return null;\n  if (player.isHost || player.isSelf) return { mode: "self" };\n  return player.isDummy ? { mode: "dummy", seat: player.seat } : null;\n}\n`;
fs.writeFileSync(libPath, lib);

const hookPath = "app/hooks/use-game-sdk-debug-control-target.ts";
let hook = fs.readFileSync(hookPath, "utf8");
hook = replaceOrThrow(hook,
`  type GameSdkDebugViewerRequest,\n} from "@/lib/game-sdk-debug-control-target";`,
`  type GameSdkDebugViewerRequest,\n  type GameSdkDebugSwitchSource,\n} from "@/lib/game-sdk-debug-control-target";`,
"hook source import");
hook = replaceOrThrow(hook,
`  const selectTarget = useCallback((target: GameSdkDebugControlTarget) => {\n    clearRetry();\n    const room = optionsRef.current.getRoom();\n    const next = commit(beginGameSdkDebugControlSwitch(stateRef.current, target));`,
`  const selectTarget = useCallback((\n    target: GameSdkDebugControlTarget,\n    source: GameSdkDebugSwitchSource = "manual",\n  ) => {\n    clearRetry();\n    const room = optionsRef.current.getRoom();\n    const next = commit(beginGameSdkDebugControlSwitch(stateRef.current, target, source));`,
"hook select source");
hook = replaceOrThrow(hook,
`    state,\n    viewer: gameSdkDebugTargetViewer(state.target),`,
`    source: state.source,\n    state,\n    viewer: gameSdkDebugTargetViewer(state.target),`,
"hook return source");
fs.writeFileSync(hookPath, hook);

const framePath = "app/components/GameSdkFrame.tsx";
let frame = fs.readFileSync(framePath, "utf8");
frame = replaceOrThrow(frame,
`import { useGameSdkDebugControlTarget } from "@/app/hooks/use-game-sdk-debug-control-target";`,
`import { useGameSdkDebugControlTarget } from "@/app/hooks/use-game-sdk-debug-control-target";\nimport { gameSdkDebugAutoFollowTarget } from "@/lib/game-sdk-debug-control-target";`,
"frame auto import");
frame = replaceOrThrow(frame,
`  const [isRoomDissolved, setIsRoomDissolved] = useState(false);`,
`  const [isRoomDissolved, setIsRoomDissolved] = useState(false);\n  const [debugAutoFollow, setDebugAutoFollow] = useState(false);\n  const [debugAutoFollowWarning, setDebugAutoFollowWarning] = useState("");\n  const lastAutoFollowOwnerSeatRef = useRef<number | null | undefined>(undefined);`,
"frame auto state");
frame = replaceOrThrow(frame,
`    selectTarget: selectDebugTarget,\n    viewer: debugViewer,`,
`    selectTarget: selectDebugTarget,\n    source: debugSwitchSource,\n    viewer: debugViewer,`,
"frame source destructure");
frame = replaceOrThrow(frame,
`  const selectDebugActor = useCallback((seat: number | null) => {\n    if (seat !== null) {\n      const target = roomRef.current?.view.common.players[seat];\n      if (!target?.isDummy) {\n        setMessage("操作対象にはダミープレイヤーだけを選択できます。");\n        return;\n      }\n    }\n    selectDebugTarget(seat === null ? { mode: "self" } : { mode: "dummy", seat });\n  }, [selectDebugTarget]);`,
`  const selectDebugActor = useCallback((seat: number | null) => {\n    if (seat !== null) {\n      const target = roomRef.current?.view.common.players[seat];\n      if (!target?.isDummy) {\n        setMessage("操作対象にはダミープレイヤーだけを選択できます。");\n        return;\n      }\n    }\n    selectDebugTarget(seat === null ? { mode: "self" } : { mode: "dummy", seat });\n  }, [selectDebugTarget]);\n\n  const debugOwnerSeat = room?.view.common.timer?.ownerSeat;\n  useEffect(() => {\n    if (!debugAutoFollow) {\n      lastAutoFollowOwnerSeatRef.current = undefined;\n      setDebugAutoFollowWarning("");\n      return;\n    }\n    if (debugOwnerSeat === null || debugOwnerSeat === undefined) return;\n    if (lastAutoFollowOwnerSeatRef.current === debugOwnerSeat) return;\n    lastAutoFollowOwnerSeatRef.current = debugOwnerSeat;\n    const currentPlayers = roomRef.current?.view.common.players ?? [];\n    const target = gameSdkDebugAutoFollowTarget(debugOwnerSeat, currentPlayers);\n    if (!target) {\n      setDebugAutoFollowWarning(\n        `SEAT ${debugOwnerSeat + 1} は実ユーザーのため、操作対象を自動変更できません。`,\n      );\n      return;\n    }\n    setDebugAutoFollowWarning("");\n    selectDebugTarget(target, "auto-follow");\n  }, [debugAutoFollow, debugOwnerSeat, selectDebugTarget]);`,
"frame auto effect");
frame = replaceOrThrow(frame,
`          appPhase: appPhase(room),\n          canActAsDummy: common.permissions.canDebugActAsDummy === true,`,
`          appPhase: appPhase(room),\n          autoFollowEnabled: debugAutoFollow,\n          autoFollowOwnerSeat: debugOwnerSeat ?? null,\n          autoFollowWarning: debugAutoFollowWarning,\n          canActAsDummy: common.permissions.canDebugActAsDummy === true,`,
"frame debug props");
frame = replaceOrThrow(frame,
`          onAutoProgress: async (target) => {\n            await run(() => autoProgressDebug(target));\n          },\n          onSelectActor: selectDebugActor,`,
`          onAutoProgress: async (target) => {\n            await run(() => autoProgressDebug(target));\n          },\n          onToggleAutoFollow: setDebugAutoFollow,\n          onSelectActor: selectDebugActor,`,
"frame toggle prop");
frame = replaceOrThrow(frame,
`          statusMessage: message,`,
`          statusMessage: message,\n          switchSource: debugSwitchSource,`,
"frame source prop");
fs.writeFileSync(framePath, frame);

const headerPath = "app/components/GameSdkShellHeader.tsx";
let header = fs.readFileSync(headerPath, "utf8");
header = replaceOrThrow(header,
`export type GameSdkDebugRoom = {\n  appPhase: string | null;`,
`export type GameSdkDebugRoom = {\n  appPhase: string | null;\n  autoFollowEnabled: boolean;\n  autoFollowOwnerSeat: number | null;\n  autoFollowWarning: string;`,
"header auto fields");
header = replaceOrThrow(header,
`  onRemoveDummy: (seat: number) => void | Promise<void>;`,
`  onRemoveDummy: (seat: number) => void | Promise<void>;\n  onToggleAutoFollow: (enabled: boolean) => void;`,
"header toggle callback");
header = replaceOrThrow(header,
`  statusMessage: string;\n};`,
`  statusMessage: string;\n  switchSource: "manual" | "auto-follow" | "reset";\n};`,
"header source field");
header = replaceOrThrow(header,
`              <div>Room {debugRoom.code} · rev {debugRoom.revision}</div>\n              {debugViewerControls}`,
`              <div>Room {debugRoom.code} · rev {debugRoom.revision}</div>\n              <label className="mt-2 flex items-center justify-between gap-3 rounded-md border border-cyan-200 bg-white px-2 py-1.5">\n                <span>自動追従</span>\n                <input\n                  type="checkbox"\n                  checked={debugRoom.autoFollowEnabled}\n                  onChange={(event) => debugRoom.onToggleAutoFollow(event.target.checked)}\n                  className="size-4 accent-cyan-600"\n                />\n              </label>\n              {debugRoom.autoFollowEnabled && (\n                <p className="mt-1 text-[10px] leading-4 text-cyan-800">\n                  {debugRoom.autoFollowOwnerSeat === null\n                    ? "明確な手番がないため、現在の選択を維持しています。"\n                    : `SEAT ${debugRoom.autoFollowOwnerSeat + 1} を追従中（${debugRoom.switchSource === "auto-follow" ? "自動" : "手動確認中"}）`}\n                </p>\n              )}\n              {debugRoom.autoFollowWarning && (\n                <p role="alert" className="mt-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">\n                  {debugRoom.autoFollowWarning}\n                </p>\n              )}\n              {debugViewerControls}`,
"header auto ui");
fs.writeFileSync(headerPath, header);

const testPath = "tests/game-sdk-debug-control-target.test.ts";
let test = fs.readFileSync(testPath, "utf8");
test = replaceOrThrow(test,
`  beginGameSdkDebugControlSwitch,`,
`  beginGameSdkDebugControlSwitch,\n  gameSdkDebugAutoFollowTarget,`,
"test import");
test += `\n\ntest("DEBUG auto-follow maps host to self and dummy seats to unified targets", () => {\n  const players = [\n    { seat: 0, isHost: true, isSelf: true, isDummy: false },\n    { seat: 1, isHost: false, isSelf: false, isDummy: true },\n    { seat: 2, isHost: false, isSelf: false, isDummy: false },\n  ];\n  assert.deepEqual(gameSdkDebugAutoFollowTarget(0, players), { mode: "self" });\n  assert.deepEqual(gameSdkDebugAutoFollowTarget(1, players), { mode: "dummy", seat: 1 });\n  assert.equal(gameSdkDebugAutoFollowTarget(2, players), null);\n  assert.equal(gameSdkDebugAutoFollowTarget(null, players), null);\n});\n\ntest("DEBUG switch records auto-follow as the trigger source", () => {\n  const next = beginGameSdkDebugControlSwitch(\n    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,\n    { mode: "dummy", seat: 3 },\n    "auto-follow",\n  );\n  assert.equal(next.source, "auto-follow");\n  assert.equal(next.status, "switching");\n});\n`;
fs.writeFileSync(testPath, test);
