# Game Fields SDK モジュールカタログ

ゲームをゼロから作り直さず、ここにある公式モジュールを組み合わせます。最初のモックでは全moduleが必須です。AIは採否を決めず、同等機能をAppSetへ再実装しません。

## 初期profile

- 初回モック保存時にPlatformが38件すべてを`required`として付与する。
- `mock/preview.json`、manifest、AppSet、管理トークン、MCPから必須一覧を変更できない。
- モック承認後、AIは読み取り専用`get_game_module_requirements`で返る`requiredModuleIds`と各moduleの`delivery`、`packageExports`、`publicApis`、`usage`を正本としてAppSetを作る。

機械可読な正本は`@game-fields/game-sdk/modules`の`GAME_SDK_MODULE_CATALOG`です。

## 利用区分

- **SDK標準**: スターターで利用でき、ゲーム固有部分から再実装しない。
- **本体統合時に利用**: Game Fields本体には実装済み。外部スターターから内部ファイルをコピーせず、`SDK_REQUESTS.md`へ利用希望を記録する。
- **未提供**: 新しい共通化候補。ゲーム内へ場当たり的に複製せず、必要なinterfaceを`SDK_REQUESTS.md`へ記録する。

## 共通UI

| モジュール | 区分 | 提供するもの |
| --- | --- | --- |
| 標準プレビューシェル | SDK標準 | 保存URLの外側でゲーム広場、ゲームカード、入室前、部屋ロビー、ゲーム領域、結果から同じ部屋へ戻る導線を提供。ゲームpackageには含めない |
| ゲーム共通ヘッダー | 本体統合時に利用 | 広場へ戻る、メニュー、ルール、プレイヤーメニュー |
| 部屋共通UI | 本体統合時に利用 | 参加者一覧、全員に見える部屋設定、ホストだけの設定変更、時間制限 |
| デバッグUI | SDK標準／本体統合時に利用 | 権限表示、ダミー参加者、視点・フェーズ切替、自動進行、参加者を維持した進行中断 |
| 結果UI | 本体統合時に利用 | 同じ部屋へ戻る、広場へ戻る、共有、再戦導線 |

## SDK基本セット（実装済み）

| モジュール | 区分 | 提供するもの |
| --- | --- | --- |
| Online Room | SDK標準 | Room作成、ホスト、参加・退出、人数上限、設定、開始前状態 |
| AppSet合成 | SDK標準 | `defineGameSdkOnlineRoomAppSet`で固有state・Command・Viewを登録し、`createGameSdkOnlineRoomModule`で基本セットと合成 |
| Revision | SDK標準 | Command成功ごとにrevisionを1増加し、古いrevisionを拒否 |
| 閲覧者別共通View | SDK標準 | 内部player IDを出さず、seat・表示名・接続・本人／ホスト表示を提供 |
| Lifecycle | SDK標準 | `room/join`、`room/leave`、`room/update-settings`、`room/abort`、`room/rematch` |
| 認証・保存・Realtime | 本体統合時に利用 | Cookie由来actor、Redis保存、active room、一覧、WebSocket通知とpolling fallback |

新しいオンラインゲームはこの基本セットを必ず起点にします。アプリセットへRoom作成、参加者管理、設定更新、revision、共通permissionsを再実装しません。

## プレビュープリセット（実装済み）

隔離Previewは全`index.html`へ`window.GameFieldsPreset`を自動注入します。外側Shellが共通UIを所有するため、ゲーム側で同名の見た目や状態管理を再実装しません。次の標準属性は旧モック互換用であり、新規ゲームでは共通UIをHTMLへ置かず、`registerGame`だけを使います。

| 属性 | 実際の動作 |
| --- | --- |
| `data-action="debug"` または `data-gf-command="debug"` | 共通デバッグパネルを開閉 |
| `data-action="dummy"` | ダミープレイヤーを追加し、参加者一覧と視点候補を更新 |
| `data-gf-command="remove-dummy"` | 最後のダミープレイヤーを削除 |
| `data-action="start"` | フェーズを`playing`へ変更し、登録済みゲームの`start`を実行 |
| `data-action="abort"` | ゲーム固有状態を中断し、参加者を維持して`lobby`へ戻す |
| `data-gf-command="auto-progress"` | 登録済みゲームのデバッグ自動進行を実行 |
| `data-gf-command="rematch"` | ゲーム固有状態を初期化して同じ部屋へ戻す |
| `data-gf-player-list` | Runtimeが参加者`li`を描画する領域 |
| `data-gf-viewer` | DEBUG外側Shellが所有する閲覧視点の直接選択ボタン群。ゲーム固有コードから生成・変更しない |
| `data-gf-phase` | 現在フェーズの表示。ゲーム固有コードからフェーズ強制UIを追加しない |

ゲーム固有コードは、石・カード・盤面など固有状態だけを登録します。以下の5 handlerは省略せず、該当処理が軽微でも明示します。

