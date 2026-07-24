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

`general-words`、`word-pairs`、`rare-words`は公開pool IDです。実際に利用できるpoolは審査済みmodule profileとゲーム権限でPlatform側が制限します。

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
