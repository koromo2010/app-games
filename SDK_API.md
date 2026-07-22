# Game Fields SDK v0.1.0 最小リファレンス

## Imports

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
import {
  createGameSdkMockRuntime,
  GameSdkRuntimeError,
} from "@game-fields/game-sdk/mock-runtime";
```

## Manifest

`defineGameManifest`で次を宣言します。

- `id`: 小文字英数字とハイフン
- `title.ja` / `title.en`
- `playMode`: `online-room` または `local-pass-and-play`
- `minimumPlayers` / `maximumPlayers`
- debug、観戦、replay、rating、LLMの利用有無

## Stored Room

保存するRoomは最低限、次を持ちます。

```ts
type Room = GameSdkStoredRoom & {
  code: string;
  revision: number;
  phase: string;
};
```

Command成功時は`advanceGameSdkRoom(room, updates)`を使い、revisionをちょうど1増やします。

## Trusted actor

`createRoom`と`applyCommand`の`context.actor`は、Game Fieldsが署名済みセッションから解決した本人です。

```ts
context.actor.playerId
context.actor.displayName
context.actor.role // host | player
context.actor.debugAccess
```

これらをブラウザから送られたCommand payloadで上書きしてはいけません。

## Server module

```ts
defineGameServerModule({
  manifest,
  createRoom(input, context) {
    // revision 1のRoomを返す
  },
  applyCommand(room, command, context) {
    // 権限、フェーズ、手番、入力を検証して次のRoomを返す
  },
  presentRoom(room, context) {
    // context.viewerに見せてよいRoomViewだけを返す
  },
});
```

## Mock Runtime

`createGameSdkMockRuntime`はDB不要のメモリ実装です。Room作成、閲覧、revision付きCommand、古いrevision拒否をテストできます。

Mock Runtimeはローカルテスト用であり、本番Redisや認証への接続権限を持ちません。

## Preview preset API

SDK Previewでは`window.GameFieldsPreset`が自動で利用できます。`script`タグを自分で追加する必要はありません。

```ts
type PreviewPlatformState = {
  roomCode: string;
  phase: "lobby" | "playing" | "result";
  debugOpen: boolean;
  debugAccess: boolean;
  viewerId: string;
  players: Array<{ id: string; name: string; role: "host" | "player"; dummy: boolean }>;
};

GameFieldsPreset.getState(): PreviewPlatformState;
GameFieldsPreset.command(name: string, payload?: Record<string, unknown>): void;
GameFieldsPreset.subscribe(listener): () => void;
GameFieldsPreset.registerGame(adapter): () => void;
```

標準Commandは`debug:toggle`、`dummy:add`、`dummy:remove`、`viewer:set`、`phase:set`、`game:start`、`game:abort`、`game:auto-progress`、`game:rematch`です。ゲーム固有コードは`registerGame`で`start`、`abort`、`autoProgress`、`rematch`、`onStateChange`だけを接続します。
