# 開発スレッドログ

この文書は、GPTとの開発スレッドで出た要望、判断経緯、実施結果を後から追跡するための参考ログである。現在仕様の正本ではない。実装時は `docs/README.md` の読書順に従い、`DEVELOPMENT_HANDOFF.md`、ゲーム別資料、登録簿、コードを優先する。

## 記録ルール

- 開発上の要望・判断・調査・実装・外部設定・公開・保留が生じた作業単位は、明示依頼がなくても終了前に必ず追記する。詳細は `DEVELOPMENT_LOGGING.md` を正本とする。
- 新しい記録は末尾へ追記し、過去の記録は原則として書き換えない。訂正は新しい項目として追記する。
- 利用者の要望、主要な判断、実施内容、関連コミット、未対応事項を簡潔に残す。
- APIキー、Cookie、パスワード、メールアドレス、内部プロンプト、ツールの生出力、ゲームの秘密情報、個人情報は残さない。
- ログと現行資料が食い違う場合、ログを根拠に実装せず、現行資料とコードを確認する。
- チャット全文の逐語保存ではなく、開発上意味のある発言と応答を時系列で記録する。

## 2026-07-13 — バグ監査、観測性、マイページ、プレイバック

### 利用者からの要望

1. `game-app` の開発資料を読み直し、まずバグチェックを行う。
2. 資料の読書順や、確認対象を拾いにくい箇所を改善する。
3. 実運用後のデバッグに備えてログ取得を拡充し、将来のモジュール／コンテナ分割も想定する。
4. 各プレイヤーが自分の過去の試合を見返せるプレイバックを用意する。
5. 通常の保存期間は30日、お気に入りは期限なし、初期上限は10件とする。
6. `/users/me` の本人専用マイページを用意し、戦績、プレイバック、お気に入り、共有をまとめる。
7. ロビー上部のプレイヤー表示は簡単なポップアップとし、元のアイコン選択を残したうえでマイページボタンを追加する。
8. プレイバックはたほい屋だけでなく、アカウント戦績対象の全ゲームへ広げる。
9. SNS共有は単純な勝敗ではなく、プレイバックからゲーム別の見どころをまとめた内容にする。
10. GPTとの開発スレッドも、仕様の正本ではなく参考ログとして残す。

### 判断と実施結果

- 資料入口を `docs/README.md` に統一し、作業別索引とバグ確認順を整備した。
- 構造化観測イベント、禁止情報、相関用の不透明参照、Vercel Runtime Logsでの確認手順を整備した。
- マイページとプレイバック保存を追加した。通常30日、お気に入り最大10件・期限なしを環境変数で調整できる。
- ロビーのアカウントポップアップへ、アイコン色、標準画像、画像アップロード、マイページ導線をまとめた。
- ワードウルフ、たほい屋、ノーザンブランチ、ことばで数ならべ、ことば潜伏戦の全5ゲームをプレイバック保存へ接続した。
- 共有文には最大3件の匿名化した見どころを含める。参加者名、説明本文、秘密語、個別投票先、認証付きURLは共有しない。
- 新しいアカウント戦績ゲームでプレイバック実装が欠けた場合、共通要件検査を失敗させるようにした。
- 固定のローカル用HMACフォールバックは廃止し、サーバー秘密値が設定されていない環境ではプレイバックを保存しない安全側の動作にした。

### 関連コミット

- `5a12d1a` — `Harden multiplayer flows and add replay observability`
- `2d00ff7` — `Expand playback across all games`

### 補足

- 詳細プレイバックは機能公開後に完了した試合から保存する。過去の戦績だけから、発言や投票などの詳細は復元できない。
- この項目は当時の開発経緯を示すログであり、以後の変更で仕様が更新される可能性がある。

## 2026-07-13 — ロビーの情報階層

### 利用者からの要望

- ロビーではゲーム一覧を主役として最上位に表示する。
- PCではアカウントや戦績などの補助情報を左側、ゲーム一覧を右側に置く。
- スマホでは未ログイン時だけログイン画面を優先し、ログイン後は補助情報をトップバナーから開くポップアップへまとめる。

### 判断と実施結果

- 画面幅が狭い場合もゲーム一覧が先に表示される順序へ変更した。
- PCでは左側を340pxの情報サイドバー、右側を可変幅のゲーム一覧とした。
- ゲーム一覧の先頭に見出しを追加し、ページ内の主目的を明確にした。
- スマホのログイン後はゲーム一覧だけを本文の先頭に置き、既存のアカウント・復帰・戦績パネルをモーダル表示して二重実装を避けた。
- 1024px未満の狭いPCで情報欄が消えたように見えたため、トップバナーへ常時見える「情報」ボタンを追加し、左側から開くドロワーへ変更した。
- 狭いPCでは画面左端の細い感知エリアへマウスを当ててもドロワーを開けるようにした。タッチ操作と発見性のためトップバナーの「情報」ボタンも残した。
- ドロワーの表示・非表示を瞬間切替から約300msの左右スライドへ変更し、背景の暗転もフェードで連動させた。
- 左端ホバーの反応が鈍く感じられたため、感知領域を幅12px・中央50%から幅24px・全高へ拡大し、Pointer Enterで即時に開くよう変更した。スライド時間も約200msへ短縮した。
- ことば潜伏戦の作り込み開始にあたり、長音符「ー」を独立した文字スキャン候補へ追加し、呼び出し前は伏せるよう修正した。全5ゲームのルール説明を共通ダイアログへ揃え、現行の得点・終了条件・時間切れに更新した。ゲーム名の変更は候補提示後に決めるため未変更。
- 「ことば潜伏戦」を「ことばソナー」へ改称した。デバッグ用パスワード認証をゲーム画面からマイページへ移し、認証済みアカウントだけ各ゲームのトップバナーに操作を表示する方式へ統一した。デバッグ中は同じ部屋・参加者を残してゲーム開始前へ戻す共通の中断操作を追加した。

## 2026-07-14〜2026-07-15 — 負荷対策、共通オンライン基盤、新ゲーム

### 利用者からの要望

- 利用者増加時に耐えられるかを監査し、重大なボトルネックを順に解消する。
- 共通時間管理、途中離脱者の復帰、二回連続時間切れ時の短縮と復帰操作、容量警告を各ゲームへ横展開する。
- 将来の広告枠を共通化し、ゲーム固有コードから広告事業者を直接呼ばない構造にする。
- ワードスケールを公開し、ゲーム分類タグを追加する。
- 新しい言葉ゲームをWord Outへ発展させ、コードインターセプトとキャンバスの試作を始める。

### 判断と実施結果

- APIレート制限、部屋一覧のページング、参加人数上限、Redis要求の堅牢化、Neonへのアカウント・戦績保存、負荷検査を追加した。
- オンラインルーム通信とCommand APIを共通化し、未変更Roomの転送量を削減した。
- 共通広告スロット、非アクティブプレイヤー復帰、ストレージ容量警告を追加した。広告は既定で非表示とした。
- ワードスケールの縦型並べ替えUI、確定・結果順、共有同意を整備し、公開ゲームへ変更した。
- Word Outを公開し、得点ベースの多人数Eloを追加した。コードインターセプトは非公開のチーム対抗試作として追加した。
- キャンバスは非公開試作として、キーボード描画、Undo/Redo、透明度、共同描画、プレイヤー別レイヤー、自分の線だけのUndo等を段階的に追加した。

### 関連コミット

- `9966852` — `Add shared API rate limits`
- `340344b` — `Unify online room command APIs`
- `3783ae0` — `Add ad slots, inactive-player recovery, and storage alerts`
- `af67390` — `Publish Word Scale and add game tags`
- `184b619` — `Generalize Nigoichi as Word Out`
- `cd6c2f8` — `Use score-based multiplayer Elo`
- `58d6943` — `Add private Code Intercept game`
- `c3079b2` — `Add private Canvas drawing UI prototype`


### 未対応・保留

- 広告のlive配信は、同意管理、配信adapter、CSP、年齢・地域・コンテンツ方針を実装するまで保留。
- キャンバスの一般公開は保留し、共通描画基盤の試作として扱う。

## 2026-07-15〜2026-07-16 — GAME FIELDS共通UI、法務、管理画面、モジュール化

### 利用者からの要望

- 広場、ロビー、マイページ、ゲーム中の共通導線を整理し、PCと将来のスマホ専用UIを分離しやすくする。
- キャンバスへズーム、全画面、機能ON/OFF、ロビー落書きボード等を追加する。
- 利用規約・プライバシーポリシー、アカウント削除、サイト管理、管理者メール、容量・運用状況、ハイパーパラメータ管理を用意する。
- 長大なゲームコンポーネントを、表示、通信、操作、ViewModel等へ分割する。

### 判断と実施結果

- 正式ブランドを`GAME FIELDS`とし、ゲーム選択画面を「広場」、募集・待機画面を「ロビー」と整理した。
- 利用規約・プライバシーポリシーへの同意保存、未使用アカウント削除方針、本人によるアカウント削除を追加した。
- キャンバスへズーム、ホイール操作、全画面表示、全画面パレット、機能フラグ、ロビー落書き、自分の線だけの全消去を追加した。
- 管理画面へサイト設定、稼働状況、ゲーム公開管理、容量、ハイパーパラメータ一覧・安全な編集を追加した。管理者ログインは登録メールとPasskeyを要求する構成へ強化した。
- Canvas同期、オンラインRoom service、主要ゲーム画面の責務分離を進めた。WordWolfは巨大コンポーネントから表示・通信・操作等を分離した。

### 関連コミット

- `8f0ff64` — `Add GAME FIELDS legal, consent, and account retention`
- `1271a7d` — `Add self-service account deletion`
- `ead08cc` — `Add configurable Canvas features and fullscreen palette`
- `d185e4f` — `Add admin operations dashboard`
- `e4f0ac3` — `Require passkeys for site administration`
- `0b9c14f` — `Allow safe hyperparameter editing`
- `3bc20f0` — `Modularize and optimize canvas synchronization`
- `8b156d0` — `Modularize game client components`

## 2026-07-16〜2026-07-18 — 本番・開発データ分離と共通単語DB

### 利用者からの要望

- 本番と開発を分け、通常のアカウント、部屋、戦績、Redis、Blobは混ざらないようにする。
- 単語マスターDBだけは本番・開発で共通利用し、WordWolfのペア評価、たほい屋候補、一般単語プールを蓄積する。
- 管理者レビュー、人間評価、正式採用、ゲーム別難易度を運用できるようにする。
- たほい屋はZipfに基づく秘境・魔境の抽出と、抽出後のLLM語釈生成を維持する。

### 判断と実施結果

- アプリDB、Redis、Blobを本番・開発で分離し、単語カタログだけを共通層とする三層構成を採用した。
- アプリDBのRedisフォールバックを廃止し、環境別接続先と厳格な分離検査を追加した。
- 共通単語DBへ下書き、LLM評価、人間投票、正式採用、既レビュー候補非表示の流れを追加した。
- WordWolfの共通語彙RAGと、たほい屋の共通カタログ参照へ移行した。
- たほい屋は実効Zipfで難易度帯を分け、Zipf 0候補は抽出後にLLMで正解語釈を生成する流れへ修正した。
- デバッグ権限は管理者登録メールとアカウント別付与へ限定し、復旧用メール設定をマイページへ移した。

### 関連コミット

- `530db1a` — `Add secure environment-separated vocabulary database foundation`
- `4955133` — `Support environment-separated Redis Cloud connections`
- `f785aab` — `Add strict app database environment helper`
- `75131ba` — `Add shared vocabulary Word Wolf RAG`
- `516d70a` — `Migrate Tahoiya topics to shared catalog`
- `1659527` — `Split Tahoiya difficulties by effective Zipf`
- `282ec0e` — `Restrict debug access to administrator emails`

### 未対応・保留

- 共通単語DBの編集は本番にも影響するため、通常の開発データと同じ感覚では扱わない。

## 2026-07-17〜2026-07-19 — たほい屋、コードインターセプト、共通単語プール

### 利用者からの要望

- たほい屋の語釈生成、難易度スクリーニング、再利用、投票・復帰を安定させる。
- コードインターセプトのチーム履歴、得点、ヒント、再提出、時間切れ、候補語抽出を改善する。
- 一般単語プールをワードスケール、ワードアウト、コードインターセプトへ採用し、難易度を設定する。
- ワードアウトとコードインターセプトの文字被り履歴は当日だけ保持し、候補を使い切れば当日中でも解除する。

### 判断と実施結果

- たほい屋へ難易度別LLMスクリーニング、進捗表示、不正形式の再試行、スクリーニング先行生成を追加した。
- たほい屋の投票、ルーム復帰、全員復帰待ち、復帰待ち参加者をホストが外す操作を堅牢化した。
- コードインターセプトはチーム別履歴、両チーム得点、カード番号別ヒント、回答再提出、ヒント修正、時間切れ減点、候補10語抽出を追加した。
- 一般単語プールを複数ゲームへ接続し、保存済み難易度タグを参照するようにした。
- オンラインRoom復帰管理と締切処理を共通化した。

### 関連コミット

- `a6335cd` — `Adopt Tahoiya screening-first flow`
- `35b57a9` — `Harden Tahoiya voting and room recovery`
- `bb1b842` — `Compact Code Intercept history and allow clue revision`
- `2706fe3` — `コードインターセプトに時間切れ減点を追加`
- `7e05f9c` — `コードインターセプトに候補10語抽出を追加`
- `36d420d` — `Use general word pool for word games`
- `278cb2b` — `オンライン部屋復帰管理と締切処理を共通化`

## 2026-07-18〜2026-07-20 — 通信負荷削減とWebSocket段階導入

### 利用者からの要望

- プレイヤー増加時のRedis負荷と画面応答を改善する。
- WebSocketを導入しつつ、切断や未対応環境ではpollingへ安全に戻す。
- API直叩きや観戦モードでの秘密情報漏えいが残らないか確認する。


### 判断と実施結果

- プレイヤー操作の応答待ちを短縮し、RedisのRoom polling命令数とアプリ全体のサービス負荷を削減した。
- PreviewからWebSocket Room更新を導入し、pollingフォールバックを完成させた。
- 一時的なPreview試験用cleanup routeは確認後に削除した。
- 観戦モードは保存Roomをそのまま返さず、閲覧者別の表示データへ変換し、参加者Commandと秘密情報をサーバー側で制限する方針とした。

### 関連コミット

- `51ac5a0` — `Improve multiplayer response latency`
- `f739f21` — `Add preview WebSocket room updates`
- `00c0ce1` — `Reduce Redis room polling commands`
- `fd60f2d` — `Reduce application-wide service load`
- `5f4a397` — `Complete WebSocket polling fallback`
- `8bf541f` — `Add secure online room spectator mode`

### 未対応・保留

- 観戦・認可層はdevelopで実装・自動テスト済み。本番反映前のdev実プレイ確認は未完了。

## 2026-07-20〜2026-07-21 — 多言語化、UI三層、ゲームSDK基盤

### 利用者からの要望

- 将来中国語等を追加できる多言語化基盤を入れ、まず英語版を作る。
- 言語依存ゲームはマイページで言語を切り替えない限り、別言語の部屋を作成・閲覧・参加できないようにする。
- スマホ専用UIへ発展できるよう、通信・状態管理とPC/Mobile表示を分離する。
- 外部または別のChatGPTでもゲーム固有部分だけを安全に作れるSDKと雛形を準備する。

### 判断と実施結果

- アカウント言語、URL locale、共通UI辞書を追加した。言語依存Roomの`contentLocale`は認証済みアカウントからサーバー側で確定する。
- 日本語コンテンツしかない言語依存ゲームは、英語設定から作成・閲覧・参加できない。言語非依存の大富豪は日英混在Roomを許可した。
- 広場、ログイン、マイページ、共通Room操作、大富豪の初期英語UIを追加した。
- WordWolfとWord ScaleをGame→Controller→Desktop Layoutの三層へ分離し、閲覧権限をView permissionsへ投影した。
- 新規ゲーム生成script、manifest、認可済みactor、保存RoomとRoomViewの分離、revision付きCommand、DB不要のMock Runtime、SDK内部依存監査を追加した。

### 関連コミット

- `2a88a08` — `Add account locale room isolation`
- `a6e0bb2` — `Add initial English app experience`
- `73f1223` — `Make URL locale authoritative on client`
- `69d6e43` — `Split WordWolf controller and desktop layout`
- `a8f9e67` — `use Word Scale controller layout`
- `c005989` — `feat: add game scaffold generator`
- `594d0c2` — `Add Game SDK runtime contracts`

### 未対応・保留

- SDK v1の契約基盤はdevelopへ反映済みだが、本体のCookie認証、Redis CAS、WebSocket、戦績へ接続するplatform adapterは未実装。
- `sdk.game-fields.com`の制作は保留。Developer PortalやSDK専用環境を実装済みとして扱わない。

## 2026-07-20〜2026-07-21 — Vercel三層分離と誤接続ガード

### 利用者からの要望

- `main`を本番、`develop`を開発へ確実に割り当て、誤ブランチのデプロイや本番・開発ストレージの混線を防ぐ。
- VercelのSensitive値を再表示・コピーせず、既存接続先を維持したまま環境識別ガードを有効にする。

### 判断と実施結果

- Vercel Projectを本番`app-games`と開発`app-games-dev`へ分け、本番は`main`、開発は`develop`だけをデプロイする構成にした。
- 本番層、開発層、共通単語DB・LLM・メール送信等の共通層という三層構成を明文化した。
- `APP_ENV`、`APP_DATABASE_ENV`、`REDIS_ENV`、`BLOB_ENV`を環境識別に使用した。Sensitiveな既存`DATABASE_URL`は変更せず、旧変数を使う場合にも識別ガードを適用した。
- Shared Variablesへの共通LLM・共通語彙・メール送信キー移行に対応した。
- develop側は環境ガードとSDK v1まで反映済み。本番mainには環境ガードに必要な変更だけを切り出し、開発中の英語版、観戦、SDK等は含めなかった。

### 検証

- develop側の環境ガードは全362テスト、ESLint、production buildに成功し、`app-games-dev`へデプロイ済み。
- 本番向け切り出しは全301テスト、ESLint、production buildに成功し、`app-games`のVercelデプロイが成功した。

### 関連コミット

- `7842c7e` — `Support shared Vercel environment variables`
- `48f4df4` — `Use Git branches for app environment detection`
- `e8b5735` — develop: `Guard legacy database URLs by environment`
- `bbb687a` — main: 本番向け環境ガードの限定反映

## 2026-07-21 — 開発ログ保存運用の復旧

### 利用者からの要望

- 作業ログが7月13日で止まり、`sdk.game-fields.com`の過去判断が引き継がれなかったため、ログ保存を先に復旧する。
- `sdk.game-fields.com`制作は保留し、保存ルールの整備と欠落ログの補完を優先する。

### 判断

- 「利用者が明示的に保存を依頼した場合だけ」という従来の弱い規定を廃止する。
- 開発上の要望・判断・調査結果・実装・外部設定・公開・保留が生じた作業単位は、明示依頼がなくても終了前にGitへ記録する。
- 会話全文は保存せず、目的、判断、実施結果、検証、関連コミット、未対応・保留を区別した要約を残す。
- ログは経緯の参考資料とし、現行仕様の正本は引き続きコードと各専門資料とする。

### 実施結果

- `AGENTS.md`へ必須保存ルールを追加した。
- `docs/DEVELOPMENT_LOGGING.md`を新設し、対象、タイミング、書式、禁止情報、訂正方法を定義した。
- 7月14日から21日までの主要な欠落経緯を、現行資料とGitコミットで確認できる範囲に絞って本ログへ補完した。

### 検証


- 記載した関連コミットがGit履歴に存在することと、文書へ接続文字列等の秘密値が混入していないことを確認した。
- 全369テスト、ESLint、production build（72ルート）に成功した。

### 未対応・保留

- `sdk.game-fields.com`の制作は保留。再開が明示されるまでサイト、Developer Portal、SDK専用Vercel環境を作らない。

## 2026-07-21 — SDK制作再開前の分離方針確認

### 利用者からの要望

- 保留していた`sdk.game-fields.com`制作へ戻る。
- 将来SDKを一般配布するため、app-gamesと分ける必要があるか、同居しても問題ないかを確認する。

### 判断

- Gitリポジトリは`app-games`と共通のままでよい。一般配布に必要なのは別リポジトリ化ではなく、公開packageの独立性である。
- 同じNext.jsアプリ・同じnpm packageへの同居は避け、npm workspacesで`packages/game-sdk`と`apps/sdk-portal`へ物理分離する。
- Developer Portalは同一Gitリポジトリから、Root Directoryを`apps/sdk-portal`とする別Vercel Project `app-games-sdk`へデプロイする。
- SDK用Vercel環境、DB・Redis・Blob名前空間、権限、秘密情報は本番`app-games`と開発`app-games-dev`から分離する。
- 内部`game-runtime`は非公開とし、外部ゲームは公開SDK packageだけへ依存する。これにより将来SDKを別リポジトリへ移しても利用者側のimportを維持できる。

### 確認根拠

- 現在のSDK v1は内部DB・Redis・環境変数をimportしない境界検査を持つため、公開packageへ移す下地がある。
- Vercelは同じmonorepoのディレクトリごとに別ProjectとRoot Directoryを設定できる。
- npm workspacesは同一リポジトリ内のpackageを独立packageとして管理でき、公開SDKはscoped public packageとして個別に配布できる。

### 未対応

- `packages/game-sdk`への移動、workspace設定、pack/install検査は未実装。
- `apps/sdk-portal`、`app-games-sdk`、`sdk.game-fields.com`へのデプロイは未実装。
- npm organization、公開package名、公開ライセンス、初回publishは未決定。

## 2026-07-21 — 外部ゲームの提出・審査・公開権限

### 利用者からの要望

- SDKは一般に利用できるようにするが、外部開発者にはSDKでゲームを作って提出してもらう形とする。
- `main`への反映と本番公開はGame Fields運営者本人が行う。外部開発者が直接公開する仕組みにはしない。

### 判断

- SDKの一般配布と、本体ゲームの公開権限を分離する。
- 外部開発者の責任範囲は、SDKを使ったゲーム固有packageの作成、ローカル検証、必要情報を添えた提出までとする。
- 提出後は自動検査を行うが、それを採用承認とは扱わない。運営者が内容、品質、権利、安全性を審査し、採用したものだけを`develop`へ統合する。
- dev実プレイ確認後の`main`反映と本番公開も運営者だけが行う。
- 外部開発者へ`develop`、`main`、Vercel、本番DB・Redis・Blobの書き込み権限は付与しない。Developer Portalから提出しても自動merge・自動deploy・自動公開しない。
- 提出数が増えて人手の審査が追いつかなくなった場合は、AI・自動検査へセキュリティ、バグ、依存関係、権利情報、低品質・量産提出の一次審査を担わせられる設計にする。
- 審査方法を自動化しても、無審査公開は認めない。すべての提出物は最低1つのGame Fields管理下の採用ゲートを通し、判定不能・高リスクなものは公開せず隔離する。

### 実施結果

- `EXTERNAL_GAME_PACKAGE.md`、`CHATGPT_GAME_SDK.md`、`DEVELOPMENT_HANDOFF.md`へ提出・審査・公開権限の境界を明記した。

### 未対応・保留

- 提出形式、審査画面、権利・ライセンス申告書式、sandbox実行方法は未実装。

## 2026-07-21 — SDK Developer Portalの初期構築

### 利用者からの要望

- ドメイン設定済みの`sdk.game-fields.com`を立ち上げる。
- SDK専用Vercel Projectを新設する段階へ進む。

### 判断

- 空のVercel Projectを先に作らず、同一リポジトリの`apps/sdk-portal`へ独立Next.jsアプリを置いてから、Root Directoryを指定してVercelへ読み込む。
- Portalは初期段階ではDB、Redis、Blob、管理者秘密情報、メール送信キーを必要としない。
- Vercel Projectは`game-fields` Team内の`app-games-sdk`とし、Production Branchは`main`、`develop`はPreviewに限定する。
- SDKの一般配布と本体への公開権限は引き続き分離し、Portalにも外部開発者から`main`へ直接公開する経路を作らない。

### 実施結果

- ルートをnpm workspaces化し、`apps/*`と将来の`packages/*`を独立単位として管理できるようにした。
- `apps/sdk-portal`へSDK専用Next.jsアプリ、レスポンシブな初期ランディング、独立metadata、独立proxy・instrumentation、ESLint設定を追加した。
- `npm run dev:sdk`と`npm run build:sdk`を追加した。
- 初期ページにSDKの安全境界、SDK v1の準備状況、提出・自動検査・運営審査・dev実機確認・`main`公開のゲートを明記した。

### 検証

- SDK Portal単体と本体全体のESLint、全369テスト、本体72ルートのproduction build、Portal 2ルートのproduction buildに成功した。
- SDK PortalのHTTP 200と主要本文のsmoke確認に成功した。
- ブラウザ検証CLIは実行環境でUnix socketを作成できず、画像による目視確認は未実施。production buildとHTTP応答は成功している。

### 未対応・保留

