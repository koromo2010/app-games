# Redis統合・移管・Vercelビルド抑制 Runbook

最終更新: 2026-07-30

この文書は、`wy-app-games`の所有スコープ移管、本番正式SDK Runtimeの継続接続、開発Redisへのdevelopment系統合、`sdk-dev-redis`からの非破壊データ移行、Vercel build抑制を扱う。接続文字列、token、passwordは記録しない。Database IDとendpoint hostは作業報告に記録してよいが、Gitにはcredential値を残さない。

## 1. 確定アーキテクチャ

### 本番Redis

- resource: `wy-app-games`
- `personal` scopeから`game-fields`へVercel Marketplaceの正式Transferで移管する。
- Database ID、データ、plan、regionを維持する。
- 利用対象は`app-games`上のmain Platformと本番正式SDK Runtimeだけとする。
- development、SDK development Portal、development Preview Runtimeを接続しない。
- SDK Portalの`SDK_REDIS_*`を正式Room RuntimeのRedis資格と混同しない。

### 開発Redis

- `app-games-dev`が現在接続している既存Redisを統合先候補とする。
- 新しいRedisを作成しない。
- `app-games-dev`の既存Redisが存在しない場合は停止し、推測で`sdk-dev-redis`または`wy-app-games`を選ばない。
- 実画面でresource名、Database ID、endpoint host、region、現在planを確認する。
- `sdk-dev-redis`と同一か別resourceかをDatabase IDとendpoint hostで判定する。
- dev Platform、SDK development Portal、development Preview Runtimeを物理的に同じ開発Redisへ接続する場合でも、namespaceを分離する。
- 有料化が必要な場合は、対象DB名、現在plan、変更後plan、月額を実画面で確認して報告し、明示了承後にだけ実行する。

### 移行元

- `sdk-dev-redis`は移行元として保持する。
- 有料化しない。
- 削除しない。
- source keyは検証完了後も、別途明示指示があるまで削除しない。

## 2. 絶対条件

- 新しいRedisを作成しない。
- developmentを`wy-app-games`へ接続しない。
- `sdk-dev-redis`を有料化・削除しない。
- 開発Redisのplan変更を、対象・変更後plan・月額の報告前に実行しない。
- region、auto-upgrade、Spend Limit、個人側Vercel Proを変更しない。
- `FLUSHDB`、`FLUSHALL`、target全体を消去するRestore／Import、既存target keyの上書きを行わない。
- source database／source keyを削除しない。
- Neon PostgreSQL、Blobを変更しない。
- backup／exportまたは同等のデータ保全確認前にTransfer、接続先変更、データ移行を開始しない。
- token、password、接続文字列全体をログ、Git、Issue、PR、チャットへ出力しない。
- `main`へのコード反映、force push、履歴書き換えをこの作業では行わない。
- `app-games-sdk-portal`は未使用を確認できるまで削除しない。

## 3. 作業再開時のGit確認

1. remote `develop`、作業branch、PR headを取り直す。
2. `develop` SHA、作業branch SHA、ahead／behind、mergeabilityを記録する。
3. local未commit変更の有無を確認する。
4. T-26と変更ファイルが重複する場合は内容を比較し、既存変更を破棄しない。
5. `develop`が進んでいればforceせず取り込み、全テストを再実行する。
6. Vercel check成功をNext.js build成功として扱わず、Ignored Build Stepのskipと区別する。

## 4. 変更前に必ず採取する実値

### Redis resource

| Resource | 必須項目 | 判断条件 |
| --- | --- | --- |
| `wy-app-games` | Database ID、endpoint host、primary/read region、plan、現在scope／installation、接続Project | 本番専用。Transfer前後でID・データ・plan・regionを維持 |
| `app-games-dev`が現在使うRedis | resource名、Database ID、endpoint host、region、plan、接続Project | 開発統合先候補。存在しなければ停止 |
| `sdk-dev-redis` | Database ID、endpoint host、region、plan、上限状態、key数、type別件数、namespace、backup/export可否、日時別command推移 | 移行元。削除・upgrade禁止 |

