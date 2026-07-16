# ノーザンブランチ 個人利用オンライン試作

公開情報を参考にしながら、固有のカード構成や表現を再現せずに作成した個人利用枠の試作です。市販商品の完全再現ではありません。

## 現在の遊び方

- ログインした2〜4人が、それぞれの端末から同じ部屋へ参加する
- ホストが4文字の部屋コードを発行し、任意で合言葉を設定する
- 市場、得点、建物、現在の手番、行動履歴は全員で共有する
- 手札の内容は本人のAPI応答だけに含め、他の参加者には枚数だけを表示する
- 手番の本人だけが資源獲得、生産、売買、建物使用、手番終了を操作する
- 建物などで先に10点へ到達したプレイヤーが勝利する
- 部屋とゲーム状態はRedisへ保存し、再読み込みや別端末からの復帰に対応する

## デバッグモード

ロビー上部の共通デバッグボタンから有効化します。ONのホストは最大4人までダミーユーザーを追加でき、全員分の手札を確認しながらダミーの手番を代行できます。OFFに戻すとダミーはロビーから除外されます。

## サーバー側の扱い

- 行動ルールは `lib/northern-branch-game.ts`、actorと手番の権限検証は `lib/northern-branch-room-store.ts` で行う
- Redis更新はrevision付きcompare-and-setで競合を検知する
- APIは個人利用Cookieとログインセッションを毎回確認する
- 1部屋の上限は現在のカード初期値に合わせて4人とする
- 部屋は最終更新から6時間で期限切れになる

## 主なファイル

- ルール処理: `lib/northern-branch-game.ts`
- カード・建物データ: `lib/northern-branch-data.ts`
- 部屋保存と権限: `lib/northern-branch-room-store.ts`
- 保存データ復元: `lib/northern-branch-room-normalizer.ts`
- 手札秘匿・ロビー表示整形: `lib/northern-branch-room-presentation.ts`
- API: `app/api/northern-branch/rooms/route.ts`
- 画面: `app/northern-branch/NorthernBranchGame.tsx`

## 個人利用枠の解除

Vercelにサーバー側環境変数 `PRIVATE_GAME_ACCESS_KEY` を設定し、広場上部の無注釈フィールドへ同じ文字列を入力します。照合後、30日間有効なHttpOnly Cookieが発行されます。
