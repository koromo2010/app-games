# App Games agent guide

このリポジトリを編集するAI・開発者は、作業開始時に `docs/README.md` の読書順に従い、`README.md` と `docs/DEVELOPMENT_HANDOFF.md` を読むこと。Vercel、環境変数、DB、Redis、Blob、DNS、GitHub権限、外部API設定を扱う場合は、説明や操作案内を始める前に現在の対象ブランチの `docs/ENVIRONMENT_VARIABLES.md` も必ず読むこと。バグ修正・認証・マルチプレイ進行を変更する場合は `docs/KNOWN_ISSUES.md` も確認すること。新規ゲームの追加・ゲーム仕様の変更時は、さらに `config/game-registry.json` と `docs/NEW_GAME_CHECKLIST.md` を必ず確認すること。会話スレッド内の記憶や `docs/DEVELOPMENT_THREAD_LOG.md` を正本にしない。開発上の要望・判断・調査結果・実装・外部設定・公開・保留事項が生じた作業単位は、利用者から明示的な保存依頼がなくても、終了前に `docs/DEVELOPMENT_LOGGING.md` に従って `docs/DEVELOPMENT_THREAD_LOG.md` へ必ず追記する。お題DB、既出判定、問題再利用を変更する場合は `docs/TOPIC_HISTORY_DATABASE.md` も先に読むこと。

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
- デバッグモードはトップバーの共通 `DebugModeButton` を使う。管理パスワード認証とアカウント別の利用フラグはマイページと共有 `/api/debug-auth` に集約し、資格のない利用者には操作を表示せずAPIでも拒否する。デバッグ中は同じ部屋・参加者を維持したままゲーム開始前へ戻す中断Commandを用意する。
- 復旧用メールアドレスは任意。パスワード再設定は共通の `player-password-reset` APIを使い、メールの存在を応答から漏らさず、期限付き・一度きりのトークンを使う。
- 部屋設定のデフォルトはゲーム別・プレイヤー別に保存する。
- 1プレイヤーが保持できるアクティブな部屋は各ゲームで1つ。
- サーバーを正として投稿、投票、フェーズ遷移を処理する。クライアントだけで完了判定しない。
- AI生成物には `GameGenerationMeta` を保持し、Good/Badと自由記述のフィードバックへつなぐ。
- お題候補へ経験済みプレイヤー配列を増やし続けない。長期設計では、候補と品質統計は候補DB、経験済み候補IDはゲーム別・プレイヤー別Redis Setへ分離する。
- 既存のユーザー変更を消さない。秘密情報や `.env.local` をコミットしない。
- 全ゲームを `config/game-registry.json` に登録する。ロビー表示、公開範囲、プレイ方式、LLM、戦績、必須共通UIを別々のファイルへ重複定義しない。
- `docs/MODULAR_GAME_ARCHITECTURE.md` のモジュール境界と `docs/CONTAINER_ARCHITECTURE.md` の将来構成を守る。UIコンポーネントからRedisを呼ばず、HTTP通信、時計、純粋なゲーム進行、永続化を分離する。分離済みファイルは登録簿の `moduleBoundaryFiles` に列挙し、自動検査から脱落させない。
- サーバーログは `lib/observability` の閉じたイベントschemaを使う。リクエストbody、部屋JSON、合言葉、正解、秘密語、手札、投稿本文、Cookie、APIキー、氏名、メール、外部SDK例外本文をconsoleへ直接出さない。詳細は `docs/OBSERVABILITY.md`。
- アカウント参加型ゲームは共通戦績へ結果を保存し、ロビーの全ゲーム・ゲーム別フィルターで確認可能にする。ローカル回しゲームは、アカウントへ安全に紐づけられるまで戦績対象外と明記する。
- 詳細プレイバックは観測ログではなく `lib/game-replay-store.ts` へ保存し、参加者本人だけに返す。内部プレイヤーIDをユーザーURLへ使わず、共有文へ認証付きURLを含めない。ゲーム仕様として投稿本文や参加者名を共有する場合は送信前プレビューを必須にし、参加者名は本人のデフォルトOFFの同意を入室時に固定保存し、未同意なら匿名ラベルへ置き換える。

## Environment variables and external configuration

- Vercel、Neon、Upstash、Blob、DNS、GitHub Secrets／Tokens、外部APIキー等について、追加・変更・削除・共有Link・再デプロイ・ドメイン割当・Ignored Build Stepの案内または確認を行う前に、必ず `docs/ENVIRONMENT_VARIABLES.md` の現在配置と未完了事項を確認する。過去チャット、記憶、スクリーンショットだけを根拠にしない。
- 操作対象は、Vercel Team、Project名、Git branch、Root Directory、Deployment Environment、キー名、Sensitive区分まで特定する。台帳にない状態は「未確認」とし、推測で「設定済み」にしない。
- 外部設定を変更した作業は、同じ作業単位で `docs/ENVIRONMENT_VARIABLES.md` の現在状態を更新するまで完了扱いにしない。「登録済み」「ProjectへLink済み」「再デプロイ済み」「実機確認済み」を別の状態として記録する。
- 経緯は `docs/DEVELOPMENT_THREAD_LOG.md`、現在配置は `docs/ENVIRONMENT_VARIABLES.md` を正本とする。両方が必要な変更では同時に更新し、ログだけに現在状態を残さない。
- 秘密値、トークン、接続文字列、パスワードはGit、Issue、PR、チャット、スクリーンショットへ残さない。記録するのはキー名、配置先、権限範囲、Sensitive区分、確認状態、必要なローテーション期限だけとする。
- 最終報告前に、今回触れた外部設定が台帳へ反映され、次回の担当がチャット履歴なしで次の一手を判断できることを確認する。

## Development conversation logging

- チャット全文ではなく、次の担当が目的と経緯を復元するために必要な要約を記録する。
- コード変更がなくても、仕様決定、設計判断、調査で確定した事実、Vercel・DB等の外部設定変更、公開、保留・撤回は記録対象とする。
- 原則として作業終了前に追記し、コードや文書を変更した場合は同じコミットへ含める。長い作業では重要な判断または公開の区切りでもチェックポイントを残す。
- 要望、判断理由、実施結果、検証、関連コミット／PR、未対応・保留を区別する。推測を確定事項として書かない。
- 秘密値、個人情報、ゲームの秘密情報、内部プロンプト、ツールの生出力は保存しない。
- 詳細な書式と訂正方法は `docs/DEVELOPMENT_LOGGING.md` を正本とする。

## Verification and publishing

変更後は最低限、次を実行する。

```bash
npm run lint
npm test
npm run build
```

`npm run lint` の先頭で `scripts/check-game-standards.mjs` が実行される。共通UI、非公開Cookie検証、部屋TTL、LLMゲートウェイ、戦績、ゲーム登録の不足を、警告ではなくエラーとして扱う。

`main` へのpushでVercel本番が自動デプロイされる。変更を公開した場合は、対象コミットのデプロイが `READY` になったことまで確認する。

ChatGPT Workの新規スレッドでは `gh` がない場合がある。接続済みGitHubアプリからblob/tree/commit/refを操作できるなら、GitHub CLIなしでもmainへfast-forward公開できる。`gh` 不在だけで公開を断念しない。詳細は `docs/DEVELOPMENT_HANDOFF.md` を参照する。

アーキテクチャ、ゲームルール、環境変数、主要ファイル、デプロイ方法を変えた場合は、同じ変更内で `docs/DEVELOPMENT_HANDOFF.md` も更新すること。