- ChatGPTのVercel Connectorは`game-fields` Team scopeを持たず403となるため、`app-games-sdk` Project作成には同Team scopeへの再認証が必要。
- `app-games-sdk`の作成、Root Directory設定、Ignored Build Step、`sdk.game-fields.com`割当、Vercel上の初回Deploymentは未実施。
- `packages/game-sdk`への公開SDK移動、pack/install契約、npm package名・ライセンス・初回publishは未実装。
- チュートリアル、APIリファレンス、ゲーム雛形ダウンロード、提出画面は未実装。

## 2026-07-21 — Vercel ConnectorのTeam権限復旧

### 作業目的

- ChatGPTのVercel Connectorを再接続し、`game-fields` Teamへアクセスできるか確認する。


### 実施結果

- Vercel ConnectorのTeam一覧に`game-fields`が表示されることを確認した。
- `game-fields`配下の既存Project `app-games`と`app-games-dev`を参照できることを確認した。
- SDK専用Projectを作成するためのConnector権限上の障害は解消した。

### 検証

- 全369テスト、ESLint、production build（72ルート）に成功した。

### 未対応・保留

- `app-games-sdk` Projectの作成、Root Directoryの`apps/sdk-portal`指定、Production Branch設定、`sdk.game-fields.com`割当、初回Deploymentは未実施。

## 2026-07-21 — SDK Vercel Project作成と初回Deployment

### 利用者からの要望

- `sdk.game-fields.com`立ち上げを再開し、VercelでSDK専用Projectを作成する。

### 判断

- `game-fields` Team内に`app-games-sdk`を作成し、本体・devの環境変数やデータ資源は複製しない。
- Git連携と独自ドメイン移管が完了するまでは、既存`app-games`の`game-fields.com`系ドメインを変更しない。

### 実施結果

- Vercel Project `app-games-sdk`を`game-fields` Team内に作成した。
- `apps/sdk-portal`の最小ソースを直接送信して初回Deploymentを作成し、`READY`になった。
- 暫定URL `https://app-games-sdk.vercel.app` がHTTP 200を返し、タイトル、SDK概要、管理下の公開ゲートを含む本文を確認した。
- 本体・devのDB、Redis、Blob、管理者秘密情報、環境変数はSDK Projectへ複製していない。
- `sdk.game-fields.com`は現時点で本番`app-games` Project側に登録されたままで、SDK Projectへは移管していない。

### 検証

- Vercel buildが成功し、Deployment状態`READY`を確認した。
- 暫定URLのHTTP 200と主要本文を確認した。

### 未対応・保留

- 初回Deploymentはソースファイル直接送信であり、GitHub `koromo2010/app-games`との接続は未設定。
- Root Directory `apps/sdk-portal`、Production Branch `main`、`develop` Preview、Ignored Build Stepは未設定。
- `sdk.game-fields.com`を本番ProjectからSDK Projectへ移管し、独自ドメインでの実機確認を行う必要がある。
- 現行Vercel ConnectorはGit接続、Project設定更新、独自ドメイン移管の書込み操作を公開しておらず、この環境のCLIはVercel認証先へ接続できなかった。Vercel Dashboardまたは認証済みCLI／REST APIで残設定を行う。

## 2026-07-21 — SDK ProjectのGit接続とRoot Directory設定

### 作業目的

- SDK専用Vercel ProjectをGitHubへ接続し、monorepo内のPortalだけを自動デプロイできる状態にする。

### 実施結果

- `app-games-sdk`のRoot Directoryを`apps/sdk-portal`へ変更した。
- Git Repositoryとして`koromo2010/app-games`が接続済みであることをVercel Dashboard上で確認した。
- Ignored Build Stepは`main`と`develop`だけをbuild対象とする設定で保存済みであることを確認した。
- Root Directory外のworkspace依存をBuild Stepへ含める設定は有効のままとした。

### 未対応・保留

- Production Branchが`main`であることは、Dashboard画像の表示範囲外だったため未確認。
- `develop`更新からPreview Deploymentが自動作成されることを確認し、Production BranchとGit連携を実動作で検証する。
- 検証成功後に`sdk.game-fields.com`を本番`app-games` Projectから`app-games-sdk`へ移管し、独自ドメインでHTTP応答を確認する。

## 2026-07-21 — SDK PreviewのGit buildエラー修正

### 調査結果

- `develop`更新から`app-games-sdk`のPreview Deploymentが自動作成され、Git接続とPreview運用が有効であることを確認した。
- 初回Git buildは、SDK Portalがリポジトリ直下のTailwind用PostCSS設定を継承し、SDK packageにない`@tailwindcss/postcss`を要求したため失敗した。
- PortalのCSSはTailwindを使用しておらず、SDKを本体のbuild依存から分離する方針に従い、本体側のTailwind依存をSDKへ追加しない。

### 実施結果

- `apps/sdk-portal/postcss.config.mjs`へ空の独立PostCSS設定を追加し、リポジトリ直下のTailwind設定を継承しないようにした。

### 未対応・保留

- 修正後のGit Preview buildとHTTP応答を確認する。
- Preview成功前は`sdk.game-fields.com`を移管しない。

## 2026-07-21 — SDK Git Preview検証完了

### 実施結果

- PostCSS分離修正を`develop`へ反映し、GitHub更新から`app-games-sdk`のPreview Deploymentが自動作成された。
- Vercelは`develop`をProductionではなくPreviewとして扱い、SDK Portal 2ルートのbuildが成功して`READY`になった。
- Vercel上のGit接続、Root Directory、Production Branch、Ignored Build Stepが意図した運用で機能することを実動作で確認した。
- Preview URLはVercel認証保護が有効なため未認証の本文取得はできないが、Deployment buildと配備処理は正常終了した。

### 検証

- ローカルで全369テスト、ESLint、本体72ルートbuild、SDK Portal 2ルートbuildに成功した。
- Vercel Preview Deployment `f2974e2`が`READY`になった。

### 未対応・保留

- `main`にはまだPortalソースがないため、developの他機能を含めずSDK Portalとworkspace設定だけを限定反映する。
- SDK本番build成功後に`sdk.game-fields.com`を本番`app-games` Projectから`app-games-sdk`へ移管する。


## 2026-07-21 — SDK独自ドメイン公開と配布packageの物理分離

### 利用者からの要望

- `sdk.game-fields.com`のVercel設定完了後、SDK開発の次工程を進める。

### 判断

- 正本の導入順に従い、Portalの機能追加より先に公開契約を`packages/game-sdk`へ物理分離する。
- 公開候補package名は`@game-fields/game-sdk`、preview versionは`0.1.0`とする。
- npm scope、公開ライセンス、初回publishを運営者が承認するまでは`private: true`かつ`UNLICENSED`を維持し、誤公開を防ぐ。
- 外部開発者へ`develop`、`main`、Vercel、DB等の権限を渡さず、すべての提出物をGame Fields管理下の審査ゲートへ通す方針は変更しない。

### 実施結果

- Portalソースの`main`限定反映とSDK ProjectのProduction buildが完了し、`sdk.game-fields.com`を`app-games-sdk`へ割り当てた。Vercel DashboardでProduction・Valid Configurationを確認した。
- SDKの基本契約、server runtime、mock runtimeを`lib/game-sdk*.ts`から`packages/game-sdk/src`へ移し、独立した`package.json`、SemVer、TypeScript build、公開ファイル一覧、3つの`exports`を追加した。
- 生成雛形と契約テストを`@game-fields/game-sdk`のpackage importへ切り替えた。
- package境界検査をworkspace構成へ更新し、外部runtime依存、環境変数参照、未承認の公開設定を拒否するようにした。
- tarballを一時外部projectへinstallし、基本契約、server runtime、mock runtimeをpackage名だけでimport・実行する自動検査を追加した。
- Developer PortalとSDK正本資料を、独自ドメイン公開済み・package分離済み・npm registry未公開の現在値へ更新した。

### 検証

- `npm run test:sdk-package`で`game-fields-game-sdk-0.1.0.tgz`の生成、外部fixtureへのinstall、3 exportの実行に成功した。
- SDK境界検査、ESLint、全369テスト、本体72ルートのproduction build、SDK Portal 2ルートのproduction buildに成功した。

### 未対応・保留

- npm registryのscope所有確認、公開ライセンス決定、`private`解除、初回publishは未実施。
- Game Fields本体のCookie認証、Redis CAS、WebSocket、戦績、リプレイへゲームmoduleを接続する内部platform adapterは未実装。
- Developer Portalのチュートリアル、APIリファレンス、ゲーム雛形ダウンロード、提出画面は未実装。

## 2026-07-21 — SDK内部platform adapterの認証・Redis CAS実証

### 利用者からの要望

- 公開SDK packageの物理分離に続き、小規模オンラインゲームを使って本体認証・Redis CASへ接続する内部platform adapterの実証を進める。

### 判断

- 外部ゲームへCookie、Redis、DB、環境変数を公開せず、公開SDKだけに依存するゲームmoduleとGame Fields内部Runtimeを物理的に分ける。
- 内部Runtime coreは非公開workspace package `@game-fields/game-runtime`へ置き、CookieとRedisの具体実装は本体`lib/game-sdk-platform-adapter.ts`から注入する。
- Create/Command payloadからactor IDや表示名を受け取らず、署名済みプレイヤーセッションから解決したID・表示名・デバッグ資格だけをtrusted actorへ入れる。
- clientの`expectedRevision`が一致していても保存直前のRedis CASが競合した場合は、Commandを自動再適用せず409相当の`STALE_REVISION`として拒否する。これによりMock Runtimeと本体Runtimeの契約を一致させる。
- 実証ゲームはゲーム一覧へ追加・公開せず、公開SDKだけをimportする小規模な合計カウントfixtureとして自動テストに閉じる。

### 実施結果

- `packages/game-runtime`へplatform room envelope、host/player判定、作成、読取、Command、閲覧者別presentation、revision不変条件を実装した。
- `lib/game-sdk-platform-adapter.ts`へ署名済みプレイヤー認証、Redis TTL保存、原子的な部屋作成、revision CAS、Roomコード・保存サイズ・保存形式の検査を実装した。
- adapterの外向きメソッドからactor/identity引数を除き、操作ごとに本体認証resolverを実行するようにした。
- `GameSdkTrustedActor`へセッション由来の`displayName`を追加し、新規ゲーム雛形からclient入力の`playerName`を削除した。
- `tests/fixtures/sdk-count-up-game.ts`を追加し、別アカウント参加、host開始、同revisionの同時Command、保存Roomと公開RoomViewの分離を検証した。
- SDK境界検査を、公開SDK、内部Runtime core、実証ゲームの3層へ拡張した。実証ゲームから本体`lib`、Redis、DB、環境変数へ依存できない。
- SDK Portalへ本体統合用adapterの認証・Redis CAS実証済みを追記した。

### 検証

- `npm run lint`に成功した。
- 全372テストに成功した。
- `npm run test:sdk-package`でtarballの外部installと3 exportの実行検査に成功した。
- 公開SDK、内部Runtime、本体Next.js、SDK Portalのproduction buildに成功した。

### 未対応・保留

- 汎用HTTP routeとBrowser向けClient Runtimeは未実装。実証fixtureをゲーム一覧や本番routeへ公開していない。
- WebSocket通知、1プレイヤー1部屋、退出・解散、戦績、レーティング、リプレイ、広告、通報・監査のRuntime注入は未実装。
- npm registryのscope所有確認、公開ライセンス決定、`private`解除、初回publishは未実施。
- Developer Portalのチュートリアル、APIリファレンス、ゲーム雛形ダウンロード、提出画面は未実装。

## 2026-07-21 — ChatGPT用SDKスターターZIPの試用開始

### 利用者からの要望

- SDK packageを実際にダウンロードし、利用者本人がChatGPTと一緒にゲームを1本作るところまで試したい。

### 判断

- npm registry公開やPortalでの一般配布より先に、運営者本人が外部利用者と同じダウンロード・ChatGPT開発・再提出の流れを試す。
- SDKの`private: true`と`UNLICENSED`は維持し、試用ZIPをPortalや`main`へ公開しない。
- 初回利用者がコードを理解しなくても始められるよう、SDK tarballだけでなく、貼り付け用プロンプト、`AGENTS.md`、`GAME_SPEC.md`、最小APIリファレンス、提出チェックリスト、動作する型付きゲーム例を1つのZIPへ含める。
- 初期例はダミー2人で最後まで進む小規模カウントゲームとし、ChatGPTが確定した`GAME_SPEC.md`に合わせてゲーム固有部分を置き換える。

### 実施結果

- `sdk/starter-template`へ初回手順、ChatGPT編集指示、仕様書、SDKリファレンス、SDK追加要望欄、提出チェック、manifest、Room／Command／RoomView、server module、契約テスト、完走デモを追加した。
- `scripts/build-game-sdk-starter.mjs`が`@game-fields/game-sdk`をtarball化し、versionとtarball名をテンプレートへ反映して`artifacts/game-fields-sdk-starter-v0.1.0.zip`を生成するようにした。
- 外部zip依存を追加せず、UTF-8の通常ZIPを生成・展開検査する最小実装を`scripts/lib/stored-zip.mjs`へ追加した。
- `scripts/check-game-sdk-starter.mjs`で、空の一時ディレクトリへのZIP展開、同梱SDK install、TypeScript build、契約テスト、CLIデモ完走を自動検査するようにした。
- SDK境界監査へスターターのTypeScript import、platform資源参照、runtime依存を追加した。
- 生成物は`artifacts/`へ置きGit管理対象外とした。試用ZIPは会話内のファイルとして利用者へ渡し、Portalへは追加していない。

### 検証

- 通常のZIP検査で16ファイルすべてのCRCと展開可能性を確認した。
- `npm run test:sdk-starter`で同梱SDK install、型検査、3件の契約テスト、revision 5での1ゲーム完走に成功した。
- `npm run test:sdk-package`でSDK tarballの外部installと3 exportの実行に成功した。
- SDK境界検査を含むESLint、全372テスト、本体72ルートのproduction build、SDK Portalのproduction buildに成功した。


### 未対応・保留

- 利用者本人による実ダウンロード、ZIPのChatGPTへの再投入、ゲーム仕様相談、実装済みpackageの再提出、Game Fields dev統合は次の対話で確認する。
- 試用結果を反映するまでは、SDK ZIPをPortalから一般公開しない。
- npm registryのscope所有確認、公開ライセンス、初回publish、Portalの正式チュートリアル・APIリファレンス・提出画面は未実装。

## 2026-07-21 — Pro版ChatGPT向け公開Git入口

### 利用者からの要望

- 無料版の検証より先に、Pro版ChatGPTを前提とした入口を完成させる。
- SDK一式を毎回ダウンロードさせず、小さな指示書1ファイルから公開Gitを取得してゲーム制作を始められるようにする。

### 判断

- 入口は`sdk/entry/START_GAME_FIELDS.md`の1ファイルとし、現在のChatGPTモードでGit取得、複数ファイル編集、Node.js実行、ZIP返却ができない場合だけWorkまたはCodexへの切替を案内する。
- 新しいGitHub repositoryは増やさず、公開済み`koromo2010/app-games`にスターター19ファイルだけを持つ`sdk-starter`ブランチを作る。入口は`--depth 1 --single-branch`でこのブランチだけを取得し、本体の`main`／`develop`を作業対象にしない。
- スターター内容は従来ZIPと公開Git用snapshotで共通化し、`starter-manifest.json`で公式repository、ref、starter version、SDK versionを検証する。
- 作成したゲームは自動公開せず、`npm run package`で提出ZIPを作り、Game Fields側の検査・審査・dev実プレイ確認へ渡す。

### 実施結果

- Pro版向け入口、公開Git用snapshot生成器、取得元manifest、提出ZIP生成器を追加した。
- `npm run package`は`node_modules`、`dist`、`.git`、過去の提出物を除外し、`submission/game-fields-submission.zip`を生成する。
- 公開`sdk-starter`ブランチをGitHub commit `ffe83c1`として作成し、Vercel用placeholder追加後の先端を`10d2dbb`とした。初回19ファイルのblob SHAとtree `89254ce`、最終20ファイルのtree `21b877c`はローカル検証済みsnapshotと一致する。
- SDK Portal ProjectはRoot Directory `apps/sdk-portal`がスターターbranchにない場合、Ignored Build Stepより先にエラーとなるため、snapshotへ専用placeholderを追加した。これは提出ZIPには含めない。
- `main`、`develop`、Vercel、npm registry、SDK Portalの一般向け導線はこのブランチ公開では変更していない。

### 検証

- `npm run test:sdk-starter`で入口文書、公開Git用snapshotと試用ZIPの同一性、同梱SDK install、型検査、契約テスト、デモ完走、提出ZIPを確認した。
- 公開ブランチを実際に`git clone --depth 1 --single-branch --branch sdk-starter`で取得し、SDK install、契約テスト3件、revision 5でのデモ完走、20ファイルの提出ZIP生成に成功した。
- SDK境界検査を含むlint、全372テスト、本体72ルートのproduction build、SDK Portalのproduction buildに成功した。
- `develop` commit `00fb5ad`の`app-games-dev`とSDK Previewが`READY`になった。`sdk-starter` commit `10d2dbb`のSDK Project Deploymentは既存Ignored Build Stepにより`CANCELED`となり、Root Directory欠落エラーを再発しないことを確認した。

### 未対応・保留

- 運営者本人が入口ファイルをPro版ChatGPTへ実際に添付し、ゲーム相談、実装、提出ZIP返却までの会話体験を検証する。
- 生成された実ゲームをGame Fields devへ統合し、ブラウザから遊べるところまでは未検証である。
- 無料版の通常Chat／Codexで同じ入口がどこまで進むかは、Pro版の実機検証後に確認する。
- Portalからの入口ダウンロード、正式ライセンス、npm registry公開、提出画面は未実装である。

## 2026-07-21 — 初心者向け仕様相談・モック確認導線

### 利用者からの要望

- 作りたいアプリの仕様が決まった後、Git側のアプリ要件を守ったモックをAIに作らせ、内容を説明させるところまで誘導したい。
- 小さなDL用入口ファイル、README、AI用指示、要件、モック用ファイルをGit側で更新可能な形にする。

### 判断

- 既存の公開`sdk-starter`取得導線を維持し、別のランチャーやリポジトリを増やさない。
- 初心者向けの標準順序を「普通の言葉で相談 → 仕様確定 → 共通要件照合 → 静的画面モック → 説明と利用者確認 → 明確な承認後にSDK実装」とする。
- モックはAPI、DB、ログイン、外部CDNへ接続しないHTML/CSS/JavaScriptとし、役割、秘密情報、待機、エラー、切断、時間切れ、結果、PC・スマホを本実装前に確認できるようにする。
- 入口では具体的なゲーム例を採用せず、添付資料を今回の仕様と自動解釈しない。

### 実施結果

- `sdk/entry/START_GAME_FIELDS.md`を、Git取得後に要件とモックガイドを読み、仕様確定後にモックを作り、利用者の承認を待つ流れへ更新した。
- スターターへ`APP_REQUIREMENTS.md`、`MOCK_GUIDE.md`、`MOCK_REVIEW.md`、`mock/README.md`を追加した。
- `AGENTS.md`、`START_HERE.md`、`README.md`、提出チェックリストを同じ段階制御へ更新した。
- `npm run check:mock`を追加し、仕様・確認記録の未記入、モック必須ファイル、HTMLのCSS／JavaScript／viewport参照を検査するようにした。
- スターター配布検査へ新しい要件・モック関連ファイルを追加した。

### 検証

- `scripts/check-mock.mjs`の構文検査に成功した。
- 白紙スターターで`npm run check:mock`相当を実行し、未作成の`mock/index.html`、`styles.css`、`mock.js`を意図どおり拒否することを確認した。
- `npm run test:sdk-starter`は依存未導入で停止し、その後の依存導入も実行環境のnpm cache書込み制約とtar展開失敗により完了しなかった。変更に起因する型・契約テスト失敗は未観測である。

### 未対応・保留

- 更新後の公開`sdk-starter`ブランチを実際にcloneし、初心者との仕様相談、モック生成、説明、承認待ちまでの会話体験を確認する。
- Portalからの入口ダウンロード、正式ライセンス、npm registry公開、提出画面は引き続き未実装である。

## 2026-07-21 — SDKゲームのデバッグモード必須化

### 利用者からの要望

- SDKで生成するゲームは検証用のデバッグモードを必須にしたい。

### 判断

- デバッグはゲームごとの任意機能ではなく、モックと本実装の共通要件とする。
- 最低限、権限あり／なし、ダミー参加者、閲覧視点、主要フェーズと異常状態、ダミー自動進行、進行中断を1人で確認できるようにする。
- 本実装では共通デバッグUIとサーバー側権限検証を使い、一般利用者へ操作を表示しない。

### 実施結果

- SDKスターターのAI指示、共通要件、仕様書、モックガイド、確認記録をデバッグ必須へ更新した。
- `check:mock`へ仕様・確認記録・モック内の必須デバッグ項目検査を追加した。
- 本体READMEと新規ゲーム追加チェックリストも任意表現から必須へ変更した。

### 検証

- `check-mock.mjs`の構文検査と差分整合性を確認する。

### 未対応・保留

- 本番共通UIパッケージをSDKモックから直接利用する仕組みと、公開`sdk-starter`ブランチへの同期は別途確認する。


## 2026-07-21 — SDK標準UIプレビューと再利用モジュール案内

### 利用者からの要望

- SDKモックをゲーム固有画面だけで始めず、本番同様の広場で新作ゲームを選び、入室・部屋ロビー・ゲームへ進む掲載体験にしたい。
- ゲーム部分以外はスターターへ個別複製せず、SDKの最新版共通UIモジュールを利用したい。
- AIへ既存のトランプ・お絵描き基盤を知らせ、今後モジュールが増えるほど新規ゲーム制作を効率化したい。

### 判断

- SDKプレビューの標準導線を「広場 → 新作カード → 入室前 → 部屋ロビー → ゲーム → 結果／同じ部屋へ復帰」とする。
- 共通UIの正本はSDKモジュールに置き、ゲームpackageはゲームカード情報とゲーム固有領域だけを提供する構成を目標とする。スターター内の静的共通UIは閲覧用生成物であり、長期的な正本にはしない。
- AIが利用可能な機能を推測しないよう、区分付きの`SDK_MODULE_CATALOG.md`を設ける。現在本体に存在してもSDKから直接importできないトランプ・お絵描き部品は「本体統合時に利用」と明記し、ゲーム内へコピーさせない。

### 実施結果

- スターターへ、広場、ゲームカード、入室前、部屋ロビー、ゲーム固有slot、ルール、必須デバッグを操作できる依存なしプレビューを追加した。
- `APP_REQUIREMENTS.md`と`MOCK_GUIDE.md`へ、本番相当の掲載導線とゲーム固有領域だけを編集する境界を追加した。
- `SDK_MODULE_CATALOG.md`を追加し、標準UI、トランプ、描画キャンバスの現在の機能、利用区分、仕様へ記録すべき項目を整理した。
- AI指示、仕様書、モック検査、スターター配布検査からモジュールカタログを参照するようにした。

### 検証

- 変更ファイルの`git diff --check`、変更したNode.js検査スクリプトの構文確認に成功した。
- `check:mock`は白紙の`GAME_SPEC.md`に未記入が残るため、設計どおり完走前に停止した。今回追加した標準プレビュー自体のブラウザ実機確認は未実施である。

### 未対応・保留

- 共通UIをSDK packageのversion付きモジュールへ移し、スターターの閲覧用ファイルをそこから生成する処理は未実装である。
- 本体内のトランプ・お絵描きUIとロジックを外部SDKの公開interfaceとして切り出す作業は未実装である。
- ローカル`develop`は既に公開先より先行しており、今回の変更もGitHubおよび`sdk-starter`へ未反映である。

## 2026-07-21 — 制作者別SDK環境・URL予約・DownloadMe常設

### 利用者からの要望

- `sdk.game-fields.com`から常に最新のDownloadMeを取得できるようにする。
- 制作者ごとにURLを一つ割り当て、その中の広場から同じ制作者のゲームを選び、部屋とデバッグを確認できるようにする。
- 制作開始時にURL名を聞き、AIがSDK側へ重複確認してから予約する。

### 判断

- 分離単位はゲームではなく制作者とし、`/<creator-slug>`配下にその人の簡易Game Fields環境を置く。
- slug予約はRedisの原子的な`SET NX`を使い、未設定・障害時に予約成功を推測しない。
- 入口ファイルは正本からPortalのbuild前に同期し、古い手動コピーを配布しない。

### 実施結果

- PortalトップへDownloadMeのダウンロード導線とデモ環境への入口を追加した。
- `sync:download`を追加し、`sdk/entry/START_GAME_FIELDS.md`から`public/DownloadMe.md`を生成するようにした。
- 制作者slug別の広場、ゲーム選択、部屋ロビー、中央ゲーム領域、結果、デバッグパネルの初期プレビューを追加した。
- slug正規化、予約語、重複確認API、7日間の仮予約API、予約トークンを追加した。
- DownloadMeとスターターAI指示を、最初に制作者URL名を確認・予約し、その後ゲームの核を対話で決める順序へ更新した。

### 検証

- DownloadMeの正本同期に成功し、`git diff --check`に成功した。
- SDK Portal buildは依存の`next`が未導入で停止した。`npm install`も実行環境のnpm tarball破損が繰り返され、依存導入を完了できなかったため、production buildは未検証である。

