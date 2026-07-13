# app-games 開発資料ナビ

このページを、別スレッドや別担当者が開発へ入るときの資料入口とする。`DEVELOPMENT_THREAD_LOG.md` は判断経緯を残す参考ログであり、ここから辿れる現行資料とコードを正本として使う。

## 最初の読み順

1. ルートの `AGENTS.md` で、変更してはいけない共通制約を確認する。
2. `docs/DEVELOPMENT_HANDOFF.md` で、現在の仕様・主要ファイル・環境変数・公開手順を確認する。
3. 下表から、今回の作業に該当する資料だけを追加で読む。
4. `git status --short --branch` と直近コミットを確認し、既存変更を上書きしない。
5. 変更後は最低限 `npm run lint`、`npm test`、`npm run build` を実行する。

`README.md` は利用者向け概要、`DEVELOPMENT_HANDOFF.md` は現在の開発状態、各ゲーム資料は詳細ルール、`CONTAINER_ARCHITECTURE.md` は将来案である。将来案を現在実装済みの仕様と読み違えないこと。

## 作業別の資料索引

| 作業 | 最初に読む資料 | 次に確認する正本・コード |
| --- | --- | --- |
| 未修正バグ・次の修正順 | `KNOWN_ISSUES.md` | 対象項目に記載したAPI・store・domain |
| バグ調査・全体監査 | `DEVELOPMENT_HANDOFF.md` の共通ルールと現行仕様 | `config/game-registry.json`、対象ゲームの画面・API route・room store、`package.json` |
| ワードウルフのルール・進行 | `DEVELOPMENT_HANDOFF.md` 6章、`game-concept.md` 2章 | `lib/wordwolf-command-domain.ts`、`lib/wordwolf-room-store.ts`、`app/wordwolf/game-flow.ts` |
| たほい屋のルール・進行 | `DEVELOPMENT_HANDOFF.md` 7章 | `lib/tahoiya-room-store.ts`、`lib/tahoiya-types.ts`、`app/tahoiya/TahoiyaGame.tsx` |
| ことばで数ならべ | `KOTOBA_DE_KAZU_NARABE.md` | `lib/hodoai-room-store.ts`、`app/api/hodoai/rooms/route.ts` |
| ことばソナー | `KOTOBA_SENPUKU.md` | `lib/kotoba-senpuku-room-store.ts`、`app/api/kotoba-senpuku/rooms/route.ts` |
| ノーザンブランチ | `NORTHERN_BRANCH_PROTOTYPE.md` | `lib/northern-branch-game.ts`、`lib/northern-branch-room-store.ts` |
| 新規ゲーム追加 | `NEW_GAME_CHECKLIST.md` | `config/game-registry.json`、`scripts/check-game-standards.mjs` |
| お題DB・既出判定・再利用 | `TOPIC_HISTORY_DATABASE.md` | ゲーム別topic catalog・history store・topic API |
| モジュール分割・時間管理 | `MODULAR_GAME_ARCHITECTURE.md` | `moduleBoundaryFiles`、`lib/game-timer`、対象Command API |
| ログ確認・障害調査・観測基盤 | `OBSERVABILITY.md` | `lib/observability`、`instrumentation.ts`、Vercel Runtime Logs |
| 将来の物理コンテナ分割 | `CONTAINER_ARCHITECTURE.md` | 現在は将来案。先にモジュラーモノリスの境界を守る |
| LLM・利用者APIキー・課金元 | `DEVELOPMENT_HANDOFF.md` 3〜4章 | `lib/game-llm.ts`、`lib/llm-access.ts`、`lib/llm-model.ts` |
| 戦績・レーティング | `DEVELOPMENT_HANDOFF.md` 5章 | `lib/player-stats-store.ts`、`lib/game-rating.ts` |
| マイページ・対戦プレイバック・お気に入り・共有 | `GAME_REPLAYS.md` | `lib/game-replay-store.ts`、`app/api/player-replays/route.ts`、`app/users/me` |
| 過去スレッドの要望・判断経緯 | `DEVELOPMENT_THREAD_LOG.md`（参考ログ） | 現在仕様は必ず該当資料とコードで再確認する |
| 公開・引き継ぎ更新 | `DEVELOPMENT_HANDOFF.md` 9〜10章 | `git diff`、Vercelの対象デプロイ |

## バグ調査で見る順番

全体を無差別に読むのではなく、次の順で確認すると重大箇所を拾いやすい。

1. `npm run lint`、`npm run build`、利用可能なら画面スモークテスト。
2. APIが、Cookieやサーバーセッションから本人を特定しているか。リクエストの `playerId` / `actorId` だけを本人証明にしていないか。
3. 秘密情報をゲームフェーズと閲覧者に応じて除外しているか。部屋JSON全体を全員へ返していないか。
4. Commandの参加資格・ホスト権限・手番・対象・フェーズ検証。
5. revision CAS、同時参加、二重送信、タイムアウトと通常操作の競合。
6. 勝敗・得点・戦績・レーティングの冪等性。
7. Redis TTL、アクティブ部屋索引、部屋削除時の後始末。
8. 画像・名前・自由記述・部屋設定のサイズ上限と正規化。

## 文書間で迷ったとき

- 現在の共通仕様は `DEVELOPMENT_HANDOFF.md` を優先する。
- 監査済みの未修正バグと着手順は `KNOWN_ISSUES.md` を確認する。
- ゲーム固有の詳細ルールは各ゲーム資料を優先する。
- 登録ゲーム一覧と自動監査対象は `config/game-registry.json` を優先する。
- 実装済みのモジュール境界は `MODULAR_GAME_ARCHITECTURE.md` と `moduleBoundaryFiles` を使う。
- `CONTAINER_ARCHITECTURE.md` は将来構成であり、実装済みとはみなさない。
- `DEVELOPMENT_THREAD_LOG.md` は過去の経緯を調べるときだけ参照し、現在仕様の根拠にはしない。
- 資料とコードが食い違う場合は、片方だけを黙って合わせず、差分をバグまたは仕様判断として明示する。
