# 外部開発者向けゲームパッケージ構想

## 目的

将来、Game Fields本体の認証・個人情報・DB・運用基盤を渡さず、ゲーム部分だけを他の開発者へ依頼できるようにする。

## 境界

外部開発者が担当する範囲はゲーム固有パッケージ内に限定する。

```text
packages/
  game-sdk/       公開可能な型、共通UI、テスト用アダプター
  game-runtime/   Game Fields内部の認証、部屋、戦績、監査

games/
  <game-id>/
    manifest.ts
    domain/
    client/
      use<Game>Controller.ts
      <Game>DesktopLayout.tsx
      <Game>MobileLayout.tsx   # 必要になるまで未作成
      permissions.ts
    server/
      commands.ts
      presentation.ts
    locales/
    tests/
```

当面は既存のNext.js配置を維持しつつ、この依存方向へ段階的に寄せる。最初からmonorepo移動を行わない。

## 現在の実装段階

SDK v1の公開型、認可済みactorを受けるserver module契約、閲覧者別presentation、メモリMock Runtime、manifest検証、生成雛形、import境界検査は`lib/game-sdk*.ts`と`scripts/create-game.mjs`へ実装済み。Cookie認証、Redis、DB、管理機能には依存していない。

本体のオンラインRoomへ接続するplatform adapter、SDK専用Vercel環境、外部配布用package、Developer Portalは次段階であり、現時点では実装済みと扱わない。

## 外部へ公開するもの

- ゲームSDKの型
- 共通ボタン、トップバー、ルールダイアログ等のUI
- Roomの公開View型
- Command送信用の限定クライアント
- ローカル用のモックRuntime
- i18nインターフェース
- テスト用fixture
- ゲーム登録manifestのschema

## 外部へ公開しないもの

- DB接続情報
- Redisキーと永続化実装
- Cookie署名・認証秘密鍵
- 管理者・デバッグ資格判定
- 個人情報
- LLM APIキー
- 通報・モデレーション内部情報
- 戦績の直接書き込み
- 本番環境変数

## 依存ルール

```text
Game package -> game-sdk
Game package -> 許可されたruntime interface
Game package -X-> DB / Redis / account store / admin store
Platform runtime -> Game package manifest / commands / presentation
```

ゲーム側はGame Fields内部storeをimportせず、Runtimeから渡されたinterfaceだけを利用する。

## UI標準

外部ゲームも次の三層を必須とする。

```text
Game entry
  -> Controller
  -> DesktopLayout / MobileLayout
```

UI権限はControllerがpermissionsとして計算する。ただし最終認可はサーバーCommandで再検証する。

## 導入順

1. WordWolfでController・DesktopLayout・permissionsの基準を確立（完了）
2. manifestとRuntimeのTypeScript契約を作る（完了）
3. メモリMock Runtimeと契約テストを作る（完了）
4. import境界をlintで監査する（完了）
5. テンプレートゲームをRuntime契約対応にする（完了）
6. 小規模オンラインゲームでplatform adapterを実証する
7. 後から`packages/game-sdk`へ物理分離する

## 完了条件

外部開発者が、本番DBやアカウント実装へ触れずに次を実行できること。

- ローカルでゲーム開始
- ダミープレイヤーを使った全進行テスト
- DesktopLayoutの確認
- Command単体テスト
- 多言語文言の追加
- manifest検証

統合時にはGame Fields側が認証、部屋永続化、デバッグ権限、戦績、リプレイ、広告、通報、監査を注入する。
