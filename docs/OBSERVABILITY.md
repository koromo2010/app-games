# ログ・観測性の運用

## 目的

ゲーム進行の不具合を、本文や秘密情報を保存せずに後から追跡する。現在は構造化JSONを標準出力へ送り、Vercel Runtime Logsで確認する。将来コンテナ分割したときも同じイベントschemaを維持し、sinkだけをLog Drain、OTLP collector、Sentry等へ差し替える。

## 現在の実装

| 境界 | ファイル | 責務 |
| --- | --- | --- |
| イベントschema | `lib/observability/types.ts` | 許可するフィールドを閉じた型で定義 |
| 実行時allowlist・不透明参照 | `lib/observability/event.ts` | 型を迂回した値も除外し、部屋・actor・eventをHMAC参照へ変換 |
| 出力先 | `lib/observability/sink.ts` | 現在は1行JSONのconsole sink。将来のcollector adapter差し替え点 |
| リクエスト相関 | `lib/observability/logger.ts` | request ID、trace ID、所要時間、成功・拒否・競合・失敗を共通化 |
| 起動境界 | `instrumentation.ts` | Node.js runtime登録と、将来のOpenTelemetry初期化位置 |

`schemaVersion` は現在 `1`。イベント名やフィールドを削除・意味変更する場合はversionを上げる。追加は後方互換で行う。

## 記録対象

GETポーリングの成功と通常の401/403/404は量とノイズが多いため記録しない。ただし、読み取りの設定不備・ストレージ障害・予期しない5xxは `room.read` 等で記録する。以下の状態変更は原則すべて記録する。

- 部屋作成・参加・設定・開始・投稿・投票・手番・削除
- Commandの成功、権限拒否、期限切れ、revision競合、無視された重複イベント
- タイマー発火・再試行時刻・適用結果
- ログイン、登録、ログアウトの成功・失敗
- 戦績イベントの新規記録と失敗
- LLM providerの成功、フォールバック、生成失敗
- フィードバック保存の成功・失敗

主要イベント:

| event | 用途 |
| --- | --- |
| `room.mutation` | 部屋作成・互換保存 |
| `room.command` | ゲーム別Command |
| `room.delete` | 1部屋・ホスト部屋一括削除 |
| `game.command` | WordWolfの進行Command |
| `timer.expire` | 時限イベント |
| `auth.session` | ログイン・登録・ログアウト |
| `stats.record` | 戦績・レーティング確定 |
| `ai.provider` | 共通LLM provider試行 |
| `ai.generation` | ゲーム別生成・審査 |
| `feedback.save` | Good/Badフィードバック保存 |
| `source.fetch` / `source.refresh` | タホイヤ外部辞書の取得試行・更新結果 |
| `catalog.sync` | Git管理候補のカタログ同期 |
| `auth.access` / `auth.ai-access` | デバッグ・非公開ゲーム・AI利用権の認証結果 |
| `auth.password-reset` / `auth.profile` | パスワード再設定・プロフィール更新。メールや名前は記録しない |
| `settings.save` | 部屋設定既定値の保存結果。設定本文は記録しない |
| `room.read` / `stats.read` / `settings.read` | 読み取り時の5xxのみ。成功ポーリングは記録しない |
| `replay.record` / `replay.favorite` | プレイバック保存・お気に入り変更。説明本文は記録しない |
| `game-sdk.preview-room` | 正式Preview Roomの作成・Command・Runtime接続結果 |
| `sdk.preview-runner-auth` | SDK Previewのserver grant拒否理由。token・秘密値・利用者IDは記録しない |

## ログへ入れない情報

次は理由を問わず禁止する。イベントschemaにもフィールドを作らない。

- パスワード、合言葉、Cookie、認証token、APIキー
- ワード、正解、秘密語、手札、偽説明、ヒント、投票先などゲーム秘密
- 投稿本文、自由記述、プロンプト、LLM応答本文
- 氏名、メールアドレス、アバター画像
- リクエストbodyや部屋JSONの丸ごと出力
- 外部SDK例外のmessage・stackの丸ごと出力

