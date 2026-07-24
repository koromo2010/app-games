# @game-fields/game-sdk

Game Fieldsのゲーム固有部分を、本番DB・Redis・認証・管理権限へ接続せずに開発するための公開契約・再利用ライブラリです。

現在はDeveloper Previewです。packageは単体でbuild・pack・外部install検証でき、npm public packageとして公開できる構成です。

```bash
npm install @game-fields/game-sdk
```

## Exports

- `@game-fields/game-sdk`: manifest、Controller、Command、Room/View契約
- `@game-fields/game-sdk/runtime`: SDK基本セット、AppSet合成、低水準server module契約
- `@game-fields/game-sdk/modules`: 既存共通モジュールの一覧と、複数ゲームで共有する純粋な進行部品
- `@game-fields/game-sdk/content-source`: Platform注入型のワード・ペア・語釈供給契約
- `@game-fields/game-sdk/llm`: Platform注入型の共通LLM gateway契約
- `@game-fields/game-sdk/resources`: privileged resourceの注入contextと必須resource guard
- `@game-fields/game-sdk/playing-cards`: カード型、デッキ、シャッフル、配札、秘密手札投影
- `@game-fields/game-sdk/playing-cards-react`: カード、手札、裏向きカード束のReact UI
- `@game-fields/game-sdk/drawing`: ストローク、正規化、塗りつぶし、レイヤー・機能preset
- `@game-fields/game-sdk/drawing-react`: マウス・タッチ・ペン対応のCanvas、ツールバー、レイヤーReact UI
- `@game-fields/game-sdk/mock-runtime`: DB不要のメモリRuntimeと契約エラー
- `@game-fields/game-sdk/client-runtime`: 採用済みゲームをGame Fieldsの認証済みRoom APIへ接続するbrowser transport
- `@game-fields/game-sdk/handshake`: SDK環境・release・契約schema・必須capabilityの接続前互換性判定

## Example

```ts
import {
  GAME_SDK_VERSION,
  defineGameManifest,
} from "@game-fields/game-sdk";
import {
  createGameSdkOnlineRoomModule,
  defineGameSdkOnlineRoomAppSet,
} from "@game-fields/game-sdk/runtime";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { createGameSdkHttpClientRuntime } from "@game-fields/game-sdk/client-runtime";
import { negotiateGameSdkHandshake } from "@game-fields/game-sdk/handshake";
```

## Word/content source

ワードDBそのものや接続情報は公開packageへ含めません。ゲームは公開型をimportし、Game Fieldsがcontextへ注入するadapterだけを使います。

```ts
import { requireGameSdkContentSource } from "@game-fields/game-sdk/resources";

async function createRound(context: GameSdkCommandContext) {
  const words = await requireGameSdkContentSource(context.resources).drawWords({
    pool: "general-words",
    difficulty: "normal",
    count: 8,
  });
  return words.map((word) => word.surface);
}
```

SDKが公開するpool IDは`general-words`と`word-pairs`だけです。画面と仕様書では、`GAME_SDK_CONTENT_POOL_DEFINITIONS`の正式名を使います。

| pool ID | 正式名 | 定義 |
| --- | --- | --- |
| `general-words` | 一般語彙 | 単語ゲーム向けに利用可否と難易度を審査した一般的な単語 |
| `word-pairs` | 審査済みワードペア | 2語の関係と距離を審査したワードウルフ向けペア |

低認知語彙、たほい屋の未審査候補、審査結果、採用済みお題はGame Fields内部専用です。公開SDKの型・定数・APIからは指定できず、文字列を直接送っても拒否されます。

難易度の保存・API値は`easy | normal | hard`、利用者向け表示は「簡単・普通・難しい」です。`general-words`は普通で標準80%＋簡単20%、難しいで難しい50%＋標準40%＋簡単10%を混ぜます。返却された`word.difficulty`は各項目自身のtierです。

`GameSdkWordContent`はopaque `id`、表示用`surface`、任意の`reading`、実際の`difficulty`、公開`tags`を返します。pairはopaque `id`、`first`、`second`、`difficulty`、任意の`relation`、definitionは`wordId`、`surface`、短い`definition`を返します。opaque IDは除外と語釈取得にだけ使い、解析やDBキー化をしません。

