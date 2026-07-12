# app-games 開発引き継ぎ

最終更新: 2026-07-12

## 1. プロジェクト

- 作業対象: `app-games`
- GitHub: `https://github.com/koromo2010/app-games`
- 本番: `https://www.game-fields.com`（Vercel URL: `https://app-games-orcin.vercel.app`）
- Next.js App Router / React 19 / TypeScript
- RedisはUpstash互換REST APIを使用
- 元の `paper-ai-app` とは完全に別物として扱う

## 2. 最初に確認する場所

| 目的 | 主なファイル |
| --- | --- |
| 共通LLM経路 | `lib/game-llm.ts`, `lib/llm-model.ts`, `lib/gemini.ts`, `lib/groq.ts` |
| 有料API切替 | `lib/llm-access.ts`, `app/api/llm-access/route.ts`, `app/components/PaidLlmAccessButton.tsx` |
| 共通フィードバック/RAG | `lib/game-feedback-store.ts`, `lib/game-ai-types.ts`, `app/api/game-feedback/route.ts`, `app/components/GameFeedbackPanel.tsx` |
| 共通部屋設定 | `lib/room-defaults-store.ts`, `lib/game-room-defaults-client.ts`, `app/components/RoomConfigSummary.tsx` |
| 共通時間制限 | `lib/game-room-config.ts`, `app/components/RoomTimeLimitControl.tsx` |
| 共通デバッグ認証 | `app/components/DebugModeButton.tsx`, `app/api/debug-auth/route.ts` |
| アカウント・メール復旧 | `lib/player-account-store.ts`, `lib/player-password-reset.ts`, `lib/email.ts`, `app/api/player-account/route.ts`, `app/api/player-password-reset/route.ts`, `app/reset-password` |
| ワードウルフ | `app/wordwolf`, `app/api/wordwolf`, `lib/wordwolf-room-store.ts` |
| たほい屋 | `app/tahoiya/TahoiyaGame.tsx`, `app/api/tahoiya`, `lib/tahoiya-room-store.ts`, `lib/tahoiya-types.ts` |
| たほい屋の問題再利用 | `lib/tahoiya-topic-catalog.ts`, `app/api/tahoiya/topic/route.ts` |

## 3. 環境変数

本番Vercelには以下が必要。値をコード、ログ、クライアントへ出さない。

- `OPENAI_API_KEY`
- `LLM_ACCESS_PASSWORD`
- `LLM_SESSION_SECRET`（32文字以上を推奨。利用者持込APIキーのCookie暗号化専用。未設定時は既存のサーバー秘密値から導出）
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `DEBUG_MODE_PASSWORD`
- `PRIVATE_GAME_ACCESS_KEY`（個人利用ゲーム枠の解除キー）
- `RESEND_API_KEY`
- `EMAIL_FROM`（任意。既定値 `Game Fields <noreply@game-fields.com>`）
- `APP_BASE_URL`（推奨。本番は `https://game-fields.com`）
- `UPSTASH_REDIS_REST_URL` または `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_TOKEN` または `KV_REST_API_TOKEN`
- 既存の `KV_*`, `REDIS_URL` も環境に設定されている場合がある

### メール送信の初期設定

パスワード復旧メールはResendから送る。Resendで `game-fields.com` を追加し、案内されたSPF/DKIM等のDNSレコードを設定してドメイン認証を完了する。その後、Vercelへ `RESEND_API_KEY` を登録する。送信元を変える場合だけ `EMAIL_FROM` を設定する。

アカウント作成時のメール登録は任意。既存アカウントはログイン後、現在のパスワードを再入力してメールを追加・変更できる。メールアドレスそのものはクライアントの保存セッションへ含めず、登録有無だけを保持する。

再設定リンクは1時間有効で、一度使うとRedisから削除される。同じメールアドレスからの発行は60秒に1回まで。発行APIは、登録の有無にかかわらず同じ成功応答を返す。

## 4. 共通LLM方針

ゲーム固有APIは事業者SDKを直接呼ばず、`generateGameLlmText` を使用する。

1. personalモードでは利用者が選んだOpenAI・Gemini・Groqと持込キー
2. paidモードではGame Fields提供枠のOpenAI
3. 失敗または出力不採用ならGame Fields側のGemini、次にGroq
4. 最後にユーザーへnoticeを表示してローカル候補

