# ローカル共通ワードDB

最終更新: 2026-07-15

辞書全件、正規化CSV、Zipf計算結果を本番へ送る前に、ローカルのPostgreSQLで取込・分類・確認するための開発環境である。本番Neonや既存ゲームのRedisには接続しない。

## 保存対象

- Gitへ保存する: `compose.yaml`、スキーマ、取込・変換プログラム、人工的なテストデータ
- Gitへ保存しない: `.env.word-db.local`、Docker Volume、辞書原本、生成CSV、DBダンプ、Python仮想環境
- 辞書関連のローカルファイルはリポジトリ直下の `.word-master-local/` に置く。このディレクトリはGit対象外である。

## 初回起動

Docker Desktopを起動し、画面左下が `Engine running` になっていることを確認する。その後、リポジトリ直下で実行する。

```powershell
npm run word-db:local:up
npm run word-db:local:status
npm run word-db:init:local
```

既定の接続先は `127.0.0.1:5432`、DB名とユーザー名は `app_games` である。ローカル値は `.env.word-db.local` にあり、このファイルはGitへ入らない。

`word-db:init:local` は既存の共通スキーマとワードマスタースキーマを冪等に作成する。繰り返し実行しても既存データを削除しない。

## 固定辞書の取得・変換・取込

SudachiDict Coreは `20260428` に固定する。配布URL、ライセンス・帰属、2つのZIPのSHA-256は `config/word-sources/sudachidict-core-20260428.json` を正本とする。取得元は公式ビルド定義と同じ `small_lex.zip`、`core_lex.zip` である。

```powershell
python -m venv .venv-word-master
.\.venv-word-master\Scripts\python.exe -m pip install -r requirements\word-master.txt

# 初回は公式配布元から取得し、ハッシュ確認後に正規化CSVを作る
.\.venv-word-master\Scripts\python.exe scripts\prepare-sudachidict-core.py

# ローカル接続文字列をこのプロセスだけへ読み込む（値は画面へ表示しない）
$databaseLine = Get-Content .env.word-db.local |
  Where-Object { $_ -like 'DATABASE_URL=*' } |
  Select-Object -First 1
$env:DATABASE_URL = $databaseLine.Substring('DATABASE_URL='.Length)

.\.venv-word-master\Scripts\python.exe scripts\import-word-master.py `
  --input .word-master-local\sudachidict\20260428\sudachidict-core.normalized.csv `
  --source-key sudachidict-core `
  --source-name "SudachiDict Core" `
  --source-version 20260428 `
  --source-url https://github.com/WorksApplications/SudachiDict/releases/tag/v20260428 `
  --license "Apache-2.0 with bundled third-party notices" `
  --attribution "Works Applications Co., Ltd.; UniDic Consortium; NEologd contributors and data sources listed in SudachiDict LEGAL" `
  --import-notes "Fixed source 20260428; checksums and legal URL are recorded in config/word-sources/sudachidict-core-20260428.json"
```

変換アダプタは公式CSVの19列を検証し、NFKC正規化、読み・品詞・固有名詞区分の変換、DBの一意条件に合わせた重複除外を行う。取込処理は `wordfreq[cjk]==3.1.1` で日本語Zipfを計算し、PostgreSQLの一時表から単語と3ゲーム分の初期設定を一括登録する。

2026-07-15の検証結果は、入力1,629,080行、正規化後1,185,822語、重複除外443,257行、無効1行である。ローカルDBへ単語1,185,822件、ゲーム設定3,557,466件を登録し、Zipf欠損と元データID重複はいずれも0件だった。DB容量は約1.38GB。辞書原本、正規化CSV、DB本体はすべてGit対象外である。

## 外国人名の照合

Sudachiの一般人物名からカタカナ単独名を取り出し、Wikidataの日本語人物データで正式名を確認する。最初は高頻度側など少数で実行し、キャッシュを蓄積しながら再開する。

```powershell
# 上の取込手順と同様に DATABASE_URL を読み込んだ状態で実行する
.\.venv-word-master\Scripts\python.exe scripts\enrich-wikidata-person-names.py `
  --max-rows 500
```

`--max-rows` を省略すると未処理候補をすべて対象にする。Wikidata Query Serviceへ逐次問い合わせるため、大量処理は分割して行う。応答は `.word-master-local\wikidata-person-enrichment-v1.jsonl` に保存され、同じ候補の再実行では再利用される。`--refresh` は明示的に最新応答を取り直す場合だけ使う。

除外判定は `wikidata-person-name-v2` を使い、正式名の構成要素に完全一致しないニックネームや英字名は除外しない。新しく追加した正式名は、レビュー前に出題されないよう3ゲームとも使用不可で登録する。2026-07-15の初回部分検証では短い名前34件と正式名34件が有効で、正式名との構成要素不一致は0件、既存3ゲームの利用可能件数に変化はなかった。

## 表層品質の再分類

Sudachi取込を同じコマンドで再実行すると、`surface-quality-v1` が全行へ適用される。再実行は既存行を更新し、Wikidata人物名フラグと既存ゲーム設定を維持する。

施設・組織・地名、3要素以上の列挙、単一文字の過剰反復、不完全な小さい「っ」終わり、英字、顔文字記号を理由付きで `exclude` にする。単語は物理削除しない。2026-07-15の再分類結果は `clean` 566,862件、`exclude` 618,994件だった。

Zipfが0より大きく1未満の確認用抽出では、再分類前の16件から次の5件が除外され、11件が残った。

- `よろよろよろっ`: `truncated_ending`
- `星槎道都大学`: `facility_name`
- `篆・隷・楷・行・草書`: `enumeration`
- `さささささ`: `repeated_noise`
- `湯谷石子駅`: `facility_name`

## 日常操作

```powershell
# 状態確認
npm run word-db:local:status

# PostgreSQLのログ確認
npm run word-db:local:logs

# 停止（DBデータは保持）
npm run word-db:local:down

# 再開
npm run word-db:local:up
```

Docker DesktopのContainers画面では `app-games-word-db` として表示される。

## データを削除しないための注意

`docker compose down -v` は実行しない。`-v` はローカルDBを保存するVolumeも削除する。通常の停止には `npm run word-db:local:down` を使う。

DBをバックアップする場合も、ダンプは `.word-master-local/` などGit対象外の場所へ保存する。将来Neonへ移す際はGitを経由せず、選択済みレコードの同期またはPostgreSQL間の直接移行を使う。

## 構成

- PostgreSQL: 16
- pgvector: 0.8.2
- Docker image: `pgvector/pgvector:0.8.2-pg16-bookworm`
- 公開範囲: `127.0.0.1` のみ
- データ保存: Dockerの名前付きVolume `word-db-data`

通常のNeon URLには従来どおりNeon Serverless Driverを使う。`localhost`、`127.0.0.1`、`::1` のURLだけNode.jsのPostgreSQL TCPドライバーを使う。
