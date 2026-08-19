import { GAME_SDK_MODULE_USAGE_ITEM_SCHEMA } from "@game-fields/game-sdk/module-usage";

/** Public publish_mock definition shared by the route and contract tests. */
export const PUBLISH_MOCK_TOOL_DEFINITION = {
  title: "操作プロトタイプの検査・保存",
  description: "互換tool名です。確定済みmodule contractに結び付いた共有SDK sourceから操作プロトタイプを検査し、module usage matrixと人間確認URLを保存します。任意の静的HTMLだけの保存は拒否します。",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string" },
      gameId: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      manifest: { type: "object" },
      moduleBinding: { type: "object" },
      moduleUsage: {
        type: "array",
        maxItems: 64,
        items: GAME_SDK_MODULE_USAGE_ITEM_SCHEMA,
      },
      files: {
        type: "object",
        description: "操作プロトタイプと正式Packageで共有するindex/styles/mock/previewおよびsource/**のUTF-8本文。",
        additionalProperties: { type: "string" },
      },
    },
    required: [
      "slug",
      "gameId",
      "title",
      "manifest",
      "moduleBinding",
      "moduleUsage",
      "files",
    ],
    additionalProperties: false,
  },
} as const;

export const PUBLISH_MOCK_TOOL = {
  name: "publish_mock",
  ...PUBLISH_MOCK_TOOL_DEFINITION,
} as const;
