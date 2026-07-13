# 新規ゲーム追加チェックリスト

別スレッドや別の担当者がゲームを追加しても、共通仕様を会話の記憶に依存させないための必須手順です。

1. `config/game-registry.json` に最初にゲームを登録する。
2. `playMode` を `online-room` または `local-pass-and-play` から選ぶ。
3. LLM利用、公開範囲、アカウント戦績の有無を実態どおりに宣言する。
4. `requiredTokens` に、そのゲームで必須となる共通UIを列挙する。
5. オンライン部屋は共通TTL、サーバー正本、ホスト権限、1人1部屋を実装する。
6. LLMは `lib/game-llm.ts`、デバッグ認証は `DebugModeButton`、時間制限は `RoomTimeLimitControl` を使う。
7. アカウント参加型ゲームは `lib/player-stats-store.ts` に冪等な結果記録、`lib/game-replay-store.ts` に本人用プレイバックと匿名化した共有用見どころを追加し、登録簿の `statsRecorder` と `replayRecorder` に記録する。
8. 非公開ゲームはページのサーバー側で `privateGameCookieMatches` を検証する。
9. 共通 `GameRulesDialog` を使った最新ルール、ロビーへの戻り口、デバッグ時の確認手段を用意する。ルールには基本進行だけでなく、得点・終了条件・時間切れも記載する。
10. `npm run lint` と `npm run build` を通し、公開時はVercelの `READY` を確認する。

自動監査は、未登録の `*Game.tsx`、共通UI不足、非公開Cookie検証不足、共通TTL未使用、LLMゲートウェイ迂回、戦績処理不足、JSX属性の `\\u3042` のような文字化け候補を検出します。