プロバイダー間のフォールバックは共通ゲートウェイだけで行う。ゲームAPI側で同じ連鎖を重ねて、APIリトライ回数を増やさない。品質重視処理は `quality: "high"` を指定できる。生成元、モデル、personal/paid/free/local、prompt version、校閲元、RAG参照IDを `GameGenerationMeta` に保存する。

### 有料APIと将来の課金

利用者持込APIとGame Fields提供の有料OpenAIを次の2経路に分離する。

1. `personal`: 利用者がOpenAI・Google Gemini・Groqから事業者を選び、その事業者で取得したAPIキーを入力する。料金と無料枠は選択した事業者側の契約に従う。
2. `game-fields`: Game Fieldsの `OPENAI_API_KEY` を使う。現在は `LLM_ACCESS_PASSWORD` による招待・動作確認用で、将来は購入済み権限やクレジット残高による認可へ置き換える。

利用者持込は `lib/game-llm.ts` のpersonalモード、Game Fields提供枠はpaidモードとして扱う。`GameGenerationMeta.provider` と `billingSource` に事業者と `personal` / `game-fields` を記録するため、将来の原価・利用量分析で区別できる。決済実装時は `lib/llm-access.ts` のGame Fields提供枠の認可を差し替え、ゲーム固有ルートは変更しない。

利用者持込キーは入力時に各事業者のモデル取得APIで現在のモデルを利用できるか検証する。平文をRedis、プレイヤーアカウント、ログ、localStorageへ保存しない。事業者名とキーをAES-256-GCMで暗号化したHttpOnly・SameSite=Lax Cookieへ最大8時間だけ保持し、切断時に削除する。旧OpenAI専用Cookieは読み取り互換を保ち、次回接続時に共通Cookieへ移行する。暗号化には32文字以上の `LLM_SESSION_SECRET` を推奨し、未設定時は既存の `LLM_ACCESS_PASSWORD` と `OPENAI_API_KEY` からサーバー内で秘密値を導出する。入力画面ではAPIと一般向け月額プランが別であること、取得先、専用キー、権限制限、利用上限設定を案内する。

## 5. マルチプレイ共通ルール

- 部屋設定は全クライアントへ表示する。
- 設定操作はロビーにいるホストだけ。
- 設定デフォルトはプレイヤーごとにRedisへ保存し、localStorageをフォールバックにする。
- 1プレイヤー1アクティブ部屋。新しい部屋作成時は古いホスト部屋を解散する。
- 投稿・投票がそろったらサーバー側で自動遷移する。
- 自動遷移しなかった場合の手動ボタンはホスト向けに残すが、必要条件を満たすまで表示しない。
- 時間制限は共通プリセットと秒数手入力に対応し、`0` は制限なし。
- デバッグモードは各ゲームのトップバーにあるホスト専用 `DebugModeButton` から切り替える。ONにするときは `DEBUG_MODE_PASSWORD` を共有APIで検証し、ゲームごとのパスワードUIは作らない。

## 6. ワードウルフ現行仕様の要点

- `/wordwolf`
- 部屋制、ログイン制、復帰対応、デバッグ時は1人テスト可
- 順番投稿・全員同時投稿、順番ランダム、同時投票、同率・決選投票、狼の逆転回答に対応
- お題は同日同語禁止、全期間同組合せ禁止。固有名詞は語だけで類推できない距離へ調整済み
- OpenAI OFF時はGemini、Groq、ローカルの順。逆転判定は無料APIまたはfuzzy/feedbackを使用

詳細な挙動を変える前に、`lib/wordwolf-room-store.ts` のサーバー遷移を確認する。

## 7. たほい屋現行仕様の要点

- `/tahoiya`
- 2人から開始可能
- 「回答者1人」と「全員作成・全員投票」の2モード
- 全員が偽説明を1つ投稿。全員完了までは上書き可能
- 投稿完了で自動的に投票へ進む。手動の投票遷移ボタンは全員投稿後だけ表示
- 投票済み候補は本人の画面でシアン表示し、変更候補はアンバー表示
- 結果時に読み、正解説明、辞書・典拠情報を表示
- 正解説明は約10字、20字、30字を中心に、40字、50字、最大60字も低確率で混在させる。長い段階ほど出現率を下げ、無理に引き延ばさない
- 回答者1人モードだけ、偽説明担当へ正解情報を見せる設定が使える。全員投票では絶対に見せない
- 「通常」と「高難易度」のお題難易度がある
- お題候補は一般語、固有名詞、カタカナ語を含む。現代人物、企業、商品、流行語は除外