### 未対応・保留

- SDK Portalへ専用Redis REST環境変数を設定し、実環境でslug確認・競合予約を検証する。
- 現在の部屋状態はブラウザ内保存であり、別端末・共同検証用のサーバーRoom永続化は未実装である。
- 共通UI、トランプ、お絵描きの正式なversion付きSDK公開モジュール化は継続作業である。
- GitHub、`sdk-starter`、Vercelへは未反映である。

## 2026-07-21 — SDKトップのDownloadMe公開修正

### 利用者からの要望

- 公開中のSDKトップから最新版DownloadMeを実際にダウンロードできるようにする。

### 判断・実施結果

- ヒーローと開始セクションの両方に常時表示するダウンロード導線を置いた。
- `/DownloadMe.md`へ`Content-Disposition: attachment`を付け、ブラウザ内表示ではなく`DownloadMe.md`として保存されるようにした。
- 配布物は引き続き`sdk/entry/START_GAME_FIELDS.md`を正本とし、Portalのdev/build前に同期する。

### 検証

- 正本とPortal配布ファイルの完全一致、および`git diff --check`に成功した。
- SDK Portalのlint/buildは実行環境でnpm tarball破損とnpm cache directory作成失敗が発生し、依存導入できないため未完了である。

### 公開

- この記録時点ではGit反映前。SDK PortalのProduction Branchは`main`のため、`develop`反映後にPortal対象差分を`main`へ反映し、公開URLの応答を確認する。
## 2026-07-22 — main・SDK共通のPlatform VersionとSDK後方互換

### 利用者からの要望

- Game Fields本体とSDKのバージョンを合わせ、SDK更新で既存ゲームが動かなくなる事態を避けたい。

### 判断

- 本体・Portal・DownloadMe・SDK packageの公開単位には共通のPlatform Versionを使う。
- 既存ゲームは作成時のSDK contract schemaへ固定し、Platform更新時に一斉更新しない。破壊的変更時は新しいcontract schemaと旧schema adapterを併存させる。

### 実施結果


- `config/platform-release.json`を版情報の正本として追加した。
- package、SDK contract、room schemaの不一致を拒否する`check:versions`をlintへ追加した。
- DownloadMeとSDK Portalへリリース情報を同期し、スターターmanifestへPlatform・SDK contract版を埋め込むようにした。
- 互換性ルールとリリース手順を`docs/SDK_VERSIONING.md`へ記録した。

### 検証

- `npm run check:versions`成功。
- SDK Portalの`sync:download`成功。

### 未対応・保留

- dev SDK／SDK本番のVercel Project分離と実環境公開は未実施。
- contract schemaを将来追加した時点で、旧schema adapterと全登録ゲームの版別CIを実装する。

## 2026-07-22 — SDK devのNeon・Redis保存基盤

### 利用者からの要望

- `sdk-dev`から先にSDK用DB基盤を整え、`sdk`とは保存先だけを分離しつつ同じ制作フローで使えるようにする。

### 判断

- 7日間のslug仮予約と競合ロックはRedis、正式な制作者slugとゲーム登録情報はPostgreSQLを正本とする。
- 部屋の汎用JSON保存はゲームRuntime契約が未確定のため、この作業では先行実装しない。
- 正式確定時に一度だけ管理トークンを返し、DBにはSHA-256ハッシュだけを保存する。

### 実施結果

- Vercelの`app-games-sdk-dev`へ`develop`をProduction Branchとして割り当て、`sdk-dev.game-fields.com`、`sdk-dev-neon`、`sdk-dev-redis`の接続と再デプロイまで完了した。
- `sdk_creators`と`sdk_games`のschema、slug正式確定API、管理トークン認証付きゲーム登録API、公開ゲーム一覧APIを追加した。
- 制作者広場がPostgreSQLへ登録されたゲームカードを表示するようにした。
- DownloadMeはbuild元に応じて`sdk-dev.game-fields.com`または`sdk.game-fields.com`へ接続し、制作フロー自体は同一と明記した。

### 検証

- `npm run check:versions`、`npm run check:sdk`、DownloadMe同期、`git diff --check`に成功した。
- SDK Portal buildは作業環境のnpm tarball展開破損により依存導入できず、ローカルでは未完了。

### 未対応・保留

- 変更を`develop`へ反映し、Vercel buildと実環境での予約→確定→ゲーム登録→広場表示を確認する。
- SDK RoomのRedis永続化、複数端末同期、Runtime APIは次段階。
- SDK本番側のNeon・Redisは、devで同じschemaとフローを確認した後に別ストアとして準備する。
## 2026-07-22 — 公開SDKスターターのmanifest同期修正

### 利用者からの要望

- DownloadMeから開始したゲーム制作が、公開スターターの`starter-manifest.json`に版情報がなく停止する問題を直す。

### 判断

- `sdk/starter-template`を正本とし、公開`sdk-starter`ブランチを手作業で直さず、検査済みsnapshotを再生成して同期する。
- `platformVersion`と`sdkContractVersion`を公開前検査の必須項目にし、再発を防ぐ。

### 実施結果

- 公開前検査へPlatform VersionとSDK contract versionの検証を追加した。
- SDKのクリーン型検査で利用するTypeScript標準ライブラリへ`DOM`を追加し、`structuredClone`の型解決を修正した。

### 検証

- `npm run test:sdk-starter`に成功した。入口文書、公開Git用snapshot、manifest必須項目、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。

### 未対応・保留

- `develop`へ公開前検査と型設定を反映した（`19ce506`）。
- `sdk-starter`の現行履歴を維持したままmanifestを更新した（`660f29c`）。公開ファイルを再取得し、`platformVersion: 0.1.0`と`sdkContractVersion: 1`を確認した。
- 公開ブランチ全体の再生成snapshotへの置換は、同時更新を保護するため見送った。今回の制作停止原因はmanifest更新で解消済み。
## 2026-07-22 — SDKのGit自動保存と別オリジンmockプレビュー

### 利用者からの要望

- AIが作成したクライアント側mockを、制作者のSDKインスタンスURLからクライアントへ見せたい。
- ゲームごとのVercel操作や手動アップロードを不要にし、この開発環境と同様にAIの生成物を裏側でGitへ自動保存したい。
- SDK公開を前提に、未審査JavaScriptからPortal、本体認証、DB、管理APIへ影響しない構成にしたい。

### 判断

- 案内URLは`<SDK Portal>/<creator-slug>/mock/<game-id>`のままにし、未審査mockの実行だけを別オリジン`preview-dev.game-fields.com`／`preview.game-fields.com`へ分離する。
- mockの正本は本体の公開Gitではなく、Game Fields管理下の専用非公開Gitリポジトリとする。SDK Portalだけに同repoの書込資格、隔離previewだけに別の読取専用資格を付ける。
- AIは制作者の管理トークンで限定upload APIを呼ぶ。Portalが`previews/<slug>/<game-id>/mock`へcommitするため、外部開発者へGit、Vercel、`develop`、`main`の権限を渡さない。
- Portal DBには確定commit SHAを保存し、Portalとpreviewの環境別共有秘密で10分の閲覧grantを署名する。previewはDB、Redis、Blob、管理API、Git書込資格を持たない。
- iframe属性とHTTP CSPの両方から`allow-same-origin`、外部通信、フォーム、子frame、親画面操作を許可せず、mock scopeのHttpOnly Cookieだけを使う。

### 実施結果

- `apps/sdk-preview`を独立Next.jsアプリとして追加し、health、署名grant受領、scope限定Cookie、Git asset取得、MIME固定、容量上限、CSP sandbox、robots拒否を実装した。
- 非公開workspace `packages/sdk-preview-auth`へgrantのHMAC署名・期限・ID・確定40桁revision検証を集約した。
- SDK Portalへ管理トークン付きmock保存APIを追加した。必須3ファイル、拡張子、path traversal、重複、32ファイル、単体2MB、合計5MBを検査し、Git blob/tree/commit/refを原子的に更新する。並行ref更新は最新parentから最大3回再試行する。
- `sdk_games.mock_revision`を追加し、制作者広場の実mockカード、共有ページ、隔離iframeを接続した。修正後も共有URLは変わらず、表示時に最新の紐付けrevisionへ短時間grantを発行する。
- スターターへ`mock/preview.json`と`npm run publish:mock`を追加し、AIがcheck後にSDKへ保存して共有URLを案内する制作フローへ更新した。
- 本体root buildから独立Next.js workspaceを除外し、Portalとpreviewはそれぞれのtsconfig/buildで検査する境界を明示した。

### 検証

- `npm run lint`、SDK Portal lint、隔離preview lintに成功した。
- `npm test`で全378テストに成功し、追加の署名改ざん・期限、path traversal、MIME、upload必須ファイル・重複・容量境界も成功した。
- `npm run build`、`npm run build:sdk`、`npm run build:sdk-preview`に成功した。
- `npm run test:sdk-starter`で入口、公開Git用snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。

### 未対応・保留

- 専用非公開mock Gitリポジトリを作成し、Portal用Contents read/write資格とpreview用Contents read資格を別々に発行する。
- Vercel Project `app-games-preview-dev`をRoot Directory `apps/sdk-preview`、Production Branch `develop`で作成し、`preview-dev.game-fields.com`を割り当てる。
- `docs/ENVIRONMENT_VARIABLES.md`記載のPortal／preview環境変数を設定し、再デプロイ後に実際のmock保存、Git commit、共有URL、iframe asset読込、期限切れ・不正URL拒否を実機確認する。
- SDK本番用の専用Git・資格・署名鍵・preview Projectは、sdk-devの一連動作を確認してから別値で作成する。

## 2026-07-22 — SDK dev mock保存先と隔離previewの外部設定

### 利用者からの要望

- SDK devの環境変数はVercel画面だけで場当たり的に扱わず、以前決めたとおりGitの環境変数台帳を正本として継続管理する。

### 判断

- 秘密値はGitへ保存せず、キー名、配置Project、Vercel対象環境、Sensitive区分、設定確認状態、再デプロイ状態だけを`docs/ENVIRONMENT_VARIABLES.md`へ記録する。
- Vercel操作の案内前に台帳を確認し、操作後に同じ行の状態を更新する。期待配置と現在配置を分け、未確認を設定済みと扱わない。

### 実施結果

- private repo `koromo2010/game-fields-sdk-mocks-dev`を作成した。
- Portal用にContents read/writeだけの資格、preview用にContents read-onlyだけの別資格を発行した。
- `app-games-sdk-dev`へ`SDK_MOCK_GITHUB_REPOSITORY`と`SDK_MOCK_GITHUB_WRITE_TOKEN`、`app-games-preview-dev`へ`SDK_MOCK_GITHUB_REPOSITORY`と`SDK_MOCK_GITHUB_READ_TOKEN`をProduction対象で登録した。
- `SDK_PREVIEW_SIGNING_SECRET`をTeam Shared Variableとして作成し、両ProjectのProductionへLinkした。
- `app-games-preview-dev`をRoot Directory `apps/sdk-preview`で作成し、Production Branchを`develop`へ変更した。
- Git台帳の現在配置表を更新した。途中で既存`SDK_MOCK_GITHUB_REPOSITORY`を重複追加する誤案内があり、台帳を参照していなかった運用上の問題として訂正した。

### 検証

- Vercel上で両Projectへの共有署名鍵Linkと各Project Variableのキー名・対象環境を画面確認した。秘密値は記録・表示していない。
- Vercel APIで`app-games-preview-dev`の最新Deploymentが初回`main`由来のままであることを確認した。環境変数追加後の`develop`再デプロイと実機動作は未実施。

### 未対応・保留

- `app-games-sdk-dev`と`app-games-preview-dev`を新しい環境変数構成で再デプロイする。
- `preview-dev.game-fields.com`を割り当て、mock保存、private Git commit、共有URL、iframe asset、期限切れ・不正署名拒否を実機確認する。
- `app-games-preview-dev`のIgnored Build Stepを確認・設定する。
- 作成途中に増えた`app-games-sdk-portal`はcustom domainを持たない。使用予定がないことを確認後、削除するか判断する。

## 2026-07-22 — 別スレッドでも環境変数管理を忘れない運用

### 利用者からの要望

- 別のChatGPTスレッドへ移っても、Gitで管理している環境変数台帳の確認・更新を忘れない仕組みにしたい。

### 判断

- 会話ログや担当者の記憶ではなく、リポジトリ直下の `AGENTS.md` から必ず台帳へ誘導する。これにより、リポジトリを開いた別スレッドにも作業開始時の制約として伝える。
- 現在配置の正本は `docs/ENVIRONMENT_VARIABLES.md`、判断経緯は `docs/DEVELOPMENT_THREAD_LOG.md` とし、外部設定変更では両方を更新する。
- 「登録済み」「Shared Link済み」「再デプロイ済み」「実機確認済み」を分け、途中状態を完了と誤認しない。
- PR経由の作業にも同じ確認を残すため、PRテンプレートへ環境変数・外部設定チェックを追加する。

### 実施結果

- `AGENTS.md` に、Vercel・DB・Redis・Blob・DNS・GitHub権限・外部API設定を案内する前の台帳確認と、変更後の同時更新を必須化した。
- `docs/README.md` の別スレッド向け資料ナビへ、会話記憶ではなく環境変数台帳から再開するルールを追加した。
- `docs/ENVIRONMENT_VARIABLES.md` に別スレッド再開手順と状態定義を追加した。
- `docs/DEVELOPMENT_LOGGING.md` に、現在配置と経緯の二重記録ルールを追加した。
- `.github/pull_request_template.md` を追加し、外部設定変更時の台帳更新と秘密値非保存を確認項目にした。

### 検証

- GitHub上の `develop` で各ファイルを再取得し、必須導線と状態定義が存在することを確認する。
- 文書・PRテンプレートのみの変更であり、アプリの実行コードや環境変数値は変更していない。

### 関連コミット

- `4c9f155` — ルートのエージェント指示へ環境変数台帳確認を必須化
- `2aa9ba0` — 資料ナビへ別スレッド再開ルールを追加
- `e6a7dd8` — 環境変数台帳へ再開手順と状態定義を追加
- `877833a` — 外部設定の二重記録ルールを追加
- `06f18f0` — PRテンプレートへ外部設定チェックを追加

### 未対応・保留

- 現在進行中のSDK-dev／preview-dev設定作業は、台帳記載の未完了事項から再開する。共有鍵追加後の再デプロイ、previewドメイン割当、Ignored Build Step、実機mock確認はまだ完了扱いにしない。

## 2026-07-22 — 隔離SDK previewのVercel build修正

### 調査結果

- `preview-dev.game-fields.com`のDNS割当はValid Configurationになったが、`app-games-preview-dev`が誤って`apps/sdk-portal`を配信していた。
- VercelのRoot Directoryを`apps/sdk-preview`へ訂正した後、PostCSS設定が要求する`@tailwindcss/postcss`を単独workspace installで解決できずbuildが失敗した。
- ルートworkspaceにはTailwind依存があったが、Vercelは`apps/sdk-preview`をRoot Directoryとして単独installするため、previewアプリ自身のmanifestにも依存宣言が必要だった。

### 実施結果

- `apps/sdk-preview/package.json`へ`@tailwindcss/postcss`と`tailwindcss`をdevDependencyとして追加し、lockfileを同期した。
- 環境変数台帳へ、共有鍵反映後のDeployment、previewドメイン、Root Directory訂正とbuild修正の状態を反映した。秘密値は変更・記録していない。

### 検証

- `npm run build:sdk-preview`に成功し、`/health`、`/open/...`、`/p/...`を含む隔離previewの全Routeがbuildされた。

### 公開確認

- 修正コミット`dfdab59`を`develop`へ反映した。
- VercelのProduction buildが`@game-fields/sdk-preview`を対象に完了し、DeploymentがREADYになった。
- `https://preview-dev.game-fields.com/health`がHTTP 200と`{"ok":true,"service":"game-fields-sdk-preview"}`を返すことを確認した。

### 未対応・保留

- Portalからのmock保存、private Git commit、共有URL、iframe asset読込、期限切れ・不正署名拒否を実機確認する。

## 2026-07-22 — SDK発行URLをモック完成条件として強制

### 利用者からの要望

- DownloadMeからゲームを作った際、ローカルHTMLの案内で終わらず、SDK-devへ保存して遊べるSDK URLを返す制作フローにする。
- 配布ファイル名を用途が分かる`GameFieldsDownloadMe.md`へ変更する。既存利用者はいないため旧ファイル名の互換導線は持たない。

### 実施結果

- 入口文書とスターターAI指示へ、`check:mock`成功、SDK保存、`saved: true`、`previewUrl`取得、クリック可能なURL案内をモック完成条件として追加した。
- SDK保存やURL取得に失敗した場合、ローカルHTML、チャット内プレビュー、推測URLを代替完成品として案内することを禁止した。
- `publish:mock`が有効な`previewUrl`を検査し、`saved`、`gameId`、`previewUrl`のJSONと利用者向け保存結果を出力するようにした。
- Portalの配布ファイルと導線を`GameFieldsDownloadMe.md`へ変更し、同期元は引き続き`sdk/entry/START_GAME_FIELDS.md`に一本化した。
- スターター回帰検査へ新しい完成条件の必須文言を追加した。

### 検証

- `git diff --check`に成功した。
- `npm run test:sdk-starter`に成功し、入口、公開snapshot、ZIP、SDK install、型検査、契約テスト、デモ完走を確認した。

## 2026-07-22 — SDKダウンロード前の利用案内を追加

### 利用者からの要望

- DownloadMe内ではなく、SDK Portalのダウンロード前に、初回モック作成の所要時間、制作途中の修正指示、URL発行後の確認方法を人間向けに説明する。
- 制作には通常チャットではなくChatGPTのCodexまたはWorkが必要であることと、その理由も明示する。
- 試用期間中は配布名を`GameFieldsDownloadMe-ver1.md`とし、改版ごとに`verN`を上げる。仕様固定後にバージョンなしへ戻す。

### 実施結果

- SDK Portalのダウンロード直前へ、10〜20分の目安、作業中の追加指示、SDK発行URLでの確認と継続修正を案内する3項目を追加した。
- Codex／Workがコード取得、複数ファイル編集、検査、SDK保存、URL発行に必要であり、通常チャットで生成されたローカルHTMLはSDK保存済み完成版ではないことを独立した注意欄で説明した。
- 配布URL、ダウンロード名、同期先を`GameFieldsDownloadMe-ver1.md`へ統一し、狭い画面では案内を1列表示にした。

## 2026-07-22 — 表アカウントとSDK所有権の共通化を開始

### 利用者からの要望

- SDK専用アカウントを増やさず、表のGame Fieldsアカウントを共通利用する。
- 一度ChatGPTへ接続すれば、同じChatGPTアカウントの別端末・別チャットから過去のSDK制作物を扱える構造にする。

### 判断

- DownloadMeへパスワードや恒久トークンを埋め込まず、表アカウントを正本とする。
- ブラウザ間は短期署名コードによるSSO、ChatGPTとの永続的な連携はOAuth 2.1付きMCP Appで分離する。
- 既存の管理トークン経路は移行中の互換経路として残し、新規制作者から`owner_player_id`を付与する。

### 実施結果

- 本体に認証済みプレイヤーから60秒のSDK接続コードを発行するAPIを追加した。
- SDK Portalにstate検証付きの開始・callback APIと30日SDK専用HttpOnly Cookieを追加した。
- 未ログイン時は表のゲーム一覧でログインを求め、成功後にSDK接続へ自動復帰する導線を追加した。
- `sdk_creators.owner_player_id`を後方互換migrationで追加し、ログイン中に確定した新規制作者へ所有者を記録するようにした。

### 検証

- SDK接続コードの署名、改ざん拒否、期限切れ拒否の単体テストに成功した。
- `npm run build:sdk`に成功した。

### 未対応・保留

- `SDK_ACCOUNT_LINK_SECRET`と`GAME_FIELDS_APP_BASE_URL`はVercelへ登録・再デプロイ済み。表アカウント側DB・Redis復旧後の実機SSO確認が必要。
- ChatGPT App用MCPサーバー、OAuth discovery、PKCE、アクセストークン、scope検証、App登録は未実装。
- 所有者未設定の既存`test3`等をアカウントへ引き取る管理導線は未実装。

## 2026-07-22 — develop本体の環境変数・Storage状態を台帳へ反映

### 確認結果

- `PLAYER_SESSION_SECRET`は`app-games-dev`のProductionへSensitive登録・再デプロイ済みで、実行ログ上の未設定エラーは解消した。
- `SDK_ACCOUNT_LINK_SECRET`は本体側が追加申告済み、SDK Portal側は画面確認済み。共有値の一致とSSO実機動作は未確認として区別した。
- `GAME_FIELDS_APP_BASE_URL`はSDK PortalのProductionへ登録・再デプロイ済み。
- 開発用Neonを`app-games-dev-neon`としてSingapore、Authなし、Freeで作成し、`app-games-dev`のProductionへ接続した。
- Neon Integrationが`NEON_DATABASE_*`一式を自動登録したことをVercel画面で確認した。既存`DATABASE_URL`は削除せず保持している。
- 現行コードはまだ`NEON_DATABASE_URL`を読まないため、DB接続反映済みとは扱わない。schema migrationも未実施である。
- 開発用Redisは未作成で、アカウント登録・ログイン・SDK SSOの実機確認は未完了である。

### 台帳更新

- `docs/ENVIRONMENT_VARIABLES.md`へDevelopment本体の現在配置表を追加した。
- 「登録済み」「再デプロイ済み」「実行ログ確認済み」「実機確認済み」を混同せず記録した。

### 管理漏れの原因と再発防止

- 最初の台帳更新はローカル編集だけで止まり、未コミット・共有`develop`未反映のまま「更新済み」と報告していた。別スレッドから参照できる永続状態ではなかった。
- 台帳が手書きだけだったため、コードが参照する環境変数のうち21キーが未記載だった。
- `scripts/check-environment-ledger.mjs`を追加し、コード参照キーが台帳にない場合は`npm run lint`を失敗させるようにした。
- 台帳編集だけで完了とせず、検査、コミット、共有branch反映、共有側からの再取得確認までを永続更新の完了条件とする。

## 2026-07-22 — 開発DB・共有Free Redisのコード切替

### 利用者からの要望

- `app-games-dev-neon`と、追加課金を避けてSDK-devのFree Redisを共有する外部設定の続きを実装する。

### 判断

- 開発Neonは`NEON_DATABASE_URL`を旧`DATABASE_URL`より優先する。
- Redisは`DEV_REDIS_*`資格を旧Redis資格より優先し、dev本体の全キーへ中央アクセス層で`app-dev:`を付け、SDK Portalの既存`sdk:`キーと論理分離する。

### 実施結果

- Vercel画面で`DEV_REDIS_REDIS_URL`、`DEV_REDIS_KV_URL`、`DEV_REDIS_KV_REST_API_URL`、`DEV_REDIS_KV_REST_API_TOKEN`、`DEV_REDIS_KV_REST_API_READ_ONLY_TOKEN`のProduction登録を確認した。
- DB・Redisの接続優先順位とRedisコマンドの名前空間化を実装し、環境変数台帳と引継ぎ資料を更新した。

### 検証

- `npm test`（383件）、`npm run lint`、`npm run build`に成功した。
- Vercel再デプロイ、schema migration、登録・ログイン実機確認は未実施。

### 未対応・保留

- 共有`develop`反映後にVercelの再デプロイを確認し、開発Neonへschemaを適用する。

## 2026-07-22 開発ストレージ分離の共有反映・接続確認

### 実施

- 開発Neon／共有Free Redisの優先接続と`app-dev:`名前空間分離を、共有`develop`の`0773a78`へ反映した。
- Vercel `app-games-dev`のProduction Deployment `dpl_BD5vAa8NDCkSAe3eEog1qq4uWudx`が対象SHAをビルドし、`READY`および`dev.game-fields.com`へのalias反映を確認した。
- 存在しない資格で`POST /api/player-account`を実行し、`401 INVALID_CREDENTIALS`を確認した。この経路でRedisレート制限、PostgreSQL schema自動適用、アカウント照会が成功している。

### 現在状態

- `NEON_DATABASE_URL`優先接続、開発Neonのschema、`DEV_REDIS_*`優先接続は実機確認済み。
- 新規アカウントの登録・ログイン・セッション保持をブラウザで確認する工程は未実施。
- 旧`DATABASE_URL`と旧`REDIS_URL`は安全のため保持中であり、削除判断は新規登録・ログイン確認後とする。
- `dev.game-fields.com`で新規登録・ログイン、Redis利用、SDK-dev SSOを実機確認する。

## 2026-07-22 — SDK Portalの認証・本体連携状態を可視化

### 利用者からの要望

- SDK Portalの画面上で、ログイン中か未ログインか、本体のどのアカウントと連携しているかを判別できるようにする。

### 判断

- SDK専用アカウントを増やさず、既存の30日SDK連携CookieをSDKのログイン状態として表示する。
- 本体の署名コードへ表示名を追加する。パスワード、本体Cookie、メール等はPortalへ渡さない。
- 旧Cookieは失効させず後方互換で受理し、表示名がない場合は再連携を案内する。

