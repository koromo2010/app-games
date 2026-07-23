# UIアーキテクチャ（スマホ対応準備）

## 目的

現時点ではスマホ専用UIを作らず、現在のPC表示・デザイン・挙動を維持したまま、将来UIだけを差し替えられる境界を作る。

## 標準三層

各ゲーム画面は次の三層を標準とする。

```text
<Game>Game
  -> use<Game>Controller
  -> <Game>DesktopLayout
```

将来は入口だけを次のように切り替える。

```tsx
return isMobile
  ? <GameMobileLayout controller={controller} />
  : <GameDesktopLayout controller={controller} />;
```

MobileLayoutは必要になるまで作らない。

## 共通ページ遷移

- アプリ内ページリンクは `AppLink` を使い、現在のlocaleをURLへ付けたまま移動する。
- `RouteTransitionProvider` は遷移開始から120msを超えた場合だけ `PageLoadingOverlay` を表示する。短い遷移では表示せず、ローディングUI自体の点滅を避ける。
- App Routerのsegment待機は `app/loading.tsx`、オンラインゲームの初期セッション／部屋復元は同じ `PageLoadingOverlay` を使う。
- ボタン内の短い保存処理やゲーム内フェーズ更新は従来の局所pending表示を使い、ページ遷移用オーバーレイと混ぜない。

## 共通デバッグメニュー

- ホスト向け `DebugModeButton` は `GameTopBanner` に直接置き、DEBUGボタンから開く共通画面内ウィンドウをデバッグ操作の唯一の入口とする。
- 画面内ウィンドウは非モーダルとし、ゲーム画面を操作可能なまま使う。PCでは移動・サイズ変更・最小化・閉じるに対応し、ウィンドウ外の左クリックまたはタップでクリック先の操作を妨げず自動的に最小化する。狭い画面ではビューポート内へ固定して誤操作を避ける。
- ダミーの追加・削除、代理操作対象の切替、フェーズ固有の一括入力、進行補助、プレイバック、中断、行動ログは画面内ウィンドウへ置く。通常のLayoutやフェーズ部品にはデバッグ状態の説明だけを残せる。
- ゲーム固有操作は `gameTools`、DBを使うワード・お題生成テストは任意の `wordGenerationTools` として注入する。DB機能を持たないゲームは後者を渡さない。
- ワード生成テストはゲームを開始せず、Room、ラウンド、出題済み履歴を変更しない。候補生成・審査そのものが検査対象の場合だけ、ゲーム専用または共通の候補DBへ結果を保存できる。

## 共通AI通信バイタル

- AI APIを呼ぶ可能性があるクライアント操作は、共通`aiActivityFetch`または`withAiActivity`を通す。
- `GameTopBanner`は共通`AiActivityVital`を持ち、AI通信中だけシアンの発光・脈動を強める。利用するAPI設定により個人APIまたはGame Fields提供枠の利用量が発生し得ることをtitleで説明する。
- 同時に複数の生成・判定が進んだ場合は参照数で管理し、最後の処理が終了するまで通信中表示を維持する。ゲームLayoutが個別に表示状態を持たない。

## 共通部屋操作

- `OnlineRoomLifecycleActions`をロビー・プレイ中・結果の部屋操作ポリシーとする。
- ロビーはホストの「部屋を解散」、プレイ中は部屋操作なし、結果は「部屋に戻る／広場へ戻る／部屋を解散」を表示する。
- 結果画面の具体的なpending制御と遷移確認は内部の`RoomResultActions`、サーバー側の最終認可は`canDissolveOnlineRoom`とゲームStoreが担当する。

## Controller層

Controllerは次を束ねる。

- state
- session
- polling / room同期
- actions
- ViewModel
- UI用permissions

Layoutは通信、永続化、API URL、Cookie、Redis、サーバーCommandを直接扱わない。

## 権限層

Layoutや子コンポーネントでホスト・手番・秘密表示などを組み合わせて判定しない。ControllerがUI表示専用のpermissionsを渡す。

例：

```ts
permissions.canStartGame
permissions.canEditRoomSettings
permissions.canVote
permissions.canSubmitClue
permissions.canSubmitFinalAnswer
permissions.canAbort
permissions.canSeeSecret
permissions.canDebug
permissions.canDissolve
```

これは表示と操作可否を整えるための補助層であり、セキュリティ境界ではない。最終認可は従来どおりサーバーCommand側で行う。

## DesktopLayout

現在の配置、CSS class、表示順、挙動をそのまま保持する。構造分離時にレスポンシブ調整やデザイン変更を同時に行わない。

## 基準実装

WordWolfを最初の基準実装とする。

- `app/wordwolf/WordWolfGame.tsx`
- `app/wordwolf/use-wordwolf-controller.ts`
- `app/wordwolf/wordwolf-view-permissions.ts`
- `app/wordwolf/WordWolfDesktopLayout.tsx`

## 横展開状況

登録済みの全9ゲームは標準三層へ移行済み。

| ゲーム | Entry | Controller | DesktopLayout |
| --- | --- | --- | --- |
| WordWolf | `WordWolfGame.tsx` | `use-wordwolf-controller.ts` | `WordWolfDesktopLayout.tsx` |
| Word Scale | `HodoaiTalkGame.tsx` | `use-hodoai-controller.ts` | `HodoaiDesktopLayout.tsx` |
| Word Out | `NigoichiGame.tsx` | `use-nigoichi-controller.ts` | `NigoichiDesktopLayout.tsx` |
| Code Intercept | `CodeInterceptGame.tsx` | `use-code-intercept-controller.ts` | `CodeInterceptDesktopLayout.tsx` |
| Tahoiya | `TahoiyaGame.tsx` | `use-tahoiya-controller.ts` | `TahoiyaDesktopLayout.tsx` |
| Word Sonar | `KotobaSenpukuGame.tsx` | `use-kotoba-senpuku-controller.ts` | `KotobaSenpukuDesktopLayout.tsx` |
| Northern Branch | `NorthernBranchGame.tsx` | `use-northern-branch-controller.ts` | `NorthernBranchDesktopLayout.tsx` |
| Canvas | `CanvasGame.tsx` | `use-canvas-controller.ts` | `CanvasDesktopLayout.tsx` |
| Daifugo | `DaifugoGame.tsx` | `use-daifugo-controller.ts` | `DaifugoDesktopLayout.tsx` |

各EntryはController生成とLayout選択だけを行う。`config/game-registry.json`の`moduleBoundaryFiles`を境界の正本とし、`scripts/check-game-standards.mjs`が全登録ゲームについてEntryの薄さ、Controller・DesktopLayout・permissionsの存在、DesktopLayoutへの通信混入を検査する。新しいゲームを登録した場合も同じ三層が必須になる。今後の移行でも見た目・ルール・API契約を同時に変えない。
