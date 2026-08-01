import {
  resolveSdkReleaseProfile,
  sdkDownloadMeFileName,
  sdkDownloadMeVersion,
} from "@game-fields/sdk-release-profiles";
import platformRelease from "../../../config/platform-release.json";
import profileConfig from "../../../config/sdk-release-profiles.json";

function localDefaultEnvironment() {
  return process.env.VERCEL || process.env.VERCEL_GIT_COMMIT_REF
    ? undefined
    : "development";
}

function configuredPortalBaseUrl(origin?: string) {
  if (process.env.SDK_PORTAL_BASE_URL) return process.env.SDK_PORTAL_BASE_URL;
  if (!origin) return undefined;
  try {
    const candidate = new URL(origin).origin;
    return Object.values(profileConfig.profiles).some(
      (profile) => profile.portalBaseUrl === candidate,
    ) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function sdkPortalReleaseProfile(origin?: string) {
  return resolveSdkReleaseProfile({
    release: platformRelease,
    profileConfig,
    requestedEnvironment: process.env.SDK_PORTAL_CHANNEL,
    gitRef: process.env.VERCEL_GIT_COMMIT_REF,
    portalBaseUrl: configuredPortalBaseUrl(origin),
    defaultEnvironment: localDefaultEnvironment(),
  });
}

export function sdkPortalDownloadMeFileName(origin?: string) {
  return sdkDownloadMeFileName(platformRelease, sdkPortalReleaseProfile(origin));
}

export function sdkPortalDownloadMeVersion() {
  return sdkDownloadMeVersion(platformRelease);
}

export function sdkPortalMcpInstructions(origin?: string) {
  const profile = sdkPortalReleaseProfile(origin);
  const fileName = sdkDownloadMeFileName(platformRelease, profile);
  return "最初にget_sdk_handshakeを呼び、添付された最新版DownloadMeに記載されたrequiredCapabilitiesだけをそのまま送り、accepted=trueを確認してください。"
    + "requiredCapabilitiesの入力schemaは将来互換のため固定enumではありません。別surface向け機能を推測で追加してはいけません。"
    + `Workではtoolが遅延読み込みされるため、初期一覧にget_sdk_handshakeがなくても、まず${profile.pluginName} get_sdk_handshake Game Fields SDK接続互換性でtool検索してください。`
    + "既存チャットのtool schemaはプラグイン更新後も差し替わりません。"
    + `明示的な検索後も古い固定enumまたは旧tool構成しか見えない場合は、そのチャットで続けず、利用者へ${profile.pluginName}の更新、更新後に作成した新しいチャットでの再選択、${fileName}だけの再添付を案内して停止してください。`
    + "その後、Game Fieldsアカウント本人のSDK制作環境だけを操作します。保存後はsavedとcreatorUrlを確認し、制作者トップを最初の案内リンクにしてください。";
}
