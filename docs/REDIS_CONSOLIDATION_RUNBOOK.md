# Redis統合・移管・Vercelビルド抑制 Runbook

最終更新: 2026-07-30

この文書は、`wy-app-games`の所有スコープ移管、SDK Runtime／developmentのRedis統合、`sdk-dev-redis`からの非破壊データ移行、Vercel build抑制を扱う。接続文字列、token、passwordは記録しない。Database IDとendpoint hostは作業報告に記録してよいが、Gitには必要最小限だけを残す。

## 1. 絶対条件

- 新しい有料Redisを作成しない。
- `sdk-dev-redis`を有料化しない。
- plan、region、auto-upgrade、Spend Limit、契約、個人側Proを変更しない。
- `FLUSHDB`、`FLUSHALL`、target全体を消去するRestore／Import、既存target keyの上書きを行わない。
- source database／source keyを削除しない。
- Redis以外のNeon PostgreSQL、Blob、Integration resourceを変更しない。
- backup／export完了前にtransfer、接続先変更、データ移行を開始しない。
- token、password、接続文字列全体をログ、Git、Issue、PR、チャットへ出力しない。
- `main`へのコード反映、force push、履歴書き換えをこの作業では行わない。

## 2. 変更前に必ず採取する実値

Vercel Marketplace／Upstashの画面または読取APIから、次を採取する。

### Redis resource

| Resource | 必須項目 | 変更前の期待状態 | 実値記録 |
| --- | --- | --- | --- |
| `wy-app-games` | Database ID、endpoint host、primary region／read region、plan、所有scope、接続Project | 個人scope、Fixed 250MB、有料、本番mainが利用 | 作業時に記入 |
| `sdk-dev-redis` | Database ID、endpoint host、region、plan、command上限状態、接続Project | Free、500K command上限到達、developmentとSDK Portalで利用 | 作業時に記入 |

個人scopeのIntegrationに含まれる全resourceを列挙する。VercelのTransferがIntegration全体単位で、`wy-app-games`以外のresourceや請求を巻き込む場合は移管を停止する。

### Git

- `main` SHA
- `develop` SHA
- 作業branch SHA
- open PRと並行作業branch
- local未commit／未push変更

remote `develop`が基準SHAから進んだ場合、forceせず取り直し、自動テストを再実行する。

## 3. Vercel Project台帳

2026-07-30にVercel読取APIで確認したProject構成。Redisの実endpointはVercel／Upstashで再確認するまで推測で埋めない。

| Project | Scope | Production branch | Domain | Redis利用 | 変更対象Environment |
| --- | --- | --- | --- | --- | --- |
| `app-games` | `game-fields` | `main` | `game-fields.com`, `www.game-fields.com` | Platform production、正式SDK Runtime production | 必要時のみProduction |
| `app-games-dev` | `game-fields` | `develop` | `dev.game-fields.com` | Platform development、正式SDK Runtime development | Production deployment環境のみ |
| `app-games-sdk` | `game-fields` | `main` | `sdk.game-fields.com` | SDK Portal production registryのみ | Productionのみ |
| `app-games-sdk-dev` | `game-fields` | `develop` | `sdk-dev.game-fields.com` | SDK Portal development registryのみ | Production deployment環境のみ |
| `app-games-sdk-portal` | `game-fields` | `develop` | custom domainなし | 重複Project候補。利用確認まで接続変更禁止 | build常時skip |
| `app-games-sdk-preview` | `game-fields` | `main` | `preview.game-fields.com` | Redis接続禁止 | 変更なし |
| `app-games-preview-dev` | `game-fields` | `develop` | `preview-dev.game-fields.com` | Redis接続禁止 | 変更なし |

正式Package RoomのRuntimeはSDK PortalではなくPlatform Runtime上で動く。したがって本番正式Roomは`app-games`のproduction Redis、development正式Roomは`app-games-dev`のdevelopment namespaceを使用する。PortalのURL予約registryは別用途として専用prefixへ分離する。

## 4. 接続変数名とtarget architecture

値は記録しない。Projectに存在する変数名と利用Environmentだけを記録する。

