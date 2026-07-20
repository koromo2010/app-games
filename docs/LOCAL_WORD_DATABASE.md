# ローカル共通ワードDB

最終更新: 2026-07-19

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

## JMdict全件の統合取込

取得済みJMdict原本から全エントリーの語義・優先度・関連語などを保存し、表記を既存ワードマスターへ統合する。ドライランでは原本のSHA-256、エントリー数、表記数だけを検証し、`--apply`指定時だけローカルDBへ書き込む。

```powershell
$databaseLine = Get-Content .env.word-db.local |
  Where-Object { $_ -like 'DATABASE_URL=*' } |
  Select-Object -First 1
$env:DATABASE_URL = $databaseLine.Substring('DATABASE_URL='.Length)

python scripts/import-jmdict-all.py `
  --input .word-master-local\jmdict\20260718\JMdict_e.gz `
  --expected-sha256 81C546F3C88AC08B3FD98B9AA63A73A2D74FE29536E209DB41F5CB1D4A298B3C `
  --apply
```

`word_source_entries.entry_payload`は`ent_seq`、`k_ele`、`r_ele`、`sense`以下の全フィールド、繰り返し、XML属性をJSONBで保持する。表記が既存`normalized_form`と一致すれば既存IDへリンクし、一致しない表記だけ新しい`words.id`を追番する。読み違いだけでは別の共通IDを作らない。新規表記のZipfは全体語として実測できる場合だけ保存し、分割・未収録はNULLのままとする。

2026-07-19の取込結果は、原本217,946エントリー、301,447表記、既存統合103,959表記、新規197,488表記、リンク307,169件。新規IDは取込前最大7,120,334より後の7,122,675から始まり、未解決表記・未リンクエントリー・既存表記と重複する新規有効行はいずれも0件だった。新規表記の実測Zipfは14,843件、分割154,337件、未収録28,308件で、補完Zipfは設定していない。

## chiVeによるワードウルフ候補探索

意味が近い語の候補探索には、Apache-2.0で提供されるchiVe `v1.3 mc90`のgensim形式を固定して使う。配布URL、ファイルサイズ、SHA-256、帰属は `config/word-sources/chive-1.3-mc90.json` を正本とする。アーカイブ、展開したモデル、一致率レポート、生成ペアは `.word-master-local/` だけへ保存し、Git・Vercel・本番DBへ送らない。

```powershell
# 取得済みファイルはサイズとSHA-256を再検証して再利用する
.\.venv-word-master\Scripts\python.exe scripts\prepare-chive.py

# ローカルDB接続文字列をこのプロセスだけへ読み込む
$databaseLine = Get-Content .env.word-db.local |
  Where-Object { $_ -like 'DATABASE_URL=*' } |
  Select-Object -First 1
$env:DATABASE_URL = $databaseLine.Substring('DATABASE_URL='.Length)

# 本番カタログと同じ候補条件でchiVe収録率を測る
.\.venv-word-master\Scripts\python.exe scripts\prepare-chive.py --coverage

# Zipf 3以上8未満の名詞から未審査ペア100組をローカル生成する
.\.venv-word-master\Scripts\python.exe scripts\generate-chive-wordwolf-pairs.py --limit 100
```

2026-07-16の初回結果は、chiVe語彙410,533件に対して共通候補197,040件中128,183件が一致し、収録率65.05%だった。Zipf 3以上8未満の名詞67,071件では44,239件がchiVeと一致し、未審査サンプル100組を生成できた。

chiVeの近傍には、有用な同カテゴリ語だけでなく、同義語、上下関係、対義語、複合語の一部も混ざる。この段階の出力は本番投入候補ではない。後続のSudachi同義語辞書で表記違い・略称・近すぎる同義語を除外し、日本語WordNetで兄弟概念を加点した後に審査する。

## Sudachi同義語辞書による除外

SudachiDict Coreと同じ `20260428` タグの `synonyms.txt` を固定して使う。配布URL、コミット、ファイルサイズ、SHA-256、ライセンスは `config/word-sources/sudachi-synonym-20260428.json` を正本とする。辞書原本、検索索引、適用結果は `.word-master-local/` にだけ保存する。

```powershell
# 原本を検証し、検索用のローカル索引を作る
.\.venv-word-master\Scripts\python.exe scripts\prepare-sudachi-synonyms.py

