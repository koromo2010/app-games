# 外部サービス契約・課金台帳

最終更新: 2026-07-21

Game Fieldsの運営・開発で利用する外部サービスについて、契約状況、月額固定費、従量課金、用途、解約時の影響を一元管理する。

金額やプランが未確認のものは推測で埋めず、`要確認`のまま残す。請求画面を確認したときに更新する。

## 現在の課金・契約一覧

| サービス | 契約状況 | 現在のプラン | 固定費 | 従量課金 | 主な用途 | 解約・停止時の影響 | 確認先 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vercel | 契約中 | Pro | 約2,000〜3,000円/月相当。正確な請求額はBillingで確認 | 利用量が付属クレジットを超えた場合 | 本番、開発、将来のSDK環境のホスティング・デプロイ | サイトとAPIが停止。Preview、独自ドメイン運用、Shared Environment Variables等にも影響 | Vercel Team `game-fields` → Billing / Usage |
| Redis | 利用中 | 要確認（Redis CloudまたはUpstash） | 要確認 | 容量、接続、リクエスト数等に応じる可能性あり | ルーム状態、ゲーム進行、一時状態、ロック | オンラインルーム作成・同期・再接続が停止 | Redis CloudまたはUpstashのBilling画面 |
| Neon PostgreSQL | 利用中 | 要確認 | 要確認 | ストレージ、Compute、転送量等に応じる可能性あり | 本番DB、開発DB、共通単語DB | アカウント、戦績、設定、単語DB等が停止 | Neon Console → Billing / Usage |
| Vercel Blob | 利用中 | Vercel契約内または従量 | 固定費はVercel契約に含まれる可能性あり | 保存容量、転送量、操作回数 | ゲーム画像、アイコン、アップロード資産 | 画像表示・アップロードが停止 | Vercel → Storage / Usage |
| Resend | 利用中 | 要確認 | 要確認 | 送信通数超過時に発生する可能性あり | 問い合わせ、通知、復旧メール | メール送信が停止 | Resend → Billing / Usage |
| OpenAI API | APIキー設定あり | API従量課金 | 原則なし | トークン利用量 | ゲーム用LLM、説明生成等 | 対象AI機能が停止 | OpenAI Platform → Usage / Billing |
| Gemini API | APIキー設定あり | 要確認 | 要確認 | モデル・利用量による | LLM代替・補助 | 対象AI機能が停止 | Google AI Studio / Google Cloud Billing |
| Groq API | APIキー設定あり | 要確認 | 要確認 | プラン・利用量による | LLM代替・高速推論 | 対象AI機能が停止 | Groq Console → Billing / Usage |
| お名前.com | 契約中 | `game-fields.com` ドメイン | 年額。正確な更新額は要確認 | 通常なし | ドメイン・DNS管理 | `game-fields.com`、`dev.game-fields.com`、`sdk.game-fields.com`が利用不能 | お名前.com Navi → 契約更新・請求 |

## 環境別の主な有料資源

| 環境 | Vercel | PostgreSQL | Redis | Blob | ドメイン |
| --- | --- | --- | --- | --- | --- |
| Production | `app-games` | `app-games-neon` | 本番Redis | 本番Blob | `game-fields.com` |
| Development | `app-games-dev` | `dev-neon` | `dev-redis` | `dev-games-blob` | `dev.game-fields.com` |
| SDK | 将来 `app-games-sdk` | SDK専用DBを予定 | SDK専用または名前空間分離 | SDK専用または名前空間分離 | `sdk.game-fields.com` |
| Vocabulary | 各環境から共通利用 | `word-master-neon` | 原則使わない | 原則使わない | なし |

## 毎月確認する項目

1. VercelのIncluded Credit消化額とOn-Demand Charges。
2. Redisのストレージ、接続数、リクエスト量と請求額。
3. NeonのCompute時間、ストレージ、転送量と請求額。
4. OpenAI、Gemini、Groqの月間利用額。
5. Resendの送信通数と超過見込み。
6. ドメイン更新月と自動更新状態。

## 運用ルール

- 新しい外部サービスを導入したら、この台帳へ追加する。
- 無料枠でもクレジットカード登録や従量課金がある場合は掲載する。
- APIキーや接続文字列などの秘密情報は記載しない。
- 金額が不明な場合は推測せず`要確認`とする。
- 月額固定費と従量課金を分けて記載する。
- 解約前に、代替サービスと停止影響を必ず確認する。
- 課金アラートや上限設定が可能なサービスでは、各サービス側でも設定する。

## 次回確認メモ

- Redisの契約先がRedis CloudかUpstashかを請求画面で確定する。
- Vercel Proの実際の月額請求とIncluded Creditの適用範囲をBillingで記録する。
- Neonの3データベースが同一契約内か、プロジェクト別課金かを確認する。
- Resend、Gemini、Groqが無料枠のみか、有料プラン・従量課金状態かを確認する。