### 実施結果

- Portalヘッダーへ、未ログイン時のログイン導線と、ログイン中の表示名・本体連携状態・再連携・ログアウトをまとめたアカウントメニューを追加した。
- 本体のSDK連携コード、Portalの検証・Cookieを表示名対応にし、SDK側のログアウトAPIを追加した。

### 検証

- `npm run build:sdk`と`npm run lint`に成功した。

### 未対応・保留

- `develop`共有反映とSDK-devの再デプロイ後、`test10`で再連携し、表示名とログアウトをブラウザで確認する。

## 2026-07-22 — Work／Codex共通のSDK OAuth・MCP制作経路

### 利用者からの要望

- DownloadMeを別チャットへ渡した制作でSDK認証が引き継がれず、登録前に完成扱いになる問題を修正する。
- Codex専用ではなくChatGPT Workにも対応し、Game Fieldsアカウントへ正式ログインする方式にする。

### 判断

- DownloadMeへ期限付きtokenを埋め込む途中案は撤回する。
- WorkはApp、CodexはリモートMCPとして、同じOAuth 2.1付きSDK接続を使用する。
- 初回だけブラウザでGame Fieldsアカウントと制作権限を承認し、以後はaccess tokenの更新をクライアントへ任せる。DownloadMeだけで未登録Appが自動導入されるとは扱わない。
- MCP toolは制作者URLの確認・本人名義の予約／確定・本人環境へのモック保存に限定する。

### 実施結果

- OAuth protected resource metadata、authorization server discovery、DCR、authorization code + S256 PKCE、refresh token rotation、revocationをSDK Portalへ追加した。
- OAuth資格はPostgreSQLへハッシュ保存し、scopeと所有者を各SDK操作で検証する。
- `/api/mcp`へ制作toolsを追加し、`publish_mock`が実保存後にだけ`saved: true`と`previewUrl`を返すようにした。
- DownloadMeを`ver2`へ更新し、秘密値埋込みと旧管理token前提を新規Work／Codexフローから外した。

### 検証

- SDK Portal単体build、`npm run lint`、386件の`npm test`、本体production buildに成功した。
- OAuth／MCP境界のsource regression testを追加し、PKCE、認証challenge、scope、本人所有権、DownloadMeへの秘密値非混入を自動検査した。

### 未対応・保留

- 共有`develop`反映、SDK-dev再デプロイ、ChatGPT Work側のGame Fields App登録、Codex側のリモートMCP接続、OAuth実機認可、`publish_mock`実保存を順に確認する。

## 2026-07-22 — SDK OAuth・MCPの共有反映と公開疎通確認

### 実施

- Work／Codex共通のOAuth・MCP実装を共有`develop`の`53c6b35`へ反映した。
- Vercel `app-games-sdk-dev`のProduction Deployment `dpl_9AiJM4M4MQmHY2ZtV77dmbKktPW5`が対象SHAをビルドし、`READY`になったことを確認した。
- `sdk-dev.game-fields.com`でOAuth authorization server metadataとprotected resource metadataが200を返すことを確認した。
- 未認証のMCP POSTが401を返し、`WWW-Authenticate`でprotected resource metadataと`scope="sdk:creator sdk:mock"`を案内することを確認した。
- `GameFieldsDownloadMe-ver2.md`が200かつ添付ファイルとして取得できることを確認した。

### 未対応・保留

- ChatGPT WorkへのGame Fields App登録、CodexへのリモートMCP接続、ブラウザでのOAuth認可、認証後のtool一覧・予約・`publish_mock`実保存は未実施。

## 2026-07-22 — ChatGPT WorkでSDK MCP toolが0件になる問題

### 利用者からの要望

- SDK-devをOAuth接続して更新しても、ChatGPTのプラグイン画面に利用可能なアクションが表示されない問題を修正する。

### 判断

- OAuth接続は成立しており、問題をMCP初期化とtool discoveryの互換層として扱う。
- 手書きMCP routeが固定していたprotocol versionを、ChatGPTが提示する対応版から選ぶ方式へ変更する。
- ChatGPTが各操作の性質を安全に判定できるよう、tool title、引数説明、read-only／destructive／idempotent／open-world annotationsを明示する。

### 実施結果

- MCPの対応版として`2025-06-18`、`2025-03-26`、`2024-11-05`を宣言し、対応するクライアント提示版をinitialize responseへ返すようにした。
- tools capabilityへ`listChanged: false`を明記し、4件のtool定義へ表示名と操作属性を追加した。

### 未対応・保留

- 自動テスト・build後に共有`develop`へ反映し、SDK-dev再デプロイ後、ChatGPTの「更新する」で4アクションが表示されることを実機確認する。

## 2026-07-22 — DownloadMeのプラグイン導線とSDK mock Git保存エラー

### 利用者からの要望

- Game Fields toolsがない状態でURL名・ゲーム内容を先に聞いた案内がミスリードだったため、DownloadMeへプラグイン導入案内を明記する。
- Workからのモック保存で`SDK mock Git storage is not configured`となる問題を修正する。

### 調査結果と判断

- ChatGPT Workでは`gameapp-dev`プラグインが未選択なら、制作質問より先に追加・選択を案内する。候補に存在しない場合だけ、開発者モードからOAuth MCP Appを追加する手順へ進む。
- OAuth接続、MCP初期化、tool discoveryまでは成功し、4操作が表示された。
- `publish_mock`はGit保存開始時に失敗した。Vercel台帳ではRepositoryとWrite Tokenを登録済みとしていたが、実行時にはRepository形式不正またはWrite Token欠落のどちらかを検出しており、台帳と実態が矛盾している。
- 秘密値をログへ出さず不足キーだけを特定できるよう、Git保存設定エラーへ環境変数名を含める。

### 実施結果

- `GameFieldsDownloadMe-ver2.md`へ`gameapp-dev`優先の接続案内と、接続確認前に制作質問を始めない制約を追加した。
- mock Git設定検査を、不足・不正な環境変数名が分かるエラーへ変更した。
- 環境変数台帳を実機結果に合わせて訂正した。

### 未対応・保留

- 変更を共有`develop`へ反映してSDK-devを再デプロイする。
- `publish_mock`を再試行して不足キーを特定し、`app-games-sdk-dev`のProduction環境変数を修正後、`saved: true`とpreview表示まで確認する。
## 2026-07-22 — SDK制作者環境を本体UI・module構成へ変更

### 利用者からの要望

- `/<creator>/mock/<game>`の独自簡易UIではなく、本番と同じログイン・広場・カード・共通メニュー上で制作中ゲームを検証したい。
- ゲーム全体Sourceがmodule構成を持ち、ゲームごとに任意moduleを不採用にでき、Game Fieldsが必須moduleを強制する設計にしたい。

### 判断

- カード情報だけのSourceではゲーム固有Controller・domain・presentation・server処理を表現できないため、Runtime参照とmodule policyを含む`GameDefinition`を共通入口にする。
- 認証、session、共通ナビ、プレイヤーメニュー、永続化adapter、最終認可、観測はplatform固定とし、ゲームpackageから無効化・置換できない。
- 任意moduleの未採用は欠落ではなく、理由付き`disabled`を必須にする。

### 実施結果

- 現行registryとSDK game descriptorを同じ`GameDefinition`へ変換し、本体`GameLobby`へ追加ゲームを渡せるようにした。
- SDK Portalの制作者URLを本体dev UIの全画面表示へ変更し、公開ゲームURLを`/<creator>/games/<game-id>`へ変更した。
- platform/core/capabilityの型付きmodule policyを追加した。

### 検証

- `npm run lint`成功。
- 本体production buildとSDK Portal production build成功。
- 全386テスト成功。現行9ゲームのcapability採否を明示registryへ移す監査とSDKゲーム固有surfaceの完全package化は未完了。

### 未対応・保留

- `publish_mock`というtool名、内部Gitの`mock`保存名、旧互換URLをgame package表現へ移行する。
- 現行各ゲームのmodule境界を監査し、推測変換ではなくregistryの明示policyを正本にする。
- SDK-devへ反映後、`test10-1`で本体ログイン画面・本体カード・ゲーム固有領域を実機確認する。

## 2026-07-22 — 既存ゲームのmodule採否を明示正本化

### 利用者からの要望

- SDK公開は先でもよいので、Source全体がmodule構成を持ち、将棋盤・サイコロ等の公式packageを後から増やせる基盤を先に作る。

### 判断

- オンライン部屋の有無から観戦、戦績保存からratingのようにcapabilityを自動推定しない。
- platform固定module、全ゲーム必須core、ゲーム別の任意capabilityを分け、任意moduleの不採用には理由を必須とする。

### 実施結果

- 現行9ゲームのmodule採否を`app/games/built-in-game-module-policies.ts`へ明示した。
- SDK game descriptorも同じcapability policyを受け取れるようにした。
- 登録ゲームとpolicyの過不足、理由なしdisabledを拒否するテストを追加した。
- 環境変数台帳を、Repository追加後に`test10-1`保存が成功した実機結果へ訂正した。

### 検証

- module policy単体テスト成功。
- 本体production build成功。

### 未対応・保留

- 変更を共有`develop`へ反映し、SDK-devの本体UI共用表示を実機確認する。
- 内部互換の`publish_mock`、保存API、private Git階層は、game package契約が固まるまで残す。利用者向けURLには出さない。

### 公開・実機確認

- 共有`develop`の`1313e35`へ反映した。
- `app-games-dev`と`app-games-sdk-dev`の対象DeploymentがともにREADYになった。
- `https://sdk-dev.game-fields.com/test10-1`が200を返し、本体devのゲーム広場UI内に保存済み「21ゲーム」カードが追加されることをHTML応答で確認した。
- `https://sdk-dev.game-fields.com/test10-1/games/twenty-one-misere`が200を返すことを確認した。ブラウザ上の操作・ログイン・ゲーム進行は利用者による画面確認を残す。

## 2026-07-22 — SDK制作者広場のカタログ分離を修正

### 利用者からの要望

- `test10-1`には本番側の既存ゲームを表示せず、その制作者が保存した開発中ゲームだけを本体と同じ広場UIで確認したい。
- 保存済みの「21ゲーム」が表示されない不具合を直したい。

### 判断

- 共用対象はログイン、ヘッダー、広場レイアウト、カード外枠等のplatform UIであり、本番ゲームのカタログ内容ではない。
- SDKゲームは本体の運用登録簿に存在しないため、制作者広場内だけで公開中の運用定義を合成する。本体の未知ゲーム既定値をpublicへ緩めない。

### 実施結果

- `GameLobby`へ組み込みゲームを含めるかの明示設定を追加し、通常広場は従来どおり、SDK制作者広場は組み込みゲームなしにした。
- 制作者広場では保存済みSDKゲームへscope限定のpublic運用定義を付与し、共通のhidden判定で消えないようにした。
- 現行仕様の正本を「本体UI共用・カタログ置換」へ訂正した。

### 検証

- 修正前の実APIで`test10-1`に`twenty-one-misere`（21ゲーム）が保存済みであることを確認した。
- `npm run lint`、全388テスト、本体production build、SDK Portal production buildに成功した。
- 共有`develop`の`38bf4ab`へ反映し、`app-games-dev`と`app-games-sdk-dev`の対象DeploymentがREADYになった。
- `https://sdk-dev.game-fields.com/test10-1`が参照する本体dev広場で、カード見出しが「21ゲーム」1件だけであり、組み込みゲームカードがないことをHTML応答で確認した。
- `https://sdk-dev.game-fields.com/test10-1/games/twenty-one-misere`が200を返すことを確認した。

### 未対応・保留

- ブラウザ上でログイン後のカード遷移と21ゲームの進行を確認する。

## 2026-07-22 — SDK隔離ゲームのiframe接続拒否を修正

### 利用者からの要望

- SDK制作者広場で「21ゲーム」を開いた際、`preview-dev.game-fields.com`の接続拒否でゲーム固有領域が表示されない不具合を直す。

### 判断

- 本体UI共用後は、隔離Runtimeの直近のiframe親がSDK Portalではなく本体devになる。CSPの`frame-ancestors`は外側のSDK Portalと直近親の本体UIを環境別に限定許可する。
- `allow-same-origin`を付けないsandbox、DB・Redis・書込資格を持たない隔離Projectという既存の境界は維持する。

### 実施結果

- developの既定CSPへ`https://dev.game-fields.com`、mainの既定CSPへ本体production originを追加した。
- 環境変数で明示上書きする場合も二段iframeの両originが必要であることを台帳へ記録した。
- developの既定CSPにSDK Portalと本体devの両originが含まれる回帰テストを追加した。

### 検証

- `npm run lint`、全388テスト、SDK Preview production buildに成功した。

### 未対応・保留

- 21ゲームの操作自体は利用者ブラウザで再確認する。

### 公開・実機確認

- `main`と`develop`を`75a284b`へfast-forwardし、同一コミットへそろえた。
- `app-games-preview-dev`のdevelop Production Deployment `dpl_D7krEAsXqA4dUFncRanjG8HmUKLb`がREADYになった。
- 保存済み21ゲームの隔離Runtimeを実際に開き、CSPが`https://sdk-dev.game-fields.com`と`https://dev.game-fields.com`を許可し、`allow-same-origin`を許可していないことをHTTP応答で確認した。

## 2026-07-22 — SDK Previewへ共通プリセット部品を追加

### 利用者からの要望

- AIが作った21ゲーム内のデバッグボタン等が飾りで動かないため、SDKに実動作するプリセット部品を用意し、ゲーム制作AIがそれを使えるようにしたい。

### 判断

- 未審査HTMLから本体React componentを直接importさせず、隔離Previewがbrowser runtimeを自動注入する。
- 共通Runtimeが参加者、ダミー、デバッグ表示、閲覧視点、フェーズ、開始、中断、再戦、自動進行を所有し、ゲーム側は石・カード・盤面等の固有処理だけを登録する。
- 既に保存済みの旧モックにも効くよう、旧スターターの`data-action`属性を互換Commandとして扱う。

### 実施結果

- `GameFieldsPreset` RuntimeとHTML自動注入をSDK Previewへ追加した。
- ダミー追加・削除、視点候補更新、フェーズ切替、参加者を維持した中断、再戦、自動進行adapterを実装した。
- スターターの画面を標準属性へ更新し、module catalogとAPI referenceへ利用方法を追加した。

### 検証

- SDK Previewのプリセット注入・CSP単体テスト4件成功。
- SDK Preview lintとproduction build成功。
- `npm run lint`、全389テスト、本体production build、`npm run test:sdk-starter`に成功した。

### 未対応・保留

- 共有branchとPreviewへ反映後、保存済み21ゲームで共通操作を実機確認する。21ゲーム固有の1〜3個取得・手番・敗北判定は、そのゲームの`registerGame` adapterへ接続する必要がある。

## 2026-07-23 — SDK生成物をゲーム固有slotへ限定

### 利用者からの要望

- 21ゲームで共通UIが二重表示され、旧モックの飾り操作も残ったため、再生成前に制作AIへ渡す指示を修正する。

### 判断

- 保存するiframe HTMLはGame Fields全体ではなく、盤面、ゲーム固有操作、手番、固有結果だけを持つ`game-slot`とする。
- 広場、ヘッダー、入室、部屋、参加者、ルール、デバッグ、退出・再戦は外側のPlatform Shellが所有し、制作AIは`GameFieldsPreset.registerGame()`へ固有処理だけを接続する。
- 文書だけでは旧全画面テンプレートへ戻るため、スターター本体と`check:mock`も同時に変更し、共通UIの複製をエラーにする。

### 実施結果

- 外部制作者向けの指示、共通要件、モックガイド、モジュールカタログをslot方式へ統一した。
- スターターのHTML/CSS/JSをゲーム固有slotの最小例へ変更し、5つのpreset handlerを例示した。
- `check:mock`とスターター完走検査へ、旧lobby/entry/room・参加者・デバッグUIの非重複検査を追加した。
- 直前のGitHub反映でバイナリ化していた開発ログを、プリセット実装時点の正常なUTF-8内容へ復元した。

### 検証

- `npm run lint`成功。
- 全389テスト成功。
- `npm run test:sdk-starter`で公開Git snapshot、ZIP、SDK install、型検査、契約テスト、完走、提出ZIPまで成功。
- Next.js buildは一時worktree外を指す`node_modules` symlinkをTurbopackが拒否した。webpack代替も既存のclient importにある`node:crypto`で停止し、今回変更したSDK文書・静的テンプレート由来のコンパイルエラーは検出されていない。

### 未対応・保留

- 保存済み21ゲームは自動変換しない。更新後のスターター指示を使って再生成・再保存し、実URLで確認する。
## 2026-07-23 — DownloadMe配布名をver3へ更新

### 利用者からの要望

- SDKスターターと制作指示を改版した以上、配布ファイル名も`ver2`のままにせず`ver3`へ上げる。

### 判断

- SDK入口の内容改版と配布名の版を一致させる既存方針に従い、Portalの表示、取得URL、添付名、同期先を`GameFieldsDownloadMe-ver3.md`へ統一する。
- 既に取得された`ver2`との区別を明確にするため、新しい名前で配布物を生成する。旧ファイルは既存リンクの互換用として残すが、Portalからは案内しない。

### 実施結果

- SDK Portalの2つの取得導線、download response header、同期scriptを`ver3`へ更新した。
- 正本`START_GAME_FIELDS.md`から`public/GameFieldsDownloadMe-ver3.md`を生成した。
- `DEVELOPMENT_HANDOFF.md`の現行配布名も`ver3`へ更新した。

### 検証

- lint成功。
- 全390テスト成功。
- root production buildは、検証用worktreeの`node_modules`が外部symlinkであることをTurbopackが拒否したため未完了。ソースのcompile errorではない。

### 関連コミット

- `c7488c0` — `develop`へ`GameFieldsDownloadMe-ver3.md`の配布導線と生成物を反映。

### 公開確認

- `app-games-sdk-dev`の`c7488c0` Production DeploymentがREADY。
- `https://sdk-dev.game-fields.com/GameFieldsDownloadMe-ver3.md`が200、添付名`GameFieldsDownloadMe-ver3.md`、正本から生成した内容との完全一致を確認した。
- SDK-devトップページが`ver3`だけを新規取得導線として表示することを確認した。

### 未対応・保留

- なし。

## 2026-07-23 — SDK制作環境への再ログイン導線を追加

### 利用者からの要望

- DownloadMeの制作開始手順が新規URL作成だけを前提にしているため、既に作成済みのSDK環境へ再ログインして制作を続けられるようにする。

### 判断

- OAuthで確認したGame Fieldsアカウントの所有環境をMCPから安全に一覧取得し、既存環境が1件なら自動再利用、複数なら利用者が選択、0件の場合だけ新規予約へ進む。
- 他利用者の環境検索や任意slugからの所有者推測は許さず、ログイン本人の`owner_player_id`に一致する環境だけを返す。
- 制作フローの改版に当たるため、既存`ver3`を上書きせず新規配布名を`GameFieldsDownloadMe-ver4.md`へ上げる。

### 実施結果

- 読み取り専用MCP tool `list_creator_environments`を追加し、本人所有のslug、表示名、ゲーム数だけを返すようにした。
- DownloadMeを既存環境優先の開始手順へ変更し、既存環境では空き確認・予約・確定を再実行しないよう明記した。
- Portalの新規取得導線、添付名、同期先を`ver4`へ更新した。旧配布ファイルは互換用に残した。

### 検証

- `npm run lint`成功。
- 全390テスト成功。
- `npm run test:sdk-starter`で入口、公開Git snapshot、ZIP、SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPまで成功。
- `npm run build`は検証用worktree外を指す`node_modules` symlinkをTurbopackが拒否したため未完了。Runtime packageの型検査は成功し、今回のソース由来のcompile errorは検出されていない。

### 未対応・保留

- `develop`反映後、SDK-devのMCP tool一覧と`ver4`実ファイルを確認する。
## 2026-07-23 — SDK保存後の案内を制作者トップへ統一

### 利用者からの要望

- ゲーム保存直後の最初のリンクを個別ゲームではなく、`https://sdk-dev.game-fields.com/test10-1/`のような制作者環境トップにしたい。

### 判断

- 保存済みゲーム一覧と再ログイン先を同じ入口にするため、制作者トップを主リンクとする。
- 今回のゲームへ直接入るURLも補助リンクとして残し、既存クライアント向け`previewUrl`は互換維持する。
- DownloadMeの動作指示が変わるため配布名を`ver5`へ上げる。

### 実施結果

- `publish_mock`と旧管理トークン互換APIが`creatorUrl`、`gameUrl`、`previewUrl`を返すよう変更した。
- DownloadMeとスターター指示を、`creatorUrl`を最初に案内する内容へ更新した。
- SDK Portalの新規配布導線を`GameFieldsDownloadMe-ver5.md`へ変更した。

### 検証

- `npm run lint`成功。
- `npm test`成功（391件）。
- `npm run build`は検証用worktreeの`node_modules`シンボリックリンクをTurbopackが拒否したため未完了。変更コード由来の型・lint・テスト失敗はない。

### 未対応・保留

- `develop`への反映とSDK-dev実機確認は未実施。

## 2026-07-23 — SDK Preview Runtimeの誤った未接続判定を修正

### 利用者からの要望

- 制作者トップから保存済みゲームを開いても「Game Fields Previewから開いてください」と表示される問題を解消する。

### 判断

- 起動導線ではなく、PreviewがHTMLへ共通Runtimeを注入済みか判定する条件が原因だった。
- ゲーム側が契約どおり`window.GameFieldsPreset`を参照するだけでは注入済みとみなさず、Previewが追加する`data-game-fields-preset`付きscriptだけを注入済みの正本とする。
- Preview配信時にHTMLへ注入する処理の修正なので、保存済みゲームの再生成や新revision保存は不要とする。

### 実施結果

- `injectGameFieldsPreset`の重複判定をscript markerへ限定した。
- `allow-same-origin`を持たない隔離iframeでは認証Cookie付き外部`preset.js`を取得できないため、信頼済み共通RuntimeをHTMLへインライン注入する方式へ変更した。隔離条件と外部通信禁止は維持した。
- Runtimeが状態保存用の`html[data-gf-phase]`を表示ラベルと誤認して文書全体を消去しないよう、ルート要素をラベル更新対象から除外した。
- 外側Platform Shellへ開始・自動進行・中断・再戦ボタンを追加し、隔離iframeとは送信元windowとCommand allowlistを検証する`postMessage`で接続した。iframe側からは表示用phaseだけをShellへ通知する。
- HTML内のゲームコードが`GameFieldsPreset.registerGame`を参照していてもRuntimeが1回だけ注入される回帰テストを追加した。

### 検証

- 対象テスト6件成功。
- `npm run lint`成功。
- `npm test`成功（393件）。
- `npm run build`成功。
- SDK-devの`countdown-21-v2`既存revisionを実機確認し、未接続警告が消えて外側の「ゲーム開始」が表示されることを確認した。
- 「ゲーム開始」後に1〜3個の操作が有効になり、「1個取る」で残数21→20、手番がMichelへ交代、履歴が1手増えることを確認した。
- `app-games-dev`と`app-games-preview-dev`の対象デプロイがともにREADYになったことを確認した。

### 関連コミット

- `a8e58e1` — Runtime注入済み判定をmarkerへ限定。
- `144be2f` — Runtimeを隔離HTMLへインライン注入。
- `0298f1e` — Runtime描画時に文書ルートを保持。
- `48f3d26` — 外側Shellの共通操作と隔離Runtimeを接続。

### 未対応・保留

- なし。途中の不完全修正は後続コミットで解消済み。

## 2026-07-23 — ワードウルフを使ったSDK共通Room境界の第一段階

### 利用者からの要望

- 既存ワードウルフを分解してsdk-devで動かし、SDKへ切り出す共通部分を実物で確定する。

### 判断

- 現行のWordWolf Roomを丸ごとSDKへ移さず、共通Room envelopeとゲーム固有stateを分離する。
- 参加、退出、設定更新、中断、再戦はSDK共通Lifecycle reducer、お題配布、ヒント、投票、逆転回答、秘密情報projectionはワードウルフpackageが所有する。
- まずMock Runtimeで1試合完走するserver契約を固定し、その後に汎用HTTP/Client Runtimeとsdk-devの正式Room UIへ接続する。

### 実施結果

- 公開SDKへオンラインRoom、Player、Settings schema、Lifecycle Commandと純粋reducerを追加した。
- `games/wordwolf-sdk`をmanifest、domain、server moduleへ分離し、SDK以外のplatform内部importを禁止する自動検査対象へ追加した。
- 市民・狼には本人のお題だけを返し、観戦者には秘密語を返さない閲覧者別projectionを実装した。

### 検証

- `npm run lint`成功。
- `npm test`成功（394件）。新規テストで3人参加、開始、ヒント、投票、逆転回答、結果、再戦まで完走した。
- sdk-devの正式Room UIと永続化Runtimeへの接続は未実施。

### 未対応・保留

- Game Fields共通Room UIからSDK moduleを操作する汎用HTTP routeとClient Runtime。
- sdk-devへワードウルフpilotを登録し、ブラウザ実機で部屋作成から再戦まで確認する。
- 現行本体ワードウルフを新契約へ接続し、旧専用Lifecycleを削除する作業は実機確認後に行う。
## 2026-07-23 SDK公式サンプルエリアとワードウルフUI接続

