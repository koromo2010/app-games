# SDK共通モジュール棚卸し

## 目的

Game Fields本体にある共通機能と、外部ゲームpackageが直接利用できる公開ライブラリを混同しないための台帳。機械可読な採用正本は`@game-fields/game-sdk/modules`の`GAME_SDK_MODULE_CATALOG`とし、この文書は責任境界と実装状況を説明する。

## 全38モジュールの区分

| 区分 | 件数 | module ID | 外部ゲームからの使い方 |
| --- | ---: | --- | --- |
| Platform固定 | 7 | `authentication`, `account-session`, `authorization`, `persistence`, `observability`, `common-navigation`, `player-menu` | Game Fieldsが所有・合成。再実装不可 |
| 共通Shell | 16 | `common-shell`, `online-room`, `room-sync`, `room-settings`, `debug`, `timer`, `result`, `rematch`, `dissolution`, `stats`, `rating`, `replay`, `result-share`, `spectators`, `ai-activity`, `ads` | Game Fieldsが画面・Runtime・保存adapterを合成。ゲーム固有slotへ複製しない |
| 純粋進行helper | 11 | `start-guard`, `phase-flow`, `rounds`, `turn-order`, `collect-text`, `collect-choice`, `vote`, `role-assignment`, `team-assignment`, `secret-presentation`, `standard-outcome` | `@game-fields/game-sdk/modules`からimport |
| 再利用resource | 4 | `content-source`, `llm`, `playing-cards`, `drawing` | 非公開resourceは注入契約、ローカルresourceは公開packageからimport |

## Resource棚卸し

| module | 棚卸し前 | 公開境界 | 本体での利用 |
| --- | --- | --- | --- |
| `content-source` | catalog上の名前と固定3語Previewだけ。pool・型・取得APIが外部から不明 | `@game-fields/game-sdk/content-source`に一般語word・審査済みpair・definition、`easy | normal | hard`、取得request、返却fieldを公開。AppSetは`@game-fields/game-sdk/resources`、モックは`GameFieldsPreset.resources.contentSource`を利用 | `lib/game-sdk-content-source.ts`が一般語・ワードペア・対応語釈を読取専用で束ね、認証付き暗号化opaque IDへ変換。低認知語彙とたほい屋候補・審査・お題は内部専用として型・定数・APIから遮断する。審査済みゲームへ直接注入し、未審査Previewは外側Shellの認証・profile・レート制限付きpostMessage bridgeから同じ3 APIだけを中継。DB接続・既出履歴・抽選権限はPlatform内に保持 |
| `llm` | 共通gatewayは本体だけ。外部package用の注入型・実adapterなし | `@game-fields/game-sdk/llm`にtask、送信内容、prompt version、任意の返却schemaを持つrequestとresponse・生成metaを公開。provider/APIキーは非公開 | `lib/game-sdk-llm-gateway.ts`が審査済みserver moduleへ注入し、`lib/game-llm.ts`がprovider選択、課金元、model、fallbackを所有。Previewは`GameFieldsPreset.resources.llm`から認証・レート制限付き本体APIへ限定中継 |
| `playing-cards` | pure helperとReact UIが本体`lib/`・`app/components/`に分散 | `@game-fields/game-sdk/playing-cards`と`playing-cards-react`へ公開 | 本体も公開packageを参照し、Daifugo等と外部ゲームの実装を共通化 |
| `drawing` | stroke helper・Canvas UI・機能preset・Room同期が混在 | `@game-fields/game-sdk/drawing`と`drawing-react`へ描画コア・UIを公開 | 本体も公開packageを参照。Room同期、保存、消去権限は本体adapterに残す |

## お絵描きUIの分離結果

公開するもの:

- 正規化座標の`DrawingPoint`
- `DrawingStroke`、`DrawingLayer`、tool型
- stroke検証・上限・塗りつぶし
- lobby／collaborative用機能preset
- マウス・タッチ・ペン対応`DrawingCanvas`
- ペン・消しゴム・塗りつぶし・スポイト、色、線幅、不透明度、undo／redo、zoom、全画面をまとめる`DrawingToolbar`
- active layerと表示／非表示を選ぶ`DrawingLayerPanel`
- スポイト、塗りつぶし、パン、進行中stroke callback、キーボードカーソル

公開しないもの:

- Game Fieldsアカウントとplayer ID解決
- Redis、Room API、既出revision、polling
- lobby boardの3日保存
- host全消去／本人だけundo等の最終認可
- 共通トップバー、参加者、デバッグ、広告

これにより、外部ゲームはCanvas APIを再実装せずUIを使える一方、ゲームpackageから保存層や管理権限へ到達できない。

## 制作AIへの通知経路

1. DownloadMeの`SDK_MODULE_CATALOG.md`
2. `GAME_SDK_MODULE_CATALOG`の`delivery`、`packageExports`、`publicApis`、`usage`
3. SDK Portal module APIの`catalog`
4. MCP `get_game_module_requirements`の`requiredModules`
5. npm packageのREADMEと型定義
6. SDK-dev module labの実物

MCPはIDだけではなく、確定済みmoduleごとの公開importと利用方法を返す。`platform-owned`をコピーせず、`platform-resource`は注入adapter、`sdk-helper`と`sdk-resource`はnpm importとして扱う。
