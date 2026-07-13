# ゲームのモジュール境界

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

## ワードウルフの移行状況

- domain: `app/wordwolf/game-flow.ts`
- API client: `app/wordwolf/wordwolf-room-api-client.ts`
- phase clock: `app/wordwolf/use-wordwolf-phase-clock.ts`
- storage: `lib/wordwolf-room-store.ts`

第一段階では部屋API通信と時計を巨大な画面コンポーネントから分離した。部屋には単調増加する `revision` を持たせ、Redis内CASで古い保存を409拒否する。時間切れは `/api/wordwolf/commands` の `expire-phase` Commandへ移行済みで、サーバーが締切確認と遷移を担当する。次段階で通常の投稿・投票も同じCommandへ移し、クライアントから部屋全体を保存する経路を廃止する。これが完了すればgame-serverを独立コンテナへ移せる。

`config/game-registry.json` の `moduleBoundaryFiles` は分離済み境界の正本であり、`npm run lint` が存在を検査する。新しいスレッドや新ゲームでファイルを1つへ戻さない。