### 要望

- ワードウルフ用の一般制作者アカウントを増やさず、SDK-dev内に公式サンプル専用エリアを用意する。
- 分離済みワードウルフserver moduleをブラウザ画面へ接続し、SDKへ切り出す共通部分を実物で検証する。

### 判断・実装

- `/sdk-examples/`を`Game Fields Official`のコード管理カタログとし、`sdk_creators`、`owner_player_id`、管理トークンに依存させない。
- `/sdk-examples/word-wolf`は`games/wordwolf-sdk/server-module.ts`をin-memory Mock Runtimeで実行する。別の見た目用ゲーム進行は作らない。
- SDK共通欄にRoom code、phase、revision、host、playersを表示し、固有欄で秘密語、ヒント、投票、逆転回答、勝敗を扱う。
- ホスト・参加者・観戦者の視点切替、秘密語projection、進行中断、同じ参加者での再戦を確認できる。
- SDK Portalにも同名routeを追加し、dev/mainに応じたGame Fields本体をiframe表示する。

### 検証・保留

- SDK package build、対象lint、公式エリア回帰テスト、既存ワードウルフpilotテストに成功。
- 永続Room、HttpOnly session由来actor、HTTP Client Runtimeは未接続。今回の画面はSDK境界の公式ブラウザpilotであり、本番ルーム基盤への移行は次工程。

## 2026-07-23 — SDK公式サンプルをGame Fields共通UIへ統合

### 利用者からの要望

- SDK公式サンプルだけを独立した濃紺UIへ分けず、一般ゲームと同じGame Fields共通UI上で表示する。

### 判断

- `game-fields-official`は所有・編集権限上の区分であり、別デザインの画面区分にはしない。
- SDKゲームも通常ゲームと同じ共通ラウンジ、ゲームカード、トップバー、プレイヤーメニュー、ルーム設定表示を利用し、ゲーム固有部分だけを差し替える。

### 実施結果

- `/sdk-examples`の独自カタログUIを廃止し、共通`GameLobby`へ公式ワードウルフのカードを登録した。
- 登録簿外IDを安全側で非表示にする共通運用設定へ、公式ワードウルフ専用の公開設定を明示し、共通ラウンジ上でカードが表示されるようにした。
- `/sdk-examples/word-wolf`の独自ヘッダーを共通`GameTopBanner`、`GameTopMenu`、`GamePlayerMenu`へ置換した。
- SDK共通Room情報を共通`RoomConfigSummary`で表示し、ゲーム画面とデバッグ欄も既存Game Fieldsのパネル表現へ統一した。
- 回帰テストを、独自公式UIの固定文言ではなく共通UIコンポーネント利用を必須とする検査へ変更した。

### 検証

- `npm run lint`成功。
- `npm test`成功（395件）。
- 通常配置の依存を持つ検証コピーで`npm run build`成功し、`/sdk-examples`と`/sdk-examples/word-wolf`の生成を確認した。
- `29654e5`の`app-games-dev`と`app-games-sdk-dev`がREADYになったことを確認した。
- `https://sdk-dev.game-fields.com/sdk-examples`を実ブラウザで開き、共通ラウンジのアカウント欄・検索欄・通常カードUIと「ワードウルフ SDK」カード1件の表示を確認した。
- `https://sdk-dev.game-fields.com/sdk-examples/word-wolf`を実ブラウザで開き、共通トップバー、広場導線、MENU、プレイヤーメニュー、共通Room設定、参加者3人、ゲーム開始ボタンの表示を確認した。

### 関連コミット

- `4479ee3` — SDK公式一覧とワードウルフ画面を共通UIへ統合。
- `29654e5` — 公式ワードウルフを共通ラウンジ上で公開表示。

### 未対応・保留

- 永続Room、HttpOnly session由来actor、HTTP Client Runtimeへの接続は次工程。

## 2026-07-23 — main側の標準クライアント三層を完成

### 利用者からの要望

- SDK側の呼び出し構造を揃える前に、main側の共通モジュール化を完成させる。
- 共通部分を呼び出し、ゲーム固有部分だけを差し替えられる構造にする。

### 判断

- `docs/UI_ARCHITECTURE.md`の基準どおり、EntryはController生成とDesktopLayout選択だけに限定する。
- Controllerがstate、session、room同期、actions、ViewModel、UI用permissionsを束ね、DesktopLayoutから通信・API client参照を除く。
- 今回はmain側を先に確定し、SDK／SDK-devの呼び出し合わせは次工程とする。

### 実施結果

- Tahoiya、Word Out、Code Intercept、Word Sonar、Northern Branch、Canvas、Daifugoを`<Game>Game -> use<Game>Controller -> <Game>DesktopLayout`へ移行した。
- 既に移行済みのWordWolf、Word Scaleを含む登録済み全9ゲームのEntryを同じ9行構成へ統一した。
- 各Controllerから`permissions`を明示し、Code Interceptのデバッグ語彙取得をroom API clientへ移した。
- Word Scaleの結果復帰、Canvasの退出・自分の線の消去を含むDesktopLayoutのroom API参照をController actionへ移した。
- `config/game-registry.json`の`moduleBoundaryFiles`へ新しいController／DesktopLayoutを登録した。
- `scripts/check-game-standards.mjs`へ、全登録ゲームの薄いEntry、Controller、DesktopLayout、permissions、DesktopLayout通信禁止の回帰検査を追加した。今後の登録ゲームにも自動適用する。

### 検証

- `npm run lint`成功。
- `npm test`成功（395件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、75ページ生成を完了した。

### 次工程

- mainで確定した三層と共通Room境界を正本に、SDK／SDK-devのGame package呼び出しを同じ構造へ合わせる。

## 2026-07-23 — ワードウルフ入場時にログアウト状態になる問題を修正

### 利用者からの要望

- devでログイン後にワードウルフへ入るとログアウト状態になる問題を解消する。

### 判断

- dev実行ログではログインAPIが200で成功した直後、`/wordwolf`遷移後の`/api/player-session`と戦績APIが401になっていた。
- 原因はlocale転送やワードウルフ固有UIではなく、Postgresにだけ存在する既存アカウントのログイン時にRedisプレイヤーセッションを再作成しないstrict DB分岐だった。
- Postgresをアカウント正本、Redisを現在プロフィールのセッション保存先とする現行設計を維持し、パスワード情報を含むアカウント全体はミラーせず、安全なプロフィールだけを復元する。

### 実施結果

- `ensurePlayerAccountSession`を共通化し、Redisセッションがない既存アカウントでもログイン成功時にプロフィールセッションを再作成するよう変更した。
- 同じ処理をメール更新後のセッション返却にも適用した。
- パスワードハッシュ、salt、メールアドレスをRedisプレイヤーセッションへ含めない回帰テストを追加した。

### 検証

- dev実行ログで、修正前はログイン成功直後の`/api/player-session`が401になることを確認した。
- `npm run lint`成功。
- `npm test`成功（396件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、75ページ生成を完了した。

### 未対応・保留

- `develop`反映後、既存アカウントで再ログインし、ワードウルフ入場後もログイン状態が維持されることを確認する。

## 2026-07-23 — 復旧用メールの所有確認を必須化

### 利用者からの要望

- 復旧用メールへ任意のアドレスを入力でき、管理者メールを知っているだけでデバッグ権限が自動付与される問題を解消する。
- メール確認後の管理者メール一致による自動付与は維持する。

### 判断

- 入力直後はメールをアカウントへ保存せず、1時間有効・一度きりの確認メールを送る。
- メールセキュリティ製品の自動リンク巡回で確定しないよう、リンク先の確認画面で「このメールを承認」をPOSTした場合だけ登録を完了する。
- パスワード再設定と管理者メール一致による自動デバッグ付与は、メールと`email_verified_at`がそろった場合だけ許可する。
- 管理画面からのプレイヤーID別の個別付与は維持する。導入前の既存メールは自動的に確認済みにせず、再承認を必要とする。

### 実施結果

- `player_accounts`へ`email_verified_at`を追加し、確認中メールはRedisの期限付きトークンとしてのみ保持するよう変更した。
- 一度きりのDB migrationで、導入前から保存されているメールのアドレスは保持し、確認日時だけを消して未確認へ移すようにした。
- 新規登録とマイページのメール追加・変更を同じ確認メールフローへ統合した。変更確認中は既存の確認済み復旧メールを維持する。
- マイページで未登録・未確認・確認済みを区別し、未確認の既存メールは現在のパスワードだけで保存済みアドレスへ確認メールを再送できるようにした。再送時は古い確認リンクを無効化する。
- `/verify-email`へ明示承認画面、`/api/player-email-verification`へ一度きりの確定処理を追加した。
- 確認済みメールだけをセッションの`hasRecoveryEmail`、パスワード再設定、管理者メール一致の自動権限判定へ使用するよう変更した。
- 既存Resend設定を再利用し、新しい環境変数は追加していない。

### 検証

- `npm run lint`成功。
- `npm test`成功（400件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。

### 未対応・保留

- `develop`反映後、確認メールの受信、明示承認、マイページの確認済み表示、管理者メール一致による自動デバッグ付与、未承認メールでの拒否を実機確認する。

## 2026-07-23 — 登録メールの識別表示とパスワード変更を追加

### 利用者からの要望

- 未確認表示なのに、どのメールアドレスが登録済みなのかマイページで分からない状態を解消する。
- パスワード変更では現在のパスワードを確認し、新しいパスワードを確認入力できる安全な導線を用意する。

### 判断

- 復旧用メールの平文は保存セッションやlocalStorageへ含めず、本人専用のアカウント取得APIだけがマスク済みヒントを返す。
- マイページでは「現在の登録先」と「新しいメールアドレス」を分け、未確認メールの再送先を識別できるようにする。
- パスワード変更の本人確認は、署名済みCookieのプレイヤーIDと現在のパスワードのサーバー照合で行う。新パスワードの2回入力は入力ミス防止であり、認証要素にはしない。

### 実施結果

- `/api/player-account`の本人向け応答へ、復旧メールの状態とマスク済み登録先を追加した。
- マイページへ現在の登録先表示、新規・変更先入力、未確認メール再送の関係が分かる表示を追加した。
- マイページへ「現在のパスワード＋新しいパスワード＋確認入力」の変更フォームを追加した。
- サーバーはCookieの本人ID、現在のパスワード、新パスワードの長さ、現在と異なる値であることを検証し、認証済みプレイヤーIDをレート制限キーに使う。

### 検証

- `npm run lint`成功。
- `npm test`成功（404件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。

### 未対応・保留

- 利用者の明示指示に基づき`develop`へ反映する。反映後、devで未確認メールのマスク表示、確認メール再送、現在パスワードを使うパスワード変更を実機確認する。

## 2026-07-23 — 確認メール再送UIと送信障害の判別を改善

### 利用者からの要望

- 「登録済みメールへ確認を再送」で現在のパスワードが必要なことを分かりやすくする。
- devで確認メールを再送できなかった原因を調査し、修正する。

### 判断

- 再送操作は新しいメールの登録・変更と別の目的なので、パスワード状態もフォームも分離する。
- 外部メールサービスの生エラー本文は、メールアドレス等を含む可能性があるためログや応答へ出さない。安全な固定コードへ分類して原因を判別する。

### 実施結果

- 未確認メールの再送を独立枠へ移し、マスク済み登録先、新規メール入力が不要であること、再送専用の現在パスワード欄、再送ボタンをまとめた。
- Resendの送信エラーを認証設定、送信元未確認、テスト送信先制限、送信枠、レート制限、その他へ分類し、マイページの案内と閉じた観測ログへ反映した。
- `app-games-dev`の実行ログで、再送要求は現在パスワードの照合とトークン発行後、Resend送信時に502となったことを確認した。Sharedキー自体は読み込まれているが、Resend側の具体的な拒否理由は旧コードでは失われていた。

### 検証

- メール送信エラー分類、既存のメール確認ポリシー、アカウントセキュリティの対象テスト10件に成功。
- 対象ファイルのESLintに成功。
- `npm run lint`成功。
- `npm test`成功（407件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。

### 未対応・保留

- `develop`へ反映後、再送を再試行し、新しい安全な分類ログでResend側の認証・送信元ドメイン・送信先制限のどれかを確定する。
- Resend Dashboard上の送信元ドメイン認証とAPIキー権限は、この環境から直接確認できず未確認。

### 公開・外部設定確認

- `74f76ee`（`Clarify recovery email resend errors`）として`develop`へfast-forwardし、`app-games-dev`の対象Deploymentが`READY`、`dev.game-fields.com`へ割り当て済みであることを確認した。
- Vercel Runtime Logsで、直前の再送要求が`EMAIL_SERVICE_NOT_CONFIGURED`ではなくResend送信後の`EMAIL_SEND_FAILED`だったことを再確認した。したがって、ResendアカウントとAPIキー変数は作成・接続済みである。
- Google Public DNSで`resend._domainkey.game-fields.com`のDKIM TXT、`send.game-fields.com`のSPF TXTとAmazon SES向けMXを確認した。DNS登録自体は存在する。
- 最新コード反映後の再送はまだ行っていない。次回の1回で画面表示または閉じたログの分類コードを確認し、Resend Dashboard上の状態またはAPIキー権限を確定する。

## 2026-07-23 — Resend認証完了とワードウルフ投票競合を修正

### 利用者からの要望

- Resend設定後に確認メールを受信できた状態を引き継ぐ。
- devのワードウルフで、投票完了後に「投票を反映できませんでした」と表示されるエラーを解消する。

### 判断

- ResendはDashboardの`game-fields.com`が`Verified`となり、devからの確認メール受信まで成功したため、外部設定と実送信を確認済みへ更新する。
- ワードウルフの保存済み結果は正しく、Vercel Runtime Logsでは最後の投票成功から約1秒後に同じ投票者の別command IDが409になっていた。投票送信中の即時ロックと、保存済み投票のサーバー冪等応答を併用する。
- ワードウルフでは自己投票を許可せず、UI候補とサーバーdomainの両方で拒否する。

### 実施結果

- 投票要求の開始時に同期refとUI stateを設定し、応答完了まで全候補ボタンを無効化して送信中表示を出すよう変更した。
- サーバーは投票者の票がすでに保存済みなら、409にせず最新の閲覧者別Roomを`applied: false`で返すよう変更した。
- 投票者本人を候補一覧から除外し、共通のサーバー投票検証でも自己投票を拒否した。
- ResendのVerifiedとdev確認メール受信成功を環境変数台帳・既知課題へ反映した。

### 検証

- Vercel Runtime Logsで、同一投票者から`cast-vote`が200成功後に409となった2要求を確認した。成功した要求は結果フェーズ・revision 13を保存していた。
- 投票者、決選投票、自己投票、保存済み投票判定の個別回帰テストに成功した。
- `npm run lint`成功。
- `npm test`成功（411件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。

### 未対応・保留

- `develop`へは未push。反映後にdevで連打時の警告非表示と自己投票候補の除外を実機確認する。

## 2026-07-23 — ワードウルフと共通モジュールの重複導線を横断監査

### 利用者からの要望

- 投票以外にも導線が重複していないか確認する。
- ワードウルフ固有の問題か、オンラインゲーム共通モジュールの問題かを切り分ける。

### 判断

- 共通側は、操作・時間切れ応答とポーリング／別操作の到着順が逆転しても、画面のRoom revisionを巻き戻さない契約にする。
- ゲーム固有Storeの保存後処理を維持したままCAS競合を再適用できるhelperは共通永続化へ置く。
- ワードウルフのゲーム進行Commandは、ゲーム番号・フェーズ・ラウンド・フェーズ開始時刻をscopeとして固定し、同じフェーズ内の同時操作だけを再適用する。
- React stateの更新を待つ送信抑止では同一tickの連打を防げないため、共通操作とワードウルフ操作は同期refも併用する。

### 実施結果

- `preferLatestOnlineRoom`を追加し、コードインターセプト、ワードアウト、ワードソナー、ノーザンブランチ、大富豪、ワードスケール、たほい屋の通常操作・時間切れ応答と、ワードウルフのRoom採用へ適用した。
- 共通の結果操作、デバッグ操作、アバター保存・ログアウトを同期refでロックした。
- 共通永続化へ、ゲーム固有の保存境界でも最新Roomへ論理Commandを最大6回再適用できるhelperを追加した。
- ワードウルフの開始・発言・投票・逆転回答へscope検証、保存済み操作の成功応答、CAS競合再適用を追加した。別フェーズ・別ラウンドから遅れて届いた操作は拒否する。
- ワードウルフの開始・発言・投票・逆転回答・回答評価・部屋作成／参加／一覧／解散を同期ロックし、ロビーRoom Actionを直列化した。
- プレイヤー名とお題ヒントはキー入力ごとに保存せず、blurまたはEnterで1回だけ保存するよう変更した。
- 参加可能部屋の一覧取得失敗にも利用者向けエラーを表示するよう補完した。

### 検証

- 共通revision採用、共通CAS再適用、ワードウルフCommand scope、投票・決選投票・自己投票の個別回帰テストに成功した。
- `npm run lint`成功。
- `npm test`成功（既存の共通Redis契約テストを維持したうえで419件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。

### 未対応・保留

- `develop`へは未push。反映後にdevで、同時発言・同時投票、フェーズ遷移直後、タイマーと手動送信の競合を実機確認する。
- 全ゲーム共通の永続command receiptは未実装。ワードウルフは現在のRoom状態とscopeによる重複判定まで対応した。

## 2026-07-23 — ダミー参加者管理、共通遷移表示、初期表示性能を改善

### 利用者からの要望

- ワードウルフのデバッグ用ダミーを削除できるようにする。
- 追加・削除をワードウルフ固有の「テストプレイヤー」機能ではなく、共通デバッグモジュールで扱う。
- 画面遷移待ちで内容が点滅しない、一般的な遷移中表示を用意する。
- 全体のもっさり感がモジュール化によるものか切り分ける。

### 判断

- ダミー参加者の追加・一覧・削除UIは共通デバッグメニューへ集約し、ワードウルフは型付きCommandだけを渡す。削除は画面上のボタンだけでなく、ホスト・デバッグ中・ロビー・ダミー対象をサーバーで検査する。
- 遷移表示は即時に出すと短い遷移まで点滅するため、120msを超えたときだけ共通オーバーレイを表示する。
- Controller／Layoutのモジュール境界はbuild時にbundleされるため、runtimeの主因とは見なさない。locale redirect、直列API、重複したRedis／Postgres読取を個別に改善する。

### 実施結果

- 共通`DebugParticipantControls`を追加し、`DebugModeButton`内でダミーの追加・一覧・削除を行う構成にした。ワードウルフのロビー設定から固有の追加ボタン、参加者一覧から固有の削除ボタンを除去した。
- ワードウルフへ`debug-remove-player`をサーバーCommandとして実装し、デバッグOFF時もダミーを整理する。
- `AppLink`と`localizedAppHref`で内部リンクを現在localeへ直接向け、不要なredirectを避けた。
- `RouteTransitionProvider`、`PageLoadingOverlay`、App Routerの`loading.tsx`を追加した。オンラインゲームの初期復元表示も同じUIへ揃えた。
- 共通session restore、ワードウルフ、たほい屋で、保存済みIDのactive room取得を永続session確認と並列化した。
- 広場のアクセス判定を並列化し、runtime hyperparameter、ゲーム運用状態、実プレイ時間sampleへ短時間cacheと同時load共有を追加した。

### 検証

- locale付き内部リンク、ダミー削除権限の回帰テストを追加した。
- `npm run lint`成功。
- `npm test`成功（421件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。

### 未対応・保留

- `develop`へは未push。反映後、devで共通デバッグメニューからのダミー追加・個別削除、デバッグOFF時の整理、広場からゲームへの遷移、保存部屋の復元表示を実機確認する。

## 2026-07-23 — 全デバッグ操作とDBワード生成テストを共通ポップアップへ集約

### 利用者からの要望

- ダミー削除を共通デバッグメニューへ置くなら、ワード生成テストを含む全デバッグ操作を同じメニューへまとめる。
- デバッグモードON中は、トップバーのDEBUGボタンからポップアップ形式で操作できるようにする。
- 新規ワード生成テストは、DBを使うゲームだけがデバッグモジュールへ任意メソッドとして接続する。

### 判断

- `DebugModeButton`をデバッグ操作の唯一の入口とし、ゲーム固有の一括操作は`gameTools`、DBワード・お題生成テストは任意の`wordGenerationTools`として受け取る。
- DB機能を持たないゲームは`wordGenerationTools`を渡さず、生成テストを表示しない。ワードウルフはDB候補の再利用と新規生成を切り替え、たほい屋とコードインターセプトは各正式DBフローを確認する。
- 生成テストはRoom、ラウンド、出題済み履歴を変更しない。候補生成・審査自体が検査対象の場合だけ、対応する候補DBへ結果を保存できる。
- 通常画面にはデバッグ中の状態説明と代理操作対象のゲーム盤面だけを残し、設定、対象切替、一括入力、強制進行の操作ボタンは置かない。

### 実施結果

- 共通`DebugGameTools`を追加し、ゲーム固有のセクション、操作ボタン、代理操作プレイヤー選択を同じ見た目で構成できるようにした。
- ワードウルフ、たほい屋、ワードスケール、ワードソナー、ワードアウト、コードインターセプト、ノーザンブランチ、大富豪のデバッグ操作をトップバーのDEBUGポップアップへ移した。
- ワードウルフのワード生成テスト、たほい屋の未判定語審査・正式採用フロー、コードインターセプトのDB候補抽出を`wordGenerationTools`へ接続した。
- たほい屋の通常画面に残っていたデバッグ強制進行ボタンも撤去し、ポップアップ内へ一本化した。
- ポップアップを24rem幅・縦スクロール対応にし、背景クリック、閉じるボタン、Escで閉じた後にDEBUGボタンへフォーカスを戻すようにした。
- DB生成テストを通常画面へ戻さない契約テストと、ゲーム登録監査を追加した。

### 検証

- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを通過した。
- `npm test`成功（423件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。

### 公開

- `002b4ee`（`Centralize debug tools in popup`）として`develop`へfast-forward反映した。
- `app-games-dev`の対象Deploymentが`READY`となり、`dev.game-fields.com`への割当を確認した。

### 未対応・保留

- devでDEBUGのON、ポップアップの各フェーズ表示、ワードウルフの新規生成切替、DB非対応ゲームで生成テストが出ないことを実機確認する。

## 2026-07-23 — DEBUGメニューを非モーダル画面内ウィンドウへ変更

### 利用者からの要望

- デバッグメニュー画面を、ゲーム画面内で扱えるウィンドウ形式にする。

### 判断

- 背景全面でクリックを遮るモーダルは使わず、ゲーム画面を表示・操作可能なままデバッグ操作を行える非モーダルウィンドウにする。
- PCでは移動・サイズ変更・最小化・閉じるに対応し、狭い画面ではビューポート内の固定パネルとして誤操作と画面外への逸脱を防ぐ。
- ゲーム固有ツールと権限・Commandの接続は変更せず、共通ウィンドウ枠だけを`DebugToolWindow`へ分離する。

### 実施結果

- 共通`DebugToolWindow`を追加し、`DebugModeButton`の内容を非モーダルの画面内ウィンドウへ表示するよう変更した。
- マウス・ペン・タッチのPointer Eventsによる移動とサイズ変更、最小化、Esc／閉じるボタン、ビューポート変更時の位置・寸法補正を追加した。
- 移動・サイズ変更はキーボードの矢印キーでも操作できる。

### 検証

- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを通過した。
- `npm test`成功（427件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- dev実機でゲーム操作との同時利用、PCの移動・サイズ変更・最小化、スマホ幅での固定表示を確認する。

## 2026-07-23 — AI通信バイタルと共通部屋操作を追加

### 利用者からの要望

- AI APIと通信している間、トップバナーのバイタル表示が光るなど、利用者が通信と課金可能性を認識できるようにする。
- 「部屋を解散」はプレイ中に表示せず、ロビーと結果画面だけにする。
- 結果画面では「部屋に戻る」「広場へ戻る」「部屋を解散」をまとめ、サイドパネルからも操作できるようにする。
- いずれもゲーム固有実装ではなく、全体モジュール側で契約を持つ。

### 判断

- AI処理は同時実行があり得るため、真偽値ではなく共通activity storeで実行中件数を管理する。すべての対象処理が終了した時だけアイドル表示へ戻す。
- 表示はAI APIを呼ぶ可能性があるクライアント要求の開始から応答終了までとし、正確な課金額やtoken数を示すものではない。
- 部屋操作は`lobby`、`playing`、`result`の共通surfaceで定義し、`playing`では何も表示しない。結果画面では既存の復帰・退出・解散処理を共通部品から呼ぶ。

### 実施結果

