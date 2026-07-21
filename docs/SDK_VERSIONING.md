# Game Fields SDK バージョン管理

`config/platform-release.json`を、Game Fields本体とSDK配布のリリース互換性に関する正本とする。

## バージョンの役割

- `platformVersion`: Game Fields本体、SDK Portal、DownloadMe、SDK packageを同時に公開するリリース番号。
- `sdkPackageVersion`: 配布する`@game-fields/game-sdk`のSemVer。現在は`platformVersion`と一致させる。
- `sdkContractVersion`: ゲームmanifestとRuntime間の破壊的変更を表す整数schema。
- `supportedSdkContractVersions`: 現在のmain Runtimeが受け入れる契約schema。既存ゲームが使うschemaは、移行完了まで残す。
- `roomSchemaVersion`: Game Fields内部で保存するSDK room envelopeのschema。

Platformの公開版を揃えることと、既存ゲームを最新SDKへ強制更新することは別である。各ゲームは作成時のSDK packageとcontract schemaをmanifestへ固定し、main Runtime側が対応するschemaをadapterで受け入れる。

## 互換性ルール

1. 同じSDK contract schema内ではfieldとCommandを削除・改名しない。追加fieldは省略可能か既定値を持たせる。
2. 破壊的変更は`sdkContractVersion`を上げ、旧schema用adapterと検査を残す。
3. `supportedSdkContractVersions`から旧schemaを削除する前に、登録ゲームがゼロであることと移行テスト完了を確認する。
4. SDK PortalはPlatformと同じ安定版だけを本番配布する。dev SDKは次版候補を配布してよいが、本番mainの対応版として表示しない。
5. 全登録ゲームの契約テストをmainのCIで実行し、未対応schemaの提出物は取込時に拒否する。

## リリース手順

1. `config/platform-release.json`の次版を決める。
2. root、SDK、Runtime、SDK Portalのpackage versionとRuntimeのSDK依存を同じ版へ更新する。
3. 契約破壊がある場合だけ`sdkContractVersion`を上げる。
4. `npm run check:versions`、SDK検査、全ゲームテストをdevで通す。
5. dev SDKとGame Fields developの組合せを実機確認する。
6. 同じcommitを基準にmainとSDK本番を公開し、両方のPlatform Version表示が一致することを確認する。

`npm run lint`は先頭で`check:versions`を実行し、版のずれをエラーにする。
