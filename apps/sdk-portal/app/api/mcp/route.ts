import { authenticateAccessToken, portalBaseUrl } from "@/lib/oauth-store";
import {
  authenticateCreatorOwner,
  finalizeInstanceSlug,
  getCreatorGameModuleProfile,
  instanceSlugAvailable,
  listCreatorEnvironments,
  normalizeInstanceSlug,
  reserveInstanceSlug,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import { saveMockFilesToGit } from "@/lib/mock-git-store";
import {
  createSdkPortalHandshakeDescriptor,
  negotiateSdkPortalHandshake,
  SDK_PORTAL_CAPABILITIES,
} from "@/lib/sdk-handshake";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import platformRelease from "../../../../../config/platform-release.json";
import {
  createInitialGameSdkModuleProfile,
  requiredGameSdkModuleIds,
} from "@game-fields/game-sdk/modules";

export const dynamic = "force-dynamic";
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function rpc(id: unknown, result: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, result }, { status, headers: { "Cache-Control": "no-store" } });
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError: false };
}

const tools = [
  { name: "get_sdk_handshake", title: "SDK接続互換性の確認", description: "制作を始める前に、接続先環境、Platform・SDK契約版、DownloadMe記載の必要機能だけを送って互換性を確認します。enumの全候補を要求せず、accepted=trueになるまで他のSDK toolを使わないでください。", annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: "object", properties: { protocol: { type: "string", const: "game-fields-sdk" }, handshakeVersion: { type: "integer", minimum: 1 }, client: { type: "object", properties: { kind: { type: "string", enum: ["ai-agent", "starter-cli", "browser-runtime", "platform"] }, name: { type: "string" }, version: { type: "string" } }, required: ["kind"], additionalProperties: false }, expected: { type: "object", properties: { environment: { type: "string", enum: ["development", "production"] }, platformVersion: { type: "string" }, sdkPackageVersion: { type: "string" }, sdkContractVersion: { type: "integer", minimum: 1 } }, required: ["environment", "platformVersion", "sdkPackageVersion", "sdkContractVersion"], additionalProperties: false }, requiredCapabilities: { type: "array", description: "添付されたDownloadMeのrequiredCapabilitiesをそのまま指定します。Portal未提供の候補を追加しません。", items: { type: "string", enum: [...SDK_PORTAL_CAPABILITIES] }, uniqueItems: true } }, required: ["protocol", "handshakeVersion", "client", "expected", "requiredCapabilities"], additionalProperties: false } },
  { name: "list_creator_environments", title: "自分のSDK環境一覧", description: "ログイン中のGame Fieldsアカウントに紐づく既存の制作者環境を一覧表示します。新規URLを予約する前に必ず呼び出してください。", annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "check_creator_url", title: "制作者URLの空き確認", description: "Game Fields SDKの制作者URL名が利用可能か確認します。", annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: "object", properties: { slug: { type: "string", description: "確認する制作者URL名" } }, required: ["slug"], additionalProperties: false } },
  { name: "reserve_creator_url", title: "制作者URLの予約", description: "ログイン中のGame Fieldsアカウント用に制作者URLを7日間予約します。", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, inputSchema: { type: "object", properties: { slug: { type: "string", description: "予約する制作者URL名" }, displayName: { type: "string", description: "制作者の表示名" } }, required: ["slug", "displayName"], additionalProperties: false } },
  { name: "finalize_creator_url", title: "制作者URLの確定", description: "予約トークンを使い、制作者URLをログイン中のアカウントへ正式登録します。", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, inputSchema: { type: "object", properties: { slug: { type: "string", description: "確定する制作者URL名" }, reservationToken: { type: "string", description: "予約時に発行されたトークン" } }, required: ["slug", "reservationToken"], additionalProperties: false } },
  { name: "publish_mock", title: "ゲームモックの保存", description: "本人所有のSDK環境へ検査済みゲームモックを保存し、制作者トップURLと今回のゲームURLを返します。saved=trueとcreatorUrlが返るまで完成扱いにしないでください。", annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: "object", properties: { slug: { type: "string", description: "本人所有の制作者URL名" }, gameId: { type: "string", description: "ゲームID" }, title: { type: "string", description: "ゲーム名" }, description: { type: "string", description: "ゲームの説明" }, files: { type: "object", description: "mock/直下を基準とする相対パスをキー、UTF-8本文を値とするファイル一覧。index.html、styles.css、mock.jsを必ず含めます。", additionalProperties: { type: "string" } } }, required: ["slug", "gameId", "title", "files"], additionalProperties: false } },
  { name: "get_game_module_requirements", title: "確定済み必須モジュール取得", description: "モック承認後、AppSet実装を始める直前に、今回必ず使用するrequiredModuleIdsを取得します。返された一覧を省略しないでください。", annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }, inputSchema: { type: "object", properties: { slug: { type: "string", description: "本人所有の制作者URL名" }, gameId: { type: "string", description: "ゲームID" } }, required: ["slug", "gameId"], additionalProperties: false } },
];

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

