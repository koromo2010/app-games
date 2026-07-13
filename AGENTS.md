# App Games agent guide

このリポジトリを編集するAI・開発者は、作業開始時に `README.md` と `docs/DEVELOPMENT_HANDOFF.md` を読むこと。新規ゲームの追加・ゲーム仕様の変更時は、さらに `config/game-registry.json` と `docs/NEW_GAME_CHECKLIST.md` を必ず確認すること。会話スレッド内の記憶だけを正本にしない。お題DB、既出判定、問題再利用を変更する場合は `docs/TOPIC_HISTORY_DATABASE.md` も先に読むこと。

## Project identity

- このプロジェクトは `app-games`。`paper-ai-app` とは完全に別のアプリとして扱う。
- GitHub: `koromo2010/app-games`
- Production: `https://www.game-fields.com`（Vercel URLも利用可能）
- Next.js App Router / React 19 / TypeScript / Redis（Upstash互換）。

## Non-negotiable architecture

- ゲームからLLM事業者を直接呼ばない。必ず `lib/game-llm.ts` を通す。
- APIキーをクライアントへ出さない。
- 利用者持込のOpenAI・Gemini・Groq APIキーはRedis・アカウント・ログ・localStorageへ保存しない。`LLM_SESSION_SECRET` で暗号化したHttpOnly Cookieに短時間だけ保持し、共通LLMゲートウェイから利用する。
- 有料OpenAI利用は「利用者本人のAPIキー」と「Game Fields提供枠」を別の課金元として扱う。将来の決済導入ではGame Fields提供枠の認可だけを購入権限へ差し替え、ゲーム固有APIを変更しない。
- マルチプレイの部屋設定は参加者全員に表示し、変更はロビーのホストだけに許可する。
- デバッグモードはトップバーの共通 `DebugModeButton` を使い、ON時は共有APIで管理パスワードを検証する。ゲーム個別に認証UIを複製しない。
- 復旧用メールアドレスは任意。パスワード再設定は共通の `player-password-reset` APIを使い、メールの存在を応答から漏らさず、期限付き・一度きりのトークンを使う。
- 部屋設定のデフォルトはゲーム別・プレイヤー別に保存する。
- 1プレイヤーが保持できるアクティブな部屋は各ゲームで1つ。
- サーバーを正として投稿、投票、フェーズ遷移を処理する。クライアントだけで完了判定しない。
- AI生成物には `GameGenerationMeta` を保持し、Good/Badと自由記述のフィードバックへつなぐ。
- お題候補へ経験済みプレイヤー配列を増やし続けない。長期設計では、候補と品質統計は候補DB、経験済み候補IDはゲーム別・プレイヤー別Redis Setへ分離する。
- 既存のユーザー変更を消さない。秘密情報や `.env.local` をコミットしない。
- 全ゲームを `config/game-registry.json` に登録する。ロビー表示、公開範囲、プレイ方式、LLM、戦績、必須共通UIを別々のファイルへ重複定義しない。
- アカウント参加型ゲームは共通戦績へ結果を保存し、ロビーの全ゲーム・ゲーム別フィルターで確認可能にする。ローカル回しゲームは、アカウントへ安全に紐づけられるまで戦績対象外と明記する。

## Verification and publishing

変更後は最低限、次を実行する。

```bash
npm run lint
npm run build
```

`npm run lint` の先頭で `scripts/check-game-standards.mjs` が実行される。共通UI、非公開Cookie検証、部屋TTL、LLMゲートウェイ、戦績、ゲーム登録の不足を、警告ではなくエラーとして扱う。

`main` へのpushでVercel本番が自動デプロイされる。変更を公開した場合は、対象コミットのデプロイが `READY` になったことまで確認する。

ChatGPT Workの新規スレッドでは `gh` がない場合がある。接続済みGitHubアプリからblob/tree/commit/refを操作できるなら、GitHub CLIなしでもmainへfast-forward公開できる。`gh` 不在だけで公開を断念しない。詳細は `docs/DEVELOPMENT_HANDOFF.md` を参照する。

アーキテクチャ、ゲームルール、環境変数、主要ファイル、デプロイ方法を変えた場合は、同じ変更内で `docs/DEVELOPMENT_HANDOFF.md` も更新すること。
