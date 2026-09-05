import { GAME_SDK_MODULE_USAGE_ITEM_SCHEMA } from "@game-fields/game-sdk/module-usage";

/** Public publish_mock definition shared by the route and contract tests. */
export const PUBLISH_MOCK_TOOL_DEFINITION = {
  title: "操作プロトタイプの検査・保存",
  description: "互換tool名です。確定済みmodule contractを再取得し、byte-preservingなfiles表現またはsrc/**→source/**の機械的補正だけを同じ操作内で再検証して、共有SDK sourceの操作プロトタイプを保存します。欠損した制作者コード、module変更、承認境界は補正しません。",
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
        oneOf: [
          { type: "object", additionalProperties: { type: "string" } },
          { type: "array", items: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, encoding: { type: "string", enum: ["utf-8"] } }, required: ["path", "content"], additionalProperties: false } },
        ],
        description: "操作プロトタイプと正式Packageで共有するUTF-8本文。canonical path mapを使う。path/content配列とstarterのsrc/**は同一bytesに限りsource/**へ補正され、制作者コードは生成されない。",
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
