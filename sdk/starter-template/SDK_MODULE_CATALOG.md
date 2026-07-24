# Game Fields SDK モジュールカタログ

ゲームをゼロから作り直さず、ここにある公式モジュールを組み合わせます。最初の候補packageでは全moduleが必須です。AIは採否を決めず、同等機能をAppSetへ再実装しません。

## 初期profile

- 初回ゲーム登録時にPlatformが38件すべてを`required`として付与する。
- `mock/preview.json`、manifest、AppSet、管理トークン、MCPから必須一覧を変更できない。
- AIは読み取り専用`get_game_module_requirements`で返る`requiredModuleIds`と各moduleの`delivery`、`packageExports`、`publicApis`、`usage`を正本としてAppSetを作る。

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
| 部屋共通UI | 本体統合時に利用 | 参加者一覧、全員に見える部屋設定、ホストだけの設定変更、時間制限。timerの正本は共通module、表示位置はゲーム固有クライアント |
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

## Preview／正式共通Room bridge

packageの`index.html`には`window.GameFieldsRoom`が注入されます。Previewと昇格後は同じAPI、同じAppSet bundle、同じクライアントを使います。

```ts
GameFieldsRoom.getSnapshot(): GameSdkRoomSnapshot | null;
GameFieldsRoom.subscribe(listener): () => void;
GameFieldsRoom.send(command): Promise<GameSdkRoomSnapshot>;
```

クライアントは閲覧者別Viewを描画し、ゲーム固有Commandだけを送ります。Room作成・参加、参加者、settings、開始、中断、再戦、timer、デバッグは外側Shellが所有します。

`GameFieldsPreset`は旧クライアントの移行用名称だけを残し、`GameFieldsPreset.room`が同じRoom bridgeを指します。`registerGame`によるブラウザ内進行と`resources`によるブラウザ側Word DB／LLM呼出しは昇格packageで禁止です。

## ワード・コンテンツ供給

ワードDBはGame Fieldsの非公開Platform resourceです。DB接続やテーブルをゲームへ渡さず、公開型`@game-fields/game-sdk/content-source`と`context.resources`に注入されたadapterだけを使います。

単語ゲームでも、初期Word DBや固定単語配列を置きません。Previewと昇格後の両方でAppSetの`context.resources.contentSource`から同じ3 APIを使います。

| 公開契約 | 内容 |
| --- | --- |
| `drawWords` | 一般語彙`general-words`から難易度・件数・除外条件を指定して取得 |
| `drawWordPairs` | `word-pairs`から難易度・件数・既出IDを指定して取得 |
| `findDefinitions` | opaqueなword IDに対応する短いゲーム用語釈を取得 |

### 語彙プール

pool IDはAPI互換用の固定値です。設定画面や説明文では次の正式名を使います。公開packageでは`GAME_SDK_CONTENT_POOL_DEFINITIONS`から同じ名前と説明を参照できます。

| pool ID | 正式名 | 定義・用途 |
| --- | --- | --- |
| `general-words` | 一般語彙 | 単語ゲーム向けに利用可否と難易度を審査した一般的な単語 |
| `word-pairs` | 審査済みワードペア | 2語の関係と距離を審査したワードウルフ向けペア |

低認知語彙、たほい屋の未審査候補、審査結果、採用済みお題はPlatform内部専用です。SDKの設定候補へ出さず、独自のpool文字列を組み立てて要求しません。

### 難易度

クライアントの表示名と保存値は次で固定します。部屋設定では保存値を使い、表示だけ日本語化します。

| 表示 | 保存・API値 | 意味 |
| --- | --- | --- |
| 簡単 | `easy` | 親しみやすい候補を中心に取得 |
| 普通 | `normal` | 標準候補を中心に、一部簡単な候補も混ぜる |
| 難しい | `hard` | 難しい候補を中心に、普通・簡単も少量混ぜる |

