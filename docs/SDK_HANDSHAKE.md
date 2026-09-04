# Game Fields SDK ハンドシェイク

Game Fields SDKへ接続するAI、starter、browser Runtimeは、制作者操作やRoom操作より先にSDK固有の互換性確認を行う。MCP `initialize`はtransport version、OAuthは本人認証、SDK handshakeは環境と契約の互換性を確認する。三つを相互代用しない。

## 正本

- 公開型とaggregate判定: `packages/game-sdk/src/handshake.ts`
- MCP wrapperとbinding発行: `apps/sdk-portal/app/api/mcp/route.ts`
- release値: `config/platform-release.json`
- Portal descriptor: `apps/sdk-portal/lib/sdk-handshake.ts`
- 公開discovery／negotiation: `/.well-known/game-fields-sdk`
- AI向けtool: `get_sdk_handshake`
- AI実行契約: `sdk/entry/START_GAME_FIELDS.md`

productionとdevelopmentは同じprotocolとrequest schemaを使う。違いはenvironment、canonical endpoint、onboarding profile、配信releaseであり、client側に別parserを作らない。

## 接続順

1. MCP clientがMCP `initialize`を行う。
2. 制作者操作ではOAuth 2.1 + PKCEで本人認証する。
3. DownloadMe記載の期待値とrequired capabilitiesを`get_sdk_handshake`へ送る。
4. CallToolResultの`isError`を確認し、`structuredContent.accepted`を読む。
5. accepted responseの`structuredContent.environmentBinding`を同一tool flowの変数に保持する。
6. 後続toolへbindingを変更せず渡し、各post-handshake responseの`structuredContent.sdkIdentity`を確認する。

handshake自体はproduct writeを行わず、認証sessionや権限を発行しない。OAuth、署名Cookie、Room actor解決の代わりにはならない。

## Request v1

```json
{
  "protocol": "game-fields-sdk",
  "handshakeVersion": 1,
  "client": {
    "kind": "ai-agent",
    "name": "ChatGPT Work"
  },
  "expected": {
    "environment": "development",
    "canonicalMcpUrl": "https://sdk-dev.game-fields.com/api/mcp",
    "onboardingProfileId": "game-fields-development-authoring-v1",
    "platformVersion": "0.2.0",
    "sdkPackageVersion": "0.2.0",
    "sdkContractVersion": 2
  },
  "requiredCapabilities": [
    "oauth2-pkce",
    "creator-environments",
    "starter-download",
    "mock-publish",
    "game-draft",
    "module-first-authoring",
    "module-usage-validation",
    "node-free-package",
    "game-package-publish",
    "formal-room-preview",
    "hash-pinned-promotion",
    "support-threads",
    "human-approved-reporting",
    "human-approved-support-replies"
  ]
}
```

`client.kind=ai-agent`では`client.name`が必須であり、`ChatGPT Work`または`Claude Code`だけを受け入れる。その他のclient kindではnameとversionは診断値として扱い、認証・認可に使用しない。

Portalへ送る`requiredCapabilities`はDownloadMe記載のcontrol-plane機能だけとする。公開SDK全体のRuntime capabilityを一括送信しない。未知のcapability名もtransport schemaでは受け取り、提供不能なら`CAPABILITY_UNAVAILABLE`で返す。

## Aggregate verdict

`accepted`は`problems.length === 0`から生成されるaggregate verdictである。次をまとめて判定する。

- protocolとhandshake version
- 対応authoring client
- semantic environment
- canonical MCP URL
- onboarding profile
- Platform versionとSDK package version
- supported SDK contract version
- required capabilities

`accepted=true`を受け取ったclientは、矛盾する別の実観測がない限り、同じfieldを独自parserで再判定してacceptedを覆さない。「acceptedだがidentity未確認」という中間状態を作らない。

`accepted=false`では`problems[*].code`を確認し、request／parser訂正、plugin更新、真の互換性blockerを区別する。現在のDownloadMeとsourceから訂正できる場合は同じ作業内で再handshakeし、`accepted=false`だけを正式resultのterminal boundaryにしない。複数の不一致は一度のresponseへまとめる。

## MCP CallToolResult

MCP toolはraw handshake descriptorではなくCallToolResultを返す。

```json
{
  "content": [
    { "type": "text", "text": "{...structured JSON...}" }
  ],
  "structuredContent": {
    "protocol": "game-fields-sdk",
    "handshakeVersion": 1,
    "environment": "development",
    "accepted": true,
    "problems": [],
    "environmentBinding": "<opaque>"
  },
  "isError": false
}
```

