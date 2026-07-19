# 新規ゲーム追加チェックリスト

別スレッドや別の担当者がゲームを追加しても、共通仕様を会話の記憶に依存させないための必須手順です。

1. `config/game-registry.json` に最初にゲームを登録する。
2. `playMode` を `online-room` または `local-pass-and-play` から選ぶ。
3. LLM利用、公開範囲、アカウント戦績の有無を実態どおりに宣言する。ゲームの遊びを単純な図形で表した正方形SVGを `public/game-icons/<game-id>.svg` に追加し、既存セットと同じ濃紺背景・太線・少色の意匠にそろえる。
4. `requiredTokens` に、そのゲームで必須となる共通UIを列挙する。あわせて `timeLimit.mode` を原則 `configurable` とし、保存フィールドを `fields`、サーバー正本の期限処理を `expiryToken` に登録する。時間制限付きの文字入力がある場合は `textInputTimeout.mode: "adopt-entered-text"` とし、締切時に入力済み文字を送る実装の識別子を `implementationTokens` に登録する。文字入力がなければ `textInputTimeout.mode: "not-applicable"` と具体的な `reason` を必須にする。ゲーム進行そのものがない機能だけは `timeLimit` 自体を `not-applicable` にできる。
5. オンライン部屋は共通TTL、サーバー正本、ホスト権限、1人1部屋を実装する。
6. LLMは `lib/game-llm.ts`、デバッグ表示はトップバーの `DebugModeButton`、資格判定は `lib/debug-access.ts`、時間制限は `RoomTimeLimitControl` と `normalizeCommonTimeLimit` を使う。0秒を制限なしとする。時間制限付き文字入力は、画面の残り時間が0になった時点で入力ルールを満たすローカルの文字を送信し、サーバー受付猶予内なら採用する。複数欄の部分入力は有効な欄を保持し、空欄・無効欄だけを既存の時間切れ補完またはペナルティ対象にする。全必須欄が有効なら通常提出として扱い、時間切れペナルティを付けない。送信は冪等にし、最終判定とフェーズ遷移はクライアント時刻を信用せずサーバーdomain/storeで行う。この境界を自動テストする。デバッグのON/OFF・プレイバック・進行中断は独立表示せず `DebugModeButton` のプルダウンへまとめ、中断後は同じ部屋のゲーム開始前へ戻す。
7. オンライン部屋の最終結果画面は共通 `RoomResultActions` と `useRoomResultReturnGate` を使う。「部屋に戻る」を先頭・全幅の主導線とし、ホストのロビー復帰を検知してから各自で選ぶ遷移とする。「広場へ戻る」は確認付きの副導線、参加枠から外れる「退出」は共通確認付きとする。復帰クリック時には最新の部屋がロビーで本人の席が残っていることを再確認する。部屋解散を検知しても結果画面を強制遷移せず、通知、復帰ボタン無効化、ポーリング停止だけを行う。ホストにだけ「部屋を解散」を表示し、各アクションの処理中はスピナーと進行中ラベルを出して二重押しを防ぐ。通常の解散はロビーまたはゲーム終了後だけ許可し、サーバー側でも共通 `canDissolveOnlineRoom` とホスト権限を検証する。ゲーム内の途中ラウンド進行は最終結果からの個人遷移と分け、進行中のデバッグ終了は解散ではなく、中断でロビーへ戻してから行う。
8. アカウント参加型ゲームは `lib/player-stats-store.ts` に冪等な結果記録、`lib/game-replay-store.ts` に本人用プレイバックと匿名化した共有用見どころを追加し、登録簿の `statsRecorder` と `replayRecorder` に記録する。
   - 最終結果画面では全プレイヤーに共通 `GameResultShareButton` を表示し、実際に送る文章をプレビューしてから共有先を選べるようにする。参加者名、秘密情報、投稿本文、認証付きURLは共有文へ含めない。
   - オンラインゲームは登録簿の `resultShare: true` を宣言し、自動監査の対象にする。
9. デバッグモードではサーバー正本の安全な行動ログを記録し、`DebugModeButton` のプルダウンから表示・コピーできるようにする。操作名、時刻、操作者表示名、遷移前後フェーズ、revisionだけを記録し、秘密情報、投稿本文、合言葉、Cookie、APIキーを入れない。登録簿の `debugActionLog: true` を宣言する。
10. 公開範囲は `config/game-registry.json` の `private` を正本とし、ページは `gamePageAccessAllowed`、APIは `gameApiAccessDeniedResponse` で共通判定する。ゲームごとにCookie判定を複製しない。
11. **ローカルモックを含む全ゲーム**のトップバーは共通 `GameTopBanner` を使い、ロビー・MENU内のルール・デバッグ（実装する場合）・プレイヤーの順を基本とする。プレイヤー表示はログアウトを内包する `GamePlayerMenu` を使い、未ログインで遊べるモックではログイン導線を表示する。登録簿の `requiredTokens` に `GameTopBanner`、`GameTopMenu`、`GamePlayerMenu`、`GameRulesDialog`、`ルール` を入れて監査対象にする。
12. 共通 `GameRulesDialog` を使った最新ルール、ロビーへの戻り口、デバッグ時の確認手段を用意する。ルールは、そのゲームをまったく知らない人や若い人でも画面だけで遊び始められる平易な文章にする。「何をするゲームか」「準備」「1回の流れ」「得点」「勝ち・終了条件」「時間切れ」を分け、得点には実際の人数や点数を使った計算例も載せる。得点がない試作は「得点なし」と明記する。
13. `npm run lint` と `npm run build` を通し、公開時はVercelの `READY` を確認する。
14. オンラインゲームは共通 `GameAdSlot` を入室前・ロビー・結果の非プレイ面へ置く。進行中とデバッグ部屋には表示せず、ゲーム固有画面から広告事業者SDKを直接呼ばない。

自動監査は、未登録の `*Game.tsx`、時間制限方針・共通時間UI・保存フィールド・期限処理・入力済み文字の時間切れ採用処理の不足、共通UI不足、非公開Cookie検証不足、共通TTL未使用、LLMゲートウェイ迂回、戦績処理不足、JSX属性の `\\u3042` のような文字化け候補を検出します。
