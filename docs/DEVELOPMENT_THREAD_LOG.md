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
