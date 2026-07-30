# Redis統合・移管・Vercelビルド抑制 Runbook

最終更新: 2026-07-30

この文書は、`wy-app-games`の所有スコープ移管、本番正式SDK Runtimeの継続接続、`sdk-dev-redis`を開発共通Redisとして使うnamespace整理、開発Redisの復旧、Vercel build抑制を扱う。接続文字列、token、password、Redis valueは記録しない。

## 1. 確定アーキテクチャ

### 本番Redis

- resource: `wy-app-games`
- 現在scope: personal
- Upstash Database ID: `83c9a0a5-4b6c-40af-933f-bf1294f82750`
- primary region: `hnd1` / Upstash `ap-northeast-1`（Tokyo, Japan）
- plan: `Fixed 250MB`
- Vercel上のConnected Projects: 2026-07-30確認時点で0件表示
- `personal` scopeから`game-fields`へVercel Marketplaceの正式Transferで移管する。
- Database ID、データ、plan、regionを維持する。
- 利用対象は`app-games`上のmain Platformと本番正式SDK Runtimeだけとする。
- development、SDK development Portal、development Preview Runtimeを接続しない。
- SDK Portalの`SDK_REDIS_*`を正式Room RuntimeのRedis資格と混同しない。

### 開発共通Redis

- resource: `sdk-dev-redis`
- `app-games-dev`が現在接続しているRedisと同一であり、別の既存dev Redisは存在しない。
- Upstash Database ID: `0861801f-9da0-47b3-a1cf-8b5847f625e0`
- primary region: Vercel `hnd1` / Upstash `ap-northeast-1`（Tokyo, Japan）
- current plan: `Pay As You Go`
- price: `$0.20 per 100K commands`
- previous plan: `Free`、500,000 commands/month
- 変更前表示: 約650,000 commands、storage 921 KB / 256 MB、bandwidth 0 B / 50 GB、cost $0.00
- plan変更は既存DBだけに対して行われ、データ移行、接続先変更、Secrets変更は行われていない。
- このDBをdev Platform、SDK development Portal、development Preview Runtimeの開発共通Redisとして利用する。
- Redis間データ移行は行わない。同一DB内で必要なkeyだけ別namespaceへ非破壊copyする。
- DB、旧key、新規copy keyを明示指示なく削除しない。

## 2. 変更前Backup

2026-07-30 13:03 JST前後にUpstash `Backups`画面で次を確認した。

| Database | Backup name | Size | State |
| --- | --- | ---: | --- |
| `wy-app-games` | `pre-namespace-20260730-1256-jst` | 1009.74KB | Completed |
| `sdk-dev-redis` | `pre-namespace-20260730-1300-jst` | 741.45KB | Completed |

- Typeはいずれも`Backup`。
- Redis value、data内容、credential、接続文字列は表示・記録していない。
- `Restore`、`Export`、Daily Backup、Secrets変更は実施していない。
- Backupは削除しない。

## 3. 復旧とwatcher修正

- 最後に確認した`REDIS_STORE_REQUEST_LIMIT_EXCEEDED`: `2026-07-30T03:08:25Z`
- Pay As You Go反映後、通常導線でRoom作成、GET、PATCHが200へ復帰した。
- Room revision 1→16まで連続更新成功をVercel実ログで確認した。
- watcher修正はPR #70で`develop`へsquash反映済み: `677e56fe9f88c6cd6a1dd63c8b2535f3d57c956e`
- 実機検証Room: `9F5N`、最終revision 8、5xx 0件。
- 再読み込み前の6 commandでは同じWebSocketを維持し、明示的な再読み込み時だけ再接続した。
- watcher修正でRedis接続先、Secrets、環境変数、namespace、planは変更していない。

## 4. 絶対条件

- 新しいRedisを作成しない。
- developmentを`wy-app-games`へ接続しない。
- `sdk-dev-redis`を削除しない。
- planを再変更しない。
- main、Secrets、環境変数、Redis接続先を変更しない。
- region、auto-upgrade、Spend Limit、個人側Vercel Proを変更しない。
- `FLUSHDB`、`FLUSHALL`、DB全体Restore／Import、既存key上書きを行わない。
- namespace整理前のkeyを削除しない。
- Neon PostgreSQL、Blobを変更しない。
- token、password、接続文字列全体、Redis valueをログ、Git、Issue、PR、チャットへ出力しない。
- `main`へのコード反映、force push、履歴書き換えを行わない。
- `app-games-sdk-portal`は未使用を確認できるまで削除しない。