- 共通`AiActivityVital`と`ai-activity-client`を追加し、全ゲームの`GameTopBanner`へ常設した。アイドル時は小さく表示し、AI通信中は発光・脈動して通信中であることを示す。
- ワードウルフとたほい屋の開始、AI生成・審査・文章補正など、AI APIを利用する可能性がある要求を共通activityへ接続した。
- 同時に複数要求が走った場合、途中の1件が完了しても表示を消さず、成功・失敗を問わず最後の要求終了時に解除する。
- 共通`OnlineRoomLifecycleActions`を追加し、全オンラインゲームの結果操作を同じ契約へ移行した。
- ワードウルフとたほい屋のサイドパネルは、ロビーではホストの解散、プレイ中は非表示、結果では部屋復帰・広場復帰・解散を表示するようにした。
- ワードウルフの権限判定も、解散可能なフェーズをロビーと結果だけへ制限した。

### 検証

- AI activityの同時実行、二重終了、失敗時cleanupの回帰テストを追加した。
- 共通部屋操作のフェーズ別表示と、ワードウルフ・たほい屋の利用契約テストを追加した。
- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを通過した。
- `npm test`成功（427件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。

### 公開

- `e8f5b48`（`Add shared debug window and AI vital`）として、画面内DEBUGウィンドウ、AI通信バイタル、共通部屋操作を`develop`へfast-forward反映した。
- `app-games-dev`の対象Deploymentが`READY`となり、`dev.game-fields.com`への割当を確認した。

### 未対応・保留

- 現在のバイタルは通信状態と課金可能性の注意を示す。実際のtoken数・金額・利用枠の表示には、サーバー側usage集計と利用者別の課金ルールが別途必要。
- dev実機でAI処理中の点灯、並列処理、プレイ中の解散非表示、結果画面の3操作を確認する。

## 2026-07-23 — DEBUGウィンドウの空白と幅崩れを修正

### 利用者からの要望

- DEBUGウィンドウの幅の使い方が不自然で、操作欄の左側に大きな空白が生じている状態を直す。

### 判断

- ゲーム固有ツールの幅ではなく、共通`DebugToolWindow`外枠のFlexbox方向指定漏れを原因と判断した。
- タイトルバーとスクロール本文を縦に並べ、本文が常にウィンドウ全幅を使う共通レイアウトへ修正する。

### 実施結果

- 共通ウィンドウ外枠へ`flex-col`を追加し、タイトルバーと本文が左右に分断されないようにした。
- 本文へ`w-full min-w-0`を追加し、ゲーム固有ツールが右端の細い列へ押し込まれないようにした。
- 共通DEBUGメニューの契約テストへ、縦配置と本文全幅の回帰検査を追加した。

### 検証

- DEBUGメニュー契約テスト3件成功。
- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを通過した。
- `npm test`成功（427件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。
- 最終HEAD `9c1a2a1`の`app-games-dev` Vercel Deploymentが`READY`となり、`dev.game-fields.com`への割当を確認した。

### 未対応・保留

- `develop`へ実装コミット`8d3710a`、公開記録コミット`9c1a2a1`をpush済み。
- dev実機でのPC幅・狭い画面表示、移動・サイズ変更・最小化の確認は未実施。

## 2026-07-23 — DEBUGウィンドウ外の操作で自動最小化

### 利用者からの要望

- DEBUGツールボックス以外の場所を押したとき、ウィンドウを自動的に最小化する。

### 判断

- ゲームごとには実装せず、共通`DebugToolWindow`がdocument-level Pointer Eventを監視する。
- マウス・タッチ・ペンの主操作だけを対象とし、ウィンドウ内操作と右クリックでは最小化しない。
- 外側で押したゲームUIのイベントは止めず、DEBUGウィンドウの最小化とクリック先の操作を同時に成立させる。

### 実施結果

- ウィンドウ外のpointer downを検出して`isMinimized`を有効化する共通処理を追加した。
- document listenerはcaptureで登録し、コンポーネントの破棄時に解除する。
- 共通DEBUGメニュー契約テストへ、外側判定・document listener登録の検査を追加した。

### 検証

- DEBUGメニュー契約テスト3件成功。
- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを通過した。
- `npm test`成功（427件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- 実装コミット`8211de6`の`app-games-dev` Vercel Deploymentが`READY`となり、`dev.game-fields.com`への割当を確認した。

### 未対応・保留

- `develop`へ実装コミット`8211de6`、push記録コミット`49ae302`を反映済み。
- dev実機確認は未実施。

## 2026-07-23 — たほい屋DEBUG機能のモジュール分割後監査

### 利用者からの要望

- たほい屋で少なくともダミー削除ができないため、モジュール化後に動かなくなったデバッグ機能を全体的に確認する。

### 判断

- たほい屋だけに残っていたゲーム固有の旧追加ボタンを延命せず、ワードウルフと同じ共通`DebugParticipantControls`へ追加・一覧・削除を接続する。
- UI表示だけでなく、個別削除、DEBUG OFF、操作対象、参加者依存状態、active-room索引を同じ削除契約へ揃える。
- 分割後の各hookを監査し、直接`setRoom`していた経路は共通の単調revision規則へ統一する。

### 実施結果

- `debug-remove-player` Commandを追加し、ホスト・DEBUG中・ロビー・ダミー対象の条件をサーバーで検証するようにした。
- 個別削除とDEBUG OFFで、ダミーに紐づく得点、偽説明、投票、時間切れ、回答者、復帰状態を整理する純粋moduleを追加した。
- ダミーをたほい屋のactive-room索引から除外し、既存のダミー索引も削除時に解放する。
- 削除対象が現在の操作プレイヤーならホストへ戻し、途中削除後に追加したダミー名が重複しないようにした。
- ラウンド開始、ロビー復帰確認、お題スキップのRoom反映を`preferLatestOnlineRoom`経由へ揃えた。
- 操作プレイヤー切替、偽説明自動入力、投票補完、フェーズ進行、中断、お題スキップ、難易度審査、正式採用フロー確認のController・Layout・Command接続を監査し、分割による配線脱落がないことを確認した。

### 検証

- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを通過した。
- `npm test`成功（431件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- `develop`へ実装コミット`a89f4e2`をfast-forwardで反映済み。
- `app-games-dev`のVercel Deployment完了確認は、この記録コミット後に行う。
- dev実機で、たほい屋のダミー追加・個別削除・DEBUG OFF一括整理と、全フェーズのデバッグ操作を確認する。

## 2026-07-23 — 公開ゲーム全体のDEBUGダミー管理を統一

### 利用者からの要望

- たほい屋の修正をまだ実機確認できていない間に、同じ修正をほかのアプリへ問題なく適用できるか確認し、まずprivateではないゲームへ適用する。

### 判断

- 公開範囲は`config/game-registry.json`の`private: false`を正本とする。
- すでに共通ダミー管理へ接続済みのワードウルフとたほい屋を基準に、ワードスケール、ワードソナー、ワードアウト、大富豪のUI、Command、Store、active-room索引を監査する。
- ゲーム固有の旧追加ボタンを残さず、共通`DebugParticipantControls`へ追加・一覧・個別削除を集約する。

### 実施結果

- 公開4ゲームへ`debug-remove-player` Commandを追加し、ホスト・DEBUG中・ロビー・ダミー対象の条件をサーバー側で検証するようにした。
- 個別削除とDEBUG OFF時の一括整理でロビー復帰状態を正規化し、ダミーをactive-room索引から除外して旧索引も解放する。
- 途中削除後も重複しないダミー名採番を共通moduleへ集約した。
- ワードスケールで削除対象が並べ替え役だった場合と、大富豪で削除対象を代理操作中だった場合はホストへ戻す。
- 4ゲームのクライアントで通常操作・時間切れ応答が共通の単調revision規則を維持していることを確認した。
- privateのノーザンブランチ、コードインターセプト、キャンバスは変更していない。

### 検証

- ダミー管理の純粋関数テストと、公開4ゲームの共通メニュー接続契約テスト8件成功。
- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを通過した。
- `npm test`成功（435件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。
- 実装コミット`164a0f1`の`app-games-dev` Vercel Deploymentが`READY`となり、`dev.game-fields.com`へのalias割当を確認した。
- devのワードスケール、ワードソナー、ワードアウト、大富豪がHTTP 200を返し、対象Deploymentの実行時error・fatalログがないことを確認した。

### 未対応・保留

- `develop`へ実装コミット`164a0f1`をfast-forwardで反映済み。
- dev実機で公開6ゲームのダミー追加・個別削除・DEBUG OFF一括整理を確認する。

## 2026-07-23 — DEBUGダミー参加者Commandを共通application層へ集約

### 利用者からの要望

- 公開ゲームへの横展開を通して、さらにモジュール化できる要素を確認する。
- 優先候補のDEBUG参加者Commandを共通化し、privateゲームへも適用する。

### 判断

- UIだけでなく、ホスト・ロビー・DEBUG中の認可、ID・名前生成、追加、個別削除、DEBUG OFF時の一括整理、ロビー復帰状態、active-room索引整理までを1つのapplication層へ移す。
- ゲーム固有Storeには、人数上限、Player生成、参加者変更後の得点・並べ替え役・代理操作対象・チーム等の補正だけをhookとして残す。
- privateゲームではオンライン参加者Roomを持つノーザンブランチとコードインターセプトへ適用し、オンライン参加者Commandを持たないキャンバスは対象外とする。

### 実施結果

- `lib/online-room-debug-participants.ts`へ共通Command適用、重複しないダミー名生成、個別・一括削除、ロビー復帰状態の正規化、非ダミーactive-roomキー生成、旧ダミー索引解放を集約した。
- ワードウルフ、たほい屋、ワードスケール、ワードソナー、ワードアウト、大富豪、ノーザンブランチ、コードインターセプトの8つのStoreを共通Commandへ接続した。
- ノーザンブランチとコードインターセプトの共通DEBUGメニューへ、ダミー一覧・追加・個別削除を接続した。
- コードインターセプトは実参加者の所属を変えず、参加者変更後のダミーだけを赤・青へ再調整する純粋domain処理を追加した。
- たほい屋の得点・偽説明・投票等、ワードスケールの並べ替え役、人数依存設定、代理操作対象などはゲーム固有補正として維持した。

### 検証

- 共通Command、private UI接続、コードインターセプトのチーム補正を含む回帰テストを追加した。
- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを警告なしで通過した。
- `npm test`成功（441件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- `develop`へ実装コミット`e3ed58e`をforceなしのfast-forwardで反映済み。
- `app-games-dev`の対象Deployment `dpl_3gZgXT8S7j25HGLvnkKYb2aEhUcj`が`READY`となり、`dev.game-fields.com`へのalias割当を確認した。
- devのノーザンブランチとコードインターセプトがHTTP 200を返し、HTML内のDeployment IDが対象Deploymentと一致すること、実行時error・fatalログがないことを確認した。
- ログイン・privateアクセス認証済み画面で、8ゲームの追加・個別削除・DEBUG OFF一括整理と、コードインターセプトのチーム再調整を実ボタン確認する。

## 2026-07-23 — オンラインRoom API Routeを共通ファクトリへ集約

### 利用者からの要望

- DEBUG参加者Commandに続き、次のモジュール候補だったRoom API Routeを共通化する。
- 例外hookを増やすだけでなく、安全に可能な範囲ではゲーム側を共通契約へ改編して揃える。

### 判断

- 公開範囲、認証、GET三分岐、参加者照合、言語、レート制限、DEBUG資格、Telemetry、DELETEを共通Routeファクトリへ移す。
- ゲーム側は`load / loadActive / list / create / apply / delete / deleteHosted / sanitize`の同じ契約へ寄せ、固有進行をHTTP Routeへ残さない。
- 大富豪のGET時ダミー進行はStoreのreconcile処理、たほい屋のAI付き`start-round`は専用application層へ置く。
- 共同描画専用で登録上`local-pass-and-play`のキャンバスは、通常オンライン対戦Roomと契約が異なるため今回の対象外とする。

### 実施結果

- `lib/online-room-route-factory.ts`を追加し、ワードウルフ、たほい屋、ワードスケール、ワードソナー、ワードアウト、ノーザンブランチ、コードインターセプト、大富豪の8 Routeを接続した。
- POSTのhost・初期参加者・content locale、PATCHのactor・参加者プロフィールを認証セッションから生成する共通入力処理へ統一した。
- 共通認証・保存障害とゲーム固有エラー表を`lib/online-room-route-errors.ts`へ集約した。
- Code Interceptの参加時team指定を必須入力から外し、Storeの均衡割当を正本にした。
- 大富豪のダミー手番復旧を`lib/daifugo-room-store.ts`へ移した。
- たほい屋のお題生成付き開始を`app/api/tahoiya/rooms/application.ts`へ分離した。
- 8つのRoute合計を1,558行から507行へ削減した。共通ファクトリを含めても783行となった。
- `scripts/check-game-standards.mjs`を更新し、新しいオンラインゲームが共通Routeファクトリを使わない場合はlintを失敗させるようにした。

### 検証

- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを通過した。
- `npm test`成功（442件）。共通認証入力がクライアント指定のhost・participant・localeを上書きする回帰テストを含む。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- `develop`へ実装コミット`8ed0e0d`をforceなしのfast-forwardで反映した。
- `app-games-dev`の対象Deployment `dpl_EEgwBAvdXRTobLdWtxvGaGpkBrcA`が`READY`となり、`dev.game-fields.com`へのalias割当を確認した。
- 8ゲームのdev画面が最終的にHTTP 200を返し、HTML内のDeployment IDが対象Deploymentと一致した。未認証Room APIは公開6本が401、private 2本が403を返し、対象Deploymentの実行時error・fatalログはなかった。
- ログイン・privateアクセス認証済み画面で、作成・参加・更新・解散と、たほい屋のお題生成、大富豪のDEBUGダミー手番を実操作確認する。

## 2026-07-23 — オンラインRoom Store Runtimeを8ゲームで共通化

### 利用者からの要望

- Room API Route共通化後も、さらにモジュール化できる箇所を進める。
- 本体だけの共通Storeを増やすのではなく、`@game-fields/game-runtime`を本体でも使えるOnline Room Runtimeへ育てる。

### 判断

- ゲーム進行、得点、秘匿、参加条件、時間切れreconcileはゲーム固有Storeへ残す。
- revision更新、競合時の再適用、保存前正規化、保存後hookはstorage-neutralな非公開Runtime coreへ移す。
- Redis CAS、TTL、一覧、active-room、新規作成、解散、Realtime、戦績・リプレイは本体adapterが注入する。
- 大富豪をpilotに契約を確認し、同じ境界をほかの7オンラインゲームへ展開する。

### 実施結果

- `packages/game-runtime/src/online-room.ts`へ、最大6回の競合再適用、revision・更新時刻の確定、保存前正規化、保存後hookを持つmutation lifecycleを追加した。
- `lib/online-room-store-runtime.ts`へ、Redis key、TTL、期限切れ整理、公開一覧、1人1active room、新規作成、個別・host一括解散、Realtimeと保存後処理を注入する本体adapterを追加した。
- ワードウルフ、たほい屋、ワードスケール、ワードソナー、ワードアウト、ノーザンブランチ、コードインターセプト、大富豪の8 Storeを共通Runtimeへ接続した。
- 8 Storeからclaim、active-room読取・解放、一覧、解散、CASの重複を外し、合計2,840行から2,583行へ削減した。
- ワードウルフのtimer・専用Command向け互換保存入口は維持し、通常Room Commandだけを共通mutation lifecycleへ移した。
- `scripts/check-game-standards.mjs`へ、全オンラインRoom Storeが共通Runtimeを利用する契約検査を追加した。

### 検証

- Runtimeの競合再適用、missing・不正Room・競合上限、8 Storeの接続、active-room解放、期限切れ一覧除外の回帰テストを追加した。
- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを警告なしで通過した。
- `npm test`成功（446件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- `develop`へ実装コミット`056a853`をforceなしのfast-forwardで反映した。
- `app-games-dev`の対象Deployment `dpl_9eiSdv9w6Yqy54swb5e5V7epcJn1`が`READY`となり、`dev.game-fields.com`へのalias割当を確認した。
- 8ゲームのdev画面がHTTP 200を返し、HTML内のDeployment IDが対象Deploymentと一致した。未認証Room APIは公開6本が401、private 2本が403を返し、対象Deploymentの実行時error・fatalログはなかった。
- 外部SDKゲームを同じ永続HTTP／Client Runtimeへ直接接続する層は未実装。
- ログイン・privateアクセス認証済み画面で、8ゲームの作成・参加・更新・解散を実操作確認する。

## 2026-07-23 — SDKゲームを永続HTTP／Client Runtimeへ接続

### 利用者からの要望

- Online Room Store Runtime共通化後に残った、外部SDKゲームを同じ永続HTTP／Client Runtimeへ直接接続する層を実装する。
- `develop`とdev環境で先行し、`main`の公開ゲームにはまだ含めない。

### 判断

- 公開SDKにはactorを受け取らないHTTP Client Runtimeを追加し、署名済みHttpOnly sessionからの認証情報注入、レート制限、TelemetryはNext.js Routeで行う。
- server moduleは静的に審査・登録したものだけを利用し、Portal metadata、creator upload、未審査preview HTMLから動的にserver moduleを解決しない。
- pilotは`wordwolf-sdk`を`development` channelで登録し、`main` deploymentではregistryから除外する。
- HTTP層は作成、取得、revision付きCommandに絞り、Room永続化とCASは既存の認証済みSDK platform adapterと`@game-fields/game-runtime`をそのまま正本にする。

### 実施結果

- `@game-fields/game-sdk/client-runtime`を追加し、`createRoom`、`readRoom`、`sendCommand`、型付きHTTPエラーを公開した。
- `/api/game-sdk/[gameId]/rooms`を追加し、認証、mutation rate limit、DEBUG資格、Telemetry、安全なエラー応答を共通化した。
- `lib/game-sdk-server-registry.ts`へ静的な審査済みmodule登録を追加し、`wordwolf-sdk`をdevelop限定で永続Redis／CAS Runtimeへ接続した。
- HTTP handlerをNext.jsから分離し、公開Client Runtimeから認証adapter、永続Runtimeまでをmemory persistenceで縦断する回帰テストを追加した。
- SDK境界検査へ、同一origin資格情報、actor非送信、静的registry、main非公開、preview非接続の契約を追加した。
- SDK packageとstarter資料へClient Runtimeの導入方法とsession境界を追加した。

### 検証

- `npm run lint`成功。9ゲーム共通要件、SDK境界、ESLintを警告なしで通過した。
- `npm test`成功（449件）。
- `npm run test:sdk-package`成功。tarballを外部consumerへ導入し、公開export 4本とClient Runtimeの型・実行を確認した。
- `npm run test:sdk-starter`成功。公開snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- `develop`へ実装コミット`ede5e68`をforceなしのfast-forwardで反映した。
- `app-games-dev`の対象Deployment `dpl_EvLYP7ipknsaJ7kGgpQS3W4ZhbRU`と、SDK Portal側の対象Deployment `dpl_Dd3t738ptBjWgWMBHGAek5a7TYV8`が同じcommitで`READY`となった。`dev.game-fields.com` aliasが本体Deploymentへ切り替わったことも確認した。
- devのSDK例2画面がHTTP 200を返し、HTML内のDeployment IDが対象Deploymentと一致した。登録済み`wordwolf-sdk` Room APIは未認証401、未登録`creator-upload`は404を返し、対象Deploymentの実行時error・fatalログはなかった。
- SDK向けRealtime／WebSocket transportと、active-room・一覧・解散のClient Runtimeは未実装。
- ログイン済み複数アカウントで、SDK Roomの作成・参加・Command・競合再試行を実操作確認する。

## 2026-07-23 — SDKゲームのRoom lifecycle・Realtimeを共通化

### 利用者からの要望

- SDK永続HTTP／Client Runtimeの次段階として、Realtime／WebSocket、active-room、部屋一覧、解散を実装する。
- `develop`とdev環境で先行し、`main`には触れない。
- 可能な範囲でログイン済み複数アカウントの実操作も確認する。

### 判断

- SDK clientへactor identityを追加せず、active-room・一覧・解散も署名済みCookieから解決した本人だけで処理する。
- SDK用のRedis Room StoreへTTL、部屋索引、1人1active room、一覧、解散、revision通知を集約し、ゲーム固有server moduleには進行と閲覧者別presentationだけを残す。
- WebSocketは状態や秘密情報を運ばず、`sdk:<game-id>`、部屋コード、revision、timestampだけを通知する。通知を受けたClient Runtimeは認証済みHTTPで閲覧者別RoomViewを再取得する。
- 未審査PreviewはRuntimeへ接続せず、静的registryに採用登録したmoduleだけを対象とする。`wordwolf-sdk`は引き続きdevelop限定とする。

### 実施結果

- `lib/game-sdk-platform-room-store.ts`を追加し、SDK roomのRedis TTL、索引、active-room claim／rollback、期限切れ整理、公開ロビー一覧、host解散を集約した。
- `lib/game-sdk-platform-adapter.ts`へactive room復元、一覧、個別／host一括解散と、`room/join`・`room/leave`に連動するactive-room処理を追加した。
- `/api/game-sdk/[gameId]/rooms`へGETのactive／一覧分岐とDELETEを追加し、認証・mutation rate limit・安全なTelemetryを既存境界のまま適用した。
- 公開`@game-fields/game-sdk/client-runtime`へ`readActiveRoom`、`listRooms`、`dissolveRoom`、`dissolveHostedRooms`、`watchRoom`を追加した。
- Realtime protocolは組み込みゲームの4文字コード契約を維持しつつ、`sdk:<game-id>`だけ4〜12文字のSDK room codeを受理するよう拡張した。
- SDK watcherはWebSocket利用不能時にポーリングへフォールバックし、接続時も45秒ごとのHTTP整合確認を維持する。
- SDK fixtureを共通`room/join` lifecycleへ移し、作成、別室競合、active room、一覧、参加、進行中解散拒否、結果後解散、host一括解散、revision通知後のHTTP再取得を縦断テストへ追加した。

### 検証

- `npm run lint`成功。SDK lifecycle・静的registry・actor非送信・DELETE境界を含む規約検査を警告なしで通過した。
- `npm test`成功（451件）。
- `npm run test:sdk-package`成功。tarballを外部consumerへ導入し、公開export 4本とClient Runtimeの型・実行を確認した。
- `npm run test:sdk-starter`成功。公開snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。
- 実装commit `da4fdbfba6e9a200ee147ad5a476f7d5ea7a379d`を`develop`へforceなしでfast-forwardし、GitHub上のtreeがローカル検証済みtreeと一致することを確認した。
- `app-games-dev`のDeployment `dpl_89TyfGC9qhgGtSE82j6DUaLj1JPb`と、SDK Portal側のDeployment `dpl_3ETLo9TpVF8C9ApqFT7KE5DXosgv`が同じ実装commitで`READY`となった。`dev.game-fields.com` aliasは本体Deploymentへ切り替わった。
- devのSDK例2画面はHTTP 200で、HTML内のDeployment IDも本体Deploymentと一致した。SDK Roomのactive取得、一覧、host一括解散は未認証401、未登録moduleは404、Realtime endpointのHEADは204を返した。
- 本体Deploymentのerror・fatalログと、SDK Room／Realtime routeの集約Runtime Errorsはいずれも0件だった。
- クラウドブラウザではSDK公式サンプルのRoom、revision、host／参加者／観戦者Viewを確認した。ただし同画面は意図どおりMock RuntimeとDEBUG fixtureを使うため、複数の実アカウントによる永続Room操作の代替確認にはしていない。認証済みAPIの直接表示はブラウザ側の`ERR_BLOCKED_BY_CLIENT`で実施できなかった。

### 未対応・保留

- ログイン済み複数アカウントによる永続SDK Roomの作成・参加・Command・Realtime更新・解散の実操作は未確認。異なるidentityのactive-room競合、参加、進行、結果後解散、cleanupは自動縦断テストで確認済み。
- npm registryへの初回公開、Portal上の正式チュートリアル・APIリファレンス・提出画面は引き続き未実装。

## 2026-07-24 — SDK固有ハンドシェイクを先に定義

### 利用者からの要望

- SDK Portalの画面や提出フローを先に進めず、SDKとして接続時のハンドシェイクを最初に定義する。
- DownloadMeから`sdk-dev`へ接続する場合も、将来`sdk`へ接続する場合も、AIから見た制作手順と契約を同じにする。

### 判断

- MCP `initialize`はMCP transport、OAuth 2.1 + PKCEは本人認証、Game Fields SDK handshakeは環境・release・contract schema・capabilityの互換性確認として分離する。
- clientは期待する`environment`、Platform版、SDK package版、SDK contract schema、必須capabilityを提示し、serverはcanonical endpointと対応release・capabilityを返す。
- `accepted=true`、`problems=[]`、接続先一致の確認前は制作者環境取得やゲーム仕様の質問へ進まない。
- `sdk`と`sdk-dev`はhandshake schemaを共用し、`environment`とcanonical endpointだけで接続先を区別する。自動的な別環境・旧版・非公式mirrorへの切替は行わない。
- handshakeはsessionやactorを発行せず、後続APIの認証・認可を省略しない。

### 実施結果