canonical parserは`isError`を先に判定し、payloadとして`structuredContent`を使う。`structuredContent`がない互換surfaceだけ、単一のJSON text contentを一度parseしてよい。wrapper直下からhandshake fieldを探さない。

accepted MCP responseではbindingを`structuredContent.environmentBinding`から取得する。bindingは表示、decode、手入力、永続化せず、同じchat、OAuth identity、client、origin、environmentのtool flowだけで使う。

handshake responseにはpost-handshake用`sdkIdentity`を要求しない。後続tool responseでは`structuredContent.sdkIdentity`の`targetEnvironment`、`canonicalMcpUrl`、release、`onboardingProfileId`を確認する。

## Bare HTTP response

認証前の`GET /.well-known/game-fields-sdk`はdiscoveryに使用できる。`POST /.well-known/game-fields-sdk`は同じ純粋な互換判定を使うが、MCP CallToolResult wrapperやauthoring `environmentBinding`を発行しない。bare HTTP responseとMCP tool responseを同じpathで解析しない。

## 拒否条件

| code | 条件 |
| --- | --- |
| `INVALID_REQUEST` | 必須field、型、既知enumのいずれかが不正 |
| `PROTOCOL_MISMATCH` | protocolが`game-fields-sdk`ではない |
| `HANDSHAKE_VERSION_UNSUPPORTED` | handshake schemaが非対応 |
| `CLIENT_UNSUPPORTED` | ai-agentのclient nameが未対応 |
| `ENVIRONMENT_MISMATCH` | semantic environmentが異なる |
| `CANONICAL_MCP_URL_MISMATCH` | canonical MCP URLが異なる |
| `ONBOARDING_PROFILE_MISMATCH` | onboarding profileが異なる |
| `PLATFORM_VERSION_MISMATCH` | Platform releaseが異なる |
| `SDK_PACKAGE_VERSION_MISMATCH` | SDK package releaseが異なる |
| `SDK_CONTRACT_UNSUPPORTED` | game contract schemaをserverが受け入れない |
| `CAPABILITY_UNAVAILABLE` | 必須機能を接続先が提供しない |

clientは自動的に別environment、旧版、非公式mirrorへ切り替えない。request／parser修正で解決できる拒否は、個別指示で回数を制限されていない限り同じ作業内で再handshakeできる。

## Requirements error projection

`get_game_module_requirements`の既知failureは、raw exceptionやbindingを返さず、MCP `CallToolResult`の`structuredContent.error`へstableな`code`、安全な`message`、`layer`、`operation`を投影する。

| failure | code | layer | operation |
| --- | --- | --- | --- |
| binding missing | `SDK_HANDSHAKE_REQUIRED` | `authorization` | `environment-binding` |
| binding mismatch | `AUTHORING_ENVIRONMENT_BINDING_MISMATCH` | `authorization` | `environment-binding` |
| owner mismatch | `SDK_OWNER_REQUIRED` | `authorization` | `requirements-owner` |
| invalid game ID | `GAME_SDK_GAME_ID_INVALID` | `validation` | `requirements-input` |
| draft missing | `GAME_SDK_DRAFT_NOT_FOUND` | `validation` | `requirements-contract` |
| changed profile unconfirmed | `MODULE_PROFILE_NOT_CONFIRMED` | `validation` | `requirements-contract` |
| stale digest | `MODULE_PROFILE_STALE` | `validation` | `requirements-contract` |

成功時のrequirements payload、creator-facing governance projection、hidden platform moduleの非露出は変更しない。

新規game draftは`createInitialGameSdkModuleProfile()`のcanonical profileとdigestを
`initial-default` / `system-default`由来の初期contractとして保存する。この状態は
人間確認ではなく、`module_profile_confirmed_at`と人間actorを持たない。初期profileと
canonicalに同一な間は`get_game_module_requirements`と`publish_mock`へ進める。
profileに差分を提案した場合だけ、active contractを維持したまま人間reviewを要求し、
`changeConfirmationState=pending-human-confirmation`、
`prototypeAuthoringAllowed=false`としてrequirements、`publish_mock`、prototype承認、
package候補作成・提出を停止する。承認後のrevision・digestへ切り替えるか、proposalを
却下した後にだけ制作を再開する。

## Versioning

`sdkHandshakeVersion`はhandshake JSONの破壊的変更で上げる。`sdkContractVersion`はgame manifest／Runtime契約、`roomSchemaVersion`は内部保存envelopeの版であり相互代用しない。同じhandshake version内ではfieldを削除・改名せず、追加fieldは省略可能にする。
