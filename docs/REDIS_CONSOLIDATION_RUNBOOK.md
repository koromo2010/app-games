# Redis統合・移管・Vercelビルド抑制 Runbook

最終更新: 2026-07-30

この文書は、`wy-app-games`の所有スコープ移管、本番正式SDK Runtimeの継続接続、`sdk-dev-redis`を開発共通Redisとして使うnamespace整理、開発Redisのplan変更判断、Vercel build抑制を扱う。接続文字列、token、passwordは記録しない。

## 1. 確定アーキテクチャ

### 本番Redis

- resource: `wy-app-games`
- 現在scope: personal
- Upstash Database ID: `83c9a0a5-4b6c-40af-933f-bf1294f82750`
- primary region: `hnd1`
- plan: `Fixed 250MB`
- Vercel上のConnected Projects: 2026-07-30確認時点で0件
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
- current plan: `Free`
- monthly command allowance: 500,000 commands
- 2026-07-30確認時点の表示: 約650,000 commands、storage 921 KB / 256 MB、bandwidth 0 B / 50 GB、cost $0.00
- Upstash `Backups`画面に`Backup & Export`操作が存在し、既存backupは0件。
- このDBをdev Platform、SDK development Portal、development Preview Runtimeの開発共通Redisとして利用する。
- Redis間データ移行は行わない。同一DB内でkeyを用途別namespaceへ整理する。
- 新しいRedisを作成しない。
- plan変更は、候補planと月額を報告し、明示了承後にだけ実行する。
- DBやkeyを削除しない。

### 開発Redisのplan候補

実画面で確認した候補は次のとおり。

| Candidate | Price shown | 判断 |
| --- | --- | --- |
| `Pay As You Go` | `$0.20 per 100K commands` | 第一候補。表示済み約650K commands相当なら約`$1.30`。command数が約5M/月に達するまではFixed 250MBより安い |
| `Fixed 250MB` | `$10 + ($5 × read region) per month` | 費用予測を固定したい場合の第二候補。現在storage 921 KBのため容量面では十分 |
| `Fixed 1GB` | `$20 + ($10 × read region) per month` | 現在の容量には過大。今回の候補外 |

read regionは現画面で追加表示されていないため、Fixed 250MBの基本月額は`$10/月`として比較する。税等は別途。

## 2. 絶対条件

- 新しいRedisを作成しない。
- developmentを`wy-app-games`へ接続しない。
- `sdk-dev-redis`を削除しない。
- `sdk-dev-redis`のplan変更を、変更後plan・月額の報告と明示了承前に実行しない。
- region、auto-upgrade、Spend Limit、個人側Vercel Proを変更しない。
- `FLUSHDB`、`FLUSHALL`、DB全体Restore／Import、既存keyの上書きを行わない。
- namespace整理前のkeyを検証完了前に削除しない。
- Neon PostgreSQL、Blobを変更しない。
- backup／exportまたは同等のデータ保全確認前にTransfer、plan変更、namespace整理を開始しない。
- token、password、接続文字列全体をログ、Git、Issue、PR、チャットへ出力しない。
- `main`へのコード反映、force push、履歴書き換えをこの作業では行わない。
- `app-games-sdk-portal`は未使用を確認できるまで削除しない。

## 3. 作業再開時のGit確認

1. remote `develop`、作業branch、PR headを取り直す。
2. `develop` SHA、作業branch SHA、ahead／behind、mergeabilityを記録する。
3. local未commit変更の有無を確認する。
4. T-26と変更ファイルが重複する場合は内容を比較し、既存変更を破棄しない。
5. `develop`が進んでいればforceせず取り込み、テストを再実行する。
6. Vercel check成功をNext.js build成功として扱わず、Ignored Build Stepのskipと区別する。

## 4. 変更前に採取する実値

### `wy-app-games`

- Database ID: 確認済み
- endpoint host: 未確認
- primary region: `hnd1`
- plan: `Fixed 250MB`
- current scope: personal
- Connected Projects: 0件表示
- Transfer単体実行可否: 未確認
- backup/export状態: 未確認

### `sdk-dev-redis`

- Database ID: 確認済み
- endpoint host: 未確認
- region: `hnd1` / `ap-northeast-1`
- current plan: Free
- current usage表示: 約650K / 500K commands、921 KB storage
- backup/export: 操作可能、既存backupなし
- current connection: `app-games-dev`接続を確認
- 他Projectの接続: 実画面で追加確認が必要
- key数、type別件数、namespace内訳: 未確認