部屋コード、プレイヤーID、Command ID、戦績event IDは `room_xxx`、`actor_xxx` 等の不透明参照へ変換する。同じ種類・同じ値は同じ参照になるため相関できるが、ログから元の値を復元できない。

## Redis・background workの失敗分類

`schedulePostResponseWork`は重要writeを既定の`critical`として同期実行し、失敗を
telemetryへ記録したうえで呼出し元へ再throwする。Room状態、戦績、replay、
SDK result outbox等を`best-effort`へ変更してはならない。Realtime通知、招待用の
二次索引、再利用候補等、正本でない処理だけが明示的な`best-effort`を指定できる。
`best-effort`の失敗はHTTP応答やprocessを失敗させず、必ず構造化イベントへ変換する。

Redis失敗の安全な分類には、閉じたenumと数値だけを使う。

- `workClass`: `critical | best-effort`
- `storageOperation`: `read | write | pipeline`
- `storageTransport`: `rest | socket`
- `storageCommand`: 許可済みRedis command名、複数種類は`MULTIPLE`、未知は`UNKNOWN`
- `commandCount`: command件数
- `serializedBytes`: 送信前にserializeしたpayloadのbyte数

Redis key/value、Room code、playerId、URL、token、接続文字列は記録しない。
観測イベント自身のRedis保存が失敗した場合は、同じ保存を再帰的に呼ばず、
`observability.sink-failure`をprocess logへ1回だけ出す。

## 環境変数

- `OBSERVABILITY_LOG_LEVEL`: `debug | info | warn | error`。既定 `info`
- `OBSERVABILITY_SERVICE_NAME`: 既定 `app-games-web`。コンテナ分割後は `game-server`、`timer-service` 等を指定
- `OBSERVABILITY_HASH_SECRET`: 不透明参照のHMAC鍵。32文字以上を推奨。未設定時は `PLAYER_SESSION_SECRET`、次に `LLM_SESSION_SECRET` を使用

本番では用途分離のため `OBSERVABILITY_HASH_SECRET` を別途設定するのが望ましい。鍵を変更すると変更前後の参照を横断検索できなくなる。

## Vercelでの調査順

1. 発生時刻、ゲーム、操作、画面に見えた状態を記録する。
2. Runtime Logsで `event=room.command` 等のイベント名と時間帯を絞る。
3. 同じ `roomRef` を検索し、直前のrevision・phaseから時系列を並べる。
4. `requestId` / `traceId` が同じイベントをまとめる。
5. `outcome=conflict`、`rejected`、`failed` と `errorCode` を確認する。
6. タイマー問題は同じ `roomRef` の `timer.expire` と通常Commandの順序を見る。
7. 勝敗・レート問題は部屋の結果Commandと `stats.record` の `eventRef` を照合する。
8. 正式PreviewのRoom作成問題は、本体の`game-sdk.preview-room`、Portalの
   `/api/preview-runtime/<creator>/<game>`、Previewのserver routeを同じ時刻・revisionで
   照合する。Previewの403は`event=sdk.preview-runner-auth`の安全な理由を確認する。
9. SDK Portalの`/api/health`が`SDK_PREVIEW_SIGNING_MISMATCH`ならゲーム固有障害として
   扱わず、対応するPortal／Preview Projectのbranch、署名鍵、environmentを確認する。

利用者から報告を受ける場合は、合言葉やお題を聞かず「発生日時・ゲーム・部屋操作・表示されたエラー」だけを確認する。

## 定期監視と負荷試験

`.github/workflows/production-smoke.yml` は30分ごとに本番ロビーを1回確認する。HTTP 200、HTML応答、6秒以内を合格条件とし、一時的なネットワーク揺らぎは最大3回まで再試行する。失敗はGitHub Actionsの失敗通知として扱う。Actions通知を受け取る担当者はGitHubの通知設定でActionsを有効にする。公開画面だけを対象とし、NeonやRedisを定期的に起こさない。

