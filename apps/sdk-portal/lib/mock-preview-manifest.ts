import {
  parseGameSdkSettingDefinitions,
  type GameSdkSettingDefinition,
} from "@game-fields/game-sdk";
import {
  validateGameSdkMockQuality,
  type GameSdkMockQualityEvidence,
} from "@game-fields/game-sdk/mock-quality";
import { prepareMockUploadFiles } from "./mock-git-store";

export type SdkMockPreviewManifest = {
  stage: "mock";
  id: string;
  settings: GameSdkSettingDefinition[];
  reviewEvidence: GameSdkMockQualityEvidence;
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
  const quality = validateGameSdkMockQuality({
    files: Object.fromEntries(prepared
      .filter((file) => file.encoding === "utf-8")
      .map((file) => [file.path, decodeMockFile(file)])),
  });
  if (metadata.gameId !== gameId) {
    throw new Error("Mock preview gameId does not match the upload target.");
  }
  return {
    stage: "mock",
    id: gameId,
    settings: parseGameSdkSettingDefinitions(metadata.settings, {
      requireTimeLimit: true,
    }),
    reviewEvidence: quality.evidence,
  };
}
