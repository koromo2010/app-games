import {
  parseGameSdkSettingDefinitions,
  type GameSdkSettingDefinition,
} from "@game-fields/game-sdk";
import { prepareMockUploadFiles } from "./mock-git-store";

export type SdkMockPreviewManifest = {
  stage: "mock";
  id: string;
  settings: GameSdkSettingDefinition[];
};

function decodeMockFile(file: {
  content: string;
  encoding: "utf-8" | "base64";
}) {
  return file.encoding === "base64"
    ? Buffer.from(file.content, "base64").toString("utf8")
    : file.content;
}

export function parseSdkMockPreviewManifest(
  gameId: string,
  files: unknown,
): SdkMockPreviewManifest {
  const prepared = prepareMockUploadFiles(files);
  const previewFile = prepared.find((file) => file.path === "preview.json");
  if (!previewFile) {
    throw new Error("Mock upload is missing preview.json.");
  }
  const metadata = JSON.parse(decodeMockFile(previewFile)) as {
    gameId?: unknown;
    settings?: unknown;
  };
  if (metadata.gameId !== gameId) {
    throw new Error("Mock preview gameId does not match the upload target.");
  }
  return {
    stage: "mock",
    id: gameId,
    settings: parseGameSdkSettingDefinitions(metadata.settings, {
      requireTimeLimit: true,
    }),
  };
}