手元または明示実行の軽量負荷試験は `npm run load:smoke` を使う。既定はローカルの `/games` へ30リクエスト・同時数3で、p50 / p95 / p99、RPS、HTTP状態、エラー率をJSON出力する。本番などlocalhost以外は誤実行防止のため `LOAD_TEST_ALLOW_REMOTE=1` が必須で、最大100リクエスト・同時数5に固定する。p95合格値はローカル2秒、リモート6秒で、必要な場合だけ `LOAD_TEST_MAX_P95_MS` で厳しくする。

```bash
# ローカル
npm run load:smoke

# 本番の軽量ベースライン（明示許可が必要）
LOAD_TEST_BASE_URL=https://www.game-fields.com \
LOAD_TEST_ALLOW_REMOTE=1 \
LOAD_TEST_REQUESTS=30 \
LOAD_TEST_CONCURRENCY=3 \
npm run load:smoke
```

認証済みGET APIを測る場合だけ、ブラウザから手作業で値をコピーせず専用テストアカウントの短命Cookieを `LOAD_TEST_COOKIE` 環境変数で渡し、`LOAD_TEST_PATHS` に同一originのパスを列挙する。Cookieは出力・ファイル・GitHub Actionsへ保存しない。POST / DELETEなど状態変更APIはこのスクリプトの対象外とし、専用の隔離環境なしに負荷を掛けない。

Vercel Alertsを利用できるプランでは、利用者がProjectのObservabilityから次を初期値として設定する。

- 5xx: 5分で5件以上を警告、20件以上を重大
- Function p95 duration: 10分継続で2秒超を警告
- 429: 全リクエストの5%超を容量・不正アクセス調査の合図にする
- 通知先: 最低2名のメール、運用チャネルがある場合は同じルールを連携

閾値は負荷試験と実トラフィックのベースライン取得後に調整する。Vercel Alertsの確認・設定は利用者がcontrol planeで行う。利用者がCLIで確認する場合は `vercel alerts rules ls --format json` を使用できる。AIはVercel Dashboard、connector、公式API、CLIその他の経路を直接使用せず、必要時は`VERCEL_USER_ACTION_REQUIRED`として確認手順、成功条件、返却してほしい結果を一度に提示する。通知先を含むルール作成は担当者と送信先を確認してから行う。

2026-07-14の本番ロビーベースライン（30リクエスト、同時数3）は、成功30、失敗0、p50 96ms、p95 4670ms、p99 4693ms、5.1 req/s。最初の同時リクエストに約4.7秒の接続待ちがあり、その後は大半が100ms前後だった。アプリのFunction処理時間とは分けて、Vercel Observability上の値は利用者が確認し、返却された結果に基づいて判定する。

## 将来のcollectorコンテナ

現在は各runtimeのstdoutへ同期せず書き出す。ゲーム処理の成功をログ保存待ちにしない。物理分割時は `ObservabilitySink` のadapterを追加し、各サービスから共通collectorへOTLPまたは内部HTTPで送る。

```text
web / game-server / timer / ai / batch
                  |
          structured event v1
                  v
       observability-gateway / collector
          |          |           |
       log store   traces      alerts
```

collector停止時もゲームCommandを失敗させない。高負荷時は成功イベントをsamplingできるが、`warn` / `error`、競合、戦績、タイマーはsamplingしない。長期保存やアラートが必要になるまでは、独立コンテナを先に増やさずVercelのstdout/Log Drainを利用する。

## 変更時の確認

```bash
npm run lint
npm test
npm run build
```

`tests/observability.test.ts` は、未許可フィールドの除外、不透明参照、例外本文の秘匿を固定する。新しい観測フィールドを追加するときは、秘密情報でないことを確認して同テストも更新する。
