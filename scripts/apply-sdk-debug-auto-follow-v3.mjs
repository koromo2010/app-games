import fs from "node:fs";
import { pathToFileURL } from "node:url";

function replaceOrThrow(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(before, after);
}

const hookPath = "app/hooks/use-game-sdk-debug-control-target.ts";
let hook = fs.readFileSync(hookPath, "utf8");
hook = replaceOrThrow(
  hook,
  `  type GameSdkDebugViewerRequest,\n} from "@/lib/game-sdk-debug-control-target";`,
  `  type GameSdkDebugViewerRequest,\n  type GameSdkDebugSwitchSource,\n} from "@/lib/game-sdk-debug-control-target";`,
  "hook source import",
);
hook = replaceOrThrow(
  hook,
  `  const selectTarget = useCallback((target: GameSdkDebugControlTarget) => {\n    clearOperation();\n    const room = optionsRef.current.getRoom();\n    const next = commit(beginGameSdkDebugControlSwitch(stateRef.current, target));`,
  `  const selectTarget = useCallback((\n    target: GameSdkDebugControlTarget,\n    source: GameSdkDebugSwitchSource = "manual",\n  ) => {\n    clearOperation();\n    const room = optionsRef.current.getRoom();\n    const next = commit(beginGameSdkDebugControlSwitch(stateRef.current, target, source));`,
  "hook select source",
);
hook = replaceOrThrow(
  hook,
  `    state,\n    viewer: gameSdkDebugTargetViewer(state.target),`,
  `    source: state.source,\n    state,\n    viewer: gameSdkDebugTargetViewer(state.target),`,
  "hook return source",
);
fs.writeFileSync(hookPath, hook);

const v2Path = "scripts/apply-sdk-debug-auto-follow-v2.mjs";
let v2 = fs.readFileSync(v2Path, "utf8");
v2 = v2.replace(
  /const hookPath = "app\/hooks\/use-game-sdk-debug-control-target\.ts";[\s\S]*?fs\.writeFileSync\(hookPath, hook\);\n\n/,
  "",
);
if (v2.includes('const hookPath = "app/hooks/use-game-sdk-debug-control-target.ts"')) {
  throw new Error("Failed to remove legacy hook patch block");
}
const tempPath = "/tmp/apply-sdk-debug-auto-follow-v3-delegate.mjs";
fs.writeFileSync(tempPath, v2);
await import(pathToFileURL(tempPath).href);

const framePath = "app/components/GameSdkFrame.tsx";
let frame = fs.readFileSync(framePath, "utf8");
frame = replaceOrThrow(
  frame,
  `  const [debugAutoFollow, setDebugAutoFollow] = useState(false);\n  const [debugAutoFollowWarning, setDebugAutoFollowWarning] = useState("");\n  const lastAutoFollowOwnerSeatRef = useRef<number | null | undefined>(undefined);`,
  `  const [debugAutoFollow, setDebugAutoFollow] = useState(false);\n  const lastAutoFollowOwnerSeatRef = useRef<number | null | undefined>(undefined);`,
  "remove warning state",
);
frame = frame.replaceAll('      setDebugAutoFollowWarning("");\n', "");
const unsupportedTargetPattern = /    if \(!target\) \{[\s\S]*?      return;\n    \}\n    selectDebugTarget\(target, "auto-follow"\);/;
if (!unsupportedTargetPattern.test(frame)) {
  throw new Error("Missing patch anchor: derive warning instead of setting state");
}
frame = frame.replace(
  unsupportedTargetPattern,
  `    if (!target) return;\n    selectDebugTarget(target, "auto-follow");`,
);
frame = replaceOrThrow(
  frame,
  `          autoFollowWarning: debugAutoFollowWarning,`,
  `          autoFollowWarning: debugAutoFollow\n            && debugOwnerSeat !== null\n            && debugOwnerSeat !== undefined\n            && !gameSdkDebugAutoFollowTarget(debugOwnerSeat, common.players)\n              ? "SEAT " + (debugOwnerSeat + 1) + " は実ユーザーのため、操作対象を自動変更できません。"\n              : "",`,
  "derived warning prop",
);
fs.writeFileSync(framePath, frame);