### Vercel Project

対象は次の7 Projectとする。

- `app-games`
- `app-games-dev`
- `app-games-sdk`
- `app-games-sdk-dev`
- `app-games-sdk-preview`
- `app-games-preview-dev`
- `app-games-sdk-portal`

各Projectについてscope、Production branch、domain、Root Directory、Environment別のRedis変数名とendpoint hostを台帳化する。secret値は出力しない。

## 5. Surface別のRedis用途

| Surface | Project | Redis用途 | resource | namespace |
| --- | --- | --- | --- | --- |
| main Platform | `app-games` | 通常Room、正式SDK Room、rate limit、realtime stream | `wy-app-games` | prefixなし。Runtime内部の`production` segmentは維持 |
| development Platform | `app-games-dev` | dev通常Room、development正式SDK Room、rate limit、realtime stream | `sdk-dev-redis` | `app-dev:` |
| production SDK Portal | `app-games-sdk` | Portal固有registryだけ | 実接続先を別途分類。`wy-app-games`へ自動接続しない | `sdk:production:preview-instance:v1:` |
| development SDK Portal | `app-games-sdk-dev` | Portal固有registry | `sdk-dev-redis` | `sdk:development:preview-instance:v1:` |
| production isolated Preview | `app-games-sdk-preview` | 原則Redisなし | なし | Redis誤設定はfail-closed |
| development isolated Preview | `app-games-preview-dev` | Preview Runtimeで実際に必要な一時状態・metrics | `sdk-dev-redis` | `preview-dev:` |
| duplicate candidate | `app-games-sdk-portal` | 利用未確認 | 変更禁止 | build skipのみ。削除しない |

正式Package RoomのRuntimeはSDK PortalではなくPlatform Runtime上で動く。本番正式Roomは`app-games`、development正式Roomは`app-games-dev`のRedis経路を使う。Portalの`SDK_REDIS_REST_URL`／`SDK_REDIS_REST_TOKEN`はPortal registry専用であり、正式Room Runtime接続の証拠にしない。

## 6. 同一開発Redis内のnamespace

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
- production PreviewにRedis資格が設定された場合は拒否する。

同一DBでもdev Platform、SDK development Portal、development Preview Runtimeの物理key・streamを一致させない。

## 7. BackupとTransfer

1. `wy-app-games`の変更前resource情報とデータ保全状態を記録する。
2. providerのbackup/exportが利用可能なら作成し、完了状態、時刻、IDを記録する。
3. `sdk-dev-redis`で`Backup & Export`を実行し、完了状態、時刻、IDを記録する。
4. backup処理中はplan／region／Transferを同時実行しない。
5. Vercel Marketplaceの正式Transferで`wy-app-games`単体を`game-fields`へ移す。
6. Database ID、endpoint host、plan、region、データが前後で同一であることを確認する。
7. mainの既存Deploymentから通常のRedis読取・更新を確認する。credentialが変わらなければ確認目的のredeployを行わない。
8. credential／Integration linkが変わる場合だけ`app-games` Productionを更新し、直前Deployment IDをrollback候補として一度だけ再配備する。

Backup Restore／Importは使用しない。

## 8. 同一DB内のkey分類とnamespace整理

Redis間コピーは行わない。`sdk-dev-redis`自身をsource兼targetとして、異なるkey名への非破壊copyが必要なkeyだけを扱う。

`node scripts/migrate-redis-namespace.mjs plan`で各keyのtype、PTTL、digest、target key、衝突状態を記録する。値とcredentialは報告へ出さない。

### copy候補

- 旧`sdk:preview-instance:v1:*`から`sdk:development:preview-instance:v1:*`
- `game-sdk-runtime:v2:development:*`から`app-dev:game-sdk-runtime:v2:development:*`
- `rate-limit:v2:development:*`から`app-dev:rate-limit:v2:development:*`
- development Preview由来と接続元まで確認できたkeyから`preview-dev:*`

### copy不要

- すでに`app-dev:*`であるkey
- すでに`sdk:development:preview-instance:v1:*`であるkey
- すでに`preview-dev:*`であるkey

### 必ず手動判定

- `sdk:production:*`
- production Runtime／rate-limit key
- prefixなしの`online-room:events:v1`
- unknown key
- 接続元を特定できないkey
- targetに同名keyが存在するentry