- 公開`@game-fields/game-sdk/handshake`へrequest、server descriptor、capability、拒否code、純粋な互換判定を追加した。
- `config/platform-release.json`へ`sdkHandshakeVersion`を追加し、公開SDK定数との一致をlintで検査するようにした。
- SDK Portalへ公開`GET/POST /.well-known/game-fields-sdk`と、OAuth後に使うMCP tool `get_sdk_handshake`を追加した。
- MCP `initialize`応答にも同じserver descriptorを載せるが、DownloadMeは明示的な`get_sdk_handshake`の`accepted=true`を完成条件とする。
- DownloadMeをver6へ更新し、接続直後にhandshakeを行ってから`list_creator_environments`へ進む順序へ変更した。
- starter manifestへ`sdkHandshakeVersion`を追加し、同梱SDK、Platform、contract schemaと一緒に取得元handshakeとの一致を確認するようにした。
- `docs/SDK_HANDSHAKE.md`を正本として追加し、versioning、SDK資料、モジュール境界、引き継ぎ資料を更新した。
- SDK Portalのclean buildでも公開SDK handshake exportを利用できるよう、Portalのpredev／prebuildでSDK packageを先にbuildするようにした。

### 検証

- handshake成功、環境違い、release・contract・capability複合不一致、不正requestの契約テストを追加した。
- `npm run lint`成功。Platform release、SDK境界、9ゲーム共通要件、ESLintを通過した。
- `npm test`成功（456件）。
- `npm run test:sdk-package`成功。tarballを外部consumerへ導入し、handshakeを含む公開export 5本を確認した。
- `npm run test:sdk-starter`成功。handshake versionを含むstarter、公開snapshot、ZIP、契約テスト、完走、提出ZIPを確認した。
- SDK packageの`dist`を一度削除した状態から`npm run build:sdk`が成功し、Portal 25ルートに`/.well-known/game-fields-sdk`が生成された。
- local production serverで公開handshakeを確認し、一致requestはHTTP 200・`accepted=true`、環境違いと未提供capabilityはHTTP 409・安全なproblem codeを返した。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `git diff --check`成功。
- 実装commit `1bc2fb7130041e948cd64403aaee40510aa8330b`を`develop`へforceなしでfast-forwardし、GitHub上のtreeがローカル検証済みtreeと一致することを確認した。
- SDK PortalのDeployment `dpl_9RwycG1GhhXZUGP8sVcRJHy4HPxH`と本体devのDeployment `dpl_GZwoT5kbTS7yLdv1j54nS9v9bxVt`が同じ実装commitで`READY`となり、`sdk-dev.game-fields.com`と`dev.game-fields.com`のaliasがそれぞれ切り替わった。
- 公開`/.well-known/game-fields-sdk`のGETでdevelopment descriptorを確認した。一致requestはHTTP 200・`accepted=true`・`problems=[]`、production環境と未提供`submission-upload`を要求した場合はHTTP 409・`ENVIRONMENT_MISMATCH`・`CAPABILITY_UNAVAILABLE`を返した。
- 公開DownloadMe ver6に`get_sdk_handshake`を制作質問より先に呼び、`accepted=true`確認後だけ`list_creator_environments`へ進む指示が含まれることを確認した。
- 両Deploymentのerror・fatalログと集約Runtime Errorsはいずれも0件だった。

### 未対応・保留

- Portalの正式チュートリアル、APIリファレンス、提出画面はhandshake確定後の次段階として未実装。
- 採用済みゲームのbrowser Runtimeへhandshakeを強制する処理は未実装。今回のv1はDownloadMe／AIとSDK Portalのcontrol planeを先に確定した。

## 2026-07-24 — 現行ワードウルフをSDK-devの受け入れ基準へ変更

### 利用者からの要望

- SDK用に縮小した別のワードウルフではなく、`main`にある現行ワードウルフをそのままSDK-devへ載せる。
- 現行ゲームが動くことで共通部分の移植を確認し、ワードウルフ固有部分を「アプリセット」、それ以外の再利用部分を「SDK基本セット」として分離する。

### 判断

- `games/wordwolf-sdk`の小規模moduleはserver契約とtransportのfixtureとして残すが、製品UIの完成判定には使わない。
- `/sdk-examples/word-wolf`は現行`WordWolfGame`を直接描画し、`/wordwolf`と同じUI・設定・お題生成・DEBUG・進行・結果を受け入れ基準にする。
- コピーを作らず正本componentを参照し、現行版とSDK-dev版が実装差分で再び分岐しないようにする。
- 今後はこの基準画面を壊さず、別ゲームでも再利用できる単位をSDK基本セットへ移し、お題・役職・ヒント・投票・決選投票・逆転回答等をワードウルフのアプリセットとして残す。

### 実施結果

- SDK-dev公式ワードウルフから独自Mock UIと固定3人fixtureの接続を外し、現行`app/wordwolf/WordWolfGame.tsx`を直接利用する薄い受け入れharnessへ置換した。
- SDK公式一覧の表示情報も現行ワードウルフのcatalogを正本とし、人数・時間・説明が別定義でずれないようにした。
- 公式サンプル回帰テストで、現行`WordWolfGame`の直接利用とMock Runtimeへの後戻り禁止を固定した。
- `docs/EXTERNAL_GAME_PACKAGE.md`と本引き継ぎに、SDK基本セットとアプリセットの二層を正本として追記した。

### 検証

- `npm run lint`成功。
- `npm test`成功（456件）。
- `npm run build`成功。Next.js 16.2.4のproduction build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、25ルート生成を完了した。
- 実装commit `2ad001765049c6e18dead8ce1d6040beddb7550c`を`develop`へforceなしでfast-forwardし、GitHub上のtreeがローカル検証済みtreeと一致することを確認した。
- 本体devのDeployment `dpl_3s5x4kvCdBkzWWPA8LhwZtN2vLXW`とSDK PortalのDeployment `dpl_7j3DeHvLNz2jCeUpG5iCMtsnAUNV`が同じ実装commitで`READY`となった。
- `sdk-dev.game-fields.com/sdk-examples/word-wolf`のiframeが`dev.game-fields.com/sdk-examples/word-wolf`を参照し、遷移先で現行UIの「ワードウルフ・ラウンジ」が表示されることを確認した。旧Mock UIの「SDK共通ルーム」は存在しなかった。
- 両Deploymentのerror・fatalログと集約Runtime Errorsはいずれも0件だった。

### 未対応・保留

- SDK基本セットへの物理移動は次段階。現時点では現行ワードウルフをSDK-devの差分検出用基準として確立した段階である。
- クラウドブラウザにログイン済みセッションがなかったため、認証が必要な部屋作成とDEBUG完走の実操作は未確認。ゲスト状態で現行UIへの置換と旧Mock UIの除去までは確認済み。

## 2026-07-24 — SDK基本セットとAppSetによるゲーム生成境界

### 利用者からの要望

- SDK-devの現行ワードウルフを受け入れ基準にしたうえで、ワードウルフ固有部分をアプリセット、それ以外をSDK基本セットとして、新しいゲームを作れる仕組みにする。
- 制作者がRoom、参加・退出、revision、共通View等をゲームごとに再実装せず、ゲーム固有のルール・state・Command・表示だけを実装できる形にする。

### 判断

- 現行`WordWolfGame`を直接表示するSDK-dev基準画面は変更せず、今後の共通部分抽出で機能差を検出する受け入れ基準として維持する。
- SDK基本セットがRoom、ホスト、参加者、設定、revision、参加・退出・設定変更・中断・再戦、安全な共通Viewを所有する。
- ゲーム側は`GameSdkOnlineRoomAppSet`として、ゲーム固有の初期state、Command遷移、再戦時reset、閲覧者別AppViewを登録する。
- 既存の低水準`defineGameServerModule`は互換性のため残し、新規Online Roomゲームと外部starterは基本セットとAppSetの合成APIを標準経路にする。
- 内部player IDは保存stateとサーバー判定だけに使い、基本セットの公開Viewでは安定したseatと表示名へ変換する。

### 実施結果

- 公開SDKへ`GameSdkOnlineRoom`、共通Create／Command／View、`defineGameSdkOnlineRoomAppSet`、`createGameSdkOnlineRoomModule`を追加した。
- SDK基本セットへ共通Room生成、lifecycle Command、revision更新、参加者・host権限、安全な共通player Viewを集約した。
- `games/wordwolf-sdk`を、Room lifecycleを持たずワードウルフ固有のお題・役職・ヒント・投票・逆転回答だけを持つAppSetへ変更した。
- Redis・認証・CAS・HTTP・Realtimeを通るcount-up fixtureもAppSet合成へ移し、新境界がMock専用ではないことを回帰テストへ固定した。
- 外部starterへ`src/app-set.ts`を追加し、`server-module.ts`はSDK基本セットとの合成だけを行う形にした。配布ZIP、提出ZIP、境界検査もAppSetを必須にした。
- 内部`npm run create-game`もcontracts、AppSet、合成server module、契約テストを生成するよう変更した。
- SDK Portal、SDK package資料、外部package資料、生成手順、チェックリスト、引き継ぎ資料を新しい二層構成へ更新した。

### 検証

- `npm run lint`成功。
- `npm test`成功（456件）。
- `npm run check:sdk`成功。
- `npm run build:sdk-package`成功。
- `npm run test:sdk-starter`成功。外部install、型検査、契約テスト、1ゲーム完走、提出ZIPまで確認した。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction buildと全ルート生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- 現行`WordWolfGame`自体の共通UI、設定画面、時間管理、DEBUG、結果導線はまだ物理的にSDK基本セットへ移していない。基準画面との同等性を保ちながら順次抽出する。
- 今回のAppSet化対象である`games/wordwolf-sdk`はserver契約fixtureであり、現行ワードウルフ製品UIのSDK移植完了を意味しない。
- Portal上の対話型ゲーム作成UI、提出・審査画面、npm registryへのSDK初回公開は未実装。
- この作業単位ではdev／本番Deploymentと複数実アカウントによる実操作を行っていない。

## 2026-07-24 — 全必須から始める共通モジュールprofile

### 利用者からの要望

- 直前工程で本体へ切り出した共通モジュールを、SDK側で別実装せずAppSetから利用する。
- 再利用候補はすべて物理的にモジュール化する。
- 制作AIが安易に未採用へしないよう、最初のモックは全モジュール必須で開始する。
- ゲームに合わない場合だけ、SDK-dev上で人間が意図的に必須解除できるようにする。
- まず全必須のまま複数ゲームへ適用し、どこまで必須で成り立つかを検証する。

### 判断

- 共通module profileは新しいRoom・認証・UI実装ではなく、既存の`online-room-route-factory`、`online-room-store-runtime`、`@game-fields/game-runtime`、共通UI、純粋domain部品を採用するレシピとする。
- profileは初回mock発行時に全件`required`でPlatformが作成する。AppSet、mock metadata、manifest、制作AIは採否を宣言しない。
- 管理トークンを使うmock発行とMCPにはprofile変更手段を与えない。MCPは確定profileの参照だけを提供する。
- SDK-devへ署名済みアカウントでログインした環境所有者だけが、Platform固定以外を理由付きで解除できる。mock再発行では既存の人間レビューを上書きしない。
- 認証、アカウント、最終認可、保存、観測、共通ナビ、プレイヤーメニューはPlatform固定とし、人間でも解除できない。

### 実施結果

- `@game-fields/game-sdk/modules`へ38件の共通module catalogと、全必須profileの生成・正規化・人間レビュー更新契約を追加した。
- 提出完了、投票、フェーズ・ラウンド・手番、役職・チーム、秘密情報のseat変換、標準結果を小さな純粋moduleへ物理分割した。
- WordWolf、Tahoiya、Word Scale、Word Sonar、Word Out、Code Intercept、Northern Branch、Daifugoの8オンラインゲームを同じ純粋moduleへ接続した。
- SDK DBへ`module_policy`を追加し、RESTとMCPの初回mock発行で全必須profileを保存するようにした。競合更新時はprofileを更新せず、人間レビューを維持する。
- SDK Portalへ所有者専用の「共通モジュール」画面を追加した。全38件の状態、Platform固定、解除理由、全必須への復帰を表示し、理由付き更新だけを許可する。
- MCPへ`get_game_module_requirements`を追加し、`editableByAi: false`を返す。変更toolは追加していない。
- starterのmock検査で`modules`、`moduleProfile`、`disabledModules`、`optionalModules`を拒否し、AIが採否を埋め込めないようにした。
- starter、SDK reference、外部package資料、新規ゲーム手順、引き継ぎを全必須開始と人間レビューの仕様へ更新した。

### 検証

- module profile、所有者専用更新境界、初回mock発行、8ゲームの共通module採用を対象とする追加テスト15件が成功した。
- `npm run lint`成功。公開SDKの依存境界はサブディレクトリを含む14ファイルを検査した。
- `npm test`成功（471件）。
- `npm run test:sdk-package`成功。外部fixtureへのinstall、6つの公開export、全38件必須profileを確認した。
- `npm run test:sdk-starter`成功。入口、公開Git snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPまで確認した。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、新しい所有者専用module APIを含む全ルート生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- 全38件を全ゲームが実際に利用できることを示したわけではない。今回の初期profileで不要と判断されたmoduleと解除理由を蓄積し、必須化できる最大集合を次段階で確定する。
- SDK-dev実環境での所有者ログイン、理由付き解除、再発行後の維持は未確認。
- dev／本番へのpushとDeploymentはこの作業単位では行わない。

## 2026-07-24 — DownloadMe ver7と人間専用module分類

### 利用者からの要望

- 最新DownloadMeだけを渡した制作GPTが、公開starter取得、モック、AppSet実装、検査、提出ZIPまで進めるver7を作る。
- moduleは将来「必須・解除可・任意」の三段階へ分類できるようにする。
- ただし制作GPTへ解除可能性を先に教えると共通moduleを使わない危険があるため、初回は38件すべて必須という情報だけを渡す。
- SDKを実際に確認して不満がある人間だけが、SDK-devの所有者画面で解除可moduleを任意へ変更できればよい。
- moduleカスタマイズは将来の課金要素にできる余地を残す。

### 判断

- 三段階分類と変更UIはSDK Portal内部へ閉じ、DownloadMe、starter資料、公開SDK catalog、MCPへ解除可能性を露出しない。
- 新規mockは従来どおり38件すべて`required`で保存する。制作GPTはモック承認後も、MCPが返す確定済み`requiredModuleIds`だけを正本とする。
- MCP `get_game_module_requirements`からprofile全体と三段階分類を除き、slug、gameId、`requiredModuleIds`、`editableByAi: false`だけを返す。
- Portalの所有者向け画面では、Platform固定7件を「必須」、残りの現在使用中を「解除可」、人間が理由付きで外した項目を「任意」と表示する。
- module変更は所有者認証に加え、server-onlyの`getCreatorModuleCustomizationAccess`を通す。Developer Previewでは所有者へ含めるが、将来はこの判定だけを購入entitlementへ差し替える。
- DownloadMeと公開starterの取り違えを防ぐため、starter manifestへ`downloadMeVersion: 7`を追加し、ver7入口が取得直後に一致を検査する。

### 実施結果

- SDK Portalの配布リンク、Content-Disposition、同期scriptを`GameFieldsDownloadMe-ver7.md`へ更新し、development用ver7実体を生成した。
- 制作GPT向け文書を全必須契約へ統一し、解除可・任意・人間向け変更方式を含めない回帰検査を追加した。
- 公開SDK catalogから`humanReviewable`を除去し、Platform固定判定を公開catalogへ載せない形へ変更した。
- 所有者画面へ必須・解除可・任意の件数と各module状態を表示し、解除理由を保存する。カスタマイズ権限がない場合はUIとAPIの双方で変更を拒否する。
- entitlement判定をclient bundleから分離し、`server-only`境界へ置いた。未許可時の更新APIは`402 customization_not_available`を返す。
- `sdk-starter`生成物へ`downloadMeVersion: 7`を含め、旧starterではver7制作を開始できないようにした。

### 検証

- `npm run lint`成功。
- `npm test`成功（472件）。
- `npm run test:sdk-package`成功。空の外部fixtureへのinstallと全38件必須profileを確認した。
- `npm run test:sdk-starter`成功。ver7入口、公開Git用snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPまで確認した。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、14ページ生成を完了した。
- `git diff --check`成功。
- 実装treeをcommit `571f0e16e5e07799bd55ee85ca11954c75ab2bdd`として`develop`へforceなしで反映した。SDK PortalのDeployment `dpl_9yZJhUsE9wDMa4ygZXhzbjw6kwjK`、本体devのDeployment `dpl_4toZQemRanHwAc66FeRhXGZheyvV`、preview devのDeployment `dpl_CJuf6t1XF2mgYWNSdtUwqL59HsRp`が同じcommitで`READY`となった。
- 検証済みstarter snapshot全32ファイルをcommit `d673e1cd34952b73f0f50a1fadc99e05c2067ce1`として`sdk-starter`へforceなしで反映した。公開branchで`downloadMeVersion: 7`、`START_HERE.md`、`src/app-set.ts`を確認した。
- `https://sdk-dev.game-fields.com/GameFieldsDownloadMe-ver7.md`を実際に取得し、`DownloadMe: ver7`、SDK handshake v1、development接続先が公開Deploymentから返ることを確認した。`https://dev.game-fields.com`もHTTP 307で正規の`/ja`へ遷移することを確認した。

### 未対応・保留

- 実際の決済、商品plan、価格、購入・返金・権利復元は未実装。今回追加したのはserver側entitlement差し替え境界までである。

## 2026-07-24 — 旧gameapp-devを更新へ案内するDownloadMe ver8

### 利用者からの要望

- `gameapp-dev`が更新前で`get_sdk_handshake`を利用できない場合、原因だけを報告して止まるのではなく、プラグイン更新を利用者へ案内する。
- 実機ではプラグイン更新済みなのに旧`GameFieldsDownloadMe-ver7`が使われていた。DownloadMeを改版したなら、利用者が取得する入口もver8へ確実に切り替える。
- 更新済みプラグインで`get_sdk_handshake`は呼べたが、制作GPTが公開SDK全体のcapability enum 8件をPortalへ要求し、未提供4件で`accepted=false`になった。この誤要求を防ぐ。

### 判断

- Game Fields toolがまったくない未接続状態と、旧`gameapp-dev`のtoolは見えるが`get_sdk_handshake`だけがない更新前状態を分ける。
- 更新前状態ではURL名やゲーム内容を質問せず、`gameapp-dev`の更新、新しいチャットでの再選択、同じDownloadMeの再添付だけを定型案内して停止する。
- 更新前のtool一覧を持つ既存チャットは、プラグイン更新後もその場で新toolを取得できない可能性があるため、新しいチャットを必須案内に含める。
- 版付き入口を上書きせず、入口と公開starterの`downloadMeVersion`を同時に8へ上げる。
- `get_sdk_handshake`が存在する場合はプラグイン旧版と判定しない。Portal control planeが要求する4件と、公開SDK型に含まれるgame Runtime向けcapability候補を分離する。
- MCP tool schemaの`requiredCapabilities` enumはPortal descriptorと同じ`SDK_PORTAL_CAPABILITIES`を共用する。DownloadMeにも4件をそのまま送り、別surface向け候補を追加しないよう明記する。
- 旧入口を再利用しても古い文書を取得し続けないよう、過去のDownloadMe URLは現行ver8へ一時redirectする。

### 実施結果

- `GameFieldsDownloadMe-ver8.md`の正本へ、更新前pluginの判定条件と利用者向け定型文を追加した。
- SDK Portalの配布リンク、Content-Disposition、同期scriptをver8へ更新した。
- MCP initialize instructionsにも同じ更新案内を追加し、接続クライアント側からも方針を取得できるようにした。
- starter manifest、`START_HERE.md`、検査scriptを`downloadMeVersion: 8`へそろえた。
- 現行資料と回帰テストをver8へ更新した。
- SDK Portalのhandshake descriptorとMCP tool schemaで4件の`SDK_PORTAL_CAPABILITIES`を共用し、MCPから未提供の`submission-upload`、`persistent-rooms`、`room-realtime`、`common-shell`を要求候補として出さないようにした。
- ver8へ、記載された4件をそのまま送り、別surface向け候補を追加しない指示を追加した。
- `DownloadMe.md`、`GameFieldsDownloadMe.md`、`GameFieldsDownloadMe-ver1.md`〜`ver7.md`から`GameFieldsDownloadMe-ver8.md`への一時redirectをSDK Portalへ追加した。

### 検証

- SDK OAuth／MCP／DownloadMeの対象テスト6件が成功した。
- 更新済み`gameapp-dev`の実接続で、Portalの4 capabilityだけを要求したhandshakeが`accepted: true`、`problems: []`になることを確認した。
- `npm run test:sdk-starter`成功。入口、公開Git snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPまで確認した。
- `npm run lint`成功。
- `npm test`成功（472件）。
- `npm run build`成功。既存`.next`生成キャッシュによる初回`ENOTEMPTY`後、キャッシュを退避したクリーンbuildで77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction buildと14ページ生成を完了した。
- `git diff --check`成功。
- 検証済みtreeをcommit `d0b660c67cb2ecdc3f7e66b3eeb66f69e2db92c0`として`develop`へforceなしで反映した。SDK Portal `dpl_6HZcuNXeppXw7wVgKknyKC5VTfX7`、本体dev `dpl_M3Ddn7uPLiJ17rtbbRj5HhrcyqwH`、preview dev `dpl_29f7w8UefetxpFg9yGbMdyMEcU3i`が同commitで`READY`となった。
- 公開starterの生成済みsnapshotをcommit `90ccd1f837ca3acce09c1aaedee45c5ead67ad41`として`sdk-starter`へforceなしで反映し、`starter-manifest.json`と`START_HERE.md`の`downloadMeVersion: 8`を公開branchから確認した。
- `https://sdk-dev.game-fields.com/GameFieldsDownloadMe-ver8.md`がHTTP 200、`DownloadMe: ver8`、`Content-Disposition: GameFieldsDownloadMe-ver8.md`を返すことを確認した。旧`GameFieldsDownloadMe-ver7.md`は現行ver8へHTTP 307で転送される。
- 公開`/.well-known/game-fields-sdk`がPortal用4 capabilityだけを返し、更新済み`gameapp-dev`から同4件を要求したhandshakeが`accepted: true`、`problems: []`になることを実機確認した。

### 未対応・保留

- 更新前プラグインを保持したままの既存チャットでは、新しいtool schemaが反映されない可能性がある。`get_sdk_handshake`自体がない場合だけ、ver8の案内どおりプラグイン更新後に新しいチャットで再試験する。

## 2026-07-24 — 遅延tool検索を必須にするDownloadMe ver9

### 利用者からの要望

- `GameFieldsDownloadMe-ver8.md`と更新済み`gameapp-dev`を新しいWorkチャットで選択しても、制作GPTが`get_sdk_handshake`を見つけず、プラグイン旧版と誤案内して停止する問題を直す。

### 判断

- WorkのApp toolは必要になるまで遅延読み込みされるため、最初のtool一覧に名前がないことを、未接続または旧版の根拠にしない。
- 制作GPTは旧版判定の前に、tool検索・発見機能で`gameapp-dev get_sdk_handshake Game Fields SDK接続互換性`を明示検索し、見つかったtoolを現在のチャットへ読み込む。
- 明示的な検索後も、ほかの`gameapp-dev` toolだけが見つかり`get_sdk_handshake`がない場合に限って、旧版更新案内を表示する。
- 入口の実行契約が変わるためver8を上書きせず、DownloadMeと公開starterの`downloadMeVersion`を9へ上げる。旧ver1〜8 URLはver9へ一時redirectする。

### 実施結果

- `sdk/entry/START_GAME_FIELDS.md`の初期接続確認と制作開始手順へ、旧版判定前の明示的tool検索を追加した。
- MCP initialize instructionsにも同じ検索語と判定順を追加した。
- SDK Portalの配布リンク、Content-Disposition、同期scriptを`GameFieldsDownloadMe-ver9.md`へ更新した。
- starter manifest、`START_HERE.md`、スターター検査、SDK Portal回帰テスト、現行資料をver9へそろえた。
- `DownloadMe.md`、`GameFieldsDownloadMe.md`、`GameFieldsDownloadMe-ver1.md`〜`ver8.md`からver9への一時redirectを追加した。

### 検証

- 更新済み`gameapp-dev`をtool検索して`get_sdk_handshake`を取得し、Portal capability 4件の実handshakeが`accepted: true`、`problems: []`になることを確認した。
- `npm run test:sdk-starter`成功。ver9入口、公開Git snapshot、ZIP展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。
- `npm run lint`成功。
- `npm test`成功（472件）。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、14ページ生成を完了した。
- SDK Portal build成果物で旧DownloadMe 10 URLがver9へ307 redirectされることを確認した。
- `git diff --check`成功。
- 検証済みtreeをcommit `02ea8684589697c4d0c1153d792a392c5c174e6b`として`develop`へforceなしで反映した。SDK Portal `dpl_7AAtPjzrZWooU4bGnepUp5UsQTxu`、本体dev `dpl_FXcdkLo6MuiDKv9QyLMaMj5UpmRr`、preview dev `dpl_2bL5Y12tbvRSb4EKH23iioabuvex`が同commitで`READY`となり、それぞれの開発用aliasへ割り当てられた。
- 公開starterの生成済みsnapshot全32ファイルをcommit `389cb31924d78964e3393e0bab7c845519d55b9b`として`sdk-starter`へforceなしで反映し、公開branchの`starter-manifest.json`が`downloadMeVersion: 9`であることを確認した。
- `https://sdk-dev.game-fields.com/GameFieldsDownloadMe-ver9.md`がHTTP 200、`DownloadMe: ver9`、`Content-Disposition: GameFieldsDownloadMe-ver9.md`を返すことを確認した。旧`GameFieldsDownloadMe-ver8.md`は現行ver9へHTTP 307で転送される。
- 公開`/.well-known/game-fields-sdk`がdevelopment環境とPortal用4 capabilityを返すことを確認した。
- 上記3 Deploymentのerror・fatalログはいずれも0件だった。

