# Game Fields SDK バージョン管理

`config/platform-release.json`を、Game Fields本体とSDK配布のリリース互換性に関する正本とする。

現在の開発候補はPlatform／SDK package `0.1.1`、SDK handshake `1`、SDK contract `1`、Room schema `2`である。Runner Runtimeは`quickjs-wasm-v1`、Resource ProtocolとClient Bridgeはそれぞれ`1`である。`0.1.1`はportable AppSet、正式Preview Room、hash固定昇格を追加する。ゲームのSDK contract schemaは維持する一方、Room開始時の固定契約とsettings snapshotを保存するため、Platform内部のRoom envelopeだけをv2へ上げる。

## バージョンの役割

- `platformVersion`: Game Fields本体、SDK Portal、DownloadMe、SDK packageを同時に公開するリリース番号。
- `sdkPackageVersion`: 配布する`@game-fields/game-sdk`のSemVer。現在は`platformVersion`と一致させる。
- `sdkHandshakeVersion`: SDK接続時に交換するhandshake JSONの破壊的schema。
- `sdkContractVersion`: ゲームmanifestとRuntime間の破壊的変更を表す整数schema。
- `supportedSdkContractVersions`: 現在のmain Runtimeが受け入れる契約schema。既存ゲームが使うschemaは、移行完了まで残す。
- `roomSchemaVersion`: Game Fields内部で保存するSDK room envelopeのschema。
- `runnerRuntimeVersion`: AppSetを実行する隔離Runtime実装。旧Roomを継続する間は必要な版を併存させる。
- `resourceProtocolVersion`: LLMやWord DB等をPlatformがserver側注入するResource要求・応答契約。
- `clientBridgeVersion`: package iframeとPlatform Shell間のRoom UI／Command bridge契約。
- `starterRef`: 対応する公開Starter branch。安定版は`sdk-starter`、development候補は`sdk-starter-dev`。

Platformの公開版を揃えることと、既存ゲームを最新SDKへ強制更新することは別である。各ゲームは作成時のSDK packageとcontract schemaをmanifestへ固定し、main Runtime側が対応するschemaをadapterで受け入れる。

## 互換性ルール

1. 同じSDK contract schema内ではfieldとCommandを削除・改名しない。追加fieldは省略可能か既定値を持たせる。
2. 破壊的変更は`sdkContractVersion`を上げ、旧schema用adapterと検査を残す。
3. handshake request／responseのfield削除・改名は`sdkHandshakeVersion`を上げる。capability追加だけでは上げない。
4. `supportedSdkContractVersions`から旧schemaを削除する前に、登録ゲームがゼロであることと移行テスト完了を確認する。
5. SDK PortalはPlatformと同じ安定版だけを本番配布する。dev SDKは次版候補を配布してよいが、本番mainの対応版として表示しない。
6. 全登録ゲームの契約テストをmainのCIで実行し、未対応schemaの提出物は取込時に拒否する。
7. Room開始時にPackage Revision、Package Root Hash、Runner Runtime、SDK／Room／Resource／Client Bridge各version、settings snapshotを固定し、進行中Roomをchannel pointer更新へ追従させない。
8. Room schemaの異なる保存recordを、不足fieldへ現在値を補って自動昇格しない。開始時契約を証明できない旧recordは旧readerで完走させるか、下記の切替手順で排出する。
9. `sdk-starter`はnpm安定版と本番Portalだけに対応させ、開発候補は`sdk-starter-dev`へ公開する。DownloadMeとstarter manifestは`config/platform-release.json`の同じ`starterRef`を使う。

## Room schema v1からv2への切替

Room schema v1にはPackage Root Hash、Runner Runtime、Resource Protocol、Client Bridge、settings snapshotが保存されていないため、安全なv2への自動変換はできない。現在の実装は環境を含むv2 namespaceへ分離し、v1 recordを上書きしない。

本番切替では、新しいv1 Roomの作成を止め、既存Roomを解散またはRoom TTL 6時間で排出したことを確認してからv2 Runtimeを有効にする。v1 Roomを切替中も完走させる必要がある場合は、v1 readerと当時のRunner／Package解決経路を別系統で残し、v2として再解釈しない。切替確認なしの通常deploymentは行わない。

## リリース手順

1. `config/platform-release.json`の次版を決める。
2. root、SDK、Runtime、SDK Portalのpackage versionとRuntimeのSDK依存を同じ版へ更新する。
3. 契約破壊がある場合だけ`sdkContractVersion`を上げる。
4. Room schemaを上げる場合は、旧schemaの継続readerまたは既存Room排出手順を決め、切替条件を満たす。
5. `npm run check:versions`、SDK検査、全ゲームテストをdevで通す。
6. `docs/SDK_DATABASE_MIGRATIONS.md`に従い、加算migrationをDeploymentより先にdevelopmentへ適用する。
7. 検証済みsnapshotを`sdk-starter-dev`へ公開し、dev SDKとGame Fields developの組合せを実機確認する。
8. `npm run release:sdk:check`で公開tarball・外部install・npm publish dry-runを確認する。
9. main反映時に`channel: stable`と`starterRef: sdk-starter`へ切り替え、同じsnapshotを安定Starterへ公開する。
10. 検証済みcommitをmainへ反映し、GitHub Actionsの`Publish Game SDK`をmainから手動実行する。versionは`config/platform-release.json`と完全一致させ、確認欄へ`publish-game-sdk`を入力する。
11. npmの`@game-fields/game-sdk@<version>`、main、SDK本番の公開を確認し、Platform Version表示が一致することを確認する。

初回publish前にnpm側で`@game-fields` scopeの所有権と、GitHub Environment `npm-public`の承認者、Repository Secret `NPM_TOKEN`（対象packageへのpublishだけを許可するgranular token）を設定する。token値はGit、文書、ログへ残さない。npm Trusted Publishingへ移行した後はworkflowから`NODE_AUTH_TOKEN`を削除する。

`npm run lint`は先頭で`check:versions`を実行し、版のずれをエラーにする。