function negotiateProtocolVersion(value: unknown) {
  return typeof value === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(value as typeof SUPPORTED_PROTOCOL_VERSIONS[number])
    ? value
    : SUPPORTED_PROTOCOL_VERSIONS[0];
}

async function callTool(name: string, args: Record<string, unknown>, playerId: string, origin: string) {
  if (name === "get_sdk_handshake") {
    return textResult(negotiateSdkPortalHandshake(args, origin));
  }
  if (name === "list_creator_environments") {
    const environments = await listCreatorEnvironments(playerId);
    return textResult({
      environments: environments.map((environment) => ({
        ...environment,
        url: `${portalBaseUrl(origin)}/${environment.slug}`,
      })),
      count: environments.length,
    });
  }
  const slug = normalizeInstanceSlug(typeof args.slug === "string" ? args.slug : "");
  const slugError = validateInstanceSlug(slug);
  if (slugError) throw new Error(slugError);
  if (name === "check_creator_url") return textResult({ slug, available: await instanceSlugAvailable(slug) });
  if (name === "reserve_creator_url") {
    const displayName = typeof args.displayName === "string" ? args.displayName.trim() : "";
    if (!displayName) throw new Error("表示名が必要です。");
    const result = await reserveInstanceSlug(slug, displayName, playerId);
    if (!result) throw new Error("このURL名はすでに使用されています。");
    return textResult({ reserved: true, ...result });
  }
  if (name === "finalize_creator_url") {
    const reservationToken = typeof args.reservationToken === "string" ? args.reservationToken : "";
    const result = await finalizeInstanceSlug(slug, reservationToken, playerId);
    if (!result) throw new Error("予約が期限切れか、現在のアカウントの予約ではありません。");
    return textResult({ finalized: true, creator: result.creator, creatorUrl: `${portalBaseUrl(origin)}/${slug}` });
  }
  if (name === "publish_mock") {
    const creator = await authenticateCreatorOwner(slug, playerId);
    if (!creator) throw new Error("この制作者URLは現在のアカウントに属していません。");
    const gameId = typeof args.gameId === "string" ? args.gameId.trim().toLowerCase() : "";
    const title = typeof args.title === "string" ? args.title.trim() : "";
    const description = typeof args.description === "string" ? args.description.trim().slice(0, 500) : "";
    if (!GAME_PATTERN.test(gameId) || !title || title.length > 120 || !args.files || typeof args.files !== "object") throw new Error("モック登録情報が不正です。");
    const revision = await saveMockFilesToGit({ instanceId: slug, gameId, files: args.files });
    await ensureSdkSchema();
    const manifest = JSON.stringify({ stage: "mock", id: gameId });
    const initialModulePolicy = JSON.stringify(
      createInitialGameSdkModuleProfile(),
    );
    await sdkSql()`INSERT INTO sdk_games (creator_id, game_id, title, description, manifest, module_policy, sdk_package_version, sdk_contract_version, mock_revision) VALUES (${creator.id}, ${gameId}, ${title}, ${description}, ${manifest}::jsonb, ${initialModulePolicy}::jsonb, ${platformRelease.sdkPackageVersion}, ${platformRelease.sdkContractVersion}, ${revision}) ON CONFLICT (creator_id, game_id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, mock_revision = EXCLUDED.mock_revision, updated_at = NOW()`;
    const creatorUrl = `${portalBaseUrl(origin)}/${slug}/`;
    const gameUrl = `${portalBaseUrl(origin)}/${slug}/games/${gameId}`;
    return textResult({ saved: true, gameId, mockRevision: revision, creatorUrl, gameUrl, previewUrl: gameUrl });
  }
  if (name === "get_game_module_requirements") {
    const creator = await authenticateCreatorOwner(slug, playerId);
    if (!creator) {
      throw new Error(
        "この制作者URLは現在のアカウントに属していません。",
      );
    }
    const gameId = typeof args.gameId === "string"
      ? args.gameId.trim().toLowerCase()
      : "";
    if (!GAME_PATTERN.test(gameId)) throw new Error("ゲームIDが不正です。");
    const moduleProfile = await getCreatorGameModuleProfile(slug, gameId);
    if (!moduleProfile) throw new Error("ゲームが見つかりません。");
    return textResult({
      slug,
      gameId,
      requiredModuleIds: requiredGameSdkModuleIds(moduleProfile),
      editableByAi: false,
      instruction:
        "このprofileをAppSet実装の正本にし、必須moduleを省略しないでください。",
    });
  }
  throw new Error("Unknown tool");
}

