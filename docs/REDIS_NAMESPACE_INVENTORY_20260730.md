# Redis namespace inventory review — 2026-07-30

対象は`game-fields` scopeの` sdk-dev-redis`。秘密値、Redis value、password、token、接続URL全体は記録しない。

## 取得条件

- 取得日時: 2026-07-30 14:43:28 JST
- Database ID: `0861801f-9da0-47b3-a1cf-8b5847f625e0`
- endpoint host: `driven-sawfly-189453.upstash.io`
- 実行command: `SCAN`、`TYPE`、`PTTL`
- Redis value読取: なし
- raw inventoryのGit保存: なし

## 集計

| 区分 | 件数 | 処理 |
| --- | ---: | --- |
| すでに`app-dev:` | 174 | そのまま保持 |
| copy対象 | 0 | 実copy不要 |
| 旧Preview token metrics | 29 | copyせずTTL自然失効 |
| 旧admin observability | 1 | `app-dev:`側が既存のため旧key保持 |
| 旧Word Wolf catalog | 1 | `app-dev:`側が既存のため旧key保持 |
| 旧realtime stream | 1 | 履歴copyせず旧stream保持、新規eventから新streamへ切替 |

合計206 key。type別はstring 118、hash 32、list 5、set 19、zset 31、stream 1。

## 判断

### Preview token metrics 29件

全件hashで48時間TTL付き。観測PTTLは約3.2時間から47.7時間。履歴counterを新namespaceへcopyすると同じ時間bucketを二重計上するためcopyしない。PR #69配備後の新規writeは`preview-dev:sdk-preview:asset-token-metrics:*`へ切り替える。旧keyは削除せず自然失効させる。

### admin observability 1件

旧`admin-observability-issues:v1`と新`app-dev:admin-observability-issues:v1`の両方が存在する。target既存keyへのmerge／overwriteは禁止されているためcopyしない。旧keyにはTTLがあり、削除せず失効を待つ。

### Word Wolf catalog 1件

旧`wordwolf:topic:catalog:v1`と新`app-dev:wordwolf:topic:catalog:v1`の両方が存在する。直接`HSETNX`がnamespace変換対象から漏れていたことを確認し、PR #69で修正した。target既存keyへのmerge／overwriteは行わず、旧keyを保持する。

### realtime stream 1件

旧`online-room:events:v1`は永続stream。Room更新通知は一時的イベントであり、過去eventを新streamへcopyすると再通知の可能性があるためcopyしない。writerとreaderを同時に`app-dev:online-room:events:v1`へ切り替え、旧streamは削除しない。

## copy plan

- copy candidate: 0
- Redis write: 0
- source delete: 0
- target overwrite: 0
- migration script apply: 不要

namespace codeの配備後に新namespaceへのwriteと実動作を確認する。旧key削除は別途明示指示があるまで行わない。
