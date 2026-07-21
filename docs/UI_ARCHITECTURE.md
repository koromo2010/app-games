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

## 横展開順

1. Word Scale
2. Word Out
3. Code Intercept
4. Tahoiya
5. Word Sonar

各移行では見た目・ルール・API契約を変えず、構造変更だけを行う。
