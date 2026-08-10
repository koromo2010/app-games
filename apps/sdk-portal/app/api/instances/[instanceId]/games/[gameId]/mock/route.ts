export const dynamic = "force-dynamic";

/**
 * The management-token static Mock upload predates module-first authoring and
 * cannot prove a confirmed profile, shared source, or module usage. Keeping it
 * writable would bypass the canonical OAuth MCP gate.
 */
export async function PUT() {
  return Response.json({
    saved: false,
    error: "LEGACY_STATIC_MOCK_PATH_DISABLED",
    instruction: "ChatGPT WorkまたはClaude Codeからcreate_game_draftとmodule確認を行い、OAuth MCPのpublish_mock（操作プロトタイプ互換名）を使用してください。",
  }, { status: 410 });
}