# DATABASE_URLを読み込んだ状態で共通候補との一致率を測る
.\.venv-word-master\Scripts\python.exe scripts\prepare-sudachi-synonyms.py --coverage

# chiVe未審査100組へ同義語除外を適用する
.\.venv-word-master\Scripts\python.exe scripts\filter-wordwolf-pairs-sudachi-synonyms.py
```

2026-07-16の固定版には70,661項目、うち有効70,154項目、26,152グループ、有効見出し66,948件があった。共通候補197,040件との一致は35,890件（18.21%）。chiVe未審査100組では、`発送日／出荷日`、`受験科目／試験科目`、`ファスナー／ジッパー` の3組を同義語として除外し、97組が残った。

辞書にない同義関係もあるため、除外0件は「同義語ではない」という保証にならない。例えば初回サンプルの `何回／何度` は辞書に収録されず残った。後続の日本語WordNetと最終審査を併用する。

## 日本語WordNetによる関係判定

日本語WordNetは公式SQLite版 `1.1`（2010-10-22）へ固定する。配布URL、圧縮ファイルのサイズ・SHA-256、ライセンス、帰属表記は `config/word-sources/japanese-wordnet-1.1.json` を正本とする。圧縮原本と展開DB、カバー率、ペア判定JSONは `.word-master-local/` にだけ保存し、Git・Vercel・本番DBへ送らない。

```powershell
# 固定版の検証、展開、SQLite整合性検査
.\.venv-word-master\Scripts\python.exe scripts\prepare-japanese-wordnet.py

# DATABASE_URLを読み込んだ状態で共通候補との一致率を測る
.\.venv-word-master\Scripts\python.exe scripts\prepare-japanese-wordnet.py --coverage

# Sudachi同義語除外後の97組へWordNet関係を付ける
.\.venv-word-master\Scripts\python.exe scripts\analyze-wordwolf-pairs-japanese-wordnet.py
```

判定順は `same_synset`（同一概念）、`similar_to`（直接の類似関係）、`direct_hypernym`（直接の上下関係）、`sibling`（直接の上位概念を共有）、`no_direct_relation`、`no_match` とする。最初の3種は近すぎる・非対称な組として除外候補にし、`sibling` はワードウルフ向きの補強情報として残す。辞書自体に誤りが含まれ得るため、これは最終採否ではなく根拠付きフラグである。

2026-07-16の固定版は日本語単語93,834件、日本語語義158,058件、日本語概念57,238件。共通候補197,040件との完全一致は42,970件（21.81%）だった。Sudachi除外後97組では、両語とも一致14組、同一synset 2組（`情報科学／情報学`、`歌唱／楽曲`）を除外し、兄弟語3組（`敗者／勝者`、`星条旗／ユニオンジャック`、`バドミントン／バレーボール`）を含む95組が残った。83組は片方以上が未収録なので、WordNet単独で生成・安全判定はしない。

ゲームや公開画面で日本語WordNet由来の関係・説明を間接利用する場合も、マニフェストの帰属表記と公式サイトへのリンクを表示する。原本を再配布する場合はライセンス本文も同梱する。

### 全件候補での収容量

2026-07-16に、既定条件（名詞、Zipf 3以上8未満、chiVe類似度0.45以上0.88以下、Zipf差0.75以下、同じ単語を複数ペアへ使わない）で全件走査した。DB候補67,071語のうちchiVe一致44,239語から16,025組・32,050語を生成した。Sudachi同義語辞書で410組、WordNetで298組を除外し、辞書工程通過は15,317組・30,634語だった。

通過内訳はWordNet兄弟概念167組、両語収録だが直接関係なし2,081組、片方以上が未収録13,069組。辞書だけで積極的な適合根拠を持つのは兄弟概念167組・334語であり、残り15,150組は「不適切と判定されなかった候補」にすぎない。最終的な完成ペア数はLLMまたは人の審査後に確定する。除外された語を別の相手と再ペアリングする処理はまだ行っていないため、30,634語は現在の一回生成方式での実測値である。

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

Sudachi取込を同じコマンドで再実行すると、`surface-quality-v3` が全行へ適用される。再実行は既存行を更新し、Wikidata人物名フラグと既存ゲーム設定を維持する。

施設・組織・地名、3要素以上の列挙、単一文字の過剰反復、不完全な小さい「っ」終わり、英字、顔文字記号を理由付きで `exclude` にする。さらに簡易候補選別として、固有名詞ではなくwordfreqが複数トークンへ分割する語のうち、漢字だけではない表記を `non_kanji_compound` で暫定除外する。単語は物理削除しない。カタカナ複合語や複合動詞などの有効語も含むため、将来は品詞・活用形・構成トークンを使って復帰対象を再選別する。

`surface-quality-v1` を適用した2026-07-15時点の再分類結果は `clean` 566,862件、`exclude` 618,994件だった。2026-07-16に `surface-quality-v2` を全有効1,185,856件へ適用し、`clean` 455,804件、`exclude` 730,052件となった。`non_kanji_compound` は既存除外理由との重複を含め131,598件に付き、この理由だけで新たに除外されたのは111,058件だった。

2026-07-19に `surface-quality-v3` の `numeric_only` を既存ローカルDBへ差分適用し、数字だけの有効163件を `exclude` にした。全角数字も正規化後に対象となる。

Zipfが0より大きく1未満の確認用抽出では、再分類前の16件から次の5件が除外され、11件が残った。

- `よろよろよろっ`: `truncated_ending`
- `星槎道都大学`: `facility_name`
- `篆・隷・楷・行・草書`: `enumeration`
- `さささささ`: `repeated_noise`
- `湯谷石子駅`: `facility_name`

## ゲーム標準語彙の安全側分類

日本語WordNet 1.1のSQLite原本を準備したうえで、次を実行する。

```powershell
python scripts/classify-standard-game-pool.py `
  --database-url $env:DATABASE_URL `
  --wordnet-database .word-master-local/japanese-wordnet/1.1/wnjpn.db `
  --apply
```

