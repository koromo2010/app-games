# Game Fields SDK v__SDK_VERSION__ 最小リファレンス

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
import {
  requireGameSdkContentSource,
  requireGameSdkLlmGateway,
} from "@game-fields/game-sdk/resources";
import type {
  GameSdkContentDifficulty,
  GameSdkWordContent,
  GameSdkWordPairContent,
  GameSdkWordDefinitionContent,
} from "@game-fields/game-sdk/content-source";
```

## Manifest

`defineGameManifest`で次を宣言します。

- `id`: 小文字英数字とハイフン
- `title.ja` / `title.en`
- `playMode`: `online-room` または `local-pass-and-play`
- `minimumPlayers` / `maximumPlayers`
- debug、観戦、replay、rating、LLMの利用有無
- `settings`: 共通設定画面へ表示する、このゲームの設定項目
- `rules`: 共通Shellへ表示する`ja` / `en`のルール一覧

Game Fields SDKの共通初期値は`minimumPlayers: 1`です。1人で開始・確認できる状態を維持し、複数人が必須となるゲーム固有ルールだけをAppSet側で追加検証します。

### 共通設定画面へ出す項目

共通設定画面は、`manifest.settings`へ宣言した項目だけを表示します。「最大人数」「ラウンド数」「難易度」「モード」等はゲームごとの任意項目であり、Platformが固定追加しません。

`online-room`で必須なのは`platformRole: "time-limit"`を持つ制限時間1項目だけです。その`defaultValue`と`options`もゲーム側で決めます。`0`を選択肢へ含める場合は制限なしです。最大人数またはラウンド数を共通Shellの人数上限・表示にも使うゲームだけ、それぞれ`platformRole: "maximum-players"`、`"round-count"`を宣言します。

```ts
settings: [
  {
    key: "timeLimitSeconds",
    label: { ja: "1手の制限時間", en: "Turn time limit" },
    type: "select",
    defaultValue: 45,
    platformRole: "time-limit",
    options: [0, 15, 45, 90],
    unit: { ja: "秒", en: "s" },
  },
]
```

`defaultSettings`は宣言した全項目と同じキーを持ち、各値を`defaultValue`と一致させます。共通画面で変更された値はRoom設定として保存・同期され、Previewのゲーム固有JavaScriptでは`GameFieldsPreset.getState().settings`、本実装のAppSetでは`settings`引数から参照します。iframe内へ同じ設定UIを重複配置しません。

本体統合後は、利用者が現在の宣言済み設定をゲーム別の個人既定値として保存できます。Platformはmanifestにないキー、型違い、未宣言のselect値を保存しません。

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

## 共通timerと手番完了

締切、残り時間、受付猶予、時間切れCommandはSDK基本セットが所有します。ゲーム固有クライアントは表示位置と見た目だけを決め、締切時刻や残り時間を正本として更新しません。

AppSetは部屋設定から制限時間を返し、正常に1手を採用したtransitionで`timer: "reset"`を返します。共通RuntimeはCommand成功後だけ新しい`startedAt`と`deadlineAt`を生成します。入力エラー、AI失敗、権限拒否、revision競合ではtransition自体が保存されないため、時間もリセットされません。

```ts
const appSet = defineGameSdkOnlineRoomAppSet({
  // ...
  timer: {
    durationSeconds(settings) {
      return settings.timeLimitSeconds; // 0は制限なし
    },
    graceMs: 1_500,
  },
  expireAppTurn(room) {
    return {
      phase: "playing",
      app: applyServerTimeout(room.app),
      timer: "reset",
      timedOutPlayerIds: [currentPlayerId(room)],
    };
  },
  applyAppCommand(room, command, context) {
    const next = applyAcceptedTurn(room, command, context);
    return {
      phase: next.complete ? "result" : "playing",
      app: next.app,
      timer: next.complete ? "stop" : "reset",
    };
  },
});
```

閲覧者別RoomViewでは`room.view.common.timer`から`durationSeconds`、`startedAt`、`deadlineAt`、`turnSequence`を読めます。表示はゲーム画面内の任意位置へ置けますが、ブラウザからtimer時刻を送ってサーバー正本を上書きしてはいけません。

正式RoomではShellが`room/expire-timer`を要求し、Runtimeがサーバー時刻、
turn sequence、graceを再検証してから`expireAppTurn`を実行します。2回連続
時間切れの本人だけ5秒制限となり、本人の`room/recover-timeout`で復帰します。

## Word DB resource

単語・ペア・読み・語釈はGame Fields共通Word DBから取得します。ゲームpackageへ初期Word DB、固定単語配列、DB client、接続文字列、SQLを入れません。

クライアントの難易度設定は次の値を保存します。

| 表示 | 値 |
| --- | --- |
| 簡単 | `easy` |
| 普通 | `normal` |
| 難しい | `hard` |

```ts
type Settings = {
  wordDifficulty: GameSdkContentDifficulty;
};

