# SDK PostgreSQL migration運用

SDK PortalのPostgreSQL schemaは、`db/sdk/NNN_name.sql`と
`sdk_schema_migrations`を正本とする。API request中にDDLを実行しない。

## 契約

- migration番号は`001`から欠番なく増やし、適用済みファイルを編集しない。
- runnerはSQLとversion固有backfillのSHA-256を保存し、同じ番号の内容差し替えを拒否する。
- `ensureSdkSchema()`は必要versionが適用済みかを読むだけとし、未適用なら
  `SDK_SCHEMA_MIGRATION_REQUIRED`でfail-closedにする。
- migrationはforward-onlyとする。削除・縮小・型変換等の破壊的変更は、
  expand → data移行 → 利用停止確認 → contractの順で別migrationへ分割する。
- Runtime rollbackを可能にするため、加算schemaは旧コードからも読める形で先に適用する。

現在の必須versionは`7`である。

| Version | 内容 |
| --- | --- |
| `001` | Creator／Game registryの初期schema |
| `002` | 所有者、Package pointer、OAuth client・code・grant |
| `003` | 不変Package revision、Root Hash、Channel履歴、tombstone |
| `004` | 環境別アプリカタログ、リリース履歴、dev revisionのmain採用・更新・復元 |
| `005` | SDK／dev appの承認・却下・復元理由、実行者、対象revisionの追加専用決定履歴 |
| `006` | dev appからmainへ移送したpackageの元revisionを保持する`source_revision` |
| `007` | 分岐中に異なる`005`を適用したmain／developmentの承認履歴schemaを冪等に収束 |

`003`は旧pointerにRoot Hashがない行だけをcanonical hashで補完し、
Revision台帳とChannel履歴へ冪等登録する。`004`は既存stable packageを
環境別の初回リリースへ冪等backfillし、以後の正式Runtime catalogを
`sdk_app_releases`の現在リリースから構成する。
`005`は既存行を書き換えず、以後の運営判断だけを`sdk_release_decisions`へ
追加する。採用・復元は新しいrelease行と同じtransactionで判断履歴を追加し、
却下は対象revisionとhashを固定した判断履歴だけを追加する。
`006`は既存releaseの`revision`を`source_revision`へ冪等backfillする。
以後のcross-environment昇格では、dev側の固定revisionを`source_revision`、
main側package Gitへ保存した実行revisionを`revision`として保持する。
`007`は、mainが`005_cross_environment_package_artifacts.sql`を先に適用した
期間に欠けた`sdk_release_decisions`を作成する。runnerはこの既知の`005`だけを
旧ledger entryとして受理し、未知の名前・checksum差異は引き続き拒否する。

## schema 7 read-only監査の制約

ローカルT-60差分のschema snapshotは、schema version、game／stable pointer、current release／
decisionを、一つの`REPEATABLE READ READ ONLY` transaction内の固定3 SELECTで読む。
versionが厳密に7でなければ、request中にmigrationせずfail closedにする。

固定SELECTは`game.status`と、current releaseに対応する最新decisionの`id`をDB行から読む。
同一`decided_at`では`id DESC`をtie-breakとし、取得行を決定的にする。stable manifestと
current release manifestはそれぞれ別のJSONB行からcanonical SHA-256を算出し、別revision、
branch、current/stableの他方から補完しない。status、decision ID、stable／current manifest hashは
availabilityとともに返し、不存在は`absent`、query／transaction失敗は応答自体のfail-closedとして
区別する。これらのfieldと不一致anomalyはcanonical integrity digestへ含める。

schema 7には、接続中DBがproduction／developmentのどちらかを自己証明するmarkerがない。
deployment branch由来のenvironmentはrouting contextであり、DB markerではない。snapshotは
両者を区別し、database environmentを`null`、availabilityを`unavailable:schema-7`とする。
接続文字列やDB名から推測して応答へ出してはならない。

また、stable pointerには固有の`source_revision`保存値がない。current releaseの
`source_revision`との一致から推定すると不整合を隠すため、stable provenanceは`null`、
availabilityは`unavailable:schema-7`とする。これらを証明可能にするには将来の加算schemaか、
別途承認された外部照合が必要である。本差分はschema 8、DDL、backfillを追加しない。

## コマンド

接続先は`SDK_DATABASE_URL`を正本とし、移行期間だけ
`POSTGRES_PRISMA_URL`、`DATABASE_URL`へフォールバックする。

```bash
npm run sdk:migrate:status
npm run sdk:migrate
npm run sdk:migrate:check
```

- `status`: 適用済み／未適用を表示する。schemaは変更しない。
- `sdk:migrate`: 未適用分だけを番号順に適用し、checksumを記録する。
- `check`: 未適用、未知version、checksum不一致があれば失敗する。

## Development適用手順

1. 対象が`app-games-sdk-dev`のSDK専用Neonであることを、Project・branch・接続変数名で確認する。
2. Neonで適用直前の復旧用branchまたはsnapshotを作成する。接続文字列は記録しない。
3. `npm run sdk:migrate:status`で現在versionを確認する。
4. backward-compatibleなmigrationをDeploymentより先に`npm run sdk:migrate`で適用する。
5. `npm run sdk:migrate:check`を通し、`sdk_schema_migrations`の最新versionを確認する。
6. 対象commitを`develop`へ反映し、SDK Portal Deploymentを確認する。
7. `GET /api/health`が`schemaVersion: 7`を返すことを確認する。
8. handshake、OAuth、catalog、Package提出、Runtime catalogをsmoke testする。
9. 適用・Deployment・実機確認をそれぞれ環境台帳へ記録する。

VercelのSDK Portal buildでは、同じrunnerを`--deploy`で先に実行する。
許可対象は`app-games-sdk-dev/develop`と`app-games-sdk/main`だけであり、
ほかのProject、Preview branch、ローカルbuildではDBへ接続せずskipする。
migration失敗時はbuildも失敗し、新Runtimeを公開しない。

## Backup／rollback

現在の`001`〜`007`は加算的なので、コードだけのrollbackでは追加column・tableを残す。
利用中columnを消すdown migrationは作らない。

データ破損や誤接続が発生した場合は書込みを止め、適用前に作成したNeon branch／snapshotを
新しい接続先として復元する。復元後は`status`と`check`を行い、対象Projectの接続先を
切り替えて新Deploymentを作成する。Productionへ適用する前にはdevelopmentで同じ
migration列と復元手順を確認する。
