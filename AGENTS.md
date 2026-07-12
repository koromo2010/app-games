# App Games agent guide

このリポジトリを編集するAI・開発者は、作業開始時に `README.md` と `docs/DEVELOPMENT_HANDOFF.md` を読むこと。

## Project identity

- このプロジェクトは `app-games`。`paper-ai-app` とは完全に別のアプリとして扱う。
- GitHub: `koromo2010/app-games`
- Production: `https://www.game-fields.com`（Vercel URLも利用可能）
- Next.js App Router / React 19 / TypeScript / Redis（Upstash互換）。

## Non-negotiable architecture

- ゲームからLLM事業者を直接呼ばない。必ず `lib/game-llm.ts` を通す。
- APIキーをクライアントへ出さない。
- 利用者持込のOpenAI APIキーはRedis・アカウント・ログ・localStorageへ保存しない。`LLM_SESSION_SECRET` で暗号化したHttpOnly Cookieに短時間だけ保持し、共通LLMゲートウェイから利用する。
- 有料OpenAI利用は「利用者本人のAPIキー」と「Game Fields提供枠」を別の課金元として扱う。将来の決済導入ではGame Fields提供枠の認可だけを購入権限へ差し替え、ゲーム固有APIを変更しない。
- マルチプレイの部屋設定は参加者全員に表示し、変更はロビーのホストだけに許可する。
- デバッグモードはトップバーの共通 `DebugModeButton` を使い、ON時は共有APIで管理パスワードを検証する。ゲーム個別に認証UIを複製しない。
- 復旧用メールアドレスは任意。パスワード再設定は共通の `player-password-reset` APIを使い、メールの存在を応答から漏らさず、期限付き・一度きりのトークンを使う。
- 部屋設定のデフォルトはゲーム別・プレイヤー別に保存する。
- 1プレイヤーが保持できるアクティブな部屋は各ゲームで1つ。
- サーバーを正として投稿、投票、フェーズ遷移を処理する。クライアントだけで完了判定しない。
- AI生成物には `GameGenerationMeta` を保持し、Good/Badと自由記述のフィードバックへつなぐ。
- 既存のユーザー変更を消さない。秘密情報や `.env.local` をコミットしない。

## Verification and publishing

変更後は最低限、次を実行する。

```bash
npm run lint
npm run build
```

`main` へのpushでVercel本番が自動デプロイされる。変更を公開した場合は、対象コミットのデプロイが `READY` になったことまで確認する。

ChatGPT Workの新規スレッドでは `gh` がない場合がある。接続済みGitHubアプリからblob/tree/commit/refを操作できるなら、GitHub CLIなしでもmainへfast-forward公開できる。`gh` 不在だけで公開を断念しない。詳細は `docs/DEVELOPMENT_HANDOFF.md` を参照する。

アーキテクチャ、ゲームルール、環境変数、主要ファイル、デプロイ方法を変えた場合は、同じ変更内で `docs/DEVELOPMENT_HANDOFF.md` も更新すること。
