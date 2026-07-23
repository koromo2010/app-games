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
