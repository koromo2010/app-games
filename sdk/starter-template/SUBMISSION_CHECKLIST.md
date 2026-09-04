# Game Fields 提出前チェック

## 仕様

- [ ] `GAME_SPEC.md`に人数、流れ、勝敗、時間切れ、秘密情報を書いた
- [ ] 日本語名と英語名を決めた
- [ ] 未決事項と未実装を明記した

## 安全性

- [ ] 共通モジュールは全件必須から開始し、AIがprofileを変更していない
- [ ] game draftの初期module contractがsystem-default由来であり、人間確認済みと記録していない
- [ ] 初期profileを変更した場合だけproposalを作り、人間が明示確定するまでUIやAppSetを実装していない
- [ ] `get_game_module_requirements`のrevision・digest・SDK versionを固定し、`requiredModuleIds`をdelivery別の公式契約で実利用した
- [ ] disabled moduleを使わず、required moduleごとのsource・API・runtime evidence・非再実装証拠を記録した
- [ ] `server-module.ts`はSDK基本セットとアプリセットの合成だけで、Room作成・参加者・設定・revisionを再実装していない
- [ ] `app-set.ts`にはゲーム固有state、Command、勝敗、固有presentationだけがある
- [ ] Commandは権限、フェーズ、手番、入力値をサーバー契約内で検証する
- [ ] Command payloadを本人証明に使っていない
- [ ] 保存Roomを直接クライアントへ返していない
- [ ] 権限のないRoomViewに秘密情報や内部player IDが出ない
- [ ] DB、Redis、Cookie、APIキー、管理機能へ直接アクセスしていない
- [ ] 古いrevisionが拒否される

## クライアントとPreview

- [ ] `APP_REQUIREMENTS.md`を確認した
- [ ] `mock/index.html`で主要画面と状態を確認できる
- [ ] 共有`game-client.tsx`をprototype fixture adapterと正式`GameFieldsRoom` adapterへ接続し、UIやCommand型を作り直していない
- [ ] 操作プロトタイプで主要操作、状態変化、完了、reset、module利用表を確認した
- [ ] ブラウザ内に正本のゲーム状態やWord DB／LLM bridgeがない
- [ ] PCとスマホ幅で操作できる
- [ ] `MOCK_REVIEW.md`に画面、操作、要件対応、未実装を書いた
- [ ] `mock/preview.json`のゲームID・表示名・説明を今回のゲームへ更新した
- [ ] MCPの`publish_game_package`でAppSetとクライアントを一緒に保存した
- [ ] 正式Preview Roomで別ブラウザ参加、同期、再読込復帰を確認した
- [ ] 利用者が正式Previewを確認した
- [ ] Node.jsで追加検査した場合は`npm run check:mock`が成功し、Node-freeの場合はserver-side prototype gateが成功した

## 動作

- [ ] Node.jsで追加検査した場合は`npm run check`が成功する
- [ ] Node.jsで追加検査した場合は`npm run demo`でダミーだけの1ゲームが最後まで進む
- [ ] Node.jsで追加検査した場合は`npm run diagnose:promotion`が`promotionReady: true`を返す
- [ ] 保存revisionのAppSet source SHA-256とserver bundle SHA-256を記録した
- [ ] ホスト以外にホスト専用操作を拒否するテストがある
- [ ] 終了条件のテストがある
- [ ] Node.jsで追加検査した場合は`npm run package`が成功し、提出ZIPを生成できる

## 権利・依存関係

- [ ] 外部ライブラリとバージョンを記載した
- [ ] 画像、音声、文章、データの出典とライセンスを記載した
- [ ] 参考にした既存ゲームと独自変更点を記載した
- [ ] 再配布できない素材や秘密情報を含めていない

## 提出情報

- ゲームID: `my-first-game`
- SDK version: `__SDK_VERSION__`
- 作成者表示名: 未記入
- 外部依存: TypeScript（開発時のみ）
- 素材ライセンス: 未記入
- 既知の問題: 未記入
