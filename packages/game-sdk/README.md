# @game-fields/game-sdk

Game Fieldsのゲーム固有部分を、本番DB・Redis・認証・管理権限へ接続せずに開発するための公開契約です。

現在はDeveloper Previewです。packageは単体でbuild・pack・install検証できますが、npm registryにはまだ公開していません。

## Exports

- `@game-fields/game-sdk`: manifest、Controller、Command、Room/View契約
- `@game-fields/game-sdk/runtime`: ゲーム側server module契約とrevision helper
- `@game-fields/game-sdk/mock-runtime`: DB不要のメモリRuntimeと契約エラー

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
```

Commandの実行者はpayloadから受け取らず、Runtimeが署名済みセッションから解決したtrusted actorを使います。保存Roomは必ず`presentRoom`で閲覧者別Viewへ変換してください。

外部開発者がこのpackageを使って作成したゲームは、Game Fields管理下の検査・審査・dev実プレイ確認を経たものだけが公開対象になります。このpackageは`develop`、`main`、Vercel、DB等への書き込み権限を付与しません。