### 関連コミット

- `02ea868` — DownloadMe ver9の実装を`develop`へ反映。
- `389cb31` — ver9の公開starter snapshotを`sdk-starter`へ反映。

### 未対応・保留

- 新しいWorkチャットで更新済み`gameapp-dev`と公開ver9を選び、制作GPTが遅延tool検索からhandshake、starter取得へ自律的に進む最終実機確認は未実施。

## 2026-07-24 — SDK-dev必須モジュールを実画面へ合成

### 利用者からの要望

- 制作GPTがゲーム固有slotを作るところまではいったん許容するが、全38件を必須と判定しているSDK-dev確認画面にRoomロビー、参加者、設定、DEBUG、結果等の共通モジュール実体がない問題を直す。
- 必須項目は制作側へ再実装させず、SDK-devの確認画面側が必ず用意した完成形として表示・操作できるようにする。
- 直前に`publish_mock`で正しい5ファイルを送っても許可ファイル一覧が空として拒否された保存契約の不一致も解消する。

### 判断

- `@game-fields/game-sdk/modules`のcatalogは採用方針であり、件数を表示するだけでは実装済みとみなさない。
- SDK-devはcatalogとは別の実装レジストリで、全module IDを具体的な本体共通部品、SDK helper、または隔離Preview adapterへ解決する。必須IDに割当がなければ確認画面を完成扱いにしない。
- 画面遷移は`部屋作成・参加 → Roomロビー → プレイ → 共通結果`とし、ゲーム固有HTMLは外側Shell内のiframe slotへ限定する。
- ロビーからプレイ中への遷移では同じiframe要素を保持し、外側の共通UI切替でゲーム固有状態を初期化しない。
- 認証、永続化、観測等は隔離Preview上の確認用adapterであり、本体統合時の署名済みsession、サーバー認可、Redis永続化を代用しない。

### 実施結果

- `SdkPreviewGameShell`へ部屋作成・コード参加・参加可能な部屋、参加者一覧、ホスト開始条件、最大人数・ラウンド・時間設定、共通設定要約、DEBUGダミー管理、閲覧視点、フェーズ切替、revision、時間表示、中断、共通結果、再戦・解散、戦績・rating・リプレイ投影、結果共有を追加した。
- ゲーム固有iframeは共通Room Shell内のslotとして1つだけ描画し、ロビーとプレイ中で保持する。
- `sdk-preview-module-registry.ts`を追加し、全38 IDへ実体sourceと確認surfaceを割り当てた。共通モジュール確認画面から進行helper、コンテンツ供給、LLM通信バイタル、トランプ、描画を操作確認できる。
- `GameFieldsPreset`へ外側Room状態を安全に反映する`room:hydrate`を追加し、親iframeから受理するCommandを明示的な許可リストに限定した。
- MCPの`publish_mock.files`公開schemaがpath-to-content map、保存層が配列だけを受理していた不一致を、保存境界で両形式を正規化して解消した。文字列以外の本文、パストラバーサル、重複、必須ファイル不足は引き続き拒否する。
- 現行仕様を`DEVELOPMENT_HANDOFF.md`と`EXTERNAL_GAME_PACKAGE.md`へ反映した。

### 検証

- `npm run lint`成功。
- `npm test`成功（475件）。
- 全module IDと実装レジストリの完全一致、必須解除時の合成除外、共通4面、共通部品、iframe単一保持、`room:hydrate`、MCP map形式保存を回帰テストへ追加した。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、14ページ生成を完了した。
- `npm run build:sdk-preview`成功。隔離Previewのproduction build、TypeScript検査、5ページ生成を完了した。
- `git diff --check`成功。
- ローカルNext.jsは`127.0.0.1`固定で起動できた。画面確認用`agent-browser`は環境に未導入だったため一時CLIを取得したが、Chrome取得先の証明書が実行環境で`UnknownIssuer`となり、実ブラウザ確認は実施できなかった。アプリのbuild失敗とは区別して保留する。

### 未対応・保留

- 検証済みtreeをcommit `30023635d9e016a249342ed9b65bfc5f83d0bcda`として`develop`へforceなしで反映した。SDK Portal `dpl_EqoK4Gi3DZkD8mChoar2KgtMhWP7`、本体dev `dpl_44YMskXj8mWxM3y9BvQ7abusLDLr`、preview dev `dpl_AwUZ2qAy4mKsHsMWQYAk6jYysxP1`が同commitで`READY`となり、各開発用aliasへ割り当てられた。
- 公開`https://sdk-dev.game-fields.com/test10-1/games/janken-classic`を実ブラウザで確認し、共通入室画面、部屋作成、参加者・設定ロビー、DEBUGダミー追加、プレイ中、共通結果、部屋へ戻る、部屋解散まで操作できた。
- `GameFieldsPreset`の外側bridgeは保存済みじゃんけんiframeへ`playing`を反映し、`data-gf-phase=playing`になったことを確認した。一方、保存済み`mock.js`は`DOMContentLoaded`へだけ起動処理を登録しており、遅延取得時にイベントを取り逃してゲームadapterが未登録となるため、固有じゃんけん操作は開始前表示のまま停止した。SDK共通Shellの不具合とは分離し、制作物の起動契約検査として残す。
- `sdk-starter`と本番`main`、本番SDKは未変更。

## 2026-07-24 — SDK隔離asset読込・広告枠・DEBUGフェーズ表示の修正

### 利用者からの要望

- SDK-devの`ADVERTISEMENT SLOT`をゲーム制作側から編集できない共通所有にし、広告配信がない場合は枠ごと完全に非表示にする。
- 共通接続が全件グリーンに見える一方で、保存済みじゃんけんのグー・チョキ・パーを選べない原因がどの層にあるか特定して直す。
- DEBUG TOOLS内に理由なく表示される`lobby / playing / result`の3ボタンをなくす。

### 判断

- 保存済みじゃんけんのHTML、CSS、JavaScriptをprivate mock Gitから確認した。固有`mock.js`には`registerGame`、`start`、手の選択処理が存在するため、ゲームロジック不足ではない。
- 隔離iframeは`allow-same-origin`を付けないopaque originである。入口`index.html`はpath限定HttpOnly Cookieで取得できるが、相対参照の`styles.css`と`mock.js`にはCookieが送られず403となる。このため素のHTMLだけが表示され、adapter未登録のまま外側Shellだけが`playing`へ進んでいた。
- 原因層はゲーム固有ロジックでも共通Room Shellでもなく、`apps/sdk-preview`の静的asset認証境界である。安全性を下げる`allow-same-origin`追加ではなく、同一制作者・ゲーム・commit・期限だけを読めるasset tokenで解消する。
- SDK-dev独自の`PreviewAdSlot`は共通広告制御を迂回していたため廃止し、本体共通`GameAdSlot`へ統一する。広告OFF、進行中、DEBUG中はDOMごと描画しない。
- フェーズ確認は公式Lifecycle導線で行い、DEBUG内の無条件フェーズ遷移ボタンは撤去する。

### 実施結果

- 認証済みPreview HTMLへ、同一scopeの短時間HMAC asset token付き`base` URLを注入した。CSS、JavaScript、画像、フォント等の相対参照はそのread-only経路へ解決する。
- asset tokenは署名、期限、制作者slug、ゲームID、確定commitを検証し、別ゲーム・別revision・期限切れ・改ざんを拒否する。iframeの`allow-same-origin`禁止、外部通信禁止、フォーム禁止は維持した。
- `GameFieldsPreset`が`gameAdapterReady`を外側Shellへ通知するようにした。adapter未登録ならゲーム開始を拒否し、固有Runtime未接続を画面と安全な操作ログへ明示する。
- SDK-devの常時表示`ADVERTISEMENT SLOT`を削除し、外側Shellの共通`GameAdSlot`へ統一した。ゲームpackageとiframeから表示条件を変更できない。
- DEBUG TOOLSの`lobby / playing / result`直行ボタンを削除した。ダミー追加、閲覧視点、自動進行、中断は維持した。
- 実装レジストリの広告moduleも`GameAdSlot`実体へ更新した。

### 検証

- `git diff --check`成功。
- `npm test`成功（476件）。
- asset tokenの正しいscope、別ゲーム拒否、期限切れ拒否、改ざん拒否、asset base注入、adapter接続状態、広告独自枠とDEBUGフェーズボタンの不在を回帰テストへ追加した。
- `npm run lint`成功。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、14ページ生成を完了した。
- `npm run build:sdk-preview`成功。隔離Previewのproduction build、TypeScript検査、5ページ生成を完了した。

### 未対応・保留

- 検証済みtreeをcommit `cb19399d851d18568b4add6aa0c6ae08826274b8`として`develop`へforceなしで反映した。本体dev `dpl_B2hj1SuqA31wadpPkg9i2DZJeuSe`、SDK-dev `dpl_6dKhWqSg8wPvyHCE2RseP8rjQgas`、隔離Preview dev `dpl_ER1XpKHJV6QY4oThkmL2znMZb1UM`が同commitで`READY`となり、各開発用aliasへ割り当てられた。
- 公開`https://sdk-dev.game-fields.com/test10-1/games/janken-classic`を実ブラウザで確認した。入室画面とRoomロビーに広告枠は描画されず、DEBUG TOOLSにも`lobby / playing / result`直行ボタンは存在しない。
- 保存済みじゃんけんはCSS適用と`ゲーム固有Runtime接続済み`を確認した。ダミー参加者追加、共通開始、プレイ中への遷移後に「パー」を選択し、固有画面が`手を送信しています…`へ遷移するところまで操作できた。プレイ中にも広告DOMは存在しない。
- 上記3 deploymentを対象に直近30分の`error`・`fatal`ログを確認し、該当ログは0件だった。
- `main`、本番SDK、公開`sdk-starter`は変更対象外。

## 2026-07-24 — SDK-devプレイ中ゲーム領域の列配置修正

### 利用者からの要望

- Roomロビーでは正しい位置に表示される一方、プレイ開始後だけゲーム固有領域が左側の細い列へ押し込まれる問題を直す。
- 制作クライアントへの指示ではなく、SDK-dev共通Shellの責任範囲として修正する。

### 判断

- プレイ中はゲーム固有領域を先頭、Room情報を末尾へ並べ替えているため、列幅も`可変幅 / 260px`の順にする。
- ゲームpackageは隔離iframe内から親Shellのグリッドを変更できず、制作側を修正対象にしない。
- ロビーの`340px / 可変幅`配置は現状どおり維持する。

### 実施結果

- `SdkPreviewGameShell`のプレイ中グリッドを`lg:grid-cols-[minmax(0,1fr)_260px]`へ変更した。
- ゲーム固有iframeが左の可変幅列、Room参加者・設定が右の260px列へ配置されるよう、既存の表示順と列幅を一致させた。
- 正しい列定義の存在と、誤った`260px / 可変幅`定義の不在をSDK Preview回帰テストへ追加した。

### 検証

- SDK Preview対象テスト9件成功。
- `npm run lint`成功。
- `npm test`成功（476件）。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、14ページ生成を完了した。
- `npm run build:sdk-preview`成功。隔離Previewのproduction build、TypeScript検査、5ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- 検証済みtreeをcommit `006099a2beaaf2129ddb9101a75835f8ca9efa44`として`develop`へforceなしで反映した。本体dev `dpl_GjwMJPY3M9CkbFWaRGtpstVJibAr`、SDK-dev `dpl_FX5AuxBioiz5VAQmHPjuHcaC5TuG`、隔離Preview dev `dpl_AGog8M9EXEgtuSqc2dr2CyCmrJin`が同commitで`READY`となった。
- 公開`https://sdk-dev.game-fields.com/test10-1/games/janken-classic`を実ブラウザで確認した。共通ロビーからダミー参加者を追加してプレイへ進み、幅1152pxのプレイ中グリッドが`840px / 260px`として計算されることを確認した。
- ゲーム固有領域は左840px、Room情報は右260px、固有iframeは838pxで描画され、ゲーム領域が260px列へ縮退しないことを確認した。
- 上記3 deploymentを対象に直近30分の`error`・`fatal`ログを確認し、該当ログは0件だった。ブラウザ側では検証用Chrome拡張由来のmetadata送信エラーだけを確認し、対象ページ由来のエラーはなかった。
- `main`、本番SDK、公開`sdk-starter`は変更対象外。

## 2026-07-24 — SDK-dev閲覧視点の常設選択UI

### 利用者からの要望

- DEBUG TOOLSを折りたたんだ後も閲覧視点だけは表示し、ゲーム画面を操作しながら切り替えられるようにする。
- 閲覧視点のプルダウンをやめ、参加者・観戦者を直接選ぶ選択式UIへ変更する。

### 判断

- 閲覧視点はSDK-dev外側Shellが所有する共通デバッグ機能であり、隔離iframe内のゲームpackageは変更しない。
- 共通`DebugToolWindow`へ任意の固定領域を設け、最小化時は通常本文だけを隠して固定領域を残す。固定領域を渡さない既存ゲームの表示は変更しない。
- SDK-devの閲覧視点は、現在値を`aria-pressed`で示す参加者・観戦者ボタン群とする。ダミー追加・削除時は現在の参加者配列から選択肢を再構成する。

### 実施結果

- `DebugToolWindow`へ`persistentContent`を追加し、最小化時の高さをタイトルバーと固定領域の実高に合わせた。
- `SdkPreviewGameShell`の閲覧視点`select`を削除し、選択中をシアン表示するボタン群へ置き換えた。
- 閲覧視点ボタン群を固定領域へ接続し、DEBUG本文を最小化しても表示と操作を維持するようにした。
- 現行仕様を`DEVELOPMENT_HANDOFF.md`、`UI_ARCHITECTURE.md`、`KNOWN_ISSUES.md`へ反映した。

### 検証

- DEBUG／SDK Preview対象テスト16件成功。
- `npm run lint`成功。
- `npm test`成功（476件）。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、14ページ生成を完了した。
- `npm run build:sdk-preview`成功。隔離Previewのproduction build、TypeScript検査、5ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- 検証済みtreeをcommit `106d75770471d52a1cd71118fb18fc76158ca7d4`として`develop`へforceなしで反映した。本体dev `dpl_2r2Et5ox5L4ZMde9CmAr3sybry3C`、SDK-dev `dpl_AjAGpzTwhGt539NzkafPNDgmjiFE`、隔離Preview dev `dpl_3zsMtSTahMbsnpCVqdMnHrowow46`が同commitで`READY`となった。
- 公開`https://sdk-dev.game-fields.com/test10-1/games/janken-classic`を実ブラウザで確認した。閲覧視点は旧`select`が0件、直接選択ボタンが表示され、DEBUG TOOLSを最小化した後も常設領域が表示された。
- 最小化したまま「観戦者」を選択し、`aria-pressed`が「あなた」から「観戦者」へ切り替わることを確認した。
- 上記3 deploymentを対象に直近30分の`error`・`fatal`ログを確認し、該当ログは0件だった。ブラウザ側では検証用Chrome拡張由来のmetadata送信エラーだけを確認し、対象ページ由来のエラーはなかった。
- `main`、本番SDK、公開`sdk-starter`は変更対象外。

## 2026-07-24 — SDK共通モジュール棚卸しと公開ライブラリ化

### 利用者からの要望

- ワードDB、トランプ等を制作クライアントへどう伝えているかを踏まえ、お絵描きUIを含む共通機能を棚卸しする。
- 外部ゲームから再利用できる部分をライブラリ化し、公開まで進める。

### 判断

- 全38moduleをPlatform固定7件、共通Shell16件、純粋進行helper11件、再利用resource 4件に分ける。
- 認証、保存、認可、共通Shell、DEBUG、広告はPlatform所有のまま外部packageへ公開しない。
- ワードDBとLLMはDB、provider、APIキーを公開せず、型付きresourceをRuntime contextへ注入する契約だけを公開する。
- トランプはカード型、デッキ操作、秘密手札投影、React UIを公開する。
- 描画はstroke、正規化、機能preset、Canvas、ツールバー、レイヤーパネルを公開し、Room同期、保存、最終認可はPlatform adapterへ残す。
- 公開packageはMITとし、Game Fieldsへの提出、審査、サービス利用条件はPlatform側の規約と管理ゲートへ分離する。

### 実施結果

- `@game-fields/game-sdk`をpublic packageへ変更し、`content-source`、`llm`、`resources`、`playing-cards`、`playing-cards-react`、`drawing`、`drawing-react`のsubpath exportを追加した。
- `DrawingCanvas`、`DrawingToolbar`、`DrawingLayerPanel`をReact peerだけで動く共通UIとして実装し、マウス、タッチ、ペン、塗りつぶし、スポイト、パン、undo／redo用callback、zoom、レイヤー表示を公開した。
- Game Fields本体のトランプ・描画実装を公開package経由へ切り替え、内部実装と外部SDKの二重管理を解消した。
- Runtime、Mock Runtime、内部Platform Runtimeへ`GameSdkPlatformResources`を追加し、AppSetの作成・Command・Viewへresourceを注入できるようにした。
- 機械可読module catalogへ`delivery`、`packageExports`、`publicApis`、`usage`を追加し、MCP `get_game_module_requirements`がIDだけでなく利用契約も返すようにした。
- 棚卸し正本`docs/SDK_MODULE_INVENTORY.md`、MIT License、公開README、外部fixture検査、publish dry-run、main限定の手動GitHub Actions workflowを追加した。

### 検証

- 公開packageのTypeScript build、pack、空の外部fixtureへのinstall、Runtime・resource・React UI import検査に成功した。
- `npm publish --dry-run`に成功し、87ファイル、約65.7KBのpublic tarballとして解決された。
- SDK starterの入口、公開Git snapshot、ZIP、同梱SDK install、型検査、契約テスト、完走デモ、提出ZIP検査に成功した。
- `npm test`成功（481件）。
- `npm run lint`成功。公開SDK 21ソース、内部Runtime、実証ゲーム、SDKワードウルフ、スターターの依存境界を確認した。
- 本体、SDK Portal、隔離Previewのproduction buildに成功した。
- `develop`反映後、本体dev `dpl_7X9tcohVf8tW7fVkaWDhFRucTs2M`、SDK-dev `dpl_2iZECrY1euzRJf2yJiwzjYNrWuQ7`、隔離Preview dev `dpl_7uHdsghna7K2W5XgEhRSirk72LZ6`が対象commitで`READY`となり、各開発用aliasへ切り替わった。
- 公開`/dev/playing-cards`で表向き手札、他参加者の秘密手札枚数、カード選択を実操作した。ブラウザ側の対象ページ由来error／warningは0件だった。
- 3 deploymentのbuild errorと、直近30分のruntime `error`／`fatal`は0件だった。

### 関連コミット

- `80a863817805546fedb8c3b4f52a55d60a079a7a` — `Publish reusable Game SDK resources`

### 未対応・保留

- npm registryへの実publishには、npm側の`@game-fields` scope所有権と、GitHub Environment `npm-public`の承認者、対象package限定`NPM_TOKEN`が必要である。現在の実行環境はnpm未認証のため、registryは未変更。
- workflowは`main`からの手動実行だけを許可する。developでの実機確認と外部設定完了後にmainへ反映し、`@game-fields/game-sdk@0.1.0`を初回publishする。
- `main`、本番SDK、npm registryは変更していない。

## 2026-07-24 — Game SDK初回npm公開の外部設定

### 利用者からの要望

- `@game-fields/game-sdk@0.1.0`をnpmへ初回公開するためのnpm・GitHub設定を完了し、公開作業を再開する。

### 判断

- 公開資格は`@game-fields` scopeへのread/writeだけを許可した7日間のgranular tokenとし、GitHubの`npm-public` Environment Secret `NPM_TOKEN`からだけ利用する。
- workflowは`main`からの手動実行に限定し、required reviewerの承認後だけnpm publishへ進める。
- 初回公開後は短期tokenを失効し、GitHub Actions OIDCを使うTrusted Publishingへ移行する。

### 実施結果

- npm Organization `@game-fields`を作成し、所有者アカウントの2FAを有効化した。
- 初回公開用の7日間tokenを発行し、`@game-fields` scopeをread/write、Organization管理権限をnoneに限定した。
- GitHub Environment `npm-public`へ`main`限定branch rule、required reviewer、Environment Secret `NPM_TOKEN`を設定した。
- 検証済み`develop`をGitHub `main`へforceなしでfast-forwardし、本体とSDK Portalの本番デプロイを開始した。

### 検証

- npm registryで`@game-fields/game-sdk@0.1.0`が未登録であることを確認した。
- tokenの秘密値はGit、文書、チャットへ記録していない。
- `npm run lint`、`npm test`（481件）、`npm run build`（77ページ）に成功した。
- `main` commit `72a735e6575055296b56f068d55ae9c67f8de0fa`の本体deployment `dpl_12LkKNj9EQ1JdK6xvkBv6X6SkSzM`とSDK Portal deployment `dpl_8mPgws9kC5zAH2S5FzKYSmM9Vcz3`が`READY`となり、`game-fields.com`／`www.game-fields.com`と`sdk.game-fields.com`へalias切替された。
- 両deploymentのbuild errorは0件、直近30分のruntime `error`／`fatal`は0件だった。

### 未対応・保留

- `Publish Game SDK` workflowをversion `0.1.0`、confirm `publish-game-sdk`で手動実行する。
- required reviewerの承認、workflow成功、npm registryからのpackument取得を確認する。
- 初回公開成功後に短期tokenを失効し、Trusted Publishing設定へ移行する。

## 2026-07-24 — SDK単語DB実配線とプレイ領域の広幅化

### 利用者からの要望

- 公開契約だけ用意されていたSDKの単語DB導線を、実際の共通DB読取へ接続する。
- SDK-devでゲーム領域が狭く見える原因がiframeかを確認し、共通側で直せる場合は修正する。

### 判断

- SDKゲームはDB接続やテーブルを受け取らず、Platform内の読取専用`content-source` adapterを`context.resources`へ注入する。
- 一般語はアプリDBの審査済み`standard-game`プール、難読語・ワードペア・語釈は共通語彙DBのactiveデータを正本とする。
- 外部へ返すword／pair IDはDB IDを契約にせず、本体秘密値から導出した鍵で認証付き暗号化したopaque IDにする。
- 未審査iframeへDB接続またはresource APIを渡さない。SDK-dev外側のmodule labだけが、認証・レート制限付きsample APIで実DB接続を確認する。
- SDK Portal最外層iframeとゲーム側CSSはどちらも幅100%／最大1320pxまで利用できた。直接の幅制限は本体Shellの`max-w-6xl`と右260px列だったため、プレイ中だけ最大1600px、ゲーム可変幅／Room情報280pxへ変更する。

### 実施結果

- `lib/game-sdk-content-source.ts`を追加し、`general-words`、`rare-words`、`word-pairs`、語釈取得を一つのPlatform adapterへ実装した。
- 一般語の既存難易度比率、難読語のZipf帯、ワードペア距離をSDKの`easy / normal / hard`へ投影した。
- DB IDを露出しない認証付き暗号化・改ざん検査付きopaque IDと、除外ID・除外表記・件数上限を実装した。
- 静的審査登録済み`wordwolf-sdk`へadapterを注入し、作成入力にお題がない場合は審査済みワードペアを取得するようにした。手動topicを渡す既存fixture互換は維持した。
- `/api/sdk-preview/content-sample`を追加し、SDK-dev module labの固定3語を実DBからの1語取得へ置き換えた。
- プレイ中Shellを`max-w-[1600px]`、`minmax(0,1fr) / 280px`へ広げた。ロビーの既存幅は変更していない。
- 現行仕様を`DEVELOPMENT_HANDOFF.md`、`SDK_MODULE_INVENTORY.md`、`EXTERNAL_GAME_PACKAGE.md`、`ENVIRONMENT_VARIABLES.md`へ反映した。新しい外部環境変数は追加していない。

### 検証

- npm registryから`@game-fields/game-sdk@0.1.0`のpackage metadataと公開tarball URLを取得し、初回publish済みであることを再確認した。
- Content Source、SDK WordWolf、SDK Previewの対象テスト13件成功。
- `npm run lint`成功。環境変数台帳60キー、9ゲーム共通要件、SDK依存境界を確認した。
- `npm test`成功（484件）。
- `npm run build`成功。Next.js production build、TypeScript検査、77ページ生成を完了した。
- `npm run build:sdk`成功。SDK Portalのproduction build、TypeScript検査、14ページ生成を完了した。
- `npm run build:sdk-preview`成功。隔離Previewのproduction build、TypeScript検査、5ページ生成を完了した。
- `git diff --check`成功。

### 未対応・保留

- ローカル環境にはDB接続値を配置していないため、実DB sampleと広幅表示の公開実機確認は`develop`反映後に行う。
- `main`、本番SDK、npm package versionはこの変更では更新しない。