個人scopeのIntegrationに含まれる全resourceを列挙する。VercelのTransferがIntegration全体単位で、`wy-app-games`以外のresourceや請求を巻き込む場合は移管を停止する。

### Vercel Project

対象は次の7 Projectとする。

- `app-games`
- `app-games-dev`
- `app-games-sdk`
- `app-games-sdk-dev`
- `app-games-sdk-preview`
- `app-games-preview-dev`
- `app-games-sdk-portal`

各Projectについて、scope、Production branch、domain、Root Directory、Production／Preview／Development別のRedis変数名とendpoint hostを台帳化する。secret値は出力しない。

## 5. Surface別のRedis用途

| Surface | Project | Redis用途 | target resource | namespace |
| --- | --- | --- | --- | --- |
| main Platform | `app-games` | 通常Room、正式SDK Room、rate limit、realtime stream | `wy-app-games` | prefixなし。Runtime内部の`production` segmentは維持 |
| development Platform | `app-games-dev` | dev通常Room、development正式SDK Room、rate limit、realtime stream | `app-games-dev`の既存Redis | `app-dev:` |
| production SDK Portal | `app-games-sdk` | URL予約registry等のPortal固有データだけ | 実値分類後に決定。`wy-app-games`へ自動接続しない | `sdk:production:preview-instance:v1:` |
| development SDK Portal | `app-games-sdk-dev` | URL予約registry等のPortal固有データ | 開発Redis | `sdk:development:preview-instance:v1:` |
| production isolated Preview | `app-games-sdk-preview` | 原則Redisなし | なし | production Redis誤設定はfail-closed |
| development isolated Preview | `app-games-preview-dev` | Preview Runtimeの一時状態・metrics等、実際に必要なものだけ | 開発Redis | `preview-dev:` |
| duplicate candidate | `app-games-sdk-portal` | 利用未確認 | 変更禁止 | build skipのみ。削除しない |

正式Package RoomのRuntimeはSDK PortalではなくPlatform Runtime上で動く。本番正式Roomは`app-games`、development正式Roomは`app-games-dev`のRedis経路を使う。Portalの`SDK_REDIS_REST_URL`／`SDK_REDIS_REST_TOKEN`はPortal registry専用であり、正式Room Runtime接続の証拠にしない。

## 6. 開発Redis内のnamespace

### dev Platform

`app-dev:`を次を含むすべての物理keyへ適用する。

- Room／Runtime状態
- player、account、session補助情報
- lock、rate limit、quota
- Redis Streamsとrealtime event stream
- cleanup、SCAN、期限切れ削除のMATCH pattern
- Lua／transaction／pipelineで指定するkey
- list、set、sorted set、hash、streamのkey

### SDK development Portal

- `sdk:development:preview-instance:v1:`を使用する。
- 旧`sdk:preview-instance:v1:`は移行確認中のread fallbackだけとし、新規write先にしない。

### development Preview Runtime

- `preview-dev:`を使用する。
- `app-dev:`と同一keyを生成しない。
- production PreviewにRedis資格が設定された場合は起動・request時に拒否する。

production、dev Platform、SDK development Portal、development Preview Runtimeで同じ論理keyを使っても物理key・streamが一致しないことを自動テストする。

## 7. BackupとTransfer

1. `wy-app-games`の変更前resource情報とデータ保全状態を記録する。
2. providerのbackup/exportが利用可能なら作成し、完了状態、時刻、IDを記録する。
3. `sdk-dev-redis`でもbackup/export可否を確認する。上限到達でcommandが拒否されても管理面のexport可否を確認する。
4. backup処理中はplan／region／Transferを同時実行しない。
5. Vercel Marketplaceの正式Transferで`wy-app-games`単体を`game-fields`へ移す。
6. Database ID、endpoint host、plan、region、データが前後で同一であることを確認する。
7. mainの既存Deploymentから通常のRedis読取・更新を確認する。credentialが変わらなければ確認目的のredeployを行わない。
8. credential／Integration linkが変わる場合だけ`app-games` Productionを更新し、直前Deployment IDをrollback候補として一度だけ再配備する。

