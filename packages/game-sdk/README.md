# @game-fields/game-sdk

Game Fieldsのゲーム固有部分を、本番DB・Redis・認証・管理権限へ接続せずに開発するための公開契約です。

現在はDeveloper Previewです。packageは単体でbuild・pack・install検証できますが、npm registryにはまだ公開していません。

## Exports

- `@game-fields/game-sdk`: manifest、Controller、Command、Room/View契約
- `@game-fields/game-sdk/runtime`: ゲーム側server module契約とrevision helper
- `@game-fields/game-sdk/mock-runtime`: DB不要のメモリRuntimeと契約エラー
- `@game-fields/game-sdk/client-runtime`: 採用済みゲームをGame Fieldsの認証済みRoom APIへ接続するbrowser transport

## Example

```ts
import {
  GAME_SDK_VERSION,
  defineGameManifest,
  type GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import {
  advanceGameSdkRoom,
  defineGameServerModule,
} from "@game-fields/game-sdk/runtime";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { createGameSdkHttpClientRuntime } from "@game-fields/game-sdk/client-runtime";
```

Commandの実行者IDと表示名はpayloadから受け取らず、Runtimeが署名済みセッションから解決したtrusted actorを使います。保存Roomは必ず`presentRoom`で閲覧者別Viewへ変換してください。

Game Fieldsへの統合後は、platformが`gameId`とゲームごとのendpointを指定して`createGameSdkHttpClientRuntime`を生成します。Client Runtimeは作成・取得・expected revision付きCommandに加え、active room、参加可能な部屋一覧、ロビー／結果後の解散、revision通知の購読を提供します。WebSocketは状態ではなくrevisionだけを運び、通知後はHTTPで閲覧者別RoomViewを再取得します。

Client Runtimeが送るのは部屋コード、作成input、expected revision付きCommandだけです。actor ID、表示名、debug資格は入力に持たず、同一originの署名済みHttpOnly Cookieからserver側が解決します。

外部開発者がこのpackageを使って作成したゲームは、Game Fields管理下の検査・審査・dev実プレイ確認を経たものだけが公開対象になります。このpackageは`develop`、`main`、Vercel、DB等への書き込み権限を付与しません。