`general-words`の混合比率は簡単=`easy` 100%、普通=`normal` 80% + `easy` 20%、難しい=`hard` 50% + `normal` 40% + `easy` 10%です。返却された各項目の`difficulty`は、その項目自身の実際のtierです。`word-pairs`は指定tierから取得します。

### 返却フィールド

| 型・フィールド | 内容 |
| --- | --- |
| `GameSdkWordContent.id` | 除外と語釈取得に使うopaque ID。内部DB IDではなく、解析しない |
| `surface` | プレイヤーへ表示する表記 |
| `reading` | 利用可能な場合の読み。未登録なら`null` |
| `difficulty` | その単語自身の`easy | normal | hard` |
| `tags` | `general-words`等の公開分類 |
| `GameSdkWordPairContent.id` | ペア単位の既出除外に使うopaque ID |
| `first` / `second` | ペアを構成する2つの`GameSdkWordContent` |
| `relation` | 登録済みの場合の短い関係説明。未登録なら`null` |
| `GameSdkWordDefinitionContent.wordId` | 語釈取得を依頼したopaque word ID |
| `definition` | Game Fieldsの短いゲーム用語釈 |

### 本実装

```ts
import type {
  GameSdkContentDifficulty,
} from "@game-fields/game-sdk/content-source";
import { requireGameSdkContentSource } from "@game-fields/game-sdk/resources";

type Settings = {
  wordDifficulty: GameSdkContentDifficulty;
};

const words = await requireGameSdkContentSource(context.resources).drawWords({
  pool: "general-words",
  difficulty: room.settings.wordDifficulty,
  count: 8,
});
```

`wordDifficulty`はクライアントで「簡単・普通・難しい」から選び、SDK基本セットのRoom settingsとして保存します。取得結果の`id`はopaqueです。DBキーとして解釈せず、API・Redis・PostgreSQLへ直接接続しません。利用可能なpoolは確定済みprofileとPlatform権限に従います。

PreviewでもこのAppSetコードをそのまま実行します。クライアントには取得済みの安全なViewだけを返します。取得失敗時はtransitionを保存せず、入力と手番を維持して再試行表示にします。

## LLM

ゲームはOpenAI、Gemini、Groqを直接呼びません。provider、モデル、APIキー、課金元、fallbackはGame Fieldsが所有し、ゲーム側は生成する内容と固定task／promptVersionだけを渡します。

本実装では、ブラウザのゲームCommandに質問・履歴等の入力だけを含め、審査済みAppSetのserver側から呼びます。

```ts
import { requireGameSdkLlmGateway } from "@game-fields/game-sdk/resources";

const generated = await requireGameSdkLlmGateway(
  context.resources,
).generate({
  task: "answer-question",
  prompt: buildReviewedPrompt(command.question, room.app.history),
  promptVersion: "answer-question-v1",
  quality: "standard",
});
```

Preview iframeはLLMを直接呼びません。AppSetのeffect requestを信頼済みPlatform側が検査し、module profile・レート制限・共通gatewayを通してから、同じAppSet実行へ結果を返します。

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

1. 最初の候補packageでは全moduleを必須として扱い、AI判断で外さない。
2. 利用者へ内部コンポーネント名の選択を求めず、SDK-devで実物を確認してもらう。
3. 既存モジュールで満たせる機能をゲーム固有コードへ複製しない。
4. カタログにない再利用価値の高い機能は、今回だけの実装にするか共通モジュール候補にするかを明記する。
5. `get_game_module_requirements`の`requiredModuleIds`と`requiredModules`の公開契約を正本とし、必須moduleを省略しない。
6. `delivery=platform-owned`または`platform-resource`のmoduleは本体ファイルをコピーせず、注入契約を使う。`sdk-helper`または`sdk-resource`は返された`packageExports`からimportする。

このカタログはモジュール追加時に更新します。スターターへ固定コピーした共通UIではなく、将来はSDKのversionに対応するモジュール実体と機械可読manifestを正本にします。