copy時はtarget keyが存在した時点で停止する。type、digest、絶対失効時刻を維持し、source keyは削除しない。切替後の安定確認まで旧keyのread fallbackを残す。

## 9. 実行順序

1. Git、Project、Redis実値の変更前スナップショットを作成する。
2. `wy-app-games`と`sdk-dev-redis`のbackup/exportを作成する。
3. `wy-app-games`を公式Transferで`game-fields`へ移管する。
4. Database ID・データ・plan・region・接続状態の維持を確認する。
5. main Platformと本番正式SDK Runtimeを通常導線で確認する。
6. `sdk-dev-redis`のplan変更候補を最終確認し、ユーザー了承後にだけ有料化する。
7. `sdk-dev-redis`内のkeyを分類し、必要なkeyだけ同一DB内でnamespace付きkeyへ非破壊copyする。
8. `app-games-dev`は同じDB接続を維持し、`app-dev:`強制コードを配備する。
9. `app-games-sdk-dev`を同じDBの`sdk:development:`へ接続する。
10. Redisが必要な場合だけ`app-games-preview-dev`を同じDBの`preview-dev:`へ接続する。
11. 旧keyを残したまま実動作確認する。
12. 削除は別途明示指示があるまで行わない。

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
- 既存データ参照
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

- 自動テスト完了まではPR branchで作業する。
- 原則1 taskにつきdevelopへのpushは1回。複数commitの作業branchはsquash mergeでdevelopへ1commitとして反映する。
- 影響するProjectだけを配備する。
- state／log／environment確認だけならredeployしない。
- 検証済みDeploymentを再利用できる場合はrebuildしない。
- `--force`、Build Cache無効化、確認目的のRedeployを常用しない。
- branchが進んだ場合はforceせず取り直し、testを再実行する。

## 13. command枯渇調査

最低限、次をprovider metricsとVercel logsで照合する。

- 日時別command数
- 接続Project別request数
- Room GET、active Room、realtime endpoint、Portal registry操作
- polling interval、WebSocket失敗時fallback、再接続、read retry
- rate limit、TTL更新、SCAN、cleanup、cron
- Room command後のwatcher再生成回数
- 429／5xxとclient retry

2026-07-30のUpstash Usageでは`sdk-dev-redis`が約650K commandsとなりFree上限500Kを超過していた。Vercel 24時間ログでは`app-games-dev`の正式SDK Room GETとrealtime endpointが高頻度で、Redis上限到達後の500は`REDIS_STORE_REQUEST_LIMIT_EXCEEDED`だった。コード上、同一Roomのcommand応答ごとにwatcherを閉じて再生成していたため、初回GETとWebSocket接続確認が増幅していた。修正後は同じRoomのwatcherを維持し、Room変更またはwatcher消失時だけ再生成する。providerの日次command graphで減少を確認するまで原因調査を完了扱いにしない。

セッション単位API上限、冪等化、残量表示、429 + Retry-After、Preview重複Build防止、将来の利用ポイント課金設計は復旧後の独立タスクとし、この作業で大規模追加実装しない。

## 14. Rollback

- Transfer後に接続不良が出た場合、credentialが不変ならProject設定を変更せずprovider側のTransfer状態を確認する。
- plan変更後の問題は、providerが許す範囲で元planへ戻す前にデータ・利用状況を確認する。
- namespace配備後の問題は、変更Projectだけを直前READY Deploymentへrollbackし、旧keyのread fallbackへ戻す。
- source keyを削除しないため旧keyを参照できる。
- code rollbackは作業branch／develop反映commitのrevertで行う。force pushしない。

## 15. 完了報告

- `wy-app-games`のTransfer前後scope、Database ID、endpoint host、region、plan
- backup／exportの証跡
- main Platformと本番正式SDK Runtimeの実動作
- `sdk-dev-redis`のID、endpoint host、region、変更前後plan、請求条件
- dev Platform、SDK development Portal、development Preview Runtimeの接続先とnamespace
- key分類数、type別件数、TTL保持、digest、collision処理
- 旧keyを削除していないこと
- 7 Projectのbranch、domain、build／skip条件、最終Deployment状態
- 実行コマンド、成功件数、失敗内容
- command枯渇原因と修正結果
- commit、Deployment ID、READY、配備後5xx
- rollback手順と直前Deployment ID
- T-26正式Room確認へ戻った時点と結果
