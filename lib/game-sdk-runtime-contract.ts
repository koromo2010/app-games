import type {
  GameFieldsPlatformRuntimeContract,
} from "@game-fields/game-runtime";
import platformRelease from "../config/platform-release.json";

export function createRemoteGameSdkRuntimeContract(input: {
  revision: string;
  packageRootSha256: string;
  sdkContractVersion?: number;
}): GameFieldsPlatformRuntimeContract {
  return {
    packageRevision: input.revision,
    packageRootSha256: input.packageRootSha256,
    runtimeVersion: platformRelease.runnerRuntimeVersion,
    sdkContractVersion:
      input.sdkContractVersion ?? platformRelease.sdkContractVersion,
    roomSchemaVersion: platformRelease.roomSchemaVersion,
    resourceProtocolVersion: platformRelease.resourceProtocolVersion,
    clientBridgeVersion: platformRelease.clientBridgeVersion,
  };
}
