export default function OfficialWordWolfSdkExamplePage() {
  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "") ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  return <main className="platform-preview-shell"><iframe className="platform-preview-frame" src={`${appBaseUrl}/sdk-examples/word-wolf`} title="ワードウルフ SDK公式サンプル" allow="fullscreen" /></main>;
}