## 5. Git運用

1. remote `develop`、作業branch、PR headを取り直す。
2. `develop` SHA、作業branch SHA、ahead／behind、mergeabilityを記録する。
3. `develop`が進んでいればforceせずmerge commitで取り込み、テストを再実行する。
4. T-26変更を破棄しない。
5. Vercel check成功をNext.js build成功として扱わず、Ignored Build Stepのskipと区別する。

2026-07-30、PR #71で`develop`を`agent/redis-consolidation`へmergeし、PR #69を最新`develop`へ同期した。force pushは使用していない。

## 6. 未確認の実値

### `wy-app-games`

- endpoint host
- Transferがresource単体で実行可能か
- Transfer確認画面の維持項目

### `sdk-dev-redis`

- endpoint host
- `app-games-dev`以外のConnected Projects
- key数、type別件数、namespace内訳

### Vercel Project

対象は次の7 Project。

- `app-games`
- `app-games-dev`
- `app-games-sdk`
- `app-games-sdk-dev`
- `app-games-sdk-preview`
- `app-games-preview-dev`
- `app-games-sdk-portal`

各Projectについてscope、Production branch、domain、Root Directory、Environment別のRedis変数名とendpoint hostを台帳化する。secret値は出力しない。

## 7. Surface別Redis用途

| Surface | Project | Redis用途 | resource | namespace |
| --- | --- | --- | --- | --- |
| main Platform | `app-games` | 通常Room、正式SDK Room、rate limit、realtime stream | `wy-app-games` | prefixなし。Runtime内部の`production` segmentは維持 |
| development Platform | `app-games-dev` | dev通常Room、development正式SDK Room、rate limit、realtime stream | `sdk-dev-redis` | `app-dev:` |
| production SDK Portal | `app-games-sdk` | Portal固有registryだけ | 実接続先を別途分類。`wy-app-games`へ自動接続しない | `sdk:production:preview-instance:v1:` |
| development SDK Portal | `app-games-sdk-dev` | Portal固有registry | `sdk-dev-redis` | `sdk:development:preview-instance:v1:` |
| production isolated Preview | `app-games-sdk-preview` | 原則Redisなし | なし | Redis誤設定はfail-closed |
| development isolated Preview | `app-games-preview-dev` | Preview Runtimeで必要な一時状態・metrics | `sdk-dev-redis` | `preview-dev:` |
| duplicate candidate | `app-games-sdk-portal` | 利用未確認 | 変更禁止 | build skipのみ。削除しない |

正式Package RoomのRuntimeはSDK PortalではなくPlatform Runtime上で動く。本番正式Roomは`app-games`、development正式Roomは`app-games-dev`のRedis経路を使う。Portalの`SDK_REDIS_REST_URL`／`SDK_REDIS_REST_TOKEN`はPortal registry専用であり、正式Room Runtime接続の証拠にしない。

## 8. 同一開発Redis内namespace

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
- production PreviewにRedis資格が設定された場合はfail-closedにする。

同一DBでもdev Platform、SDK development Portal、development Preview Runtimeの物理key・streamを一致させない。

## 9. key分類と非破壊copy

Redis間コピーは行わない。`sdk-dev-redis`自身をsource兼targetとして、異なるkey名へのcopyが必要なkeyだけを扱う。

`node scripts/migrate-redis-namespace.mjs plan`で各keyのtype、PTTL、絶対失効時刻、digest、target key、衝突状態を記録する。値とcredentialは報告へ出さない。

### keep

- すでに`app-dev:*`であるkey
- すでに`sdk:development:preview-instance:v1:*`であるkey
- すでに`preview-dev:*`であるkey

### copy候補

- 旧`sdk:preview-instance:v1:*` → `sdk:development:preview-instance:v1:*`
- `game-sdk-runtime:v2:development:*` → `app-dev:game-sdk-runtime:v2:development:*`
- `rate-limit:v2:development:*` → `app-dev:rate-limit:v2:development:*`
- development Preview由来と接続元まで確認できたkey → `preview-dev:*`

### 必ず手動判定

- `sdk:production:*`
- production Runtime／rate-limit key
- prefixなしの`online-room:events:v1`
- unknown key
- 接続元を特定できないkey
- targetに同名keyが存在するentry

### apply安全条件