SDK Previewでは同じ契約が`GameFieldsPreset.resources.contentSource`へ注入されます。単語ゲームのモックも固定単語配列や初期DBを作らず、ここから取得します。

## LLM

ゲームはprovider clientやAPIキーを持たず、Game Fieldsがserver contextへ注入したgatewayだけを使います。ブラウザはゲームCommandとゲーム入力だけを送り、審査済みAppSetが固定promptを組み立てます。

```ts
import { requireGameSdkLlmGateway } from "@game-fields/game-sdk/resources";

async function answerQuestion(
  context: GameSdkCommandContext,
  question: string,
  history: readonly string[],
) {
  return requireGameSdkLlmGateway(context.resources).generate({
    task: "answer-question",
    prompt: buildReviewedPrompt(question, history),
    promptVersion: "answer-question-v1",
    quality: "standard",
  });
}
```

Game Fieldsがpersonal／Game Fields提供枠／共有無料枠、provider fallback、認証、レート制限、観測を処理します。Previewのゲーム固有iframeは事業者APIを直接呼ばず、外側Shellの`GameFieldsPreset.resources.llm.generate`から同じrequest／response契約を確認します。

## Room settings

`manifest.settings` is the app-owned declaration for the shared room settings screen. The Platform renders only the declared fields; it does not add maximum-player or round-count inputs automatically.

`manifest.rules` is the app-owned localized rule list. The shared Shell renders
these rules without requiring a second game-specific rules panel. Signed-in
players may save the current declared settings as their defaults for the next
room; undeclared keys and invalid option values are discarded by the Platform.

Every `online-room` manifest must declare exactly one setting with `platformRole: "time-limit"`. The app owns that setting's `defaultValue` and `options`, including whether `0` is offered as no limit. Other fields are optional. Use `platformRole: "maximum-players"` or `"round-count"` only when the shared shell needs those meanings.

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

`defaultSettings` must contain exactly the same keys and values as each declaration's `defaultValue`. The shared screen saves the selected values to room settings and exposes the same values to the app.

## Turn timer

AppSetは制限時間の取得方法だけを登録し、正常に1手を採用したtransitionで`timer: "reset"`を返します。SDK基本セットがサーバー時刻から次の`startedAt`と`deadlineAt`を生成し、`RoomView.common.timer`へ投影します。拒否されたCommand、入力エラー、AI失敗では保存transitionがないためdeadlineも変わりません。

```ts
const appSet = defineGameSdkOnlineRoomAppSet({
  // ...
  timer: {
    durationSeconds: (settings) => settings.timeLimitSeconds,
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

ゲーム固有クライアントはtimerの表示位置と見た目を選べますが、ブラウザから締切時刻や残り秒数を正本として送信しません。

正式Room Shellはdeadlineと`turnSequence`だけを使って
`room/expire-timer`を要求します。Runtimeはdeadline＋graceをサーバー時刻
で再検証し、2回連続で時間切れになった本人だけを5秒へ短縮します。
短縮解除は本人の`room/recover-timeout`だけです。

## Standard result and platform persistence

ゲーム終了transitionは`standardResult`へ全参加者の順位・得点・勝者・終了理由
を返します。Platformはこの契約を共通結果、戦績、レーティング、
プレイバックへ一度だけ保存します。結果がない場合、Shellは参加順から
仮順位や仮得点を生成しません。

```ts
standardResult: defineGameSdkStandardResult({
  winnerIds: [winnerId],
  rankings: room.players.map((player) => ({
    participantId: player.id,
    rank: player.id === winnerId ? 1 : 2,
    score: scores[player.id] ?? 0,
  })),
  reason: "target-reached",
}, {
  participantIds: room.players.map((player) => player.id),
})
```

承認済みonline-roomゲームは`/sdk-games/<game-id>`の正式Shellで動作します。
Cookie認証、Redis CAS、active room、一覧、Realtime、観戦grant、DEBUG権限、
結果保存はPlatformが所有し、ゲームpackageや隔離Previewは直接書き込みません。

## Playing cards

```ts
import {
  createStandardPlayingCardDeck,
  dealPlayingCardsRoundRobin,
  presentPlayingCardHands,
  shufflePlayingCards,
} from "@game-fields/game-sdk/playing-cards";