Backup Restore／Importはtarget全体を消去するため使用しない。

## 8. キー分類と非破壊移行

`node scripts/migrate-redis-namespace.mjs plan`はsourceをSCANし、各keyについてtype、PTTL、content digest、target key、衝突状態を記録する。値とcredentialは報告へ出さない。

### 自動copy候補

- `app-dev:*`を開発Redisの`app-dev:*`へ移すentry
- `sdk:development:preview-instance:v1:*`
- 旧`sdk:preview-instance:v1:*`から`sdk:development:preview-instance:v1:*`への明示写像
- development Preview Runtimeと確認できたkeyから`preview-dev:*`への明示写像
- `game-sdk-runtime:v2:development:*`／`rate-limit:v2:development:*`を`app-dev:`へ移す明示entry

### 必ず手動判定

- `sdk:production:*`
- production Runtime／rate-limit key
- prefixなしの`online-room:events:v1`
- unknown key
- source接続元を特定できないkey
- targetに同名keyが存在するすべてのentry

`apply`は`--confirm-no-overwrite`を必須とし、target keyが存在した時点で停止する。string、hash、list、set、zset、streamをkey単位で作成し、絶対expire時刻へ換算してTTLを維持する。typeとdigestを再検証し、不一致時はその実行で新規作成したtarget keyだけを削除する。sourceには書き込まない。

production Portal keyは接続元、内容、revision、更新時刻を確認するまで移行しない。`wy-app-games`へ自動移行しない。

## 9. 実行順序

1. Git、Project、Redis実値の変更前スナップショットを作成する。
2. `wy-app-games`のデータ保全を確認する。
3. 公式Transferで`game-fields`へ移管する。
4. Database ID・データ・plan・region・接続状態の維持を確認する。
5. main Platformと本番正式SDK Runtimeを通常導線で確認する。
6. `app-games-dev`が現在使うRedisを開発統合先として確定する。
7. 開発Redisの有料化が必要なら、対象・現在plan・変更後plan・月額を報告し、了承を待つ。
8. `sdk-dev-redis`のkeyを分類し、専用namespaceへ非破壊移行する。
9. `app-games-dev`、`app-games-sdk-dev`、必要な場合だけ`app-games-preview-dev`のProduction環境を開発Redisへ切り替える。
10. sourceを残したまま実動作確認する。
11. `sdk-dev-redis`とsource keyは、別途明示指示があるまで削除しない。

`app-games-sdk` production Portalの接続先は、production registry keyの用途とtargetが確定するまで変更しない。

## 10. 実動作確認

- main Platformの通常ゲーム
- 本番正式SDK Roomの作成、Runtime接続、command、revision更新
- dev Platformの通常ゲーム
- development正式SDK Roomの作成、Runtime接続、command、revision更新
- development Preview Runtime
- 別タブまたは別端末での同期
- 再読み込み・復帰
- realtime／Redis Streams通知
- 45秒整合確認
- 移行前データ参照
- 5xx、429、`REDIS_STORE_REQUEST_LIMIT_EXCEEDED`、Redis timeoutログ

`/health`のHTTP 200だけを成功証拠にしない。

## 11. Vercel build条件

`vercel.json`から`scripts/check-vercel-build-impact.mjs`を実行する。終了コード0はskip、1はbuild。

| Project | branch gate | build対象 |
| --- | --- | --- |
| `app-games` | `main`のみ | Platform本体と共有Runtime変更 |
| `app-games-dev` | `develop`のみ | Platform本体と共有Runtime変更 |
| `app-games-sdk` | `main`のみ | `apps/sdk-portal/`とPortal共有package |
| `app-games-sdk-dev` | `develop`のみ | `apps/sdk-portal/`とPortal共有package |
| `app-games-sdk-preview` | `main`のみ | `apps/sdk-preview/`とPreview共有package |
| `app-games-preview-dev` | `develop`のみ | `apps/sdk-preview/`とPreview共有package |
| `app-games-sdk-portal` | 常時skip | 使用確認までbuildしない。削除しない |