const contentSource = requireGameSdkContentSource(context.resources);
const words = await contentSource.drawWords({
  pool: "general-words",
  difficulty: room.settings.wordDifficulty,
  count: 8,
  excludeIds: room.app.usedWordIds,
});
```

### Request

| API | フィールド |
| --- | --- |
| `drawWords` | `pool: "general-words"`（一般語彙）、`count: 1..100`、`difficulty?`、`excludeIds?`、`excludeSurfaces?` |
| `drawWordPairs` | `pool: "word-pairs"`、`count: 1..100`、`difficulty?`、`excludeIds?` |
| `findDefinitions` | `wordIds`。`drawWords`またはpair内のwordから返されたopaque IDだけを渡す |

`general-words`は単語ゲーム向けに審査した一般語彙です。`word-pairs`の正式名は「審査済みワードペア」です。低認知語彙と、たほい屋の未審査候補・審査結果・採用済みお題はPlatform内部専用で、SDKからは取得できません。表示名と説明は`GAME_SDK_CONTENT_POOL_DEFINITIONS`を参照します。

### Response

| 型・フィールド | 説明 |
| --- | --- |
| `GameSdkWordContent.id` | 除外・語釈取得用のopaque ID。内部DB IDではない |
| `surface` | 表示用の単語表記 |
| `reading` | 登録されている場合の読み。なければ`null` |
| `difficulty` | 返却項目自身の`easy | normal | hard` |
| `tags` | 公開pool等の分類 |
| `GameSdkWordPairContent.id` | ペア単位の既出除外用opaque ID |
| `first` / `second` | ペアを構成する2語 |
| `relation` | 登録されている場合の短い関係説明 |
| `GameSdkWordDefinitionContent.wordId` | 語釈取得元のopaque word ID |
| `definition` | 短いゲーム用語釈 |

`general-words`は、普通で`normal` 80% + `easy` 20%、難しいで`hard` 50% + `normal` 40% + `easy` 10%を混ぜます。このためrequestの難易度と、個々の返却項目の`difficulty`が異なる場合があります。`word-pairs`は指定tierから取得します。

取得に失敗した場合、ローカル固定語彙へfallbackせず、現在の入力・手番を維持して再試行可能なエラーを返します。

## LLM resource

本実装では、ブラウザは「AI回答を生成する」ゲームCommandと質問・履歴等のゲーム入力だけを送ります。審査済みAppSetのserver側が固定promptを組み立て、Game Fieldsから注入された共通LLM gatewayを呼びます。

```ts
const llm = requireGameSdkLlmGateway(context.resources);
const generated = await llm.generate({
  task: "answer-question",
  prompt: buildReviewedPrompt(command.question, room.app.history),
  promptVersion: "answer-question-v1",
  quality: "standard",
  responseJsonSchema: {
    name: "answer",
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
      },
      required: ["answer"],
      additionalProperties: false,
    },
  },
});
```

ゲーム側はprovider、モデル、APIキー、課金元、endpointを指定しません。Game Fieldsが利用者のpersonal／Game Fields提供枠／共有無料枠、provider fallback、認証、レート制限、観測を処理します。promptは20,000文字、JSON Schemaは32,000文字、timeoutは45秒が上限です。Previewでは`quality: "standard"`だけを利用します。

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

共通Lifecycle Commandは`room/join`、`room/leave`、`room/update-settings`、`room/abort`、`room/rematch`、`room/confirm-lobby-return`、`room/expire-timer`、`room/recover-timeout`です。結果後はhostの`room/rematch`でRoomをロビーへ戻し、各参加者の`room/confirm-lobby-return`が揃うまで次ゲームを開始できません。DEBUG対応ゲームでは権限付きホストだけがロビーで`room/debug-add-dummy`、`room/debug-remove-dummy`を使えます。AppSetのCommandは`game/start`のようにゲーム固有namespaceを使い、`room/*`を定義しません。

## 標準結果

結果へ進むtransitionは`defineGameSdkStandardResult`で全参加者の順位、得点、
勝者、終了理由を返します。Platformはこれを共通結果、戦績、rating、
playbackへ使用します。提出がない場合にPlatformが参加順から仮結果を作る
ことはありません。

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
  timer: {
    durationSeconds: number;
    startedAt: number | null;
    deadlineAt: number | null;
    remainingSeconds: number | null;
    running: boolean;
    turnSequence: number;
  };
  players: Array<{ id: string; name: string; role: "host" | "player"; dummy: boolean }>;
};

GameFieldsPreset.getState(): PreviewPlatformState;
GameFieldsPreset.command(name: string, payload?: Record<string, unknown>): void;
GameFieldsPreset.subscribe(listener): () => void;
GameFieldsPreset.registerGame(adapter): () => void;
GameFieldsPreset.resources.contentSource.drawWords(request): Promise<readonly GameSdkWordContent[]>;
GameFieldsPreset.resources.contentSource.drawWordPairs(request): Promise<readonly GameSdkWordPairContent[]>;
GameFieldsPreset.resources.contentSource.findDefinitions(request): Promise<readonly GameSdkWordDefinitionContent[]>;
GameFieldsPreset.resources.llm.generate(request): Promise<GameSdkLlmResponse>;
```

標準Commandは`debug:toggle`、`dummy:add`、`dummy:remove`、`viewer:set`、`phase:set`、`game:start`、`game:abort`、`game:auto-progress`、`game:rematch`です。ゲーム固有コードは`registerGame`で`start`、`abort`、`autoProgress`、`rematch`、`onStateChange`だけを接続します。

Previewでは、ゲームHTMLの任意位置へ`data-gf-timer`を付けると共通timerが`1:00`形式または`制限なし`を描画します。正常に1手を確定した直後だけ`GameFieldsPreset.command("timer:turn-complete")`を呼びます。これは画面確認用のPreview通知です。本体統合後は上記AppSet transitionが同じリセットをサーバー側で行い、ブラウザ通知を正本にしません。

```html
<span class="my-turn-timer" data-gf-timer>制限なし</span>
```

単語を使うモックは、初期配列を作らずPreview bridgeから取得します。

```js
const words = await GameFieldsPreset.resources.contentSource.drawWords({
  pool: "general-words",
  difficulty: selectedDifficulty, // easy | normal | hard
  count: 8
});
renderWords(words);
```

このbridgeは外側Shellがログイン、ゲーム、module profile、レート制限を確認して、本体の読取専用adapterへ中継します。iframeへDB接続、テーブル、内部ID、API URLは渡りません。

LLMを使うモックは次のように呼びます。

```js
const generated = await GameFieldsPreset.resources.llm.generate({
  task: "answer-question",
  prompt: buildPromptFromGameInput(question, history),
  promptVersion: "answer-question-v1",
  quality: "standard"
});
renderAnswer(generated.text);
```

この呼び出しはopaque-origin iframeから外部APIへ直接通信しません。外側Shellが要求を受け、ログイン済みGame Fieldsセッション、確定済みmodule profile、AI利用設定、利用上限を確認して共通gatewayへ中継します。