### たほい屋のお題生成

通常の新規生成は、高品質設定で3候補を一度に作り、可能なら別プロバイダーで1候補を校閲する。NGリストを最初のプロンプトへ渡し、無駄な再生成を避ける。

正解説明の長さは、約10字、20字、30字、40字、50字、55〜60字の順に `35% / 28% / 20% / 10% / 5% / 2%` で選ぶ。上限は60文字。選ばれた長さは生成と校閲の両プロンプトへ渡すが、文字数合わせの水増しはさせない。

出題優先順:

1. 同じ難易度で、今回の全参加者が未経験の保存済み問題
2. LLMによる新規生成
3. 難易度別ローカル候補

`lib/tahoiya-topic-catalog.ts` は各単語に経験済みプレイヤーID、利用回数、最終利用日時を保存する。Bad評価で問題視された語は再利用しない。保存問題は利用回数が少ないものから優先する。履歴はこの仕組みの導入後に出題した問題から蓄積される。

## 8. フィードバック/RAG

- Good/Bad、理由タグ、自由記述をプレイヤー単位で保存
- 使用APIとモデル、設定、結果も同時に保存
- 同じartifactへの評価は更新可能
- たほい屋には「もっと難しい単語」「実在・読み・説明が怪しい」などの理由タグがある
- Bad語はお題生成のNGリストと保存問題の再利用除外へ反映する

## 9. 開発・検証・公開

```bash
npm install
npm run dev
npm run lint
npm run build
```

変更後はlintとproduction buildを通す。UI状態を変えた場合は、ホストと非ホスト、通常モードとデバッグモード、フェーズ遷移前後を確認する。

`main` へのpushでVercelが自動デプロイする。公開作業の完了条件は以下。

ChatGPT Workではスレッドごとに作業環境が新しくなり、前スレッドにあったローカルcheckoutやGitHub CLI（`gh`）が存在しない場合がある。最初にリポジトリを取得して最新mainとの一致を確認する。`gh` がなくても接続済みのGitHubアプリが使える場合は、GitHub APIでblob、tree、commitを作成し、mainのrefをfast-forward更新して公開できる。CLIがないことだけを理由に公開不可と判断せず、GitHub連携ツールの利用可否を確認する。

1. GitHubのmainへ意図したファイルだけをコミット
2. Vercel対象デプロイが `READY`
3. 必要に応じて本番APIまたは画面を1回だけ確認
4. APIテストを無意味に繰り返して無料枠・有料枠を消費しない

## 10. 引き継ぎメモの保守

別スレッドで迷わず改造へ入れることを優先する。次の変更を行ったら、この文書も同時に更新する。

- ゲームルールや得点
- 部屋・ログイン・永続化方式
- LLMプロバイダー、モデル、フォールバック順
- RAG、履歴、問題再利用方式
- 必須環境変数
- 主要ファイルの追加・移動
- 検証・デプロイ方法


## 11. 個人利用ゲーム枠

- 必須環境変数: `PRIVATE_GAME_ACCESS_KEY`
- ロビー上部の無注釈フィールドは `/api/private-game-access` でサーバー照合する。値をクライアントへ公開しない。
- 照合成功時は30日間のHttpOnly Cookieを発行し、個人利用ゲームカードを表示する。
- `/northern-branch` はサーバー側でもCookieを検証し、未解除の場合は `/games` へ戻す。
- ノーザンブランチは現在1台回覧式の個人利用プロトタイプ。状態はブラウザー内保存で、Redisルーム対戦は未実装。
- 仮カードと仮建物は `lib/northern-branch-data.ts`、ゲーム進行は `lib/northern-branch-game.ts`、画面は `app/northern-branch/NorthernBranchGame.tsx`。
- 正式なカード構成へ差し替える前に `docs/NORTHERN_BRANCH_PROTOTYPE.md` の未実装一覧を確認する。