`package.json`、lockfile、共通tsconfig、`config/`、`types/`など影響範囲が広い変更は安全側で対象branchの全surfaceをbuildする。`docs/`とroot Markdownだけならbuildしない。diff取得不能、未知Projectは安全側でbuildする。

feature branchのVercel check successはbranch mismatchによるbuild skipであり、Next.js build成功ではない。Deploymentレコード作成後にCANCELEDになることは許容し、clone後の不要なcompileを止める。

## 12. build費抑制の運用ルール

- 自動テスト完了まではlocalまたはPR branchで作業する。
- 原則1 taskにつきdevelopへのpushは1回。複数commitの作業branchはsquash mergeでdevelopへ1commitとして反映する。
- 影響するProjectだけを配備する。
- state／log／environment確認だけならredeployしない。
- 検証済みDeploymentを再利用できる場合はrebuildしない。
- `--force`、Build Cache無効化、確認目的のRedeployを常用しない。
- branchが進んでいた場合はforceせず取り直し、testを再実行する。

## 13. command枯渇調査

最低限、次をprovider metricsとVercel logsで照合する。

- 日時別command数
- 接続Project別request数
- Room GET、active Room、realtime endpoint、Portal registry操作
- polling interval、WebSocket失敗時fallback、再接続、read retry
- rate limit、TTL更新、SCAN、cleanup、cron
- Room command後のwatcher再生成回数
- 429／5xxとclient retry

2026-07-30のVercel 24時間ログでは、`app-games-dev`の正式SDK Room GETとrealtime endpointが高頻度で、Redis上限到達後の500は`REDIS_STORE_REQUEST_LIMIT_EXCEEDED`だった。コード上、同一Roomのcommand応答ごとにwatcherを閉じて再生成していたため、初回GETとWebSocket接続確認が増幅していた。修正後は同じRoomのwatcherを維持し、Room変更またはwatcher消失時だけ再生成する。providerの日次command graphで減少を確認するまで原因調査を完了扱いにしない。

セッション単位API上限、冪等化、残量表示、429 + Retry-After、Preview重複Build防止、将来の利用ポイント課金設計は復旧後の独立タスクとし、この作業で大規模追加実装しない。

## 14. Rollback

- Transfer後に接続不良が出た場合、credentialが不変ならProject設定を変更せずprovider側のTransfer状態を確認する。
- env切替後の不良は、変更したProjectだけを直前の開発Redis資格または旧`sdk-dev-redis`資格へ戻し、直前READY Deploymentへrollbackする。
- developmentデータはsourceを削除しないため旧資格へ戻して参照できる。
- targetへ新規copyしたkeyは移行reportの一覧だけを対象に削除できるが、その後の更新がないことを確認してから手動実行する。自動一括削除は行わない。
- code rollbackは作業branch／develop反映commitのrevertで行う。force pushしない。

## 15. 完了報告

- `wy-app-games`のTransfer前後scope、Database ID、endpoint host、region、plan
- backup／exportまたはデータ保全の証跡
- main Platformと本番正式SDK Runtimeの実動作
- 開発Redisのresource名、ID、endpoint host、region、plan
- dev Platform、SDK development Portal、development Preview Runtimeの接続先とnamespace
- 移行key数、type別件数、TTL保持、digest、collision処理
- `sdk-dev-redis`を削除・upgradeしていないこと
- 7 Projectのbranch、domain、build／skip条件、最終Deployment状態
- 実行コマンド、成功件数、失敗内容
- command枯渇原因と修正結果
- commit、Deployment ID、READY、配備後5xx
- rollback手順と直前Deployment ID
- T-26正式Room確認へ戻った時点と結果
