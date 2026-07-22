export default function OfficialSdkExamplesPage() {
  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "") ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  return <main className="platform-preview-shell"><iframe className="platform-preview-frame" src={`${appBaseUrl}/sdk-examples`} title="Game Fields SDK公式サンプル" allow="fullscreen" /></main>;
}
