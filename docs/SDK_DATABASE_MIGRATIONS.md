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

現在の必須versionは`4`である。

| Version | 内容 |
| --- | --- |
| `001` | Creator／Game registryの初期schema |
| `002` | 所有者、Package pointer、OAuth client・code・grant |
| `003` | 不変Package revision、Root Hash、Channel履歴、tombstone |
| `004` | 環境別アプリカタログ、リリース履歴、dev revisionのmain採用・更新・復元 |

`003`は旧pointerにRoot Hashがない行だけをcanonical hashで補完し、
Revision台帳とChannel履歴へ冪等登録する。`004`は既存stable packageを
環境別の初回リリースへ冪等backfillし、以後の正式Runtime catalogを
`sdk_app_releases`の現在リリースから構成する。

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
7. `GET /api/health`が`schemaVersion: 4`を返すことを確認する。
8. handshake、OAuth、catalog、Package提出、Runtime catalogをsmoke testする。
9. 適用・Deployment・実機確認をそれぞれ環境台帳へ記録する。

VercelのSDK Portal buildでは、同じrunnerを`--deploy`で先に実行する。
許可対象は`app-games-sdk-dev/develop`と`app-games-sdk/main`だけであり、
ほかのProject、Preview branch、ローカルbuildではDBへ接続せずskipする。
migration失敗時はbuildも失敗し、新Runtimeを公開しない。

## Backup／rollback

現在の`001`〜`004`は加算的なので、コードだけのrollbackでは追加column・tableを残す。
利用中columnを消すdown migrationは作らない。

データ破損や誤接続が発生した場合は書込みを止め、適用前に作成したNeon branch／snapshotを
新しい接続先として復元する。復元後は`status`と`check`を行い、対象Projectの接続先を
切り替えて新Deploymentを作成する。Productionへ適用する前にはdevelopmentで同じ
migration列と復元手順を確認する。
