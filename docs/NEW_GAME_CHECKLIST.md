# 新規ゲーム追加チェックリスト

別スレッドや別の担当者がゲームを追加しても、共通仕様を会話の記憶に依存させないための必須手順です。

1. `config/game-registry.json` に最初にゲームを登録する。
2. `playMode` を `online-room` または `local-pass-and-play` から選ぶ。
3. LLM利用、公開範囲、アカウント戦績の有無を実態どおりに宣言する。
4. `requiredTokens` に、そのゲームで必須となる共通UIを列挙する。
5. オンライン部屋は共通TTL、サーバー正本、ホスト権限、1人1部屋を実装する。
6. LLMは `lib/game-llm.ts`、デバッグ表示はトップバーの `DebugModeButton`、資格判定は `lib/debug-access.ts`、時間制限は `RoomTimeLimitControl` を使う。デバッグのON/OFF・プレイバック・進行中断は独立表示せず `DebugModeButton` のプルダウンへまとめ、中断後は同じ部屋のゲーム開始前へ戻す。
7. オンライン部屋の結果画面は共通 `RoomResultActions` を使い、ホストへ「同じ部屋でもう一度」と「部屋を解散」を必ず並べる。通常の解散はロビーまたはゲーム終了後だけ許可し、サーバー側でも共通 `canDissolveOnlineRoom` とホスト権限を検証する。進行中のデバッグ終了は解散ではなく、中断でロビーへ戻してから行う。
8. アカウント参加型ゲームは `lib/player-stats-store.ts` に冪等な結果記録、`lib/game-replay-store.ts` に本人用プレイバックと匿名化した共有用見どころを追加し、登録簿の `statsRecorder` と `replayRecorder` に記録する。
9. 公開範囲は `config/game-registry.json` の `private` を正本とし、ページは `gamePageAccessAllowed`、APIは `gameApiAccessDeniedResponse` で共通判定する。ゲームごとにCookie判定を複製しない。
10. トップバーは共通 `GameTopBanner` を使い、ロビー・ルール・デバッグ・プレイヤーの順を基本とする。プレイヤー表示はログアウトを内包する `GamePlayerMenu` を使い、ログアウトをトップバーへ単独配置しない。
11. 共通 `GameRulesDialog` を使った最新ルール、ロビーへの戻り口、デバッグ時の確認手段を用意する。ルールには基本進行だけでなく、得点・終了条件・時間切れも記載する。
12. `npm run lint` と `npm run build` を通し、公開時はVercelの `READY` を確認する。

自動監査は、未登録の `*Game.tsx`、共通UI不足、非公開Cookie検証不足、共通TTL未使用、LLMゲートウェイ迂回、戦績処理不足、JSX属性の `\\u3042` のような文字化け候補を検出します。
