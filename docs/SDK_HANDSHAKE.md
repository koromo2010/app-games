# Game Fields SDK ハンドシェイク

Game Fields SDKへ接続するAI、スターター、browser Runtimeは、制作者操作やRoom操作より先にSDK固有の互換性確認を行う。MCPの`initialize`はMCP transportの版を合意するだけであり、Game Fields Platform、SDK package、契約schema、接続環境、利用機能の互換性を保証しない。

## 正本

- 公開型と判定: `packages/game-sdk/src/handshake.ts`
- リリース値: `config/platform-release.json`
- Portal descriptor: `apps/sdk-portal/lib/sdk-handshake.ts`
- 公開discovery／negotiation: `/.well-known/game-fields-sdk`
- AI向けMCP tool: `get_sdk_handshake`
- DownloadMeの期待値: `sdk/entry/START_GAME_FIELDS.md`

`sdk.game-fields.com`と`sdk-dev.game-fields.com`は同じhandshake protocolと要求形式を使う。違いは`environment`、canonical endpoint、配信releaseであり、AIの制作手順は分岐させない。

## 接続順

1. MCP clientはMCP `initialize`を行う。
2. 制作者操作を行う場合はOAuth 2.1 + PKCEで本人認証する。
3. `get_sdk_handshake`を呼び、DownloadMeが持つ期待値と必須capabilityを提示する。
4. `accepted=true`、`problems=[]`、接続先環境・release・portal endpoint一致を確認する。
5. 成功後にだけ`list_creator_environments`以降のSDK toolを使う。

公開の`GET /.well-known/game-fields-sdk`は認証前のdiscoveryに利用できる。`POST /.well-known/game-fields-sdk`と`get_sdk_handshake`は同じ純粋な互換判定を使う。ハンドシェイク自体は認証sessionや権限を発行せず、OAuth、署名Cookie、Room actor解決の代わりにはならない。

Portalの`get_sdk_handshake`へ送る`requiredCapabilities`はDownloadMe記載の4件だけとする。公開SDK全体のcapability型にはgame Runtime向けの`persistent-rooms`、`room-realtime`、`common-shell`等も含まれるが、Portal control planeのhandshakeへenum候補を一括送信しない。MCP tool schemaのenumとPortal descriptorは`SDK_PORTAL_CAPABILITIES`を共用し、DownloadMeとの不一致を回帰テストで拒否する。

## Request v1

```json
{
  "protocol": "game-fields-sdk",
  "handshakeVersion": 1,
  "client": {
    "kind": "ai-agent",
    "name": "ChatGPT"
  },
  "expected": {
    "environment": "development",
    "platformVersion": "0.1.1",
    "sdkPackageVersion": "0.1.1",
    "sdkContractVersion": 1
  },
  "requiredCapabilities": [
    "oauth2-pkce",
    "creator-environments",
    "starter-download",
    "mock-publish"
  ]
}
```

`client.kind`は`ai-agent`、`starter-cli`、`browser-runtime`、`platform`のいずれかとする。`client.name`と`client.version`は診断用の任意値で、認証や認可へ使用しない。

## Response v1

```json
{
  "protocol": "game-fields-sdk",
  "handshakeVersion": 1,
  "surface": "creator-portal",
  "environment": "development",
  "release": {
    "platformVersion": "0.1.1",
    "sdkPackageVersion": "0.1.1",
    "sdkContractVersion": 1,
    "supportedSdkContractVersions": [1],
    "roomSchemaVersion": 1
  },
  "capabilities": [
    "oauth2-pkce",
    "creator-environments",
    "starter-download",
    "mock-publish"
  ],
  "endpoints": {
    "portal": "https://sdk-dev.game-fields.com",
    "handshake": "https://sdk-dev.game-fields.com/.well-known/game-fields-sdk",
    "mcp": "https://sdk-dev.game-fields.com/api/mcp"
  },
  "accepted": true,
  "problems": []
}
```

拒否時もserver descriptorは返し、`accepted=false`と安全なproblem codeだけを追加する。request本文、OAuth token、Cookie、利用者情報をproblemやログへ含めない。

## 拒否条件

| code | 条件 |
| --- | --- |
| `INVALID_REQUEST` | 必須field、型、既知enumのいずれかが不正 |
| `PROTOCOL_MISMATCH` | `protocol`が`game-fields-sdk`ではない |
| `HANDSHAKE_VERSION_UNSUPPORTED` | handshake schemaが非対応 |
| `ENVIRONMENT_MISMATCH` | DownloadMeが期待する`sdk`／`sdk-dev`と接続先が異なる |
| `PLATFORM_VERSION_MISMATCH` | DownloadMeとPortalのPlatform releaseが異なる |
| `SDK_PACKAGE_VERSION_MISMATCH` | 同梱・取得予定のSDK package releaseが異なる |
| `SDK_CONTRACT_UNSUPPORTED` | game contract schemaをserverが受け入れない |
| `CAPABILITY_UNAVAILABLE` | 制作フローに必須の機能を接続先が提供しない |

複数の不一致は一度の応答へまとめる。クライアントは自動的に別環境、旧版、非公式mirrorへ切り替えず、利用者へproblem codeを示して停止する。

## Versioning

`sdkHandshakeVersion`はhandshake JSON自体の破壊的変更で上げる。`sdkContractVersion`はゲームmanifest／Runtime契約、`roomSchemaVersion`は内部保存envelopeの版であり、相互に代用しない。同じhandshake version内ではfieldを削除・改名せず、追加fieldは省略可能にする。