結果は `word_pool_evaluations` の `pool_key = standard-game` に保存され、マスター語や既存ゲーム設定は変更しない。`--apply` を外すとドライランになる。`standard-game-ichi1-safe-v3` はJMdictの `ichi1` が付いた普通名詞だけを基礎候補とし、Zipf下限と文字数上限は採否に使わない。2026-07-20のローカルDBでは2,247語を評価し、安全側の候補347語、除外1,900語となった。採用語には `general_game_pool` と3段階難易度フラグを付け、内訳はeasy 119語、normal 165語、hard 63語である。

## センシティブ語の事前除外

スキーマ初期化後、既存ローカルDBへ `word-content-safety-v1` の完全一致ルールを適用する。

```powershell
$env:DATABASE_URL = (Get-Content .env.word-db.local | Where-Object { $_ -match '^DATABASE_URL=' }).Substring('DATABASE_URL='.Length)
npm run word-db:safety:apply
```

該当語には `content_safety_status = exclude` と理由フラグを保存し、行は削除せず3ゲームとも使用不可にする。再実行は冪等である。リストにない語は `unreviewed` のまま残し、ワードウルフの相方生成と同じLLMリクエストで安全判定する。LLMが最初の単語を却下した場合だけ、その単語IDへ判定を保存する。相方は安全な語だけを出力させるため、却下相方の保存は行わない。

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

## 本番カタログへの同期

同期前の件数確認は、ローカルDBを起動した状態で次を実行する。

```powershell
$env:WORD_DB_SOURCE_URL = <ローカルDBのDATABASE_URL>
npm run word-db:publish -- --dry-run
```

本番DBへ直接接続できる管理環境では、別DBであることを確認してから `DATABASE_URL` に対象を設定し、`npm run word-db:publish` を実行する。スクリプトは辞書原本やCSVを送らず、選別済みの最小フィールドだけを差分同期する。行は削除せず、同期から外れたIDを `active = false` にする。

一般ゲームプールと四字熟語だけを既存カタログへ追加・更新し、他のカタログ行を非アクティブ化しない場合は、`WORD_DB_SOURCE_URL` にローカルDB、`DATABASE_URL` に本番DBを設定して `npm run word-db:selected-pools:publish -- --dry-run` で件数確認後、`--dry-run` を外す。2026-07-20の同期件数は一般347語（easy 119、normal 165、hard 63）と四字熟語2,168語である。

Vercel連携のSensitive環境変数は `vercel env pull` でも値が空になる。値をログやチャットへ貼らない。必要な場合は、Vercel実行環境内で公開鍵署名を検証する一時的な管理経路を使い、完了後に必ず削除する。通常アプリへ恒久的な投入APIを残さない。

`.vercelignore` は `.word-master-local/`、`.venv-word-master/`、辞書・CSV・DB出力を配備対象から除外する。この除外は削除しない。