- `--confirm-no-overwrite`を必須にする。
- write前にcopy対象すべてのtarget不存在とtarget key重複なしをpreflightする。
- source keyとtarget keyが同一なら拒否する。
- plan後にsource type、digest、絶対失効時刻が変わっていれば停止する。
- copy後にtarget type、digest、絶対失効時刻を再検証する。
- 途中失敗時は、その実行で作成したtarget keyだけを削除する。
- source keyは削除しない。

## 10. 現在の実行順序

1. 変更前Backupを作成する。**完了**
2. PR #69を最新`develop`へforceなしで同期する。**完了**
3. key分類器、namespace処理、copy toolを安全条件に合わせる。
4. focused test、dry-run、Platform／Portal／Preview buildを実行する。
5. `sdk-dev-redis`の実key inventoryを取得する。
6. planを生成し、keep／copy／manual／collisionをレビューする。
7. userの明示確認なしに実key copy、環境変数変更、接続先変更、配備を行わない。
8. `wy-app-games` Transferは別途、resource単体Transferと維持項目を確認してから実行する。

`app-games-sdk` production Portalの接続先は、production registry keyの用途とtargetが確定するまで変更しない。

## 11. 検証項目

- namespace: Platform／Preview／productionの物理key分離
- Streams: writer、reader、consumer group
- Lua／EVAL／EVALSHA
- SCAN MATCH
- pipeline／socket transaction
- copy tool: dry-run、type、digest、絶対TTL、衝突停止、全体preflight、実行内rollback
- Platform build
- SDK Portal build
- SDK Preview build
- feature branchの7 Project compile前skip

`/health`のHTTP 200だけを成功証拠にしない。

## 12. Vercel build条件

| Project | branch gate | build対象 |
| --- | --- | --- |
| `app-games` | `main`のみ | Platform本体と共有Runtime変更 |
| `app-games-dev` | `develop`のみ | Platform本体と共有Runtime変更 |
| `app-games-sdk` | `main`のみ | `apps/sdk-portal/`とPortal共有package |
| `app-games-sdk-dev` | `develop`のみ | `apps/sdk-portal/`とPortal共有package |
| `app-games-sdk-preview` | `main`のみ | `apps/sdk-preview/`とPreview共有package |
| `app-games-preview-dev` | `develop`のみ | `apps/sdk-preview/`とPreview共有package |
| `app-games-sdk-portal` | 常時skip | 使用確認までbuildしない。削除しない |

feature branchのVercel check successはbranch mismatchによるbuild skipであり、Next.js build成功ではない。Deploymentレコード作成後にCANCELEDになることは許容し、clone後の不要compileを止める。

## 13. command枯渇調査

2026-07-30のUpstash Usageでは`sdk-dev-redis`が約650K commandsとなりFree上限500Kを超過していた。Vercelログでは`app-games-dev`の正式SDK Room GETとrealtime endpointが高頻度で、上限到達後の500は`REDIS_STORE_REQUEST_LIMIT_EXCEEDED`だった。

同一Roomのcommand応答ごとにwatcherを閉じて再生成していたことが増幅要因であり、PR #70で修正済み。実機ではcommand中のWebSocket再生成が消えた。providerの日次command graphで長期的な減少を確認する作業は継続する。

セッション単位API上限、冪等化、残量表示、429 + Retry-After、Preview重複Build防止、将来の利用ポイント課金設計は復旧後の独立タスクとし、この作業で大規模追加実装しない。

## 14. Rollback

- namespace codeの問題は変更Projectだけを直前READY Deploymentへrollbackする。
- developmentの直前Deployment: `dpl_9BfJji7FV2DKm4gVVqsaYBztpKd9`
- source keyを削除しないため旧keyを参照できる。
- copy途中の失敗は、その実行で新規作成したtarget keyだけを削除する。
- code rollbackはrevertで行う。force pushしない。
- Backup Restoreは自動実行しない。

## 15. 完了報告

- Backup名、対象DB、size、State、確認時刻
- `wy-app-games`のTransfer前後scope、Database ID、endpoint host、region、plan
- main Platformと本番正式SDK Runtimeの実動作
- `sdk-dev-redis`のID、endpoint host、region、変更前後plan、請求条件
- dev Platform、SDK development Portal、development Preview Runtimeの接続先とnamespace
- key分類数、type別件数、絶対TTL保持、digest、collision処理
- 旧keyを削除していないこと
- 7 Projectのbranch、domain、build／skip条件、最終Deployment状態
- 実行コマンド、成功件数、失敗内容
- commit、Deployment ID、READY、配備後5xx
- rollback手順
- T-26正式Room確認へ戻った時点と結果
