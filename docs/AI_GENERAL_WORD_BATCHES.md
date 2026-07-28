# AI生成・一般単語候補

一般単語は50カテゴリから各30語、合計1,500候補をAIで作り、ローカルDBで審査する。
生成直後の語は正式な `words` へ入れず、`ai_word_candidates` に
`review_status = generated` として保存する。難易度はこの段階では付けない。

## バッチ単位

通常は5カテゴリ、最大150語を1バッチにする。全50カテゴリは10バッチで一巡する。
カテゴリ内または過去バッチとの重複、表記不正があった場合は、後続バッチで不足分を補充する。

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
