# AI生成・一般単語候補

一般単語は50カテゴリから各30語、合計1,500候補をAIで作り、ローカルDBで審査する。
生成直後の語は正式な `words` へ入れず、`ai_word_candidates` に
`review_status = generated` として保存する。難易度はこの段階では付けない。

難しい語の拡充では、生活語用カテゴリとは別に大学レベルの専門分野50カテゴリを使う。
哲学・法学・社会科学・人文科学・数理科学・自然科学・医学・工学を対象とし、
各カテゴリ30語、合計1,500語を `general-hard-v1-001` から
`general-hard-v1-010` の10バッチで生成する。難しさだけを理由に不採用にはせず、
独立した日本語の用語として成立することを品質審査の基準にする。

## バッチ単位

通常は5カテゴリ、最大150語を1バッチにする。全50カテゴリは10バッチで一巡する。
カテゴリ内または過去バッチとの重複、表記不正があった場合は、後続バッチで不足分を補充する。

難語周回でも5カテゴリ×30語を1バッチとする。既存候補との重複確認と不足補充は
1,500語を生成し終えた後にまとめて行う。

難語周回の途中では通常の取込コマンドを使わず、比較を行わないステージングへ保存する。
この段階では既存のAI候補や正式ワードとの照合、`matched_word_id` の付与を行わない。

```powershell
npm run word-db:ai-stage:local -- --input=.word-master-local/ai-general/general-hard-v1-001.json
```

10バッチ・1,500語をステージングへ保存した後に、一括で表記重複と既存ワードを比較し、
品質審査へ渡す候補を確定する。

比較は読み取り専用で実行し、この時点では候補行の追加や永久IDの付与を行わない。

```powershell
npm run word-db:ai-stage-compare:local -- --prefix=general-hard-v1-
```

表記一致・読み不一致は自動統合しない。既存語の読みが誤っている場合は
`word_reading_corrections` に履歴を残して訂正する。別語の場合は既存語を維持し、
新しい読みを別の一般名詞として扱う。

比較結果を確認したら、ステージング全行と採用候補の対応履歴を残して候補を確定する。
このコマンドは同じ入力に対して再実行でき、既存候補を複製しない。

```powershell
npm run word-db:ai-stage-finalize:local -- --prefix=general-hard-v1-
```

難語1,500行の初回確定結果は、生成内重複11行、既存AI候補の再利用138語、
新規審査候補1,351語、未解決0件だった。重複統合後の1,489語中、
既存 `words` と表記・読みが一致したのは1,123語、新しい語として扱う候補は366語。
この段階では恒久IDを発行しない。

新規1,351語の品質審査とセンシティブ審査は全件承認・`clean` となった。
難易度は「簡単＝小学6年生まで、普通＝高校卒業まで、難しい＝大学・専門教育」を
基準にし、専門カテゴリ名だけで一律判定しない。初回分類は簡単26語、普通512語、
難しい813語だった。既存候補として再利用した138語の既存審査・難易度は上書きしない。

昇格前に `word-db:ai-match-resolve:local` で表記・読みが一致する既存 `words` を
監査する。利用可能な一致行が1件だけなら既存の永久IDを再利用し、0件なら新規語、
複数件なら意味を安全に特定できないため新規語として扱う。難語周回では984語が
既存ID再利用、366語が一致なしだった。「ラジカル」は同表記・同読みが2行あったため
自動統合せず、合わせて367語へ新規IDを発行した。

新規IDは7320315〜7320681。367語すべてに、品質審査済みカテゴリを根拠として
普通名詞・非活用・一般語・人名ではない・表層品質clean・安全cleanを記録した。
全1,351語へ重複しない永久IDがあり、3ゲーム分4,053件の設定を承認・使用可で作成した。

旧周回の昇格結果を再監査したところ、「ネコ」「サクラ」など一般語26語が、
同じ表記・読みの人名断片IDへ紐づいていた。旧IDは削除せずゲーム利用不可のまま残し、
一般名詞として新規ID 7320682〜7320707を発行して候補を付け替えた。
対応は `ai_word_promotion_repairs` に保存し、
`word-db:ai-repair-promotions:local` の再実行で追加0件になることを確認した。
以後の既存ID照合では、人名断片と人物固有名詞を一般語の再利用先にしない。

候補データは `.word-master-local/ai-general/` に一時保存し、Gitへ追加しない。
入力形式は次のとおり。

```json
{
  "schemaVersion": 1,
  "batchKey": "general-v1-001",
  "generatedBy": "codex",
  "model": "gpt-5",
  "promptVersion": "general-word-candidate-v1",
  "categories": [
    {
      "categoryKey": "food_meals",
      "words": [
        { "surface": "おにぎり", "reading": "おにぎり" }
      ]
    }
  ]
}
```

1カテゴリは1〜30語を受け付ける。語は2〜24文字の現代日本語表記、読みはひらがなで
登録する。英字、顔文字、空白を含む語、同一バッチ内の重複は除外される。

## ローカルDBへの登録

Docker Desktopを起動してから実行する。

```powershell
npm run word-db:local:up
npm run word-db:init:local
npm run word-db:ai-import:local -- --input=.word-master-local/ai-general/general-v1-001.json
npm run word-db:ai-status:local
```

取込コマンドはlocalhost以外のDB接続を拒否する。同じ `batchKey` と同じ内容の再実行は
何も追加しない。同じ `batchKey` に別内容を割り当てることも拒否する。

## 保存する情報

- 候補表記、正規化表記、読み
- 50カテゴリのうちの主カテゴリ
- AI生成バッチ、生成者、モデル、プロンプト版
- 既存 `words` に同じ正規化表記がある場合の参照ID
- 審査状態
- 後から付ける難易度、確信度、判定理由
- 正式ワードへ昇格した場合の永久ID

辞書原本、生成JSON、CSV、DBダンプはGitへ入れない。

## センシティブ判定

AI候補は正式な `words` へ昇格する前に、`ai_word_candidates.content_safety_status`
へ `clean`、`review`、`exclude` のいずれかを保存する。判定理由とフラグは
候補行と履歴テーブルの両方に残す。

判定入力JSONは `.word-master-local/` 配下へ置き、Gitには追加しない。

```powershell
npm run word-db:ai-safety-review:local -- --input=.word-master-local/ai-general-reviews/general-content-safety-v1.json
```

カテゴリごとの件数が30語ではない追加世代は、生成バッチ接頭辞を対象にした一括品質審査を使う。

```powershell
npm run word-db:ai-bulk-review:local -- --input=.word-master-local/ai-general-reviews/general-quality-v2-all-001.json
```

一括品質審査後の承認語は、同じ生成バッチ接頭辞を対象に難易度分類する。

```powershell
npm run word-db:ai-bulk-classify:local -- --input=.word-master-local/ai-general-classifications/general-difficulty-v2-all-001.json
```

昇格時に新規永久IDを発行した語だけは、固定版辞書または審査済みカテゴリを根拠に品詞情報を付ける。

```powershell
npm run word-db:ai-bulk-enrich:local -- --input=.word-master-local/ai-general-enrichments/general-enrichment-v2-all-001.json
```
