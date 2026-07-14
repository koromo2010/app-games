# ゲームのモジュール境界

物理コンテナへ切り出した後の責務と通信構成は `docs/CONTAINER_ARCHITECTURE.md` を参照する。

将来のコンテナ分割は、先に同一Next.jsアプリ内で境界を固定する「モジュラーモノリス」方式で進める。画面をそのまま別サービスへ切り出すのではなく、依存方向を次に限定する。

```text
UI / hooks -> API client -> HTTP route -> application/domain -> storage
                                      \-> AI gateway
```

## 境界

- UI: 描画と入力のみ。`fetch`、Redis、勝敗判定を直接持たない。
- hooks: 時計、購読、画面用状態を担当し、ゲームルールを決定しない。
- API client: URL、HTTP method、レスポンス検証を集約する。
- domain: フェーズ遷移、投票集計、勝敗判定。React、HTTP、Redisへ依存しない純粋関数にする。
- application/API route: 認証、入力検証、競合制御、domainの実行を担当する。
- storage: Redisキーと永続化だけを担当する。
- AI: `lib/game-llm.ts` の共通ゲートウェイを越えて事業者へ直接依存しない。
- timer: `lib/game-timer` が締切・猶予・再試行時刻・一意イベントIDを共通管理する。ゲームdomainは期限後の具体的な状態遷移だけを持つ。

## 全オンラインゲームの共通クライアント境界

- HTTP共通処理: `lib/online-room-api-client.ts`
- 表示中の部屋同期: `app/hooks/use-online-room-polling.ts`
- ワードウルフadapter: `app/wordwolf/wordwolf-room-api-client.ts`
- たほい屋adapter: `app/tahoiya/tahoiya-room-api-client.ts`
- ノーザンブランチadapter: `app/northern-branch/northern-branch-room-api-client.ts`
- ワードスケールadapter: `app/hodoai-talk/hodoai-room-api-client.ts`
- ことばソナーadapter: `app/kotoba-senpuku/kotoba-senpuku-room-api-client.ts`
- ニゴイチadapter: `app/nigoichi/nigoichi-room-api-client.ts`

共通クライアントはURL、method、条件付きGET、JSON応答、HTTP status/payload付きエラーまでを担当する。各adapterはゲーム固有のRoom・Action型を付ける。フェーズ遷移、権限、勝敗、レスポンスの秘密情報除去は従来どおりサーバーdomain/storeの責務で、クライアント共通化へ移さない。

部屋APIの書き込み契約は全ゲームで、`POST = 新規部屋作成`、`PATCH = 既存部屋へのCommand`、`DELETE = 解散` に固定する。既存コードへのPOSTは409で拒否し、UIは作成後のRoom全体を送信しない。参加、プロフィール、ロビー設定、デバッグ操作、次ラウンド、ゲーム進行は、変更意図だけを表すゲーム固有ActionとしてPATCHする。サーバーは認証Cookieからactorを確定し、保存済みRoomへ権限・フェーズ・対象・revisionを検証して適用する。

結果データは `lib/game-result-presentation.ts` で保存順から表示順へ一度だけ射影し、画面・共有・プレイバックで同じ行を使う。ワードスケールは `hodoaiResultPresentation` がこの基準実装で、内部の0→120保存順を外部の120→0表示順へ変換する。

## ワードウルフの移行状況

- domain: `app/wordwolf/game-flow.ts`
- API client: `app/wordwolf/wordwolf-room-api-client.ts`
- phase clock: `app/wordwolf/use-wordwolf-phase-clock.ts`
- storage: `lib/wordwolf-room-store.ts`
- timer policy/event: `lib/game-timer/policy.ts`, `lib/game-timer/event.ts`
- timer ingress: `app/api/game-timer/expire/route.ts`

第一段階では部屋API通信と時計を巨大な画面コンポーネントから分離した。その後、部屋APIと表示中ポーリングの共通土台を全5ゲームへ適用した。部屋には単調増加する `revision` を持たせ、Redis内CASで古い保存を409拒否する。参加・ロビー設定・ゲーム開始・通常の発言・投票・最終回答・時間切れは `/api/wordwolf/commands` または専用部屋Commandへ移行済みで、`lib/wordwolf-command-domain.ts` と各Room Storeが検証と状態遷移を担当する。WordWolf/Tahoiyaに残っていた部屋全体POST互換経路も廃止済みで、全5ゲームのgame-server境界は同じHTTP契約になった。

`config/game-registry.json` の `moduleBoundaryFiles` は分離済み境界の正本であり、`npm run lint` が存在を検査する。新しいスレッドや新ゲームでファイルを1つへ戻さない。

プレイヤー別の連続時間切れ、5秒制限、復帰通知は `lib/player-timeout-policy.ts` を正本とする。タイマーのあるゲームはRoomへ共通フィールドを合成し、ゲーム固有Storeは「誰が時間切れになったか」と「有効な操作があったか」だけを渡す。制限解除は通常操作ではなく本人の明示的な復帰操作だけで行う。