| Surface | 正本候補／互換名 | target Redis | namespace |
| --- | --- | --- | --- |
| Platform production (`app-games`) | `APP_REDIS_URL`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`、互換`REDIS_URL`／`KV_REST_API_*` | `wy-app-games` | prefixなし。ただしRuntime内部の`production` segmentは維持 |
| Platform development (`app-games-dev`) | 同上。移行中は旧`DEV_REDIS_REDIS_URL`／`DEV_REDIS_KV_REST_API_URL`／`DEV_REDIS_KV_REST_API_TOKEN`をrollback用に保持 | `wy-app-games` | `app-dev:`をRedis共通層で強制 |
| SDK Portal production (`app-games-sdk`) | `SDK_REDIS_REST_URL`、`SDK_REDIS_REST_TOKEN` | `wy-app-games` | `sdk:production:preview-instance:v1:` |
| SDK Portal development (`app-games-sdk-dev`) | `SDK_REDIS_REST_URL`、`SDK_REDIS_REST_TOKEN` | `wy-app-games` | `sdk:development:preview-instance:v1:` |
| SDK Preview 2 Project | Redis変数を設定しない | なし | なし |

`GAME_FIELDS_ENV`はproduction／developmentを明示し、developmentはgenericな有料Redis資格を使う場合でも`app-dev:`を必ず付ける。未知環境はfail-closedにする。

## 5. development namespaceの対象

`app-dev:`は次を含むすべての物理keyへ適用する。

- Room／Runtime状態
- player、account、session補助情報
- lock、rate limit、quota
- Redis Streamsとrealtime event stream
- cleanup、SCAN、期限切れ削除のMATCH pattern
- Lua／transaction／pipelineで指定するkey
- list、set、sorted set、hash、streamのkey

Portal registryは`app-dev:`へ入れず、`sdk:development:`配下へ分離する。Preview実行ProjectへRedis資格を渡さない。

productionとdevelopmentで同じ論理keyを使っても、物理keyとstream keyが一致しないことを`tests/redis-store-config.test.ts`で検証する。

## 6. BackupとTransfer

1. `wy-app-games`で即時backupとexportを作成し、完了状態、作成時刻、backup ID／export IDを記録する。
2. `sdk-dev-redis`でも即時backupとexportを作成する。上限到達でcommandが拒否されても、provider管理面のbackup／exportが作成可能か確認する。
3. backup処理中はplan／region／transferを同時実行しない。
4. Vercel Marketplaceの正式Transferで`wy-app-games`単体を個人scopeから`game-fields`へ移す。
5. Database ID、endpoint host、plan、regionが前後で同一であることを確認する。
6. mainの既存Deploymentから通常のRedis読取・更新を確認する。credentialが変わらなければ確認目的のredeployを行わない。
7. credential／Integration linkが変わる場合だけ`app-games` Productionを更新し、直前Deployment IDをrollback候補として保持して一度だけ再配備する。

Backup Restore／Importはtarget全体を消去するため、同居Redisへの移行には使用しない。

## 7. キー分類と非破壊移行

`node scripts/migrate-redis-namespace.mjs plan`はsourceをSCANし、各keyについてtype、PTTL、content digest、target key、衝突状態を記録する。値は報告へ出さない。

自動copy候補:

- `app-dev:*`
- `sdk:development:preview-instance:v1:*`
- 旧` sdk:preview-instance:v1:* `から` sdk:development:preview-instance:v1:* `への写像
- `game-sdk-runtime:v2:development:*`／`rate-limit:v2:development:*`を`app-dev:`へ移す場合

必ず手動判定:

- `sdk:production:*`
- production Runtime／rate-limit key
- prefixなしの`online-room:events:v1`
- unknown key
- targetに同名keyが存在するすべてのentry

`apply`は`--confirm-no-overwrite`が必須で、target keyが存在した時点で停止する。string、hash、list、set、zset、streamをkey単位で作成し、絶対expire時刻へ換算してTTLを維持する。typeとdigestを再検証し、不一致時はその実行で新規作成したtarget keyだけを削除する。sourceには書き込まない。

production Portal keyは、内容、revision、更新時刻、接続元を確認し、main側の同一データとの関係を判定してからplan entryを明示的にcopyへ変更する。無条件上書きは禁止する。

## 8. Redis切替順序

1. Backup／export完了。
2. `wy-app-games` transfer完了とmain継続動作確認。
3. build gateを先に有効化。
4. 本番正式SDK Runtimeは`app-games`の既存production Redis経路を確認。別ProjectのRedis変数を無関係に変更しない。
5. 必要なproduction Portal registry keyだけ移行。
6. `app-games-sdk` Productionだけをpaid Redisへ切替し、一度だけ再配備。
7. development keyを`app-dev:`／`sdk:development:`へ移行。
8. `app-games-dev`と`app-games-sdk-dev` Productionだけを切替し、各一度だけ再配備。
9. Preview／Development Environmentの変数は同時変更しない。
10. `sdk-dev-redis`は削除・upgradeせずrollback用に保持する。

## 9. 実動作確認

各切替後に通常導線で確認する。

- 正式Room作成
- Runtime接続
- commandによるrevision／状態更新
- 別タブまたは別端末での同期
- 再読み込み・復帰
- realtime／Pub/SubまたはRedis Streams通知
- 45秒整合確認
- 移行前データ参照
- main側の通常ゲーム回帰
- 5xx、429、`REDIS_STORE_REQUEST_LIMIT_EXCEEDED`、Redis timeoutログ

`/health`のHTTP 200だけを成功証拠にしない。

## 10. Vercel build条件

`vercel.json`から`scripts/check-vercel-build-impact.mjs`を実行する。終了コード0はskip、1はbuild。

| Project | branch gate | build対象 |
| --- | --- | --- |
| `app-games` | `main`のみ | `app/`, `games/`, `lib/`, `public/`, Platformが使うpackages、root build config |
| `app-games-dev` | `develop`のみ | 同上 |
| `app-games-sdk` | `main`のみ | `apps/sdk-portal/`, `packages/game-sdk/`, `packages/sdk-preview-auth/`, SDK migration関連 |
| `app-games-sdk-dev` | `develop`のみ | 同上 |
| `app-games-sdk-preview` | `main`のみ | `apps/sdk-preview/`, 共有SDK packages |
| `app-games-preview-dev` | `develop`のみ | 同上 |
| `app-games-sdk-portal` | 常時skip | 使用確認までbuildしない |

`package.json`、lockfile、共通tsconfig、`config/`、`types/`など影響範囲が広い変更は安全側で対象branchの全surfaceをbuildする。`docs/`、root Markdown、Issue／PR templateだけならbuildしない。diff取得不能、未知Projectは安全側でbuildする。

## 11. build費抑制の運用ルール

- 自動テスト完了まではlocalまたはPR branchで作業する。
- 原則1 taskにつきdevelopへのpushは1回。複数commitの作業branchはsquash mergeでdevelopへ1commitとして反映する。
- 影響するProjectだけを配備する。
- state／log／environment確認だけならredeployしない。
- 検証済みDeploymentを再利用できる場合はrebuildしない。
- `--force`、Build Cache無効化、確認目的のRedeployを常用しない。
- branchが進んでいた場合はforceせず取り直し、testを再実行する。

## 12. command枯渇調査

最低限、次をprovider metricsとVercel logsで照合する。

- 日時別command数
- 接続Project別request数
- Room GET、active Room、realtime endpoint、Portal registry操作
- polling interval、WebSocket失敗時fallback、再接続、read retry
- rate limit、TTL更新、SCAN、cleanup、cron
- Room command後のwatcher再生成回数
- 429／5xxとclient retry

2026-07-30のVercel 24時間ログでは、`app-games-dev`の正式SDK Room GETとrealtime endpointが高頻度で、Redis上限到達後の500は`REDIS_STORE_REQUEST_LIMIT_EXCEEDED`だった。コード上、同一Roomのcommand応答ごとにwatcherを閉じて再生成していたため、初回GETとWebSocket接続確認が増幅していた。修正後は同じRoomのwatcherを維持し、Room変更またはwatcher消失時だけ再生成する。providerの日次command graphで減少を確認するまで原因調査を完了扱いにしない。

## 13. Rollback

- Transfer後に接続不良が出た場合、credentialが不変ならProject設定を変更せずprovider側のTransfer状態を確認する。
- env切替後の不良は、変更したProjectだけを旧`sdk-dev-redis`資格または直前の資格へ戻し、直前READY Deploymentへrollbackする。
- developmentデータはsourceを削除しないため、旧Project資格へ戻して参照できる。
- targetへ新規copyしたkeyは移行reportの一覧だけを対象に削除できるが、rollback実行前にその後の更新がないことを確認する。自動一括削除は行わない。
- code rollbackはこの作業branch／develop反映commitのrevertで行う。force pushしない。

## 14. 完了報告に含めるもの

- transfer前後のscope、Database ID、endpoint host、region、plan
- backup／export IDと完了時刻
- main継続動作
- production SDK Runtime／Portalの接続先と実動作
- development namespace仕様
- key数、type別件数、TTL保持、collision処理
- `sdk-dev-redis`を削除・upgradeしていないこと
- Project／branch／domain／build条件一覧
- build／skip実績
- command枯渇原因と修正結果
- commit、Deployment ID、READY、配備後5xx
- rollback手順と直前Deployment ID
- T-26正式Room確認へ戻った時点と結果