const deck = shufflePlayingCards(
  createStandardPlayingCardDeck({ jokersPerDeck: 2 }),
);
const { hands, stock } = dealPlayingCardsRoundRobin(
  deck,
  ["player-a", "player-b"],
);
const safeHands = presentPlayingCardHands(hands, "player-a");
```

React UIは`@game-fields/game-sdk/playing-cards-react`から`PlayingCardView`、`PlayingCardHand`、`PlayingCardBackStack`を利用できます。

## Drawing

```tsx
import { useState } from "react";
import type { DrawingStroke } from "@game-fields/game-sdk/drawing";
import {
  DrawingCanvas,
  DrawingToolbar,
} from "@game-fields/game-sdk/drawing-react";

export function Board() {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  return (
    <div style={{ width: 800, height: 600 }}>
      <DrawingCanvas
        strokes={strokes}
        color="#0f172a"
        width={2}
        opacity={1}
        tool="pen"
        onStrokeComplete={(stroke) =>
          setStrokes((current) => [...current, stroke])
        }
      />
    </div>
  );
}
```

`DrawingToolbar`と`DrawingLayerPanel`を組み合わせると、ペン・消しゴム・スポイト・塗りつぶし・パン、色・太さ・透明度、undo/redo、拡大縮小、全画面、レイヤー選択・表示を共通UIで構成できます。

保存、Room同期、誰が消せるかという認可はUIへ内蔵していません。`DrawingStroke`をゲームstateへ保存し、Command側で権限を検証します。

オンラインゲームは`SDK基本セット + AppSet`で構成します。基本セットが認証済みRoom、参加・退出、設定、revision、共通View、中断・再戦を所有し、AppSetはゲーム固有state、Command、勝敗、固有Viewだけを登録します。新規ゲームで`createRoom`や参加者配列を再実装する必要はありません。

新規モックの共通モジュールは全項目を`required`で開始します。AppSetや制作AIは必須一覧を変更できません。モック承認後はSDKが返す`requiredModuleIds`をすべて使います。この一覧は新しい共通機能の実装ではなく、Game Fields本体で既に使われているRoom Runtime、Route、共通UI、進行部品をAppSetへ合成する採用レシピです。

MCPの`initialize`やOAuth成功だけではSDK互換性の合意になりません。AI、スターター、browser Runtimeは制作者操作・Room操作より先にGame Fields SDK handshakeを行い、接続環境、Platform／package release、contract schema、必須capabilityが一致した場合だけ後続処理へ進みます。

Commandの実行者IDと表示名はpayloadから受け取らず、Runtimeが署名済みセッションから解決したtrusted actorを使います。保存Roomは必ず`presentRoom`で閲覧者別Viewへ変換してください。

Game Fieldsへの統合後は、platformが`gameId`とゲームごとのendpointを指定して`createGameSdkHttpClientRuntime`を生成します。Client Runtimeは作成・取得・expected revision付きCommandに加え、active room、参加可能な部屋一覧、ロビー／結果後の解散、revision通知の購読を提供します。WebSocketは状態ではなくrevisionだけを運び、通知後はHTTPで閲覧者別RoomViewを再取得します。

Client Runtimeが送るのは部屋コード、作成input、expected revision付きCommandだけです。actor ID、表示名、debug資格は入力に持たず、同一originの署名済みHttpOnly Cookieからserver側が解決します。

外部開発者がこのpackageを使って作成したゲームは、Game Fields管理下の検査・審査・dev実プレイ確認を経たものだけが公開対象になります。このpackageは`develop`、`main`、Vercel、DB等への書き込み権限を付与しません。

SDKコードはMIT Licenseです。Game Fieldsのサービス利用、ゲーム提出、審査・公開は別途Platform側の規約と管理ゲートに従います。