export async function POST(request: Request) {
  const base = portalBaseUrl(new URL(request.url).origin);
  const metadata = `${base}/.well-known/oauth-protected-resource`;
  const access = bearer(request);
  const auth = access ? await authenticateAccessToken(access, "sdk:creator", `${base}/api/mcp`) : null;
  if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="sdk:creator sdk:mock"` } });
  const body = await request.json().catch(() => null) as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: { protocolVersion?: unknown; name?: unknown; arguments?: unknown } } | null;
  if (!body || body.jsonrpc !== "2.0") return rpcError(body?.id ?? null, -32600, "Invalid Request", 400);
  if (body.method === "initialize") return rpc(body.id, { protocolVersion: negotiateProtocolVersion(body.params?.protocolVersion), capabilities: { tools: { listChanged: false } }, serverInfo: { name: "Game Fields SDK", title: "Game Fields SDK", version: platformRelease.platformVersion }, gameFieldsHandshake: createSdkPortalHandshakeDescriptor(base), instructions: "最初にget_sdk_handshakeを呼び、添付されたDownloadMeに記載されたrequiredCapabilitiesだけをそのまま送り、accepted=trueを確認してください。tool schemaに現れない機能や、別surface向けの機能を追加要求してはいけません。Workではtoolが遅延読み込みされるため、初期一覧にget_sdk_handshakeがなくても、まずgameapp-dev get_sdk_handshake Game Fields SDK接続互換性でtool検索してください。明示的な検索後もgameapp-devのほかのtoolだけが見つかり、get_sdk_handshakeがない場合に限って、利用者へgameapp-devの更新、新しいチャットでの再選択、最新版DownloadMeの再添付を案内して停止してください。その後、Game Fieldsアカウント本人のSDK制作環境だけを操作します。保存後はsavedとcreatorUrlを確認し、制作者トップを最初の案内リンクにしてください。" });
  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (body.method === "tools/list") return rpc(body.id, { tools });
  if (body.method === "tools/call") {
    const name = typeof body.params?.name === "string" ? body.params.name : "";
    if (name === "publish_mock" && !auth.scope.split(" ").includes("sdk:mock")) return rpcError(body.id, -32001, "Insufficient scope", 403);
    const args = body.params?.arguments && typeof body.params.arguments === "object" ? body.params.arguments as Record<string, unknown> : {};
    try { return rpc(body.id, await callTool(name, args, auth.playerId, base)); }
    catch (error) { return rpc(body.id, { content: [{ type: "text", text: error instanceof Error ? error.message : "SDK操作に失敗しました。" }], isError: true }); }
  }
  if (body.method === "ping") return rpc(body.id, {});
  return rpcError(body.id, -32601, "Method not found");
}