```js
GameFieldsPreset.registerGame({
  start() { resetGame(); },
  abort() { resetGame(); },
  rematch() { resetGame(); },
  autoProgress() { playOneSafeDebugStep(); },
  onStateChange(platformState, command) {
    renderGame(platformState.viewerId, platformState.phase, command);
  }
});
```

`GameFieldsPreset.command(...)`へactor IDや管理権限を渡して本人証明にしてはいけません。Previewの状態は画面確認専用で、本体統合時は認証済みRuntimeが同じ役割を引き取ります。

## ワード・コンテンツ供給

ワードDBはGame Fieldsの非公開Platform resourceです。DB接続やテーブルをゲームへ渡さず、公開型`@game-fields/game-sdk/content-source`と`context.resources`に注入されたadapterだけを使います。

| 公開契約 | 内容 |
| --- | --- |
| `drawWords` | `general-words`または`rare-words`から難易度・件数・除外条件を指定して取得 |
| `drawWordPairs` | `word-pairs`から難易度・件数・既出IDを指定して取得 |
| `findDefinitions` | opaqueなword IDに対応する短いゲーム用語釈を取得 |

```ts
import { requireGameSdkContentSource } from "@game-fields/game-sdk/resources";

const words = await requireGameSdkContentSource(context.resources).drawWords({
  pool: "general-words",
  difficulty: "normal",
  count: 8,
});
```

取得結果の`id`はopaqueです。DBキーとして解釈せず、API・Redis・PostgreSQLへ直接接続しません。利用可能なpoolは確定済みprofileとPlatform権限に従います。

## トランプ

Game Fields本体には共通トランプ基盤があります。トランプを使うゲームでは独自のカード型・シャッフル・カードUIを新設せず、この基盤の利用を指定します。

| 機能 | 区分 | 現在の内容 |
| --- | --- | --- |
| カードデータ | SDK標準 | `@game-fields/game-sdk/playing-cards`。4スート、A〜K、ジョーカー、安定したカードID、表示名・スート記号 |
| デッキ操作 | SDK標準 | デッキ生成、暗号学的乱数shuffle、配札、取得、表示順、秘密手札投影 |
| カード表示 | SDK標準 | `@game-fields/game-sdk/playing-cards-react`。表面、裏面、選択、無効状態、4サイズ、読み上げラベル |
| 手札 | SDK標準 | `PlayingCardHand`。重ね表示、横スクロール、選択・無効カード |
| 裏向きカード束 | SDK標準 | `PlayingCardBackStack`。残数表示と表示枚数上限 |

採用時は`GAME_SPEC.md`に、使用するデッキ、ジョーカー枚数、公開情報、本人の手札、他人の枚数、山札・捨て札、シャッフルのタイミングを記録します。

## お絵描き

Game Fields本体には共通キャンバス基盤があります。描画を使うゲームでは、Canvas APIのイベント処理や線データ形式を個別実装せず、この基盤の利用を指定します。

| 機能 | 区分 | 現在の内容 |
| --- | --- | --- |
| 描画キャンバス | SDK標準 | `@game-fields/game-sdk/drawing-react`の`DrawingCanvas`。マウス、タッチ、ペン入力、端末解像度対応 |
| 描画ツール | SDK標準 | ペン、消しゴム、スポイト、塗りつぶし、パン |
| 表現設定 | SDK標準 | 色、太さ、透明度、キーボードカーソル、進行中callback |
| ストローク | SDK標準 | `@game-fields/game-sdk/drawing`。正規化座標、検証・上限、進行中／完了、レイヤーID |
| レイヤー | SDK標準 | 自由／プレイヤー別レイヤーに利用できる型と機能preset |
| 保存・同期・認可 | 本体統合時に利用 | Room state、Platform adapter、Command権限で実装。UIからDBへ直接接続しない |

採用時は`GAME_SPEC.md`に、描ける人、描けるフェーズ、消去・全消去の権限、レイヤー、保存期間、最大線数、観戦者への公開範囲を記録します。

## AIの利用ルール

1. 最初のモックでは全moduleを必須として扱い、AI判断で外さない。
2. 利用者へ内部コンポーネント名の選択を求めず、SDK-devで実物を確認してもらう。
3. 既存モジュールで満たせる機能をゲーム固有コードへ複製しない。
4. カタログにない再利用価値の高い機能は、今回だけの実装にするか共通モジュール候補にするかを明記する。
5. モック承認後は`get_game_module_requirements`の`requiredModuleIds`と`requiredModules`の公開契約を正本とし、必須moduleを省略しない。
6. `delivery=platform-owned`または`platform-resource`のmoduleは本体ファイルをコピーせず、注入契約を使う。`sdk-helper`または`sdk-resource`は返された`packageExports`からimportする。

このカタログはモジュール追加時に更新します。スターターへ固定コピーした共通UIではなく、将来はSDKのversionに対応するモジュール実体と機械可読manifestを正本にします。
