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
