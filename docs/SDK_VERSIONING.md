# Game Fields SDK バージョン管理

`config/platform-release.json`を、Game Fields本体とSDK配布のリリース互換性に関する正本とする。

現在の開発候補はPlatform／SDK package `0.1.1`、SDK handshake `1`、SDK contract `1`、Room schema `1`である。`0.1.1`はportable AppSet、正式Preview Room、hash固定昇格を追加する後方互換リリースで、contract schemaは上げない。

## バージョンの役割

- `platformVersion`: Game Fields本体、SDK Portal、DownloadMe、SDK packageを同時に公開するリリース番号。
- `sdkPackageVersion`: 配布する`@game-fields/game-sdk`のSemVer。現在は`platformVersion`と一致させる。
- `sdkHandshakeVersion`: SDK接続時に交換するhandshake JSONの破壊的schema。
- `sdkContractVersion`: ゲームmanifestとRuntime間の破壊的変更を表す整数schema。
- `supportedSdkContractVersions`: 現在のmain Runtimeが受け入れる契約schema。既存ゲームが使うschemaは、移行完了まで残す。
- `roomSchemaVersion`: Game Fields内部で保存するSDK room envelopeのschema。

Platformの公開版を揃えることと、既存ゲームを最新SDKへ強制更新することは別である。各ゲームは作成時のSDK packageとcontract schemaをmanifestへ固定し、main Runtime側が対応するschemaをadapterで受け入れる。

## 互換性ルール

1. 同じSDK contract schema内ではfieldとCommandを削除・改名しない。追加fieldは省略可能か既定値を持たせる。
2. 破壊的変更は`sdkContractVersion`を上げ、旧schema用adapterと検査を残す。
3. handshake request／responseのfield削除・改名は`sdkHandshakeVersion`を上げる。capability追加だけでは上げない。
4. `supportedSdkContractVersions`から旧schemaを削除する前に、登録ゲームがゼロであることと移行テスト完了を確認する。
5. SDK PortalはPlatformと同じ安定版だけを本番配布する。dev SDKは次版候補を配布してよいが、本番mainの対応版として表示しない。
6. 全登録ゲームの契約テストをmainのCIで実行し、未対応schemaの提出物は取込時に拒否する。

## リリース手順

1. `config/platform-release.json`の次版を決める。
2. root、SDK、Runtime、SDK Portalのpackage versionとRuntimeのSDK依存を同じ版へ更新する。
3. 契約破壊がある場合だけ`sdkContractVersion`を上げる。
4. `npm run check:versions`、SDK検査、全ゲームテストをdevで通す。
5. dev SDKとGame Fields developの組合せを実機確認する。
6. `npm run release:sdk:check`で公開tarball・外部install・npm publish dry-runを確認する。
7. 検証済みcommitをmainへ反映し、GitHub Actionsの`Publish Game SDK`をmainから手動実行する。versionは`config/platform-release.json`と完全一致させ、確認欄へ`publish-game-sdk`を入力する。
8. npmの`@game-fields/game-sdk@<version>`、main、SDK本番の公開を確認し、Platform Version表示が一致することを確認する。

初回publish前にnpm側で`@game-fields` scopeの所有権と、GitHub Environment `npm-public`の承認者、Repository Secret `NPM_TOKEN`（対象packageへのpublishだけを許可するgranular token）を設定する。token値はGit、文書、ログへ残さない。npm Trusted Publishingへ移行した後はworkflowから`NODE_AUTH_TOKEN`を削除する。

`npm run lint`は先頭で`check:versions`を実行し、版のずれをエラーにする。
