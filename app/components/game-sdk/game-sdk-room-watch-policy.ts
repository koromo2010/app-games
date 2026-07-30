export function shouldRestartGameSdkRoomWatch(
  currentCode: string | null | undefined,
  nextCode: string,
  watcherActive: boolean,
) {
  return !watcherActive || !currentCode || currentCode !== nextCode;
}
