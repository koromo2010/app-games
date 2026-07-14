export type DebugReplayState = { debugMode?: boolean; debugReplayEnabled?: boolean };

export function normalizeDebugReplayEnabled(state: DebugReplayState) {
  return state.debugMode === true && state.debugReplayEnabled === true;
}

export function shouldRecordGameReplay(state: DebugReplayState) {
  return state.debugMode !== true || state.debugReplayEnabled === true;
}

export function debugReplayAfterModeChange(current: DebugReplayState, debugMode: boolean) {
  return debugMode ? current.debugReplayEnabled === true : false;
}
