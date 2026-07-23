# Game Fields SDK v0.1.0 最小リファレンス

## SDK handshake

制作クライアントはスターター取得前にDownloadMeの指示で`get_sdk_handshake`を実行済みである必要があります。`starter-manifest.json`の`sdkHandshakeVersion`、`platformVersion`、`sdkVersion`、`sdkContractVersion`がhandshake成功時のreleaseと一致しない場合は実装を始めません。

MCP `initialize`はMCP transport、OAuthは本人認証、Game Fields SDK handshakeは環境・release・契約・capabilityの互換性をそれぞれ担当します。いずれかを他の代わりに使ってはいけません。ゲーム固有コードはhandshakeやOAuthを再実装せず、公開SDKとPlatformから注入されたRuntimeだけを利用します。

## Imports

```ts
import {
  GAME_SDK_VERSION,
  defineGameManifest,
} from "@game-fields/game-sdk";
import {
  createGameSdkOnlineRoomModule,
  defineGameSdkOnlineRoomAppSet,
  type GameSdkOnlineRoom,
  type GameSdkOnlineRoomCommand,
  type GameSdkOnlineRoomCreateInput,
  type GameSdkOnlineRoomView,
} from "@game-fields/game-sdk/runtime";
import {
  GAME_SDK_MODULE_CATALOG,
  allGameSdkParticipantsComplete,
  nextGameSdkEligibleSeat,
  tallyGameSdkVotes,
} from "@game-fields/game-sdk/modules";
import {
  createGameSdkMockRuntime,
  GameSdkRuntimeError,
} from "@game-fields/game-sdk/mock-runtime";
import {
  createGameSdkHttpClientRuntime,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
```

## Manifest

`defineGameManifest`で次を宣言します。

- `id`: 小文字英数字とハイフン
- `title.ja` / `title.en`
- `playMode`: `online-room` または `local-pass-and-play`
- `minimumPlayers` / `maximumPlayers`
- debug、観戦、replay、rating、LLMの利用有無

## SDK基本セット + AppSet

新しいオンラインゲームは、Room全体を実装せずゲーム固有の`AppSet`を登録します。

```ts
const appSet = defineGameSdkOnlineRoomAppSet({
  manifest,
  defaultSettings,
  normalizeSettings(settings) {
    return settings;
  },
  createAppState(input, context, settings) {
    return createGameSpecificState(input, context, settings);
  },
  resetAppState(room) {
    return resetGameSpecificState(room.app);
  },
  applyAppCommand(room, command, context) {
    return runAuthorizedGameCommand(room, command, context);
  },
  presentApp(room, context) {
    return {
      view: createViewerSafeGameView(room, context.viewer),
      canSeeSecret: false,
    };
  },
});

export const serverModule = createGameSdkOnlineRoomModule(appSet);
```

SDK基本セットが次を所有します。

- Room作成、ホスト、参加・退出、設定更新
- `code`、revision、人数上限
- 開始前へ戻す中断、結果後の再戦
- 共通permissionsと内部player IDを除いた共通View
- 本体統合後の認証、保存、active room、一覧、Realtime、解散

AppSetが所有するのはゲーム固有state、ゲーム固有Command、フェーズ・勝敗、ゲーム固有Viewだけです。AppSetは`code`、revision、参加者配列、共通設定を更新できません。

## 共通モジュールprofile

最初のモックは`GAME_SDK_MODULE_CATALOG`の全件を必須としてPlatformが保存します。`mock/preview.json`、AppSet、manifestへmodule採否を表す独自キーを書いてはいけません。

制作AIが利用できるMCPは`get_game_module_requirements`による参照だけです。profileの変更はSDK-devの人間向け管理に限定します。AIは内部分類を推測せず、人間のレビュー後に返される`requiredModuleIds`をすべて使うAppSetを実装します。

提出完了、投票集計、次の手番、ラウンド、役職・チーム割当、内部IDからseatへの変換、標準結果は`@game-fields/game-sdk/modules`の純粋関数を利用します。同じ処理をAppSetへ複製しません。

主な合成型は次です。

```ts
type Room = GameSdkOnlineRoom<Settings, AppState>;
type CreateInput = GameSdkOnlineRoomCreateInput<Settings, AppInput>;
type Command = GameSdkOnlineRoomCommand<Settings, AppCommand>;
type RoomView = GameSdkOnlineRoomView<Settings, AppView>;
```

共通Lifecycle Commandは`room/join`、`room/leave`、`room/update-settings`、`room/abort`、`room/rematch`です。AppSetのCommandは`game/start`のようにゲーム固有namespaceを使い、`room/*`を定義しません。

## Trusted actor

`createRoom`と`applyCommand`の`context.actor`は、Game Fieldsが署名済みセッションから解決した本人です。

```ts
context.actor.playerId
context.actor.displayName
context.actor.role // host | player
context.actor.debugAccess
```

これらをブラウザから送られたCommand payloadで上書きしてはいけません。

## AppSet

```ts
applyAppCommand(room, command, context) {
  // 権限、フェーズ、手番、入力を検証する
  return {
    phase: "playing",
    app: nextGameSpecificState,
  };
}
```

`applyAppCommand`は次のゲーム固有stateとphaseだけを返します。revisionはSDK基本セットがちょうど1増やします。`presentApp`は固有Viewだけを返し、共通RoomViewはSDK基本セットが合成します。

## Mock Runtime

`createGameSdkMockRuntime`はDB不要のメモリ実装です。Room作成、閲覧、revision付きCommand、古いrevision拒否をテストできます。

Mock Runtimeはローカルテスト用であり、本番Redisや認証への接続権限を持ちません。

## Client Runtime

採用後のGame Fields統合では、platformが審査登録済みゲームのendpointを指定してbrowser Runtimeを生成します。

```ts
const runtime = createGameSdkHttpClientRuntime<CreateInput, Command, RoomView>({
  gameId: "<game-id>",
  endpoint: "/api/game-sdk/<game-id>/rooms",
});

const room = await runtime.createRoom({
  roomCode: "ABCD",
  create: { /* ゲーム固有input */ },
});

await runtime.sendCommand(room.code, {
  expectedRevision: room.revision,
  command: { type: "game/start" },
});

const activeRoom = await runtime.readActiveRoom();
const lobbyPage = await runtime.listRooms();
const watch = runtime.watchRoom(room.code, {
  onRoom(nextRoom) {
    // revision通知後に再取得された閲覧者別RoomView
  },
});

// 画面破棄時
watch.close();
```

`dissolveRoom(code)`はhostがロビーまたは結果後に使い、`dissolveHostedRooms()`は同じ条件でhost所有Roomを整理します。`watchRoom`のWebSocket通知はゲームID、部屋コード、revision、時刻だけを運び、Room状態や秘密情報を運びません。接続不能時はポーリングへフォールバックします。

Client Runtimeへactor ID、表示名、debug資格を渡す引数はありません。Game Fieldsが同一originの署名済みHttpOnly Cookieから本人を解決し、server moduleの`context.actor`へ注入します。404のRoom取得は`null`、認証・競合・入力拒否はstatusと安全なcodeを持つ`GameSdkHttpClientRuntimeError`になります。

未審査の隔離PreviewはこのRoom APIへ接続しません。Previewで保存したHTMLやmetadataがserver moduleとして動的に実行されることもありません。

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
