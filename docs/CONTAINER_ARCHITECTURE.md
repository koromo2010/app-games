# 将来のコンテナ構成候補

## 1. 方針

当面はNext.js内のモジュラーモノリスを維持し、境界が安定した機能だけを段階的にコンテナへ切り出す。最初からサービス数を増やさず、負荷・障害分離・長時間処理の必要性が明確なものを優先する。

```text
Browser
   |
   v
web / BFF ---------------> game-server
   |                            |
   |                            +----> Redis
   |
   +----> ai-worker -----------> candidate DB / Redis
   |
   +----> timer-service -------> game-server Command
   |
   +----> batch-worker --------> source catalog / candidate DB

web / game-server / timer-service / ai-worker / batch-worker
   +----> observability-gateway / collector ----> logs / traces / alerts
```

ブラウザは`web`以外のサービスへ直接接続しない。認証Cookieや利用者持込APIキーを内部サービスへ無制限に転送せず、BFFで検証した内部トークンと必要最小限の情報だけを渡す。

## 2. コンテナ候補

### web

- Next.js UI、ログイン、BFF、公開API。
- 楽観的UIと画面用View Modelを担当する。
- ゲームルール、Redisキー、LLM事業者固有処理を持たない。
- 内部サービス停止時は再試行可能なエラーを表示する。

### game-server

- 部屋Command、参加資格、手番、投票、勝敗、revision CASを担当する。
- ゲームdomainとapplication serviceを配置する。
- Redisへの部屋保存はこのサービスだけが行う。
- `commandId`で再送を冪等化し、古い`expectedRevision`を拒否する。
- AI生成や長時間バッチは実行しない。

### timer-service

- `deadlineAt`、受付猶予、タイマーイベントID、キャンセル、再試行を担当する。
- ゲームルールを持たず、期限到達時にgame-serverへ`expire-phase` Commandを送る。
- 同一イベントを複数回送ってもgame-server側の冪等性で安全にする。
- 一時停止後に期限超過イベントを再走査できるよう、期限を永続化する。

### ai-worker

- OpenAI、Gemini、Groqを共通LLMゲートウェイ経由で呼ぶ。
- お題生成、説明整形、RAG審査、難易度判定を担当する。
- HTTPリクエストを長時間待たせず、ジョブIDと結果保存を使う。
- provider障害時の再試行・フォールバック・費用記録を担当する。
- 利用者APIキーを永続化しない。

### batch-worker

- 外部ライブラリ候補の取得、100語生成、候補DB補充、期限切れデータ整理を担当する。
- 定期実行と手動実行の両方を同じジョブとして扱う。
- 途中再開できるcheckpointと、source単位の成功・失敗件数を保存する。

### rating/stats

初期段階ではgame-server内のモジュールとする。集計量が増えた場合だけイベント購読型の`stats-worker`へ分離する。勝敗確定Commandが発行する一意な結果イベントを入力とし、ゲーム進行を戦績更新待ちにしない。

### observability-gateway / collector

- 全サービスの構造化イベント、trace、metricsを同じschemaで受け取る。
- ゲーム本文や秘密情報を受け取らず、不透明なroom/actor/event参照で相関する。
- collector停止でゲームCommandを失敗させない。送信は非同期とし、warn/error、競合、戦績、タイマーを優先する。
- 現段階では独立コンテナを作らず、`lib/observability` のconsole sinkとVercel Runtime Logsを使用する。長期保存・横断trace・アラートが必要になった時点でsinkをOTLP/内部HTTP adapterへ差し替える。
- イベントschemaと運用手順は `docs/OBSERVABILITY.md` を正本とする。

## 3. 共有データ

### Redis

- 部屋状態、active room、短期タイマー、Command冪等キーに使用する。
- 書き込み所有者をキー領域ごとに1サービスへ限定する。
- UIやai-workerから部屋JSONを直接上書きしない。

### 永続DB候補

- プレイヤーアカウント、候補問題、出典、品質評価、課金権限、長期戦績に使用する。
- 現状Redisにあるデータを直ちに移す必要はない。
- Redisの大規模Hash全走査を前提にしたAPIを作らない。

### Blob/Object Storage

- 大きな生成成果物、バッチ中間ファイル、監査用エクスポートに使用する。
- 部屋のリアルタイム状態は置かない。

## 4. 内部通信契約

同期通信は短いCommandとQueryに限定する。

```json
{
  "commandId": "uuid",
  "game": "wordwolf",
  "roomCode": "ABCD",
  "type": "cast-vote",
  "actorId": "player-id",
  "expectedRevision": 18,
  "payload": { "targetId": "target-id" }
}
```

応答例:

```json
{
  "accepted": true,
  "revision": 19,
  "room": {}
}
```

イベントは少なくとも`eventId`、`occurredAt`、`schemaVersion`を持つ。Commandとイベントのschema変更は後方互換を保つか、versionを分ける。

## 5. 障害時の原則

- web停止: ゲーム状態はRedisに残り、復旧後に再接続できる。
- game-server停止: Commandを成功扱いにせず、同じ`commandId`で再送する。
- timer-service停止: 復旧時に期限超過イベントを再発行する。
- ai-worker停止: 保存候補でゲームを継続し、生成ジョブは再試行する。
- stats更新失敗: ゲーム結果を変えず、一意イベントから再集計する。
- Redis障害: ローカル状態を正とせず、接続回復まで確定操作を保留する。

## 6. セキュリティ

- 内部サービスは公開URLだけで相互信頼しない。短命な内部認証を使う。
- actorIdだけを信用せず、webで検証したプレイヤーセッションと部屋参加情報を照合する。
- クライアント送信時刻は締切判定に使用しない。
- APIキー、Cookie、パスワードをログやジョブpayloadへ入れない。
- 正解、秘密語、手札、投稿本文、メールアドレス、外部SDK例外本文もログへ入れない。識別子はHMACによる不透明参照へ変換する。
- サービスごとにRedis/DB権限を限定する。

## 7. 切り出し順

1. モジュラーモノリス内で全ゲームをCommand API化する。
2. 部屋全体保存を廃止し、game-server境界を固定する。
3. 全ゲームの時間管理を`lib/game-timer`へ接続する。
4. timer-serviceを独立させ、期限の永続化と再試行を追加する。
5. AI生成をジョブ化してai-workerへ移す。
6. 大量単語生成・外部ソース収集をbatch-workerへ移す。
7. 長期保存・横断trace・アラートが必要になったらobservability sinkをcollectorへ接続する。
8. 負荷が確認された場合だけstats-workerを分離する。

## 8. 現在地

- ワードウルフは参加・開始・発言・投票・逆転回答・時間切れをCommand化済み。
- 部屋に`revision`を持ち、Redis内CASで巻き戻りを防止済み。
- `lib/game-timer`と`/api/game-timer/expire`を共通時間管理境界として導入済み。
- ロビー設定にはホスト専用の部屋全体保存互換経路が残る。
- `lib/observability` で構造化イベントschema、request/trace相関、不透明参照、差し替え可能なsinkを導入済み。現在の出力先はVercel Runtime Logs。
- 物理コンテナ分割は未実施。現在はモジュラーモノリス段階。
