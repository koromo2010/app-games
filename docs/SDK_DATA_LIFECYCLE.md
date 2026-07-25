# Game Fields SDK データライフサイクル

SDK公開後のデータは、用途ごとに正本、保持期間、削除方法を分離する。論理削除、公開停止、Room終了、物理消去は同じ操作として扱わない。

## 原則

- Package Revisionは不変とし、同じRevisionの内容を更新しない。
- development／stableはRevisionへの可変pointerであり、公開停止ではpointerだけを外す。
- Roomは開始時のRuntime契約とsettings snapshotを保持する。Packageの公開停止後も、開始済みRoomは固定済みRevisionで終了できる。
- Browserから送られたplayer IDや削除対象は信用せず、Platformが認証情報から主体を解決する。
- token、Cookie、prompt本文、effect本文を運用ログへ保存しない。
- 環境をまたぐ履歴参照は禁止する。Redis keyとeffect journalは`GAME_FIELDS_ENV`をnamespaceへ含める。

## データ分類

| データ | 正本 | 標準保持 | 削除・失効 |
| --- | --- | --- | --- |
| Room、Command receipt、result outbox | 環境別Redis | 最終更新から6時間 | TTLまたはhost解散。終了後の再実行に使わない |
| effect journal | 環境別Redis | 6時間 | TTL。`pending`消失後も同じeffectを自動再課金しない |
| player別settings既定値 | 環境別Redis | 最終更新から2年 | TTL。Room開始後のsnapshotはRoom側の寿命に従う |
| replay | 環境別Redis | 既定30日 | TTL。お気に入り制御はreplay policyに従う |
| 戦績・rating | Platform PostgreSQL／Redis | サービス提供中 | account削除時にplayer別結果とrating fieldを削除 |
| Package Revision | SDK PostgreSQL | 公開・監査に必要な期間 | 通常は物理更新・上書き禁止 |
| channel pointer | SDK PostgreSQL | 公開中 | unpublishで即時解除。履歴とRevisionは残す |
| game catalog record | SDK PostgreSQL | 制作者が保持する間 | DELETEで`tombstone`。新規Preview／catalogから即時除外 |
| channel history | SDK PostgreSQL | 監査に必要な期間 | append-only。通常のunpublish／game削除では消さない |
| OAuth authorization code | SDK PostgreSQL | 5分 | 交換時に一回で削除。期限切れもOAuth store maintenanceで削除 |
| OAuth grant | SDK PostgreSQL | access 30日、refresh 365日 | revokeで即時無効。期限切れまたはrevoke後30日で物理削除 |
| 構造化運用issue | 環境別Redis | 7日 | TTL。機密本文は保存しない |

## 操作契約

### Packageの再送信

同じcanonical root SHA-256なら既存Revisionを返す。内容が変わった場合だけ新Revisionを作る。過去Revision、昇格履歴、Revision固定asset URLは変更しない。

### 公開停止

内部promotion APIの`DELETE`は指定channelのpointerとmanifest snapshotだけを外す。Package blob、Revision registry、promotion historyは削除しない。新規Roomは解除済みchannelを解決できず、既存Roomは固定済みRevisionを明示解決できる。

### ゲーム削除

制作者向けPackage APIの`DELETE`は`sdk_games.deleted_at`を設定する論理削除である。catalog、通常Preview、promotion対象から即時除外する。再送信した場合は明示的に復元し、新Revisionまたは同一rootの既存Revisionを利用する。

### Account削除

Platform account削除は、player IDをキーに戦績、rating、replay、settings既定値を先に冪等削除する。SDK連携済みの場合は署名済み内部DELETEを先に実行し、OAuth grantを失効、所有Creatorを無効化・匿名表示化し、所有gameをtombstone化する。SDK側が失敗した場合はPlatform accountを残して503とし、利用者が同じ削除操作を再試行できる。最後にRedis account index、Platform PostgreSQL accountの順で削除する。

異なるDBを一つの分散transactionとはみなさない。各段階を同じplayer IDで再実行可能にし、後段の正本を消す前に前段を完了する。Package Revisionは開始済みRoomの固定契約と監査証跡のため保持し、新規catalog・Preview・昇格からは即時除外する。

## 運用確認

- `GAME_FIELDS_ENV`が各deploymentに明示され、`NODE_ENV`だけで保存先を決めていない。
- candidate-previewがproductionのRedis、rating、replay、PostgreSQL channel pointerへ書き込まない。
- tombstone済みgameがcatalogと新規Previewへ出ない。
- unpublish後も開始済みRoomが固定Revisionを読める。
- OAuth期限切れ行とrevoke済み行が定期maintenanceで減少する。
- 削除event、effect ID、outbox event IDは本文を含めず相関できる。
