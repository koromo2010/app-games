Warning: truncated output (original token count: 110521)
Total output lines: 6329

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

- `NE…70521 tokens truncated…理が
  成功してからアカウント本体と旧メール索引を削除する。

### 検証

- 受信箱、旧record互換、認証・MFA、保持期限、索引外本文削除、従属データ削除、
  Cron削除順序を回帰テストへ追加した。
- `npm run lint`に成功した。
- `npm test`に成功し、全577テストが通過した。
- `npm run build`に成功し、管理受信箱APIを含むproduction buildが完了した。
- `1897a73`をdevelopへ反映し、`app-games-dev`の対象Deployment
  `dpl_3oH7GGbWCokVZDHWgN8aCdTVB1tf`がREADYになった。
- 対象Deploymentは`dev.game-fields.com`へaliasされ、公開後のerror／fatal Runtime Logは
  0件だった。

### 未対応・保留

- 管理者アカウントで既存報告・問い合わせの表示と対応状態変更を実機確認する。
- 今回の監査範囲は受信データとアカウント従属データであり、外部制作者アカウントを
  使う正式Packageの認証付き実機E2Eは前項どおり別途必要である。

### 関連コミット

- `1897a73` — 運営受信箱、受付ID、保持期限、アカウント従属データ削除を実装。

## 2026-07-26 — SDK-devからの不具合報告保存確認

### 利用者からの要望

- SDK-devから当日送信された不具合報告が、dev管理画面で古い問い合わせしか見えない
  状態でも正しく保存されているか確認する。

### 判断

- SDK-devの制作者ゲーム画面は`dev.game-fields.com/sdk-preview/...`をiframeで使用するため、
  共通メニューの「改善・バグ報告」はSDK Portalの保存先ではなく、本体devの
  `/api/user-reports`とdev Redisへ保存される。
- 公開`/contact`からの内容は管理画面の「お問い合わせ」、ゲーム共通メニューからの
  内容は「報告」に分けて表示する。両者を同じ一覧とは扱わない。

### 実施結果

- Vercel Runtime Logで、SDK-dev上の`moi-lab/skull`操作直後に、同じ認証済み利用者から
  `POST /api/user-reports`が実行されたことを確認した。
- 2026-07-26 20:39 JSTの要求はHTTP 201、`user-report.save`のoutcomeはsuccessであり、
  当日分はdev側へ正常保存されている。
- 同日の`/api/contact`送信は確認されず、当日分が「お問い合わせ」に出ないのは
  保存欠落ではなく受信箱区分の違いである。

### 検証

- `app-games-dev`の2026-07-26当日Runtime Logを、`user-report.save`と送信直前の
  SDK Preview Room操作で時刻・匿名actor参照を突合した。
- 同時間帯に報告保存失敗ログはなかった。

### 未対応・保留

- 管理画面の「報告」タブで当日recordが描画されることは、管理者ブラウザで確認する。

### 報告内容そのものの追加確認

- 報告時点の旧Deployment `15cc680`では、Skull RoomへのDEBUG追加Commandが3回とも
  HTTP成功し、lobby revisionが`1 → 2 → 3 → 4`へ進んでいた。ダミー追加の保存失敗ではなく、
  保存後の新しいRoom表示がクライアント側で保持されない経路だった。
- 後続修正`ae0b792`は、Command、iframe、watcher、timerから遅着した古いRoom応答を
  `attachLatestRoom`で拒否し、新しいrevisionを巻き戻さない。報告後の同Deploymentでは
  Skullのplaying Commandがrevision 34〜40まで進み、stale revisionの409と混在しても
  最新rev 40のlobbyへ戻ったことをRuntime Logで確認した。
- `online-room-client-state`、正式Preview creator限定DEBUG契約、SDK HTTP Runtimeの
  18テストも通過した。従って報告原因に対応する実装は`ae0b792`で反映済みと判断する。
- Cloud Browserでは通常テストアカウントでRoom `81PW`の作成・プレイヤー表示まで確認した。
  このアカウントは`moi-lab`所有者ではないため、creator限定DEBUGボタンを押す最終E2Eは
  未確認として残す。

## 2026-07-26 — 報告・お問い合わせの双方向会話と人間承認付きAI報告

### 利用者からの要望

- 運営受信箱から報告・お問い合わせへ返信し、やりとりに応じてオープン等の状態を
  管理できるようにする。
- SDK制作者側もPortal UIとAIから同じ会話を確認・追記できるようにする。
- AIが不具合報告を作れるようにするが、人間の同意なしで正式送信させない。

### 判断

- 報告・問い合わせへ共通状態`open`、`in-progress`、`waiting-user`、`resolved`、
  `closed`とappend-onlyの会話履歴を持たせる。
- 運営返信は既定で`waiting-user`、送信者追記は`open`へ戻す。状態と会話の同時更新は
  Redis CASで保護し、遅い更新によるメッセージ消失を防ぐ。
- SDK PortalとAI toolは、本体Redisを直接参照せず、既存`SDK_ACCOUNT_LINK_SECRET`の
  method・path・時刻署名付き内部APIを通す。player IDで本人のreportだけに制限する。
- AIの新規報告は7日間の下書きだけを作り、本人がPortalで確認・修正して明示承認した時に
  安定したreport IDで冪等保存する。AI用の直接submit toolは作らない。
- 公開問い合わせは認証アカウントを必須にできないため、HMAC付き専用URLと受付メールで
  本人側UIを提供する。秘密値はURL fragmentへ置き、ページrequestとreferrerに含めない。

### 実施結果

- `/admin`の「報告」「お問い合わせ」へ会話履歴、返信欄、返信後状態選択を追加した。
  full管理者の直近MFAを必須とし、監査ログには本文を複製せずmessage IDと状態だけを残す。
- お問い合わせ返信はResend idempotency key付きで送信し、メール失敗時も会話を保存する。
  新規受付メールと`/contact/thread`から、問い合わせ者が履歴確認・追記できる。
- SDK Portalへ`/support`と人間承認画面を追加した。OAuth MCPへ
  `list_support_threads`、`get_support_thread`、`reply_support_thread`、
  `prepare_support_report`を追加し、Portal UIと同じ本体データを利用する。
- Handshake capabilityへ`support-threads`と`human-approved-reporting`を追加し、
  SDK HelpとDownloadMe正本へ承認条件を明記した。
- 会話は報告180日・問い合わせ365日の既存保持期限に従う。AI下書きは7日で失効し、
  報告・下書きともアカウント削除の従属データへ含めた。

### 検証

- `npm test`に成功し、全582テストが通過した。
- `npm run verify`、`npm run lint`、本体`npm run build`、SDK Portal
  `npm run build:sdk`に成功した。
- `npm run test:sdk-starter`で入口、公開Git snapshot、ZIP展開、同梱SDK install、
  型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。
- SDK Portal buildで`/support`、`/support/drafts/[draftId]`、対応APIが生成され、
  本体buildで`/api/contact-thread`、`/contact/thread`、`/api/internal/sdk-support`が
  生成された。

### 未対応・保留

- devへのcommit反映と、本体dev・SDK Portal dev双方のDeployment／Runtime Error確認。
- full管理者、SDK制作者、公開問い合わせ者の3セッションを使う公開後の実画面E2E。

## 2026-07-26 — 双方向support機能のdevelop公開

### 利用者からの要望

- 検証済みの報告・お問い合わせ会話、人間承認付きAI報告を`develop`へpushし、
  本体devとSDK Portal devへ反映する。

### 判断

- push直前に共有`develop`を再取得し、先行していた管理者Passkey関連5コミットを
  保持した最新先端へsupport変更をrebaseする。
- 先行変更で検出したReact Hooks lint誤検知は、Hookではない補助関数の`use`接頭辞だけを
  変更し、挙動を変えない独立commitとして同時に修正する。
- GitHub CLI資格がない環境では、接続済みGitHub経路で各ローカルcommitと同一treeを作り、
  リモート先端を再確認してから非forceで`develop`をfast-forwardする。

### 実施結果

- 管理者Passkey関連5コミットとファイル競合なくrebaseし、support機能、事前調査記録、
  lint修正の3コミットを`develop`へfast-forward反映した。
- 各GitHub tree SHAをローカルの検証済みtreeと照合し、3段階とも完全一致を確認した。
- 本体devとSDK Portal devは同じ最終commit`b213a7b`を認識し、それぞれ
  `dev.game-fields.com`と`sdk-dev.game-fields.com`へ反映された。

### 検証

- 最新`develop`を含む最終treeで`npm test`に成功し、全583テストが通過した。
- `npm run verify`、本体`npm run build`、SDK Portal`npm run build:sdk`に成功した。
- `app-games-dev`のDeployment`dpl_Dx9K95hiBb1jyvET575qgV2phP22`はREADYとなり、
  `dev.game-fields.com`へaliasされた。
- `app-games-sdk-dev`のDeployment`dpl_8SKdChTTHZBiFa8d12WoxkjSN8qa`はREADYとなり、
  `sdk-dev.game-fields.com`へaliasされた。
- 両Deployment固有のerror／fatal Runtime Logは0件だった。

### 関連コミット

- `0d704e8` — 報告・問い合わせの会話、SDK Portal／AI support、人間承認付き報告を実装。
- `b213a7b` — 管理者復旧コード補助関数のReact Hooks lint誤検知を解消。

### 未対応・保留

- full管理者、SDK制作者、公開問い合わせ者の3セッションを使う実画面E2E。
- `moi-lab`所有者でのSkull DEBUGダミー追加表示の最終実機確認。

## 2026-07-26 — 報告返信のメール通知とPortal誘導

### 利用者からの要望

- 報告へ返信したときはメールでも知らせるが、会話はSDK制作者側のコンソールで
  確認・返信するよう案内したい。

### 判断

- メールは通知に限定し、会話履歴と対応状態の正本は従来どおり本体Redisと
  SDK Portal／AIの共通support threadに置く。
- 送信先はGame Fieldsアカウントの確認済み復旧用メールだけとする。未登録・未確認・
  配送失敗でも返信本文と状態更新は失わない。
- 通知から環境別Portalの該当報告へ直接移動し、未ログイン時もaccount link後の
  returnToで同じ報告を開く。

### 実施結果

- 報告への管理者返信を先にCAS保存し、確認済みメールへResendの冪等通知を送る経路を追加した。
- 通知メールへ返信本文、「メールは通知で会話はPortalが正本」という案内、
  SDK Portalで確認・返信するボタン、AIからも同じスレッドを確認できる説明を追加した。
- 通知メールへ、報告IDを指定して`get_support_thread`を呼ぶGPT貼り付け文を追加した。
  貼り付け文は、最新返信までの読込、要点と次の対応の提示、変更・返信前の人間確認を
  明示する。
- `/support?thread=<reportId>`で本人の対象スレッドを展開し、管理画面には
  `sent`、`failed`、`not-required`の配送結果を表示する。

### 検証

- `npm run lint`に成功した。
- `npm test`に成功し、全585テストが通過した。
- 本体`npm run build`に成功し、78ルートを生成した。
- SDK Portal`npm run build:sdk`に成功し、`/support`を含む15ページを生成した。
- develop／mainから対応するSDK Portal originと報告ID付きURLを作る回帰テストを追加した。

### 未対応・保留

- dev公開後、確認済みメールを持つSDK制作者への実メール配送とPortal遷移を実機確認する。

## 2026-07-26 — AIによるsupport返信も人間承認を必須化

### 利用者からの要望

- GPTプラグインから既存の報告スレッドへ返信する場合も、新規報告と同様に人間承認を
  必須にする。
- 運営返信メールからGPTへ引き継ぐ文章にも、返信下書きとPortal承認の手順を明示する。

### 判断

- Portal画面で本人が直接入力する返信は、その操作自体が人間の明示送信なので従来どおり
  即時投稿する。
- OAuth MCPからは直接返信toolを提供せず、`prepare_support_reply`で7日間の下書きだけを
  作る。本人がPortalの承認画面で内容を確認・修正して送信した場合だけ会話へ追加し、
  状態を`open`へ戻す。
- 下書き作成時は会話履歴・状態・通知を変更しない。承認は安定request IDで冪等化し、
  同じ承認要求の再試行で返信を重複させない。
- MCP tool schemaとAI実行契約が変わるためDownloadMeをver16へ上げ、
  `human-approved-support-replies` capabilityで古いPortal／チャットを互換成功させない。

### 実施結果

- MCPの`reply_support_thread`を廃止し、`replied: false`、`humanApprovalRequired: true`、
  `approvalUrl`を返す`prepare_support_reply`へ置き換えた。
- 本体へ本人所有reportだけに紐づく返信下書き保存・取得・承認APIを追加し、アカウント
  削除時の従属データ削除にも含めた。
- SDK Portalへ`/support/replies/[draftId]`と対応APIを追加した。承認画面は対象スレッドと
  返信本文を表示し、本人が本文を修正して「返信を送信」を押すまで投稿しない。
- 運営返信メールのGPT貼り付け文を、`get_support_thread`で経緯確認後、
  `prepare_support_reply`で下書きを作り、本人へ承認URLを提示する手順へ更新した。
- DownloadMe生成・Portal配布・Starter検査の版番号をリリース台帳から導出するようにし、
  development入口をver16へ更新した。ver15は旧版として保持する。

### 検証

- `npm run verify`に成功した。
- `npm test`に成功し、全585テストが通過した。
- 本体`npm run build`に成功し、78ルートを生成した。
- SDK Portal`npm run build:sdk`に成功し、返信承認画面・APIを含む15ページを生成した。
- `npm run test:sdk-starter`でver16入口、公開Git用snapshot、ZIP展開、同梱SDK install、
  型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。

### 未対応・保留

- 変更はローカルcommitまでとし、`develop`へのpushとdev Deployment確認は未実施。
- dev公開後、MCPで返信下書きを作成し、Portalで承認してスレッドが`open`へ戻る実画面E2Eを
  実施する。

## 2026-07-26 — GPTへのsupport引継ぎを報告IDだけに簡素化

### 利用者からの要望

- 運営返信メールからGPTへ貼る内容は報告IDだけにし、経緯の読込や返信時の人間承認などの
  指示はサーバー側で持たせたい。

### 判断

- メールへAI向けの長い命令文を複製せず、報告IDを会話の引継ぎキーとして表示する。
- MCPの`get_support_thread`を、`report_...`形式のIDだけが入力された場合にも呼ぶtoolとして
  宣言する。
- 取得結果へAI進行規則を含め、最新返信までの要約、次の対応の説明、直接返信禁止、
  `prepare_support_reply`による下書きとPortal承認、コード変更前の利用者確認を
  サーバー側で一元管理する。

### 実施結果

- SDK制作者への返信メールのGPT欄を報告IDだけの表示へ変更した。
- `get_support_thread`のtool説明と応答へ`assistantPolicy`を追加した。
- メール、MCP、現行仕様、引き継ぎ資料の回帰契約を更新した。

### 検証

- `npm test`に成功し、全585テストが通過した。
- `npm run verify`に成功した。
- 本体`npm run build`に成功し、78ルートを生成した。
- SDK Portal`npm run build:sdk`に成功し、MCPを含む15ページを生成した。

### 未対応・保留

- `develop`へのpushとdev環境での実メール・GPT引継ぎE2Eは未実施。

## 2026-07-26 — トップのお問い合わせとSDK新規報告導線

### 利用者からの要望

- 本体トップでお問い合わせページへの導線が見つからない状態を解消する。
- SDK Portalのサポート画面で既存報告を確認するだけでなく、同じ画面から新規報告を
  作成できるようにする。

### 判断

- 本体はフッターの既存導線を維持しつつ、ゲーム一覧の高さやスクロール位置に依存しない
  広場ヘッダーへお問い合わせを常設する。
- SDK Portalでは`/support`の見出しと空状態から`/support/new`へ移動し、人間本人が
  入力内容を確認して送信した場合に直接スレッドを作る。
- AI経由の新規報告・返信は従来どおり下書きだけを作り、Portalの承認画面を必須とする。
  人間用フォームをAIのtool経路へ流用しない。
- 人間用新規報告もrequest IDから安定した報告IDを作り、通信結果を受け取れなかった
  同一送信の再試行で重複スレッドを作らない。

### 実施結果

- `LobbyHeader`へ言語対応した`/contact`リンクを追加した。
- SDK Portalの`/support`へ「新規報告を作成」を追加し、報告が0件の場合にも同じ導線を
  表示した。
- `/support/new`へ不具合報告／改善要望、要約、詳細・再現手順、対象ページを入力する
  人間用フォームを追加した。
- Portal APIと署名済み本体内部APIへ本人所有の新規スレッド作成経路を追加し、
  保存後は作成したスレッドを展開した`/support`へ戻すようにした。

### 検証

- 対象8テストと対象lintに成功した。
- `npm test`に成功し、全586テストが通過した。
- `npm run lint`、`npm run verify`に成功した。
- SDK Portalのproduction buildに成功し、新しい`/support/new`を含む全ルートを生成した。
- 本体`npm run build`に成功し、78ページを生成した。並列検査中の初回だけ`.next`生成物の
  削除競合で`ENOTEMPTY`となったが、検査終了後の単独再実行は成功した。

### 未対応・保留

- 変更はローカルcommitまでとし、`develop`へのpushとdev Deployment確認は未実施。
- dev公開後、本体ヘッダーからお問い合わせへの遷移と、SDK制作者本人による新規報告作成・
  スレッド表示を実画面で確認する。

## 2026-07-26 — support通知・承認・新規導線のdevelop公開

### 利用者からの要望

- support返信通知、GPTへの報告ID引継ぎ、人間承認必須のAI返信、本体お問い合わせ導線、
  SDK Portalの新規報告導線をまとめて`develop`へpushする。

### 判断

- ローカルの検証済み4コミットだけを対象とし、共有`develop`が既知の先端
  `85c79bb`から動いていないことを再確認してから非forceでfast-forwardする。
- GitHub CLI資格がないため、接続済みGitHub経路で各commitのblobとtreeを再構成し、
  4段階すべてのtree SHAがローカルと一致した場合だけbranch refを更新する。
- 自動DeploymentはGit commit `90973bd`に固定して追跡し、本体devとSDK Portal devの
  READY、独自ドメインalias、build error、Runtime Errorを確認する。

### 実施結果

- support返信メール通知、Portal直リンク、報告IDだけによるGPT引継ぎ、AI返信の
  下書き・人間承認、トップヘッダーのお問い合わせ、SDK Portalの新規報告作成を
  `develop`へ反映した。
- GitHub上の最終commitは`90973bd`。内容tree `2c7e018`はローカル`430ce07`と一致した。
- `app-games-dev`と`app-games-sdk-dev`は同じcommitを認識し、それぞれ
  `dev.game-fields.com`と`sdk-dev.game-fields.com`へaliasされた。

### 検証

- 公開前の最終treeで全586テスト、lint、verify、本体・SDK Portal production buildに
  成功済み。
- 本体dev Deployment `dpl_Dick9aiPAwFZtu5BsEMXwwwxi4s5`はREADY。
- SDK Portal dev Deployment `dpl_5UBK7BacjcWR4pTy6MrF3U1pjsbv`はREADY。
- 両Deploymentのerrors-only build logに失敗はなく、error／fatal Runtime Logは0件。
- Vercel ConnectorのURL取得は両custom domainでshareable URLを生成できず、実ページ本文の
  取得確認は行っていない。

### 関連コミット

- `efec320` — SDK制作者へのsupport返信メール通知を追加。
- `8f7c1c5` — AIの既存スレッド返信もPortalでの人間承認を必須化。
- `ae6de2c` — GPTへの引継ぎ入力を報告IDだけへ簡素化。
- `430ce07` — 本体お問い合わせとSDK新規報告の常設導線を追加。
- `90973bd` — 上記4コミットと同一treeを持つ公開済みGitHub先端。

### 未対応・保留

- 本体ヘッダーからお問い合わせへの遷移、SDK制作者本人の新規報告、通知メール、
  報告IDだけを使うGPT引継ぎ、返信下書き承認を実画面E2Eで確認する。

## 2026-07-26 — 管理者向け問い合わせ通知の失敗理由と再送

### 利用者からの要望

- 管理者アカウントで「問い合わせ内容を受け取る」を有効にしているのに、
  公開フォームからの問い合わせ通知メールが届かない状態を解消する。

### 判断

- 公開済みコードは問い合わせ保存後の管理者通知失敗を`failed`へまとめており、
  例外の安全な分類やRuntime Logを残していなかった。そのため、過去の未達が
  宛先取得、Resend認証、送信元、送信制限のどれだったかは事後に確定できない。
- 問い合わせ受付自体はメール障害と切り離して成功させる既存方針を維持しつつ、
  管理者通知の最終試行日時と安全なエラーコードを問い合わせへ保存する。
- 管理画面から直近MFAと監査ログを伴う再送を行えるようにし、設定修正後の既存
  問い合わせも再提出なしで通知できるようにする。
- 再送と新規通知には問い合わせ単位のIdempotency-Keyを付け、通信再試行による
  意図しない重複送信を抑える。

### 実施結果

- 新規問い合わせと問い合わせ者の追記について、管理者通知の成功・失敗、最終試行日時、
  安全な失敗理由をRedisの問い合わせレコードへ保存するようにした。
- 宛先DB取得失敗、購読者なし、Resend未設定、認証、未確認送信元、宛先制限、送信枠、
  レート制限、その他の送信失敗を管理画面で区別するようにした。
- 管理画面の問い合わせ詳細へ「管理者通知を再送」を追加し、結果と失敗理由を即時表示する
  ようにした。再送APIはfull管理者の直近MFAを要求し、監査ログへ結果だけを保存する。
- Vercelの`app-games-dev`最新Deploymentが`develop`の`72ddebc`でREADYであること、
  環境変数台帳上でResend Shared VariableがDevelopmentへLink済みかつ過去に実送信確認済み
  であることを確認した。公開済み旧コードに失敗ログがないため、今回の過去送信の直接原因は
  未確定のままである。

### 検証

- `git diff --check`に成功した。
- `npm test`に成功し、全586テストが通過した。
- `npm run lint`に成功した。
- `npm run build`に成功し、問い合わせ再送APIを含む78ルートを生成した。

### 未対応・保留

- `develop`へのpushとdev Deployment確認は未実施。
- dev公開後、管理画面から未達問い合わせを再送し、画面に表示される成功または失敗理由と
  実メール受信を照合する。

## 2026-07-26 — 問い合わせ通知診断・再送機能のdevelop公開

### 実施結果

- 問い合わせ通知の失敗理由、最終試行日時、管理画面からの再送を`develop`へ
  fast-forwardで公開した。
- GitHub上のcommitは`fc6c7d6`。内容tree `611dbac`は全テスト・lint・buildを通した
  ローカルcommit `8c9a569`と一致する。
- `app-games-dev`は対象commitを認識し、`dev.game-fields.com`へaliasされた。

### 検証

- 本体dev Deployment `dpl_6fBkpFp7cYgPqy3NVoTb3PEocBVn`はREADY。
- errors-only build logに失敗はなく、問い合わせ関連APIのRuntime Errorと
  error／fatal Runtime Logは0件。

### 関連コミット

- `fc6c7d6` — 問い合わせ通知の失敗診断と管理画面からの再送を追加。

### 未対応・保留

- 管理画面の「お問い合わせ」で未達問い合わせを開き、「管理者通知を再送」を実行して、
  画面の成功または安全な失敗理由と実メール受信を照合する。

## 2026-07-26 — 改善・バグ報告フォームの入力保持

### 利用者からの要望

- ゲーム進行中に報告フォームへ入力している途中で画面状態が変わっても、入力内容を
  失わず送信できるようにする。

### 判断

- 報告本文を端末へ長期間残さず、同じタブ内のフェーズ変更、コンポーネント再生成、
  再読込を越えて復元するため、`sessionStorage`へ種別・概要・詳細だけを一時保存する。
- 送信成功後は下書きを削除し、Storageが使えない制限環境でも報告機能自体を止めない。

### 実施結果

- 報告フォーム下書きの検証・保存・復元を`lib/user-report-form-draft.ts`へ分離した。
- 共通報告フォームを下書きの自動復元・入力変更時保存へ接続し、保持範囲を利用者向け
  説明へ追加した。
- 不正JSON、入力上限、送信後相当の空フォーム削除を回帰テストへ追加した。

### 検証

- `git diff --check`に成功した。
- `npm test`に成功し、全589テストが通過した。
- `npm run lint`に成功した。
- `npm run build`に成功し、報告APIを含む78ルートを生成した。

### 未対応・保留

- develop公開後、実画面で入力中にゲームを進行させ、フォーム再表示時の復元と
  送信成功後の消去を確認する。
## 2026-07-26 — 改善・バグ報告フォーム入力保持のdevelop公開

### 実施結果

- 改善・バグ報告フォームの入力保持を`develop`へfast-forwardで公開した。
- GitHub上のcommitは`90251f7`。内容tree `a2e2be5`は全テスト・lint・buildを
  通したローカルcommit `a23704e`と一致する。
- `app-games-dev`は対象commitを認識し、`dev.game-fields.com`へaliasされた。

### 検証

- Deployment `dpl_AUBJzVsvWPrgDy5awDvFv9eTXj1m`はREADY。
- `npm test`で全589テスト、`npm run lint`、`npm run build`が成功済み。

### 関連コミット

- `90251f7` — 改善・バグ報告フォームの同一タブ内下書き保存を追加。

### 未対応・保留

- 実画面で入力中にゲームを進行させ、フォーム再表示時の復元と送信成功後の消去を
  確認する。

## 2026-07-26 — 問い合わせ・報告の管理受信箱とメール通知を統合

### 利用者からの要望

- 管理者アカウントで問い合わせ通知を有効にしているのに、ゲーム内の改善・バグ報告が管理者メールへ届かない状態を直す。
- 問い合わせと報告へ同じ通知・会話・再送機能を適用し、管理画面の別タブも一つへまとめる。

### 判断

- PostgreSQLの既存`receive_contacts`列は増設せず、「問い合わせ・報告を受け取る」共通購読として扱う。
- 公開問い合わせ、本体ゲーム・SDK Portalの新規報告、問い合わせ者・報告者の追記を同じ宛先へ送る。
- 運営返信から利用者へのメール通知は既存経路を維持し、利用者から運営への管理者通知とは別の配送状態として扱う。
- 管理画面は作成日時順の一つの受信箱とし、問い合わせ／改善要望／バグ報告は種別バッジで判別する。

### 実施結果

- 新規報告と報告者追記の管理者通知、冪等キー、送信状態、最終試行日時、安全な失敗理由を追加した。
- 報告APIへ直近MFA必須・監査ログ付きの管理者通知再送を追加した。
- 管理画面の「報告」「お問い合わせ」を「問い合わせ・報告」へ統合し、状態変更、返信、通知診断・再送を共通UIへまとめた。
- 管理者アカウントの購読表示を「問い合わせ・報告を受け取る」へ変更した。

### 検証

- 問い合わせ・報告関連の回帰テスト13件に成功した。
- `npm test`に成功し、全590テストが通過した。
- `npm run lint`に成功した。
- `npm run build`に成功し、全78ルートを生成した。
- GitHubの`develop`へcommit `44f0ad3`で非force公開し、検証済みtree
  `e13f243`との一致を確認した。
- `app-games-dev` Deployment `dpl_9JxESXspH4vbChdQc8gwtsfuxxC9`はREADYとなり、
  `dev.game-fields.com`へaliasされた。errors-only build logに失敗はない。

### 未対応・保留

- dev実画面から報告の「管理者通知を再送」を実行し、画面の送信結果と実メール受信を
  照合する。

## 2026-07-27 — 運営返信のパスキー要求と無反応を修正

### 利用者からの要望

- 問い合わせ・報告への通常返信ではパスキー再確認を不要にする。
- パスキーを外すだけでなく、承認後に処理が進まなかった原因も確認する。

### 判断

- 運営返信は既存のfull管理者セッションと監査ログで保護し、追加のstep-upは外す。
- 対応状態変更、管理者通知再送、昇格、重要設定等の高影響操作は直近MFAを維持する。
- mainとdevは親RP IDを共有するが管理者DBは別であるため、認証候補を現在環境へ
  登録済みのCredential IDに限定する。transport hintは固定しない。
- Vercelの`develop` branchでは、System Variableからdev WebAuthn Originを決定し、
  追加のProject Variableを不要にする。

### 実施結果

- Vercelの`app-games-dev`実行ログで、パスキー選択後の
  `POST /api/admin/passkeys`が`SITE_ADMIN_PASSKEY_NOT_FOUND`で400になったことを確認した。
- 問い合わせ・報告の返信POSTを`requireFullSiteAdminSession`へ変更し、クライアントの
  返信処理から`ensureSiteAdminStepUp`を外した。
- 返信の成功・失敗を操作中フォームの直上へ表示し、失敗時も入力を保持する。
- 同じ返信の再試行はrequest IDを維持し、保存後に応答だけ失われた場合の二重登録・
  二重通知を防ぐ。
- `SITE_ADMIN_WEBAUTHN_ORIGIN`追加依頼は、branch別の安全なコード既定へ変更したため
  取消済みとした。

### 検証

- パスキー・問い合わせ・報告関連の回帰テスト22件に成功した。
- `npm test`に成功し、全590テストが通過した。
- `npm run lint`に成功した。
- `npm run build`に成功し、全78ルートを生成した。
- 機能コミット`111f6f08226c18562fc6b3ac2aa68ba36a886094`を`develop`へ
  fast-forward反映した。
- Vercel Deployment `dpl_FizfRR15bvcwMFykMYSRvTmhYW1E`が`READY`となり、
  `dev.game-fields.com`へ反映された。errors-only build logにもエラーはなかった。

### 未対応・保留

- 管理者の実ブラウザから返信を送信し、追加パスキーなしでの保存と実メール受信を照合する。
- パスキーを維持した操作で、dev登録済みCredentialだけが候補になることを実機確認する。

## 2026-07-27 — 「コトバに迫れ」公開表示と正式Room起動障害

### 利用者からの要望

- `ai-word-guess`の公開名を「コトバに迫れ」へ変更する。
- 広場カードの汎用placeholderを作品専用画像へ置き換える。
- 正式画面でRoom作成直後に`GAME_SDK_COMMAND_REJECTED`となる障害を解消する。

### 判断

- 採用済みAppSetとmanifestは改変せず、公開後の表示名と画像を
  `publicGameId`別のPlatform presentationとして解決する。
- 2026-07-27 15:18 JST前後の本番Runtime Logでは、本体Room APIの真の失敗コードは
  `GAME_SDK_REMOTE_RUNNER_UNAVAILABLE`で、SDK Previewのportable server routeが403を
  返していた。ゲーム固有ロジックではなく、main package runtime grantの環境選択と
  Preview deployment世代のずれを起点とする実行基盤障害として扱う。
- `main` channelのgrantは発行元Portalのbranchに依存せずproduction environmentと
  `preview.game-fields.com`を使う。Previewのhealth routeも変更し、次のmain buildを
  対象プロジェクトへ確実に発生させる。
- Remote runner停止は競合ではなく一時利用不能なので、共通HTTP分類を503へ変更し、
  利用者には再試行可能な日本語メッセージを表示する。

### 実施結果

- `config/sdk-game-presentations.ts`へ「コトバに迫れ」、
  `Close in on the Word`、専用1200×500 WebP画像を追加し、広場・Room・結果・戦績・
  replayが同じ表示名を使うようcatalog解決を統一した。
- main／development／candidate-previewごとにruntime grantのenvironmentと固定originを
  選ぶようSDK Portalを修正した。
- SDK Previewのhealth応答へchannelとgrant versionを追加した。
- Remote runner停止の503分類、画面メッセージ、presentationとgrant境界の回帰テストを
  追加した。

### 検証

- `git diff --check`に成功した。
- `npm test`に成功し、全594テストが通過した。
- `npm run lint`に成功した。
- `npm run build`、`npm run build:sdk`、`npm run build:sdk-preview`に成功した。
- `npm run verify`に成功した。

### 未対応・保留

- develop公開後に本体・SDK Preview deploymentがREADYであることを確認する。
- main反映後、正式画面からRoomを作成し、Preview server routeの403が解消したことを
  Runtime Logと画面の両方で確認する。

## 2026-07-27 — メール経路の部分失敗・再試行を冪等化

### 利用者からの要望

- メール周りの横断監査で見つかった優先度の高い4件と、通信再試行による重複送信を
  まとめて修正する。

### 判断

- 会話・問い合わせ・報告はメール送信前に保存し、再試行では同じrequest IDから同じ
  record／message IDを決める。送信成功までクライアントもrequest IDを維持する。
- 運営返信メールだけが失敗した場合は、保存済み本文と同じResend冪等キーでメールだけを
  再送し、新しい会話メッセージを作らない。
- 確認メール再送は新しい配送成功を確認してから以前のリンクを無効化する。パスワード
  再設定メールの失敗時は、その試行が所有する未配送トークンとcooldownだけを解除する。

### 実施結果

- AI下書きから承認した新しい報告追記を、過去のスレッド通知済み状態に関係なく
  管理者へ通知するようにした。
- 問い合わせ・報告の失敗した運営返信メールへ「返信メールだけ再送」を追加し、
  保存済み本文・宛先・冪等キーを再利用して会話履歴を増やさないようにした。
- パスワード再設定メールの配送失敗後に直ちに再試行でき、並行する別試行の制限を
  誤って消さないようにした。
- 確認メール再送の配送失敗時も、以前届いた有効な確認リンクを維持するようにした。
- 公開問い合わせ、本体報告、公開問い合わせ追記、SDK Portal追記で同じ操作IDを
  成功まで維持し、server側の決定的IDとNX保存で通信切断後の重複内容・通知を防いだ。

### 検証

- メール部分失敗、リンク維持、メールだけの再送、request ID維持、AI承認追記通知の
  回帰テストを追加した。
- 最新`develop`統合後の`npm test`に成功し、全600テストが通過した。
- `npm run lint`に成功した。
- `npm run build`に成功し、全78ルートを生成した。

### 未対応・保留

- `develop`反映後、dev管理画面から失敗済み返信メールだけを再送し、会話件数が
  増えないことと実メール受信を照合する。
- 複数管理者宛て通知の部分成功管理、運用警告メールの再試行、通知先用途の分離は
  今回の優先修正範囲外として別途扱う。

## 2026-07-27 — メール信頼性修正のdevelop公開

### 実施結果

- メール経路の部分失敗修正、返信メールだけの再送、利用者送信の冪等化を
  GitHubの`develop`へ非forceで公開した。
- GitHub上の機能commitは`b5c17b1309b063523c5a887e2d4bd23110ef14fd`。
  内容tree `26104f94ff2269c643d0622d25d2dbbdd761d8a8`は、最新`develop`統合後に
  全600テスト・lint・production buildを通したローカルtreeと一致する。
- `app-games-dev`は対象commitを認識し、`dev.game-fields.com`へaliasされた。

### 検証

- Deployment `dpl_7emRoASVUMsqnCkzWHRaBr83rpUr`は`READY`。
- errors-only build logに失敗はなく、直近1時間のRuntime Errorは0件。

### 関連コミット

- `b5c17b1` — メール送信の部分失敗と通信再試行を冪等化。

### 未対応・保留

- dev管理画面から失敗済み返信メールだけを再送し、会話件数が増えないことと
  実メール受信を照合する。

## 2026-07-27 — スカル正式PreviewのRoom Runtime接続障害

### 利用者からの報告

- 2026-07-27 07:03 JSTごろ、`moi-dev`のスカル正式Previewで「部屋を作る」を押すと、
  ゲーム実行サーバーへ接続できない旨が表示され、Roomを作成できなかった。
- 正式PreviewからRoom Runtimeへの接続、Room作成APIの失敗原因、再試行復旧、
  スカル固有ではない共通Platform障害の有無を確認する。

### 調査結果

- 07:03:22 JSTの本体Runtime Logで
  `POST /api/sdk-preview/moi-lab/games/skull/rooms`が503、
  `GAME_SDK_REMOTE_RUNNER_UNAVAILABLE`を返した。
- 直前のSDK Portal
  `GET /api/preview-runtime/moi-lab/skull`は200で新しいserver grantを発行したが、
  直後のSDK Preview
  `POST /server/moi-lab/skull/12d4a36b8178d5c349c82512b61769c21145cf26`は403だった。
- 一つ前のPreview Deploymentでは同じrouteが24時間で696件すべて200だった。
  新しいDeploymentではRoom作成由来の4件がすべて403であり、AppSetやスカル固有処理へ
  到達する前の共通server grant検証で失敗した配備回帰と判断した。
- 既存ログはgrant拒否を一律403としており、signature、environment、instance、game、
  revisionのどの不一致かは判別できなかった。

### 実施結果

- SDK Previewのgrant拒否を、token・秘密値・利用者情報を含めず、安全な理由別の
  `sdk.preview-runner-auth`イベントへ記録する。
- SDK Portalの`/api/health`から対応Previewへ固定scopeの短命署名probeを送り、
  DBだけでなくPortal／Preview間の署名・環境一致も検査する。
- remote runnerはネットワーク例外と408／502／503／504だけを1回再試行する。
  401／403は再試行せず`GAME_SDK_REMOTE_RUNNER_AUTH_FAILED`へ分け、画面でも
  一時障害と設定不整合を区別する。

### 検証

- 関連回帰テスト12件に成功した。
- `npm test`に成功し、全605テストが通過した。
- `npm run lint`に成功した。
- `npm run build`、`npm run build:sdk`、`npm run build:sdk-preview`に成功した。

### 未対応・保留

- `develop`へ機能commit`023ab274c4a843211e9b4240ad2d8a097e386b23`、
  記録commit`bd6395ba8a75c88cedcc4b5e4cb27ef8f25037d0`を非forceで反映した。
- 本体`dpl_5MFt2pUWfvVKhtT111w4x3JFmefX`、Portal
  `dpl_5pzHbjPFsM28rj25mrpHkDmeJJ3V`、Preview
  `dpl_8BEYaib4zjnH1cdxjm9rVVbvrT16`はすべて`READY`で、errors-only build logに
  失敗はなかった。
- 配備後の`sdk-dev.game-fields.com/api/health`は503
  `SDK_PREVIEW_SIGNING_MISMATCH`を返し、Previewの`event=sdk.preview-runner-auth`は
  `TOKEN_INVALID`だった。Portal／Previewのdevelopment署名鍵不一致と確定した。
- `app-games-sdk-dev`と`app-games-preview-dev`へ同じdevelopment用
  `SDK_PREVIEW_SIGNING_SECRET` Team Shared Variableを再Linkし、両方を再デプロイした。
- Portal `dpl_DosUjeBU2vLkd7TJfCTJQKkipNoN`とPreview
  `dpl_8K9NCz2pb6ReEypH1zoddBm29jWQ`は`READY`で、errors-only build logに失敗はない。
- `https://sdk-dev.game-fields.com/api/health`が200を返し、
  `status: ok`と`previewSigning: ok`を確認した。
- 正式PreviewからのRoom作成成功は、次回の実機操作時にRuntime Logで照合する。

## 2026-07-27 — 管理受信箱の初回本文重複表示を解消

### 利用者からの要望

- 管理画面の問い合わせ・報告詳細で、同じ内容が二回表示される状態を改善する。

### 判断

- 初回投稿は上部の「内容」を正本表示とし、会話欄には追加の返信・追記だけを表示する。
- 保存済み会話データやメール本文は変更せず、過去の問い合わせ・報告にも表示変更だけを
  適用する。

### 実施結果

- `AdminSupportInboxPanel`から初回投稿の二重描画を削除した。
- 追加メッセージがない場合は会話欄を表示せず、存在する場合だけ「返信・追記」として
  表示するようにした。
- SDK Portalと問い合わせ者向け画面は初回投稿を一度だけ表示しているため変更しなかった。

### 検証

- 初回本文の描画が一箇所だけであることと、追加メッセージの条件表示を回帰テストへ追加した。
- 最新`develop`統合後に全605テスト、lint、production build（78ルート）へ成功した。
- GitHub `develop`へcommit`ba25b1107048341740183ec355f7f99392aa2467`を非forceで反映した。
- 本体dev Deployment `dpl_G2fb5K245GdqM2C81xMWEhHSaVvT`は`READY`で、
  errors-only build logに失敗はなかった。

### 未対応・保留

- 既存の問い合わせ・報告を管理画面で開き、初回本文が一度だけ表示されることを実機確認する。

## 2026-07-27 — main昇格用のdev package artifact読取境界

### 利用者からの要望

- `dev app → main app`でRuntime Bundle実体が本番package Gitへ移らず、
  `SERVER_RUNTIME_BUNDLE_NOT_FOUND`となる致命的な問題をmainまで修正する。

### 判断・実施結果

- main側がdevの固定packageをhash検証付きで複製できるよう、dev Portalへ
  service認証必須のartifact読取APIを追加した。
- 読取対象は制作者slug、game ID、40文字commit SHA、package bundle配下の安全な
  相対pathに限定する。ファイル数、単体・合計サイズ、必須packageファイルも検査する。
- package一覧と各ファイルは確定commitからだけ読み、DB、別game、Git書込操作を公開しない。

### 検証

- 追加routeの認証・develop限定・固定revision境界を静的テストへ追加した。
- `npm run lint`、SDK Portal production build、関連6テストに成功した。

### 未対応・保留

- `develop`へ非force反映し、`app-games-sdk-dev` DeploymentをREADYまで確認する。
- main Portalのartifact source healthから、環境間service認証の実往復を確認する。

## 2026-07-27 — dev管理者パスキーのUSBキー誤誘導を再調査

### 利用者からの要望

- 修正後もdev管理画面のパスキー認証がWindows Helloではなく、外付け
  セキュリティキーをUSBポートへ挿す画面を表示する問題を解消する。

### 調査結果と判断

- `app-games-dev`は`develop`の`b4f0cf94a5d17c11fc1097c4c01d4b602edb5107`が
  `READY`であり、利用者の直近ログイン試行も同Deploymentへ到達していた。
- 管理パスワード認証は成功し、パスキー検証POSTより前のブラウザ認証画面で
  停止していたため、未デプロイ、サーバー例外、古いaliasは原因ではない。
- Credential IDだけを指定してtransportを省略しても、対象Windows環境では
  外付けsecurity keyが選ばれた。従来の「transportを省けばWindows Helloへ進む」
  という判断を訂正する。
- 管理者パスキーは端末内platform authenticatorを正式要件としているため、
  登録済みCredential IDを維持したまま認証transportを`internal`へ限定する。

### 実施結果

- 認証optionsの各`allowCredentials`へ`transports: ["internal"]`を明示した。
- devの新規登録もdiscoverable credential必須へ統一した。
- 現行認証仕様と回帰テストを更新した。

### 検証

- 管理者パスキー回帰テスト2件に成功した。
- `npm run lint`に成功した。
- `npm test`に成功し、全607テストが通過した。
- `npm run build`に成功した。

### 未対応・保留

- GitHub `develop`へ`eb4c4db6e24795dfd371201e3663275a49c1715a`を非forceで反映した。
- `app-games-dev` Deployment `dpl_6zhmNABLmbbGQo8AVnrPwUBt2ZMK`は`READY`で、
  `dev.game-fields.com`のaliasが同Deploymentへ切り替わった。
- 対象Deploymentのerror／fatal Runtime Logは0件だった。
- devのWindows実機で、USBキー画面ではなくWindows Helloへ進むことを確認する。
- dev実機成功後に同じ認証transport修正をmainへ反映する。

## 2026-07-27 — 管理者パスキー登録・復旧・break-glass権限の再設計

### 利用者からの要望

- 復旧コードで今回は管理画面へ戻れたが、認証で同様の問題が起きると運用への影響が
  大きいため、登録、通常認証、復旧、重要操作の承認境界を通しで見直す。

### 調査結果と判断

- 登録optionsは`preferredAuthenticatorType: "localDevice"`という推奨だけで、
  `authenticatorAttachment: "platform"`を強制していなかった。USBキーとして登録した
  資格情報を認証側だけ`internal`へ限定したことが、登録と認証の不整合だった。
- 復旧コードの利用後は通常管理画面へ戻るだけで、新しい端末内パスキーの登録へ
  誘導していなかった。
- break-glass画面は「設定変更不可」と表示していたが、管理者アカウントの保存・削除APIが
  `recovery` scopeで直近MFAを省略し、管理者追加、パスワード更新、削除を許していた。
  画面から隠れた通常管理APIにも`recovery` scopeで読める経路が残っていた。
- 一時変数`SITE_ADMIN_BREAK_GLASS_ENABLED`の削除依頼は、実際の削除・再デプロイが
  未完了なのに機械台帳だけ未定義の`completed`となり、環境台帳検査を失敗させていた。

### 実施結果

- 新規登録はplatform attachment、discoverable credential、user verification、
  `internal` transportを必須にし、USB、別端末、種別不明の登録をサーバーでも拒否する。
- 復旧コードでログインした場合は管理者アカウント画面へ直接誘導し、Windows Helloの
  登録確認が成功した時点で通常のパスキーセッションへ切り替える。
- 管理者一覧へ端末内、外部、種別不明のパスキー件数を表示する。端末内パスキーが
  1件以上残る場合だけ、既知の外部キー登録を削除できる。
- break-glassの管理者保存・削除を直近MFA必須へ変更し、復旧画面からも操作を除いた。
  通常管理データの読取APIはfull scopeを必須にし、`recovery` scopeは管理者一覧、
  ダッシュボード、監査ログの読取とMFAリセットだけに限定した。
- break-glass削除依頼を実態どおり`requested`へ戻した。変数自体の削除はまだ行っていない。

### 検証

- 管理者パスキーと復旧scopeの新規回帰テスト7件に成功した。
- `npm test`に成功し、全612テストが通過した。
- `npm run verify`に成功し、環境台帳、9ゲーム共通要件、SDK境界、migration、
  Shell契約、lintを確認した。
- `npm run build`に成功し、production buildの全78ルートが生成された。

### 未対応・保留

- GitHub `develop`へ`883c98d5d869d3d3429c60baa7841ee60ed78de6`を非forceで反映した。
- `app-games-dev` Deployment `dpl_5ipZt2G9roaCwsovHqZ5Kc3PUFJ7`は`READY`で、
  `dev.game-fields.com`のaliasが同Deploymentへ切り替わった。
- errors-only build logに失敗はなく、公開後のerror／fatal Runtime Logは0件だった。
- dev実機で復旧コードログインからWindows Helloを追加し、次の通常ログインが
  Windows Helloへ進むことを確認する。
- 実機確認後、`SITE_ADMIN_BREAK_GLASS_ENABLED`を`app-games-dev` Productionから削除し、
  再デプロイしてマスターパスワードが通常時に拒否されることを確認する。
- dev実機成功後に同じ修正をmainへ反映する。

## 2026-07-27 — mainとdevの管理者パスキーRP IDを分離

### 利用者からの報告

- `dev.game-fields.com`でパスキーを追加したのに、ブラウザが
  `game-fields.com`へログインするパスキーとして作成しようとしていた。
- devとmainを行き来したことが、USBキーへの誘導、端末内パスキーが見つからない、
  再登録等の一連の不整合を起こした可能性を確認する。

### 調査結果と判断

- 最新developはOriginをmainとdevで分けていたが、RP IDは両方とも
  `game-fields.com`だった。管理者DBが環境別でも、端末側では同じパスキー名前空間と
  同じメール由来user handleを使用していた。
- 環境DBのCredential IDだけを`allowCredentials`へ返す対処は、別環境のcredentialを
  サーバーが受理することは防ぐが、端末側でmain／dev資格情報が置換または混在することを
  防げない。前回の親RP ID共有設計を不十分として訂正する。
- mainはRP ID `game-fields.com`、devはRP ID `dev.game-fields.com`へ分離する。
  直前に追加したplatform authenticator、discoverable credential、`internal` transport、
  復旧scope制限はそのまま維持する。

### 実施結果

- `GAME_FIELDS_ENV`、Vercel Project名、Git branchからdevを判定し、
  devの既定RP IDを`dev.game-fields.com`へ変更した。
- 環境シグナルが矛盾する場合、devへ親RP ID `game-fields.com`を手動指定した場合、
  OriginがRP IDの同一hostまたはsubdomainでない場合はfail closedで拒否する。
- 現行仕様、環境台帳、既知課題へRP ID分離と一度限りのdev再登録条件を反映した。

### 検証

- 最新`develop@b626172`へ統合後、`npm test`に成功し、全613テストが通過した。
- `npm run verify`に成功し、環境台帳、9ゲーム共通要件、SDK境界、migration、
  Shell契約、lintを確認した。
- `npm run build`に成功し、production buildの全78ルートが生成された。

### 未対応・保留

- GitHub `develop`へ`6356d4b885d703b60ae1ba3606165780b29c3524`を非forceで反映した。
- `app-games-dev` Deployment `dpl_BhKG9wbSbvBPAx3MYbLPu98ucKx3`は`READY`で、
  `dev.game-fields.com`のaliasが同Deploymentへ切り替わった。
- errors-only build logに失敗はなく、公開後のerror／fatal Runtime Logは0件だった。
- 新しいRP IDでは旧dev資格情報を利用できないため、devで既存MFAを一度リセットし、
  表示が`dev.game-fields.com`であることを確認してパスキーを再登録する。
- devをログアウトして通常ログインを確認した後、mainにも通常ログインできるか別に確認する。
  mainが旧credential不一致ならmain側だけ復旧し、`game-fields.com`用を再登録する。
- 両環境の通常ログイン成功後に一時break-glass変数を削除・再デプロイする。

## 2026-07-27 — 通常管理者のパスキー初期化を復元

### 利用者からの要望

- mainにある「パスキー初期化」をdevにも復活させる。

### 調査結果と判断

- break-glass復旧scopeを制限した認証強化で、管理者一覧の初期化ボタンと
  `reset-mfa` APIを復旧モード専用に変更し、通常のfull管理者が自分自身を
  初期化する既存経路まで塞いでいた。
- 通常のfull管理者は直近MFAを再確認した場合だけ自分自身を初期化できるように戻す。
  他の管理者を通常セッションから初期化する操作は拒否し、break-glassの
  「MFAを再設定」と通常管理APIの制限は維持する。

### 実施結果

- 通常ログイン中の本人行へ「パスキー初期化」を再表示した。
- 通常経路はクライアントでパスキー再確認を行い、APIでもfull scope、本人メール一致、
  直近MFAを検査してからパスキーと復旧コードを無効化する。
- 復旧モードでは従来どおり「MFAを再設定」を表示し、対象管理者の修復だけを許可する。

### 検証

- `npm test`に成功し、全614テストが通過した。
- `npm run verify`に成功し、環境台帳、9ゲーム共通要件、SDK境界、migration、
  Shell契約、lintを確認した。
- `npm run lint`に成功した。
- `npm run build`に成功し、production buildの全78ルートが生成された。

### 未対応・保留

- GitHub `develop`へ`4d0925ddee60ceac057fd77ee4f2e8e492200b98`を非forceで反映した。
- `app-games-dev` Deployment `dpl_DXXsECbraDEjTtyAvhrZUCZoJmRh`は`READY`で、
  `dev.game-fields.com`のaliasが同Deploymentへ切り替わった。
- errors-only build logに失敗はなく、公開後のerror／fatal Runtime Logは0件だった。
- dev管理画面の通常ログインで本人行に「パスキー初期化」が表示されることを実機確認する。

## 2026-07-27 — 承認・昇格の判断履歴を統一

### 利用者からの要望

- 承認周りの修正をタスク化し、依存順に実装する。
- SDK作品の環境別採用、dev appのmain昇格、本体developのmain反映、
  理由・対象版・実行者・日時の履歴、アプリ単位復元、人間承認、認証復旧を整理する。

### 判断

- 3本の昇格経路、main管理画面、アプリ単位ロールバック、AI下書きの人間承認、
  break-glassからのMFA復旧は既に実装済みだったため、作り直さず不足だけを補う。
- SDK／dev appの運営判断はSDK環境別DBの`sdk_release_decisions`を正本とする。
  本体`develop → main`はSDK DBへ依存させず、既存の管理者監査ログを正本とする。
- break-glassから本番承認を直接許可せず、MFA修復後のfull sessionと直近MFAを
  承認の前提にする。認証と承認の権限境界を混ぜない。

### 実施結果

- migration 005を追加し、`sdk-candidate`／`dev-app`の
  `approve`／`reject`／`rollback`、理由、実行者、対象revisionとhash、日時、
  対応release IDを追加専用で保存するようにした。
- SDK candidate採用を、stable pointer、channel履歴、現在release解除、
  新release、承認履歴まで一つのdata-modifying CTEへ統合した。
- SDK candidateとdev appへ理由必須の承認・却下UIを追加し、
  アプリ復元と`develop → main`にも理由を必須化した。
- 履歴画面へ判断理由、実行者、日時を表示した。
- AI報告の人間承認と、break-glassをMFA修復へ限定する既存境界は維持した。

### 検証

- `npm run check:sdk-migrations`で5件の連番migrationとRuntime version 5を確認した。
- `npm run lint`と`npm run verify`に成功し、環境台帳、9ゲーム共通要件、
  SDK境界、SDK Help、migration、Shell契約を確認した。
- `npm test`に成功し、昇格UI、AI下書きの人間承認、
  通常／break-glass管理者認可を含む全616テストが通過した。
- `npm run build`に成功し、production buildの全78ルートが生成された。
- `npm run build:sdk`に成功し、SDK Portalの型検査とproduction buildを確認した。
- `git diff --check`に成功した。

### 未対応・保留

- `app-games-sdk-dev`のbuild migration後、`/api/health`が`schemaVersion: 5`であること、
  dev管理画面で承認・却下・履歴・復元が動くことを実機確認する。
- main反映時は`app-games-sdk`でもmigration 005と同じ実機確認を行う。

## 2026-07-27 — main／develop統合と昇格経路の整合

### 利用者からの要望

- 承認周りの残タスクを立て、進行を壊さない順番で続行する。

### 調査結果と判断

- GitHubの`develop`は`main`に対して53コミット先行・30コミット遅延しており、
  双方に必要な修正が存在していた。単純な上書きではどちらかの変更を失うため、
  両履歴を保持するmergeとして統合する。
- `develop`の承認判断履歴と`main`の環境間package artifact移送が、どちらも
  migration 005を使用していた。承認判断履歴を005のまま維持し、
  artifact移送を006へ繰り下げ、Runtime required versionを6へ更新する。
- 管理者認証と共通Game SDK frameは`develop`の新しい実装を優先し、
  package artifact移送とEd25519 Preview認証は`main`の新しい実装を優先する。

### 実施結果

- dev appの承認時にdevelopment SDK DBからmain SDK DBへ不変package artifactを
  移送し、移送後のrevision／hashを検証してからreleaseと判断履歴を
  同一トランザクションで更新するよう統合した。
- rollbackも対象artifactを確認・必要時に再移送してから、releaseと判断履歴を
  同一トランザクションで追加する。
- release履歴へsource revisionとartifact移送状態を追加し、同じdev版でも
  本番artifactが欠ける場合は再承認による修復を案内する。
- Preview runtime URLの認証情報をqueryではなくfragmentで受け渡し、
  SDK Preview側でEd25519署名を検証するmain側の修正をdevelopへ統合した。
- migrationを`005_release_decisions.sql`、
  `006_cross_environment_package_artifacts.sql`の連番へ整理した。

### 検証

- `npm test`に成功し、承認履歴、artifact移送、Preview署名検証を含む
  全628テストが通過した。
- `npm run lint`、`npm run verify`に成功し、環境台帳、9ゲーム共通要件、
  SDK境界、SDK Help、6件の連番migration、Shell契約を確認した。
- `npm run build`、`npm run build:sdk`、`npm run build:sdk-preview`に成功した。
- `git diff --check`に成功した。

### 未対応・保留

- クラウドブラウザがtab一覧取得でtimeoutしたため、dev管理画面での
  承認・却下・履歴・復元の実操作確認は未完了。
- `develop`へ統合commitを反映し、app／SDK Portalの`READY`、
  SDK healthの`schemaVersion: 6`、公開後runtime errorを確認する。
- 上記実操作確認後に`main`をfast-forwardし、本番SDK DBのmigration 006と
  本番4 projectの配備状態を確認する。

## 2026-07-27 — SDK正式PackageのDEBUGとダミー操作をplaying中も維持

### 利用者からの報告

- スカル正式PreviewでDEBUGダミーを2人追加してゲームを開始すると、共通ヘッダーから
  DEBUGボタンが消え、ダミー手番でゲーム固有操作もできず進行不能になる。
- `supportsDebug=true`かつDEBUG利用資格を持つHOSTはplaying／resultでもDEBUGを使え、
  各ダミーの視点切替、ダミーとしての合法手、または安全な自動進行を実行できるようにする。
- ゲーム固有UIではなくPlatform共通Shellで修正する。

### 調査結果と判断

- 正式Package ShellはDEBUG表示をPackageが返す`permissions.canDebug`へ依存していた。
  固定済みの旧revisionやplaying Viewが古い値を返すと、署名済みhostセッションに
  DEBUG権限があっても共通DEBUG全体が隠れる。
- 既存の「閲覧視点」は`readRoomAsDebugViewer`による読取Viewだけを切り替え、
  iframeのゲームCommandは常にhost identityで送っていた。ダミー視点を選んでも
  ダミーの合法手にはならない。
- DEBUG権限とダミー属性は、署名済みセッション、保存Room、manifest、module profileから
  Platform adapterが最終確定する。閲覧視点と操作対象は別の状態として扱う。
- 代理操作はplaying中のダミーとゲーム固有Commandだけを許可し、`room/*`共通Command、
  hostや通常参加者の指定、権限なし操作、playing以外はサーバー側で拒否する。

### 実施結果

- Platform Room Viewへ`canDebug`、`canDebugActAsDummy`、
  `canDebugAutoProgress`を確定値として投影し、保存Roomから`isDummy`と接続状態を復元した。
- 共通DEBUG固定領域へ「閲覧視点」と別に「操作対象」を追加した。ダミーを選ぶと
  初期表示を同じダミー視点へ切り替え、その後は閲覧視点を独立して変更できる。
- iframeのゲーム固有Commandは、操作対象ダミーを選択中だけ
  `room/debug-act-as-dummy`で包み、Platformが検証後に通常Domainへ対象identityで渡す。
  Command結果も選択中の閲覧Viewでiframeへ返す。
- lobbyを出てもDEBUG表示を維持し、resultでは操作対象だけをHOSTへ戻す。
  自動進行、時間切れ、切断、入力拒否の既存DEBUG操作は維持する。

### 検証

- 旧Packageがplaying中に`canDebug=false`と誤ったダミー属性を返すfixtureでも、
  Platformが正しい表示権限とダミーを復元するHTTP縦断テストを追加した。
- ダミー代理の合法手が対象seatとして適用され、host指定、`room/*`代理、
  DEBUG権限なし操作が拒否されることを確認した。
- 最新`develop@57df5bf`へ統合後、`npm test`に成功し、全616テストが通過した。
- `npm run verify`に成功し、環境台帳、9ゲーム共通要件、SDK境界、migration、
  Shell契約、lintを確認した。
- `npm run build`に成功し、production buildの全78ルートが生成された。

### 未対応・保留

- devのスカル正式Previewで、ダミー2人追加、開始、ダミー視点／操作対象切替、
  ダミーの合法手、自動進行、resultまでのDEBUG維持を実機確認する。

### 公開結果

- 検証済みtree `9ccf88a`をGitHub commit `fa96c65`として`develop`へ
  non-force fast-forwardした。`main`は変更していない。
- `app-games-dev` Deployment `dpl_9JEdwKU5xvXCqmqaLDiBXdGR8FTH`は`READY`となり、
  `dev.game-fields.com`のaliasが同Deploymentへ切り替わった。
- 同じcommitで作成された`app-games-sdk-dev`
  `dpl_9Pn2LbSYK2Hc8WZ2WQKGTXxmfcvz`と`app-games-preview-dev`
  `dpl_HKxDgrvYwEtoSYSgM8VX9jBMhKhA`も`READY`となった。
- 3 Deploymentともerrors-only build logに失敗はなく、公開後の
  error／fatal Runtime Logは0件だった。

## 2026-07-27 — opaque-origin正式Packageのclient grant交換を修正

### 利用者からの報告

- スカル正式PreviewのページとRoom操作は開くが、ゲーム固有領域に
  「ゲームを開けませんでした」と表示され、ゲームUIが描画されない。

### 調査結果と判断

- 本体devのRoom GET／PATCH、Preview runner、Package取得はすべて200だった。
- `package-open`はGET 200の後に交換POSTがなく、失敗文は
  `apps/sdk-preview/lib/preview-exchange.ts`だけが生成していた。
- 正式Package iframeは`allow-same-origin`なしのopaque originであり、
  fragment grantを送る`fetch()`がブラウザ境界で送信前に拒否されていた。
- `allow-same-origin`追加はPackage隔離を弱めるため採用しない。交換ページだけ
  form navigationを許可し、Package本体ではCSPによりformを再び禁止する。

### 実施結果

- fragmentを履歴から消去した後、単一・4KB以下のURL encoded form本文として
  grantをPOSTするよう変更した。
- PreviewはEd25519 grant検証後に8時間・HttpOnly・Path限定Cookieを設定し、
  JSON応答ではなく303でPackage indexへ遷移する。
- 交換ページCSPは自originへの`form-action`だけを許可し、`connect-src`を禁止した。
- 正式Package iframeへ`allow-forms`を追加したが、`allow-same-origin`は追加していない。
  Package本体のCSP `form-action 'none'`も維持した。

### 検証

- fragment、form POST、query token拒否、単一token、本文上限、303、
  HttpOnly Cookie、sandboxを固定する回帰テストを追加した。
- `npm test`に成功し、全629テストが通過した。
- `npm run verify`、`git diff --check`に成功した。
- `npm run build:sdk-preview`と`npm run build`のTurbopack production buildに成功し、
  SDK Preview全Routeと本体78ルートを生成した。

### 未対応・保留

- `develop`へ反映後、スカル正式Previewで`package-open`のPOST 303、
  Package index 200、ゲーム固有UI表示を実機確認する。

### 公開結果

- 検証済みtree `ba0c225`をGitHub commit `f0b0a8f`として`develop`へ
  non-force fast-forwardした。`main`は変更していない。
- `app-games-dev` Deployment `dpl_ED54tb19UhzxfhUoewdrCWMME8su`は`READY`となり、
  `dev.game-fields.com`のaliasが同Deploymentへ切り替わった。
- 同じcommitで作成された`app-games-sdk-dev`
  `dpl_CGTbQCzUPdRHJWGuHDtRkQJTHk9a`と`app-games-preview-dev`
  `dpl_39VDPJH6sKLi4SE43KM3CJ1tmbgq`も`READY`となった。
- 3 Deploymentともerrors-only build logに失敗はなく、公開後の
  error／fatal Runtime Logは0件だった。

## 2026-07-27 — 正式Package入口をCookieなしの直接HTML応答へ変更

### 利用者からの要望

- CHIPS差分を再利用可能な検証branchへ退避し、merge、deploy、main反映しない。
- `package-open`のform POST応答でHTML骨格を直接返し、JS／CSSを一括inline化しない。
- 既存HMAC asset tokenを優先して再利用し、固定revision・asset path・期限へ
  認可を限定する。
- `allow-same-origin`なし、限定CSP、QuickJS WASM、実行直前bundle hash照合、
  Cookie非依存、`unsafe-inline`非追加を維持する。
- 実devでGET 200、POST 200、JS／CSS 200、iframe描画、Console、再読込、
  改ざん・別revision・期限切れ403、CDN／browser cacheを確認する。

### CHIPS退避

- CHIPS検証tree `dd1d8b2`をremote branch
  `experiment/chips-cookie-partitioning`のcommit `63854a2`へ保管した。
- 同branchは`develop`／`main`へmergeせず、Vercel deploymentにも使用しない。
- Cookieなし実装は別branch／clean worktreeで`develop@b627fd7`から開始した。

### 設計判断

- 現行asset tokenは制作者、ゲーム、revision、期限までをHMAC署名していたが、
  asset pathをclaimへ含めず、同revision内の別assetへ転用できた。
- 新しいsession方式は作らず、既存HMACをsource kind、制作者、ゲーム、
  revision、正規化済みasset path、期限へ拡張する。
- tokenはqueryではなくURL pathへ含める。HTML、CSS、静的module参照を各path専用URLへ
  書き換え、`server.bundle.js`、manifest、`source/`、別path、別revisionを拒否する。
- HTML骨格だけをPOST 200で返す。Platform room bridgeも外部の仮想JS assetとし、
  package HTMLへinline script/styleや`unsafe-inline`を追加しない。
- asset tokenは1時間bucket内で決定的、1〜2時間有効とする。子assetは親tokenと
  同じexpiryを継承し、同じ署名URLの応答本文を不変にする。
- browser、downstream CDN、Vercel CDNのcache期間をtoken残存期限以下に揃え、
  `stale-while-revalidate`を使わない。署名をcache keyのpathへ含め、queryを拒否する。

### 実施結果

- `package-open`／legacy `open`はgrant検証後にCookie／303を使わず、
  固定revisionの`index.html`へ署名asset URLと外部Platform bridgeを組み込んで
  直接返すよう変更した。
- asset routeはpath単位tokenを検証し、CSSの`url()`／`@import`と
  JavaScriptの静的／dynamic importを子asset用tokenへ書き換える。
- 交換ページの固定inline scriptはSHA-256 hash CSPへ変更し、
  package文書CSPは`unsafe-inline`なし、自Preview originへの`form-action`、
  許可済み`frame-ancestors`、`connect-src 'none'`とした。
- iframeの`sandbox`は`allow-same-origin`なしを維持した。
- AppSet runnerは従来どおり、1呼出しごとの新規QuickJS WASM module／context、
  bundle 1 MiB、memory 32 MiB、stack 1 MiB、750 ms上限を使う。
  server routeは実行直前に取得bundleのSHA-256をgrant登録hashと再照合する。

### ローカル検証

- client grant、CookieなしPOST、sandbox、CSP hash、path／revision／source kind／期限、
  決定的cache key、HTML／CSS／module書換えの対象30テストが成功した。
- `npm run build:sdk-preview`に成功し、全Preview RouteのTypeScript検査と
  Turbopack production buildが完了した。

### 未対応・完了ゲート

- 全テスト、`verify`、SDK Portal／Preview／本体production buildを通す。
- `develop`の3 dev Projectを同じcommitで`READY`にする。
- 実スカルで`package-open GET 200 → form POST 200 → JS/CSS 200 → iframe描画`、
  Consoleエラーなし、再読込、改ざん・別revision・期限切れ403、
  browser／Vercel CDN cache keyを確認する。
- 上記完了までは修正完了、main反映として扱わない。

## 2026-07-27 — 共有asset tokenの非互換切替を近接事故として記録

### 利用者からの要望

- `KNOWN_ISSUES.md`の「旧v1 asset tokenは60秒で失効」という誤記を訂正する。
- 段階配備なしに共有検証器をv2-onlyへ切り替えかけたこと自体を、
  次のスレッド・セッションへ残す近接事故として記録する。
- `preview-dev.game-fields.com`で旧v1 token利用者への実害が出たか確認する。

### 調査結果と判断

- 60秒なのはPortalのclient entry grantであり、旧v1 asset tokenではない。
- 直接HTML化直前の旧v1 asset tokenは、8時間のPreview client session Cookieの
  `expiresAt`を継承する正式Package／mock共有HMAC tokenだった。
- `647d598`は共有発行器と共有検証器を同時にv2-onlyへ置換し、
  `検証器のv1＋v2対応 → v2発行 → 最大TTL待機 → v1削除`を経ていなかった。
- devは2026-07-27 14:22:15 JSTからv2-onlyであり、切替直前の旧v1は
  最長で同日22:22:15 JSTまで有効になり得る。mainと本番Previewは旧v1のままである。
- この状態は既存iframeの未取得・再取得assetを403にし得るため、
  devであっても互換検証器の復元まで放置してよい状態ではない。

### 影響確認

- 2026-07-27 14:45 JSTに、`app-games-preview-dev`の機能Deployment
  `647d598`と後続文書Deployment `fd256cc`をVercelで確認した。
- 両Deploymentにasset系403は記録されておらず、観測された呼出しはスカルの
  server routeに対する200だけだった。実際の利用者失敗は現時点で観測されていない。
- asset token拒否専用の構造化イベントはないため、「実害なし」ではなく
  「観測上の実害なし」とする。互換切断リスクと復旧優先度は変わらない。

### 文書更新

- `docs/KNOWN_ISSUES.md`へ近接事故を独立項目として追加した。
- 旧v1最大寿命を約8時間へ訂正し、devの危険時間帯、main反映禁止、
  dev／mainそれぞれの段階配備と退役条件を明記した。

### 未対応・保留

- developへ旧v1＋新v2の両対応verifierと回帰fixtureを復元する。
- v2-only発行と実Networkを確認し、最後のv1発行可能時刻から最低8時間後に
  旧v1 verifier／fixtureを削除する。
- mainではverifier両対応、v2発行、8時間待機、v1削除を別配備で行う。
- 実スカルのiframe描画とasset／cache／拒否境界の確認完了までmainへ反映しない。

## 2026-07-27 — developのv1＋v2 asset verifierを復元

### 利用者からの要望

- 近接事故のステップ1として、developの共有asset verifierへ旧v1と新v2の
  両対応を復元し、devの互換切断状態を解消する。
- 復元後は、v2-only発行、8時間待機、実Network確認、v1分岐削除、
  mainでの同手順反復を順番どおり次工程へ残す。

### 判断

- 現行`createPreviewAssetToken`は変更せず、引き続きpath-scoped v2だけを発行する。
- `verifyPreviewAssetToken`だけへ旧v1 JSON／HMAC形式を一時復元する。
- 旧v1はpath／source kind claimを持たないため、元のrevision単位の認可境界を
  そのまま再現する。v1で取得したCSS／moduleの子asset URLは同じv1 tokenを
  引き継ぎ、8時間expiryをv2の2時間上限へ誤適用して502にしない。
- v1互換コードとfixtureは恒久仕様にせず、devとmainで別々に最大TTL排出と
  実Network確認を終えた後だけ削除する。

### 実施結果

- verifierは`v2.<expiry>.<signature>`を先に厳密検証し、それ以外は長さ制限、
  HMAC、audience、version、instance、game、revision、expiryを満たす旧v1だけを
  受理する。
- v2要求の子assetは従来どおりpath別v2 token、v1要求の子assetは同じv1 tokenを
  使用する。
- 現行発行器が`v2.`だけを生成すること、旧v1正常token、改ざん、期限切れ、
  game／revision不一致、v2のpath／source不一致を回帰fixtureへ追加した。

### 検証

- 対象19テスト成功。
- 全630テスト成功。
- `npm run verify`成功。
- SDK Preview production build成功。
- 本体78 routeのproduction build成功。

### 未対応・保留

- remote `develop`が`f62963d`から動いていないことを更新直前にも確認し、
  GitHub commit `9c93b8f`へforceなしでfast-forwardした。
- Preview Runtime devは2026-07-27 15:06:09 JST、本体SDK devは15:05:23 JST、
  本体devは15:07:15 JSTに同commitで`READY`となった。3件ともbuild errorは0で、
  対象DeploymentのRuntime Logにもerror／fatalは観測されていない。
- ただしクラウドブラウザは画面遷移後のtab取得時にCDP recoveryを繰り返し、
  v1由来要求とv2発行の実Network確認を実施できなかった。HTTP疎通、build、
  Runtime Logを代用せず、ステップ1は未完了のままとする。
- `preview-dev`のalias切替後にv1正常tokenが200、v2正常tokenが200、
  否定系が403となることを実配備で確認する。特にv1由来のCSS／module子assetが
  502にならず継続動作することと、v2-only発行が従来どおり動くことの両方を
  実Networkで確認するまでは、3 Projectが`READY`でもステップ1完了としない。
- v2-only発行を実Networkで確認する。最後の旧v1発行可能時刻
  2026-07-27 14:22:15 JSTから最低8時間後の同日22:22:15 JSTまでは
  v1 verifier／fixtureを削除しない。
- devのv1退役後、mainではverifier両対応、v2-only発行、8時間待機、
  v1削除を別配備として反復する。

## 2026-07-27 — 制作者広場のSDKダッシュボード導線復旧

### 利用者からの要望

- SDK制作者環境を本体の共通GameLobbyへ統合して以降、右下の共通モジュール表示とは
  両立せず消えていたSDKダッシュボードへの導線を、アカウントメニューへ常設する。
- 制作者アカウントや画面幅に依存せず、制作者広場からPortalへ戻れるようにする。

### 判断

- 共通モジュール表示との配置競合ではなく、制作者ページが持つPortal URLを
  `GameLobby`、`LobbyHeader`、`LobbyAccountMenu`へ渡していないことが直接原因だった。
- 一般広場と制作者環境の非所有者へリンクを出さないため、表示条件は単なるログインではなく
  既存の`sdk_creators.owner_player_id`とログイン中プレイヤーIDの一致を正本とする。
- 本体からPortalへの所有者照会は、新しい権限フィールドを作らず、既存の
  `SDK_ACCOUNT_LINK_SECRET`による60秒のアカウント署名とPortalの
  `authenticateCreatorOwner()`を再利用する。照会結果とエラーは保存・共有cacheしない。
- Portal接続先は`SDK_PORTAL_INTERNAL_URL`を正本とし、branch別URLはローカル互換fallbackに
  限定する。develop／mainのVercel登録は別々の環境変更として追跡する。

### 実施結果

- 制作者広場のアカウントメニューへ「SDKダッシュボード」を追加した。
- ログイン後に同一originの所有者確認APIを呼び、Portal側で
  `sdk_creators.owner_player_id`が一致した場合だけリンクURLを共通メニューへ渡す。
- URLは`SDK_PORTAL_INTERNAL_URL`と`/dashboard`から構築する。Portalにセッションがなければ
  既存`/dashboard`処理がaccount-link SSOを開始し、完了後に`/dashboard`へ戻す。
- 日本語・英語の共通UI文言を追加した。
- `SDK_PORTAL_INTERNAL_URL`のdevelop／main登録を環境変更registryへrequestedとして追加し、
  環境変数台帳へ現在の未登録状態と完了条件を反映した。

### 検証

- 所有者にはURLを返し、非所有者・未ログインには返さない分岐、既存署名によるPortal照会、
  環境別URL解決を固定する回帰テスト4件に成功した。
- `npm run lint`に成功した。
- 最新`develop@526e1c8`へ差分だけを移植した状態で、全634テストに成功した。
- 本体の`npm run build`とSDK Portalの`npm run build:sdk`に成功し、本体の所有者確認APIと
  Portalの`preview-owner` APIがそれぞれproduction routeへ含まれることを確認した。
- `npm run check:env-ledger`に成功し、環境変数台帳と変更registryの形式・参照漏れがないことを確認した。

### 未対応・保留

- `SDK_PORTAL_INTERNAL_URL`はdevelop／mainともVercel未登録。登録、再デプロイ、実機確認が必要。
- commit、push、実デプロイ後の`moi-lab`画面確認は未実施。
- 実機では`moi-dev`の表示とSDK Portal `/dashboard`へのSSO到達、非所有者ログインの非表示、
  developが`sdk-dev.game-fields.com`、mainが`sdk.game-fields.com`を指すことを確認する。

## 2026-07-27 — SDK Portal接続先のdev登録と実機確認状況

### 利用者からの要望

- `app-games-dev`へ`SDK_PORTAL_INTERNAL_URL`を実登録し、再デプロイ後の導線を確認する。
- 台帳を登録依頼のままにせず、Vercelの実態と一致させる。

### 実施結果

- `app-games-dev`のProduction Variableへ`SDK_PORTAL_INTERNAL_URL`を登録した。
- 実装コミット`bbb7efd`の再デプロイが`READY`となり、`dev.game-fields.com`へ
  aliasが反映されたことを確認した。
- 非所有者`test1`で`moi-lab`を開き、アカウントメニューに
  「SDKダッシュボード」が表示されないことを実ブラウザで確認した。
- 先行する環境変数台帳と変更registryには非所有者確認も未実施と記録されていたため、
  非所有者側は実機確認済み、所有者側だけ未確認となるよう訂正した。

### 検証

- 所有者・非所有者・未ログインの分岐は自動回帰テスト済み。
- 外部設定は登録済み、対象Deploymentは再デプロイ済み、非所有者側は実機確認済み。
- `npm run check:env-ledger`、`npm run lint`、全634テストに成功した。
- production buildは隔離worktree外を向く共有依存symlinkをTurbopackが拒否したため
  この文書訂正では再確認できていない。実装コミット`bbb7efd`では本体とSDK Portalの
  production buildに成功済みで、今回の差分は台帳・registry・開発ログだけである。

### 未対応・保留

- `moi-dev`は外部クライアント本人のアカウントであり、運営側は資格情報を保有していない。
  本人によるリンク表示、クリック、既存SSO、`sdk-dev.game-fields.com/dashboard`到達の
  実機確認だけを未完了として残す。
- `main`側の環境変数登録・デプロイは今回の対象外であり、未変更。

## 2026-07-27 — bbb7efd基準のv2／CHIPS再確認とclient grant発行時点修正

### 利用者からの要望

- `develop`の基準を`f62963d`から`bbb7efd`へ更新し、以後の検証を新基準で行う。
- browser recoveryを解消して、現行発行器のv2 token発行・取得を実Networkで再確認する。
  `/health`の200を成功証拠にしない。
- 正規署名済みv1 tokenがない状態でのテスト用secret追試は止め、正規tokenを取得できる
  見込みだけ判断する。
- ステップ1、opaque-origin／CHIPSブラウザ最終ゲート、SDKダッシュボード導線、
  `SDK_ACCOUNT_LINK_SECRET`、管理者パスキーRP ID分離の状態を同じ基準で再確認する。

### 基準と配備確認

- remote `develop`は`bbb7efd`の後に文書だけの4 commitがあり、作業開始時の先端は
  `5a9a670`だった。`bbb7efd..5a9a670`に挙動変更がないことを確認し、
  SDKダッシュボード復旧の挙動基準は`bbb7efd`のまま、検証対象Deploymentは
  現行先端として扱った。
- 作業中のremote先端を更新直前にも再取得し、`5a9a670`から動いていないことを確認した。
- client grant発行時点修正をGitHub commit `a1437ca`としてforceなしでdevelopへ反映した。
- 本体dev `dpl_AY3DJNxEYLVvHMusS3UyYUmaCR3T`、SDK Portal dev
  `dpl_HoFuQekzsQ3jHBurDYAcKDSS9PHM`、Preview Runtime dev
  `dpl_Gj5p3RiwcYiUrEuW2YSRhSz3d9Jc`が同commitで`READY`となり、
  errors-only build logはいずれも完了行だけでbuild error 0だった。

### v2／opaque-originブラウザ検証

- SDK Portalにログイン済みの非所有者`test1`から`moi-lab`のスカルを開き、
  公開Room `XK06`へ`SDK Player`として参加した。
- 実ChromeのNetworkで`GET package-open = 200`、client grant交換
  `POST package-open = 200`、path単位v2で`package-room.js`、`styles.css`、
  `mock.js`がすべて200となることを確認した。token本文・署名値は記録しない。
- nested iframeは`allow-same-origin`なしのsandboxを維持し、スカルのゲーム面、
  手札、Room Viewを実際に描画した。`/health`の200は証拠に使っていない。
- これにより現行v2の発行・取得と、Cookie／CHIPSへ依存しないopaque-originの
  ブラウザ最終ゲートは完了した。

### v1判断

- リポジトリ上の旧v1 fixtureは固定の正規署名済みtokenではなく、
  テスト用secretで実行時生成するものだった。devへ送れば署名不一致403になるだけである。
- リポジトリ、共有ブラウザとも正規署名済みv1 tokenを保持しておらず、
  現行発行器はv2-onlyである。切替前から開いていた実sessionも確認できなかった。
- したがって正規v1を非侵襲に追加取得できる現実的な見込みはない。旧発行器Deploymentや
  本番secretを意図的に再利用する追試は行わず、v1由来子asset継続だけ証拠不足として
  保留する。ステップ1全体は完了扱いにしない。

### client grant待機失効と修正

- ページ表示後にRoom参加まで約60秒待つと、Server Component render時に発行済みだった
  client grantが失効し、`GET package-open = 200`の後の
  `POST package-open = 403`でゲーム領域が空白になることを実Networkで確認した。
- Previewと採用済みPackageの両方で、iframeのsrcを同一origin認証済み
  `client-runtime` routeへ変更した。routeは固定revisionを再検証し、
  iframeがnavigateする時点で新しいruntime URLを取得して307する。
- `npm run verify`、全635テスト、変更ファイルlint、本体78 routeの
  `npm run build`に成功した。
- 配備後の60秒超再確認のためRoom退出を押したところ、確認ダイアログを契機に
  クラウドChromeがbrowser recoveryへ入り、新規タブでもDOM取得が回復しなかった。
  修正後実機再確認はv2／opaque-origin成功と分けて未完了とする。

### SDKダッシュボード、秘密値、パスキー

- 非所有者`test1`のアカウントメニューにSDKダッシュボード導線が表示されないことを
  実Chromeで再確認した。
- SDK Portalが現在発行した`test1`のcreator限定Preview linkを、本体developの
  `POST /api/sdk-preview/session`が200で交換した。これは両Projectの
  `SDK_ACCOUNT_LINK_SECRET`が同一dev値で、登録後Deploymentへ反映された実Network証拠で
  あり、秘密値本文は確認・記録していない。
- moi-dev所有者のリンク表示、クリック、account-link SSO、Portal `/dashboard`到達は、
  本人資格情報がないため未確認である。
- 管理者パスキーはdevelopの既定RP ID `dev.game-fields.com`とOrigin
  `https://dev.game-fields.com`を選ぶコードが配備済みで、分離・fail-closed回帰テストも
  成功している。Windows Hello上の旧dev資格情報リセット、再登録、通常ログインは
  platform authenticatorを持つ本人端末が必要なため未確認である。
## 2026-07-27 — Creator Dashboardの更新版正式提出導線

### 利用者からの要望

- `moi-dev`のCreator Dashboardでスカルの「制作環境」を押すと制作者ロビーへ戻り、
  保存済み更新候補と正式提出操作を確認できない問い合わせを調査・修正する。
- 対象候補は`ready-for-submission`のpackage revisionで、初回提出ではなく更新版である。

### 判断

- revision保存、所有者認可、正式提出API、ゲーム別制作画面は既に存在するため再実装しない。
- 原因はリンクの`gameId`欠落だけでなく、Dashboardが正式提出済みゲームの新candidateを
  表示対象から除外していた条件にある。
- 初回提出と更新提出を同じcandidate検出結果から扱い、更新時だけ文言を明示的に変える。

### 実施結果

- 最新candidate revisionをDashboard取得結果へ追加し、カード上へ
  `packageRevision`と`ready-for-submission`を表示した。
- 過去版が正式提出済みでも新candidateがあれば「更新版を正式提出」を表示する。
- 「制作環境」を`/<creatorSlug>/games/<gameId>`へ変更した。
- 既存の所有者認可と正式提出APIを維持し、新しい権限・DB・提出経路は追加していない。

### 検証

- `tests/sdk-oauth-mcp-source.test.ts`へ、更新candidateの表示条件、更新版ラベル、
  candidate revision表示、gameIdを含む制作環境リンクの回帰検査を追加した。
- `npm run build:runtime-packages`後の`npm run verify`、全635テスト、
  本体production build、SDK Portal production buildに成功した。
- `c5a8707`をforceなしで`develop`へ反映し、`app-games-sdk-dev` Deployment
  `dpl_HiMo7njq2srxybUnDHQUeYUfwtcV`の`READY`と`sdk-dev.game-fields.com`への
  alias反映を確認した。
- dev配備後の`moi-dev`本人による表示・提出前確認は未実施。

### 関連コミット

- `c5a8707` — `Fix SDK update submission dashboard`

### 未対応・保留

- dev配備後、`moi-dev`本人にスカルの更新revision表示、制作環境遷移、
  「更新版を正式提出」ボタン表示を確認してもらう。

## 2026-07-27 — 管理者パスキー初期化の復旧コードstep-up

### 利用者からの要望

- dev管理画面で自分のパスキーを初期化し、復旧コードを入力しても無反応に近い失敗表示で
  管理者アカウント画面へ戻る事象を修正する。

### 判断

- 復旧コードを通常full管理者のstep-upに利用できる既存クライアント意図を維持する。
- step-upでは署名済みfullセッションとchallengeの管理者メールをコード消費前に照合し、
  匿名ログイン、別管理者、break-glass scopeへ権限を広げない。
- 成功後は復旧コードセッションを画面へ即時反映し、同じ画面でWindows Hello再登録へ進める。

### 実施結果

- dev runtime logで`begin-step-up` 200直後の復旧コード要求が
  `SITE_ADMIN_CHALLENGE_INVALID` 400になることを確認した。
- 原因はstep-up challengeを発行しながら復旧コードAPIがlogin challengeだけを許可していた
  目的不一致だった。失敗はコード消費前であり、入力済みコードは未使用である。
- step-up challenge、fullセッション、同一メールを検証した後だけ復旧コードを消費し、
  `method: recovery-code`のfullセッションへ更新するよう修正した。
- 無効コードとchallenge期限切れの管理画面メッセージを具体化した。

### 検証

- 管理者認証境界の対象回帰テストに成功した。
- `npm run verify`、全636テスト、78 routeの`npm run build`に成功した。
- 修正commit `444ec16`をforceなしで`develop`へ反映した。
- 本体dev `dpl_8WMj9R8vkjmoPPGY4ThfrXL6Q4dg`、SDK Portal dev
  `dpl_Ar2yAhLEBnYiCzCueJLoaDEvVFA4`、Preview Runtime dev
  `dpl_96oWgQXG9NcBWaNWNmhtQruDydWV`がすべて`READY`となり、
  `dev.game-fields.com`を含む各aliasへ反映された。

### 関連コミット

- `444ec16` — `Fix recovery-code admin step-up`

### 未対応・保留

- 本人端末での「初期化→復旧コード→Windows Hello再登録→通常ログイン」の実機確認。

## 2026-07-27 — AI報告の既存スレッド照合を必須化

### 利用者からの要望

- AIが「以前にも報告」と本文へ書いた同一事象を、元の問い合わせへの返信ではなく
  別report IDの新規バグ報告として作成したため、同じ件は既存スレッドへ追記させる。

### 判断

- `prepare_support_reply`の存在だけではAIのtool選択を保証できない。
- AIによる新規報告の前に本人の全報告一覧を取得させ、その一覧を確認した証跡を
  `prepare_support_report`の必須入力としてサーバーでも検証する。
- 同一・再発・続報の可能性がある場合は`get_support_thread`から
  `prepare_support_reply`へ進み、新規報告を禁止する。
- 既存チャットへ固定されたDownloadMeと区別するためver17へ更新する。

### 実施結果

- DownloadMeのsupport手順へ全件照合、関連候補の詳細取得、既存スレッドへの返信を追加した。
- MCPの`prepare_support_report`へ`checkedReportIds`を追加し、現在の本人所有report ID
  全件と一致しない新規下書きを拒否するようにした。
- SDK Help、現行仕様、引き継ぎ、既知事象を同じ契約へ更新した。
- 既に作られた重複reportは自動統合せず、元スレッドへ必要内容を追記した後に重複側を
  終了する方針とした。

### 検証

- support契約テスト6件、`npm run verify`、全637テストに成功した。
- 本体production buildとSDK Portal production buildに成功した。
- 修正commit `7af8061`をforceなしで`develop`へ反映した。
- SDK Portal dev Deployment `dpl_7siz7S7hcdKWJiEzPXxSyqXjUefx`が`READY`となった。

### 関連コミット

- `7af8061` — `Prevent duplicate AI support reports`

### 未対応・保留

- ver17を使う新規AIチャットで、既存案件が`prepare_support_reply`へ進む実機確認。
- 画像で確認した重複reportと元reportの内容整理。

## 2026-07-27 — 広場のゲームお気に入り

### 利用者からの要望

- カード表示では右上、簡易一覧では行の右側に星を置き、ゲームをお気に入り登録できるようにする。
- 広場はお気に入りゲームをデフォルトで上に並べる。

### 判断

- 既存のカード／簡易一覧表示設定と同じく、未ログインでも使える端末設定として
  `localStorage`へ保存する。DB migrationや本番環境変数は追加しない。
- 星はゲーム遷移リンクの外へ独立したボタンとして置き、星の操作でゲームへ遷移しない。
- お気に入り群と通常群の内部では、検索後も登録簿由来の相対順を維持する。

### 実施結果

- カード右上と簡易一覧右端へ、登録状態が分かる星ボタンを追加した。
- お気に入りを検索結果を含む一覧の先頭へ安定ソートし、別タブでの変更も同期する。
- 日本語／英語の操作ラベルと`aria-pressed`を追加した。

### 検証

- お気に入りIDの正規化、壊れた保存値の無視、安定ソートの自動テストを追加した。
- `npm run lint`、全640テスト、78 routeの`npm run build`に成功した。

### 未対応・保留

- アカウント間・端末間同期は今回の範囲外。必要になった場合はアカウント設定APIとして
  別途導入する。

## 2026-07-27 — SDKゲームラウンジから広場への直接導線

### 利用者からの要望

- ゲームラウンジにいるとき、広場へ1クリックで戻れるようにする。
- 戻り先の呼称は「ロビー」ではなく「広場」とする。

### 判断

- 「ロビー」は作成済みRoomのゲーム開始前状態、「広場」はゲーム選択画面として区別する。
- 昇格済みSDKゲームのラウンジでは、メニュー内ではなくトップバーの直接操作として表示する。

### 実施結果

- 既存の`/games`直接リンクを「ゲーム一覧へ」から「広場へ戻る」へ統一した。
- 内部遷移を共通`AppLink`へ揃え、現在の表示言語を維持する。

### 検証

- ラウンジのトップバーに「広場へ戻る」が直接存在し、旧表記が残らないことを
  source契約テストへ追加した。
- `npm run lint`、全640テスト、78 routeの`npm run build`に成功した。

## 2026-07-27 — SDKラウンジヘッダーの共通契約化

### 利用者からの要望

- 昇格済みSDKゲームで「広場へ戻る」が表示されなかった。
- 対象画面だけへボタンを足す対処療法ではなく、モジュール化を優先する。

### 判断

- 前回は旧`ApprovedSdkGameShell`だけへ直接リンクを追加し、実際のiframe packageが使う
  `GameSdkFrame → GameSdkShellHeader`経路へ契約が届いていなかった。
- SDK Shellごとのリンク直書きを廃止し、共通`GameSdkShellHeader`へ表示面を渡す。
- `surface="lounge"`では共通ヘッダー自身が直接戻り導線を表示し、Room内では
  戻り導線を共通メニューへ置く。

### 実施結果

- Preview、採用済みiframe package、旧wordwolf clientを同じ
  `GameSdkShellHeader`契約へ統合した。
- 旧Shellから個別`GameTopBanner`と「広場へ戻る」の直書きを削除した。
- 採用済みゲームの表示名を「広場へ戻る」に統一し、制作者Previewでは同じ共通契約から
  「制作者ページへ」を表示する。

### 検証

- 共通ヘッダーがラウンジ面の直接導線を所有し、旧Shellに個別ヘッダーが戻らないことを
  source契約テストへ追加した。
- 旧経路を使う登録済みゲームが`wordwolf-sdk`であることを登録簿から確認し、
  ラウンジ／Roomのナビ配置、観戦、ルール、プレイヤーメニュー保持を回帰テストへ追加した。
- `wordwolf-sdk`のRoom作成、参加、プレイ、結果、再戦、全員復帰の既存テストを再実行した。
- `npm run lint`、全642テスト、78 routeの`npm run build`に成功した。

### 未対応・保留

- dev配備後の実画面確認。

## 2026-07-27 — SDK LLMのGemini構造化出力契約を復元

### 利用者からの要望

- 「コトバに迫れ」でAIへ質問すると、画面内とtoastの両方に
  `GAME_SDK_COMMAND_REJECTED`が表示される障害を解消する。

### 判断

- dev Runtime LogではRoom APIが409 `LLM_INVALID_RESPONSE`、Gemini provider自体は
  成功していたため、Room認証・package revision・Preview通信の障害ではない。
- 審査済みAppSetは5段階判定の`responseJsonSchema`を要求済みであり、固定AppSetを
  個別修正せず、共通LLM経路の契約漏れを直す。
- providerがschema外の応答を返した場合もゲーム固有処理で拒否するだけにせず、
  共通層で不採用として次providerへfallbackする。

### 実施結果

- Gemini Generate Contentの`generationConfig`へ要求された
  `responseJsonSchema`を転送するようにした。
- 共通JSON Schema照合器を追加し、provider応答を成功記録する前に検証するようにした。
- enum外値、余分なproperty、Markdown fence付きJSONを不適合として扱う回帰テストを
  追加した。
- SDK LLM gatewayのfixtureをschema準拠応答へ直し、schema転送契約を固定した。

### 検証

- 対象6テスト、変更ファイルlint、`git diff --check`に成功した。
- 結合前の全642テストと、最新`develop`結合後の全644テストに成功した。
- `npm run verify`と、本体・SDK Portal・SDK Previewのproduction buildに成功した。

### 未対応・保留

- `develop`反映後の3 dev Deployment READY確認と、認証済み利用者による実機再質問。
## 2026-07-27 — 共通化・dev昇格・実装一致を最優先ルール化

### 利用者からの要望

- 小さい修正でも共通化・モジュール化を先に検討し、mainで症状だけを個別再実装しない方針を、リポジトリ最上位のルールとして保存する。

### 判断

- ルート`README.md`の冒頭へ「最優先の開発原則」として明記する。
- AI・開発者がREADME以外の作業規則から開始しても見落とさないよう、ルート`AGENTS.md`にも同一文言を置く。
- ルール自体もdevelopからmainへ同一差分を昇格し、両ブランチの実装一致を確認する。

### 実施結果

- ルート`README.md`と`AGENTS.md`へ、共通化・モジュール化の事前検討、dev実装のそのままの昇格、その場しのぎの禁止、dev/main一致確認を追加した。

### 検証

- READMEとAGENTSの規則文が同一であることを確認した。
- developとmainの対象文書が同一内容になることを確認した。

### 未対応・保留

- なし。

## 2026-07-27 — 本番管理者パスキー復旧とbreak-glass削除準備

### 利用者からの要望

- 本番管理者パスキーがdevと同じWindows Hello構成になったことを確認し、通常運用へ戻して次の移行作業へ進む。

### 判断

- 管理画面の表示が`Windows Hello等 1件`、`外部キー 0件`、`種別不明 0件`、未使用復旧コード10件になったため、本番の初期化・復旧コードログイン・端末内パスキー再登録は成功扱いとする。
- 一時的な`SITE_ADMIN_BREAK_GLASS_ENABLED`を残したまま次工程へ進めず、本番`app-games` Productionから削除し、再デプロイ後の通常パスキーログインを最終ゲートにする。
- 外部設定変更前に、削除依頼を環境変数変更マスターへ登録する。

### 実施結果

- `config/environment-change-registry.json`へ本番`app-games` Productionの`SITE_ADMIN_BREAK_GLASS_ENABLED`削除依頼を`requested`として追加した。
- `docs/ENVIRONMENT_VARIABLES.md`へ、本番のWindows Hello再登録確認と削除待ちの現在状態を反映した。

### 検証

- 本番管理画面の利用者提示画像で、Windows Hello等1件、外部キー0件、種別不明0件、未使用復旧コード10件を確認した。

### 未対応・保留

- 本番`app-games` Productionから`SITE_ADMIN_BREAK_GLASS_ENABLED`を削除する。
- 削除後に再デプロイし、通常パスキーで管理画面へログインできることと、マスターパスワードによるbreak-glass復旧が無効であることを確認する。

## 2026-07-27 — develop→main昇格時の全Vercel Project確認をルール化

### 利用者からの要望

- develop→mainの同期・反映では、本体だけでなくSDK Portal・SDK Previewを含む全Vercel Projectを対象として明示的に確認する。
- Project名・ドメイン・ブランチを都度書き出し、漏れの確認後に昇格を開始する。

### 判断

- ルート`README.md`と`AGENTS.md`の最優先ルールへ同一内容を追加する。
- 将来Projectが増減しても固定一覧だけで判断しないよう、昇格時点のVercel構成と`docs/ENVIRONMENT_VARIABLES.md`の照合を必須にする。
- 昇格対象外のProjectも一覧へ残し、対象外の理由を明記する。

### 実施結果

- 昇格前のProject名・ドメイン・対象ブランチ・昇格対象可否・理由の一覧化を必須化した。
- 一覧の漏れ確認が終わるまで昇格を開始しない条件を追加した。
- 反映後は昇格対象の全Projectで、対象commitとDeploymentの`READY`を確認する条件を追加した。

### 検証

- READMEとAGENTSの追加規則文が同一であることを確認する。
- Markdown差分と現在のVercel Project台帳を照合する。

### 未対応・保留

- なし。

## 2026-07-29 — SDK正式Room復帰のpackageRevision不整合を遮断

### 利用者からの要望

- `test10-1 / link-lines`の正式Room導線で、旧Room `30QT`のserver stateとURL指定の新revision clientが混在する高優先度ブロッカーを、#26より先にdevelopで修正する。
- Room固定revisionとclient revisionの一致をロード構造で保証し、不一致時は旧Room復帰または新revisionでの新Room作成を明示選択させる。
- Vercel Preview deploymentは使わず、関連dev ProjectのProduction DeploymentとSDK Portalの正式Room導線で確認する。mainへは反映しない。
- 「部屋を解散した後にタブだけ閉じた」現象は、証拠付きで再現しない限り今回へ混ぜない。

### 判断

- Room recordの`runtimeContract.packageRevision`をSnapshot、Room一覧、HTTP clientへ欠落なく渡し、`GameSdkFrame`のattach、watch、Command応答、active Room再取得のすべてでclient revisionとの一致を先に検査する。
- 不一致時の「旧Roomへ戻る」はrevision queryだけでなく外側ページ全体をRoom固定revisionへ再読込し、manifest、module profile、server bundle、client iframeを同じ版へ揃える。
- 「新Roomを作る」は、server側で本人、現在のactive Roomコード、旧packageRevision、URL指定の新packageRevisionを再照合した場合だけactive索引を置換する。旧Roomの解散・削除・参加者変更は行わない。
- Room固定revision不明、固定package解決失敗、client ready未到達はfail closedとし、Mockや別revisionへ暗黙fallbackしない。

### 実施結果

- 原因は、server adapterが旧Room固定bundleを正しく解決する一方、`GameSdkRoomSnapshot`が`packageRevision`を公開せず、ShellがURL指定revisionのiframeを独立して起動していたことと特定した。
- formal package RoomのSnapshot・一覧へ固定revisionを追加し、revision一致ゲート、明示選択画面、固定revision URL再読込、照合付きactive Room置換、client load timeoutの明示エラーを共通基盤へ実装した。
- candidate Previewと採用済みiframe packageの両方を同じ契約へ揃え、通常のSDK Roomとnative Roomの保存契約は変更していない。
- 現時点ではdevelopへのcommit・push前であり、mainは変更していない。

### 検証

- 追加・関連テスト13件、SDK Shell契約8件、SDK依存境界検査、ESLintは成功した。
- `npm run build`、`npm run build:sdk`、`npm run build:sdk-preview`は成功した。
- 全体テストの初回実行は693/696件成功だった。3失敗のうちcloneで未取得だった`sdk-starter-dev` refは取得後に対象2件の成功を確認した。残る今回差分外の既存2件は、Node 24でJSON import attributeが必要な`game-sdk-package-manifest`と、既存`InviteRoomJoiner`がSDK Preview対応済みなのに否定する旧contract testである。

### 未対応・保留

- developへcommit・pushする。
- `app-games-dev`、`app-games-sdk-dev`、`app-games-preview-dev`の対象commit Production DeploymentがREADYであることを確認する。
- SDK Portalの「正式Roomで確認」から、Room `30QT`の不一致表示、旧revision復帰、新revisionでの新Room作成、両経路の実操作を確認する。

## 2026-07-29 — SDK正式Room復帰のpackageRevision修正をdevelop配備・実機確認

### 実施結果

- 修正commit `ae6a39c184894f6a1849a3740b517575a6e537f5`を`develop`へfast-forwardで反映した。`main`は変更していない。
- 同commitのProduction Deploymentは、`app-games-dev`が`dpl_58Rve4X8uZueSXVXxrB3XAYgAv8G`、`app-games-sdk-dev`が`dpl_BwpG14aCM72JZFkM4AvYJA2r8vNx`、`app-games-preview-dev`が`dpl_8qj3QADMXKaR8vXewwXbVPR3KY4y`で、3件とも`READY`を確認した。
- SDK Portalの正式Room導線
  `https://sdk-dev.game-fields.com/test10-1/games/link-lines?revision=02efe902e4ed49ea525abb862da74c123651efcb`
  だけを使用し、Vercel Preview deploymentは使用しなかった。

### 正式Room実機確認

- 旧Room `30QT`の固定revision
  `42292ad52a3bafcd751d6ba1767534d794c0c602`と、URL指定revision
  `02efe902e4ed49ea525abb862da74c123651efcb`の不一致を表示し、選択前のnested client iframeが0件であることを確認した。
- 「旧Roomへ戻る」でRoom `30QT`へ戻ると、client iframeは旧revisionを明示した
  `/api/sdk-preview/test10-1/games/link-lines/client-runtime?revision=42292ad52a3bafcd751d6ba1767534d794c0c602`
  を読み込んだ。resultのrev 12からlobbyのrev 13、playingのrev 14へ進め、1行1列へ配置後にrev 15・青マスとなり、旧Roomを操作できた。
- 新revision URLへ再読込すると再び不一致を表示し、「新revisionで新Roomを作る」でRoom `21GT`をrev 1として作成した。client iframeは新revisionを明示した
  `/api/sdk-preview/test10-1/games/link-lines/client-runtime?revision=02efe902e4ed49ea525abb862da74c123651efcb`
  を読み込んだ。ダミー追加でrev 2、ゲーム開始でrev 3、1行1列へ縦配置後にrev 4・青マスとなり、新revision Roomを操作できた。
- 同じ新revision URLを再読込すると、不一致画面を出さずRoom `21GT`へ通常復帰した。rev 5、nested client iframe 1件、新revision client URL、配置済みの青マスを確認した。
- 以上の各経路で、Room固定revisionとclient URLのrevisionが異なる状態は発生しなかった。不一致選択前はclientを読み込まず、旧Roomと新Roomではそれぞれ一致するclientだけを読み込んだ。

### 検証

- 追加・関連テスト13件、SDK Shell契約8件、SDK依存境界検査、ESLint、本体・SDK Portal・SDK Previewのproduction buildはすべて成功した。
- 全体テストで残った今回差分外の既存2件は、Node 24のJSON import attributeと、SDK Preview対応済み実装を否定する旧contract testであり、今回の必須テストはすべて成功した。
- 「部屋を解散した後にタブだけ閉じた」操作は今回行っておらず、同現象は再現していないため本件へ含めない。

### 未対応・保留

- `main`への反映は利用者の指示があるまで行わない。

## 2026-07-30 — T-31 通常の正式Room作成でRuntimeが接続されない問題を再オープン

### 利用者からの要望

- `test10-1 / link-lines`の通常「正式Roomで確認」で作った`GF43`がRuntime未接続となるため、development完了判定を撤回し、最優先で原因確定・最小修正・develop配備・通常導線実機確認まで行う。
- revision指定URLの成功だけを完了証拠にせず、通常導線とrevision指定導線のPackage、Runtime bundle、`GameSdkFrame`接続結果を段階ごとに比較する。
- T-26の並行変更を破棄せず、push前にremote `develop`を再取得し、force pushしない。`main`は変更しない。

### 根本原因と証拠

- `GF43`に保存済み`packageRevision`は存在しない。旧`SdkPreviewGameShell`がブラウザ内だけでRoomコードを生成しており、正式Room APIへの作成POSTとserver Room recordがなかった。
- 制作者トップの通常カタログは最新candidate revisionを返さず、revisionなしのゲームURLを作っていた。
- Portal Runtime APIはrevision指定時だけimmutable package revision行を読み、queryなしではmutableゲーム行を読んでいた。対象ゲームはcandidate作成済み・正式提出前のため、通常導線は旧Mock、revision指定導線はcandidate Packageを解決した。
- development Runtime logでは`GF43`のRoom作成はなく、queryなしRoom APIはPackage未解決で404、revision指定Room APIは200だった。成功側の正式`GameSdkFrame`ではPackage client、portable server、Room作成、盤面Commandが同じrevisionで動作した。

### 修正

- 制作者カタログが最新candidate revisionを返し、通常のゲームカードもrevision固定の正式`GameSdkFrame`へ遷移するようにした。
- queryなし／revision指定のPortal Runtime APIを同じimmutable Package resolverへ統一した。queryなしは最新candidate、revision指定は指定revisionを解決する。
- Packageが存在しない通常導線だけ旧Mockを許可し、Package lookupの例外、Runtime bundle解決、grant生成失敗はMockへfallbackせず停止する。
- 正式Roomの保存、旧Room復帰、新revisionで新Roomを作る既存分岐は変更していない。

### 自動検証

- 追加・関連テスト30/30成功。
- SDK Portal、SDK Previewの単独型検査、ESLint、SDK依存境界、SDK Shell契約8/8成功。
- `npm run build`、`npm run build:sdk`、`npm run build:sdk-preview`成功。
- 全体テストは701/703成功。残る2件は今回差分外で既知の、Node 24 JSON import属性と、実装済みSDK Preview招待を否定する旧contract test。
- ルート全体の単独`tsc`は既存test fixtureの型不一致で失敗した。変更対象のSDK Portal／SDK Preview型検査と3つのproduction buildには新規型エラーがない。

### develop反映と配備

- push直前にremote `develop`を再取得し、報告済みHEADと一致していること、作業ツリーがクリーンであることを確認した。
- 修正commit `bbfb5979697e699b128d4e0e4481580b8621ff82`を`develop`へnon-forceで反映した。
- 同commitのProduction targetは、`app-games-dev`が`dpl_CqDHi6qyB571xDLRMzkpmbkKBDXs`、`app-games-sdk-dev`が`dpl_CUfw2Y2idLRnYNBdtZcJKNNfa2m5`、`app-games-preview-dev`が`dpl_JCgyDBnCG2CARd58heBmrHR3bW3G`で、3件とも`READY`を確認した。Vercel Previewは完了証拠に使用していない。
- T-26の作業branchとPRが並行して進んでいることをVercel／GitHub状態から確認したが、remote `develop`は修正commitのままで、T-26側の変更を破棄・上書きしていない。

### 通常正式Roomの実機確認

- SDK Portalの制作者トップを再読込し、`link-lines`の通常ゲームカードが現行candidate revisionを固定した正式Room URLを持つことを確認した。
- 旧revisionのactive Roomがある状態では不一致画面を表示し、選択前にnested client iframeを起動しなかった。「新revisionで新Roomを作る」から現行candidateの正式Room `N80U`を作成し、Room作成logでも同revision、portable Runtime版、成功結果を確認した。
- `N80U`でPackage clientが起動して`Room同期済み`となり、ダミー参加者追加、ゲーム開始、1行1列への青の縦配置、Room rev 3から4への更新、青から赤への手番交代を確認した。
- SDK Portal全体の再読込後は制作者トップへ戻るPortal仕様のため、同じ通常カードを開き直した。同Room `N80U`へ不一致画面なしで復帰し、配置済みの青マス、総手数1、赤手番、Room同期状態を保持した。
- 現行candidateのrevision指定URLでも`N80U`へ復帰し、通常導線と同じclient Runtime endpoint、同じpackage revisionを解決した。Runtime接続、Room保存、Commandに別revisionの混在はなかった。
- 旧Room／新revision分岐の回帰では、旧revision URLと現行Roomの不一致時に「旧Roomへ戻る」で現行Room `AAAV`をRoom固定revisionのclientへ復帰させた。逆に「新revisionで新Roomを作る」で旧revision固定Room `3HTX`を作成し、その後の通常カードでは`3HTX`との不一致を検出して現行revisionの`N80U`へactive索引を安全に置換した。旧Roomは解散・削除していない。
- 共通基盤の横断確認として、別のcandidate Package `ai-word-guess`もSDK Portalの通常ゲームカードから正式Room `UYWB`を作成し、ゲーム固有Runtime clientと設定画面が起動した。
- 同時間帯のRuntime logには別のpoll／timer invocationで一時的な`REDIS_STORE_REQUEST_TIMEOUT`も記録されたが、T-31のRoom作成、開始、配置Commandは成功し、再読込後の保存状態も復元された。T-31のPackage／Runtime未接続原因とは分離する。

### 完了状態

- T-31はdevelopmentで原因確定、最小修正、自動検証、non-force push、3 ProjectのProduction配備、通常正式Roomの実機確認まで完了した。
- `main`は`85e702e7ed3b6acf5e7167d9fb3dcbe3a23c2389`のままで未反映。

## 2026-07-30 — SDK candidate採用のsource_revision欠落を修正

### 利用者からの要望

- `道つなぎ`の`SDK-dev → dev`採用が503 `promotion_failed`になる緊急障害を、Redis移管、PR #69、T-26、費用ダッシュボード、共通build抑制と分離してローカル修正する。
- Preview Runtimeで検証した固定Packageの正確なrevisionをrelease履歴へ保存し、stable pointerだけが先に進まないことを保証する。
- migration 006は変更せず、全INSERT／UPSERT経路、秘密値を含まないログ、必須列欠落を検知する回帰テストを確認する。
- push、PR、Deployment、DB・Redis・Secrets・環境変数変更、実昇格再試行は行わない。

### 判断

- 費用ダッシュボードのlocal branchはそのまま保持し、remote `develop@677e56f`から専用worktreeと`agent/sdk-promotion-source-revision` branchを作成する。
- candidateの`package_revision`をmanifest検証とreleaseの`revision`／`source_revision`で共通使用し、stable pointer、channel履歴、旧current解除、新release、判断履歴を既存の単一PostgreSQL文に保つ。
- 実行時の`sdk_app_releases` INSERT／UPSERTを全走査し、migration 004/006から導出した現行必須列へ照合するschema-aware testを追加する。旧INSERTは`source_revision`のNOT NULL違反相当として再現する。
- server logは入力・schema・source取得・manifest検証・release書込み・結果検査の段階を分け、識別子と安全な分類だけをJSONで出す。公開APIの未知エラーは従来どおり`promotion_failed`へ正規化する。

### 実施結果

- candidate採用の新release INSERTへ`source_revision`を追加した。保存値はstable pointerや最新版の再取得ではなく、Preview Runtime検証へ渡した固定candidate revisionと同一である。
- `SDK-dev → dev`と`SDK → main`は同じserviceを使うため両方の潜在欠落を解消する。`dev app → main app`の昇格・復元2経路は既に同列を保存しており変更していない。
- migration 004の初回backfillを含む全4 INSERTを監査した。migration 004は006より前のschemaで正しく、現行Runtimeの3 INSERTはすべてmigration 006適用後の必須列を満たす。
- Redis接続先、namespace、plan、Secrets、環境変数、migration、Vercel／GitHub設定は変更していない。

### 検証

- focused promotion／manifest／release UI／schema-aware回帰テスト17件、昇格関連contractを含む拡張focused test 45件は成功した。
- SDK Portal ESLint、SDK Portal単独TypeScript検査、全体lint、SDK migration 7件の整合性検査、SDK依存境界検査は成功した。
- Game SDK／Game Runtime package、SDK Portal、本体のproduction buildは成功した。本体はTypeScript検査と78ページ生成まで完了した。
- 全体testは720/722成功した。残る2件は基準`develop@677e56f`と同じ、Node 24のJSON import attributeと、実装済みSDK Preview招待を否定する旧contract testである。今回追加した5件はすべて成功した。
- 環境台帳検査は基準と同じ既存`SDK_ACCOUNT_LINK_ALLOWED_ORIGINS` 1件だけで失敗した。今回差分に環境変数の追加・変更はない。
- 実差分7ファイルのbuild影響判定は、developmentでは`app-games-sdk-dev`だけBUILD、`app-games-dev`、`app-games-preview-dev`、無効化済み`app-games-sdk-portal`はSKIPである。将来mainでは`app-games-sdk`だけBUILDし、`app-games`、`app-games-sdk-preview`はSKIPする。

### 未対応・保留

- push許可後は変更パスのbuild判定に従い、必要なdevelopment Projectだけを1回配備して`道つなぎ`の同じ固定candidate採用を実機確認する。
- `main`への反映と`SDK → main`の実機確認は別承認とする。

## 2026-07-30 — 問い合わせ・報告の新着未反映とT-33再発調査

### 利用者からの要望

- `dev.game-fields.com/ja/admin`の「問い合わせ・報告」が新着を反映せず、すべて13、オープン0、ユーザー返信待ち9、対応済み3、見送り・終了1のままになった原因を調査する。
- 通知から本文、氏名、メールアドレスを扱わず、ID、到着時刻、送信種別、dev／productionを特定し、4 ProjectのPOST、通知処理、Redisのrecord／index／namespaceを読取専用で照合する。
- 保存失敗、index登録失敗、一覧timeout、環境違い、SDK Portal接続先、アプリ外メール経路を分離する。
- 必要なら最新`develop`基準の専用worktreeでローカル修正し、問い合わせ、報告、利用者追記、Redis timeout、namespace分離を検証する。
- Redis、環境変数、外部設定、push、PR、merge、Deploymentを変更せず、許可前のテスト投稿も行わない。

### 読取調査

- 専用worktree `agent/support-inbox-timeout-recurrence`を`develop@4cd963816538d5f0fb4cb6facf540b9fc792f8dd`から作成した。他の作業branchは変更していない。
- 48時間のVercel Runtime記録で、`app-games-dev`の通常問い合わせPOST 201を2026-07-29 13:55:29 JSTと22:42:53 JSTに確認した。保存後の運用通知telemetryはそれぞれ`sent`である。ログはrequest本文とrecord IDを意図的に保持しないため、2件の`contact_...` IDは通知側の最小情報なしには復元できない。
- SDK Portal devでは、2026-07-30 17:29:37 JSTの下書き作成と17:30:45 JSTの本人承認送信に対応する`app-games-dev`の`POST /api/internal/sdk-support` 201を確認した。確定IDは`report_8e58e0d0-3ba2-4cb8-90e5-c35f57b4729c`である。Portalと本体の対応時刻から、この報告の`GAME_FIELDS_APP_BASE_URL`はproductionでなくdev本体を指していた。
- 観測範囲内で`app-games`、`app-games-sdk`に該当POSTはなく、`app-games-dev`の`POST /api/user-reports`もなかった。該当新着候補はdevの通常問い合わせ2件とSDK Portal報告1件である。
- dev本体は共有物理Redisへ`app-dev:` prefixで接続する。問い合わせは`app-dev:contact:v1:<id>`と`app-dev:contacts:v1`、報告は`app-dev:user-report:v1:<id>`と`app-dev:user-reports:v1`を使用する。SDK Portal独自のPreview index namespaceはsupport record保存先ではない。
- 問い合わせと報告の初回保存は、Luaの単一`EVAL`でrecord SET、index LPUSH、trimを行う。201応答済みの当初保存について、record保存後にindex登録だけ失敗する部分成功はない。後からindexだけ欠落していれば、後発の削除・破損・環境変更を別に調べる必要がある。
- 公開問い合わせ通知メールはrequesterを`replyTo`にするが、受信メールをアプリへ取り込むwebhookはない。運営がメールクライアントから直接返信した場合、その返信は管理受信箱の会話へ入らない。

### timeout原因と一覧13件の表示経路

- Vercel runtime error集計で、2026-07-29 22:26:55 JSTから2026-07-30 17:06:30 JSTまで`REDIS_STORE_REQUEST_TIMEOUT`を88件確認した。記録上のrequest pathは複数に分散したが、全stackは同一だった。
- 配備済みsource mapを復元すると、stackは`lib/redis-store.ts:91`、同`:245`、`lib/sdk-preview-room-invite-index.ts:24`へ到達した。問い合わせ／報告のlist処理ではない。
- `app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts`がRoom更新成功後に招待索引の保存・削除を`void`で開始し、rejectを回収していなかった。非重要な索引更新のtimeoutがUnhandled RejectionとなってNode processをexit 128にし、同じFluid Nodeプロセス上で並行していた別requestへ誤帰属された。
- 2026-07-30 16:49:43 JSTの`GET /api/admin/contact-messages`はVercel上200であり、同時刻の`GET /api/admin/user-reports`も200である。後続の16:54:46 JST、17:07:39 JSTの問い合わせ一覧GETはerrorなしで成功したため、Redis／一覧取得の恒常障害ではなく一時的なprocess障害は復旧している。
- Vercelは過去のresponse bodyを保存していない。問い合わせlist自身がthrowした場合の実装上の応答は500 `{"error":"CONTACT_MESSAGES_LOAD_FAILED"}`だが、当該記録は200で、timeout stackも別処理を指す。このため通常の`{"contacts":[...]}`を生成した可能性が高いが、process exitとsocket flushが競合した場合のブラウザ実受信bodyまでは確定できない。
- 管理画面は両APIを`no-store`で取得し、両方の配列検証が成功した後だけitemsを置換していた。失敗時はエラー文だけを更新し、直前のitemsを保持したため、古い13件と状態件数が残った。サーバーcacheから古い13件を返す経路はない。

### ローカル修正

- Room成功後の招待索引保存・削除を既存のpost-response work helperへ登録し、Redis timeoutを安全なtelemetryに変換する。未処理rejectによるNode process終了と別requestへの誤帰属を防ぐ。
- 管理受信箱は問い合わせ／報告の一方でも取得またはresponse検証に失敗した場合、旧itemsを消して件数・状態フィルターを隠し、「以前の件数は表示していない」と明示する。
- 両管理GETへ、本文等を含めない一覧成功件数と安全な失敗分類のtelemetryを追加する。将来の200記録と実際のlist成否を区別できるようにする。
- 問い合わせと報告の実storeをin-memory Redis REST fakeで通し、recordとindexの作成、一覧反映、利用者追記後の`open`復帰を同じproduction store実装で検証する回帰テストを追加する。

### 検証

- focused testは11/11、関連Redis／namespace／email／support testは29/29成功した。
- 変更対象ESLintと全体`npm run lint`は成功した。
- 全体testは722/724成功した。追加2件は成功し、残る2件は基準`4cd9638`と同じNode 24 JSON import attributeと、実装済みSDK Preview招待を否定する旧contract testである。新規失敗はない。
- 本体production buildはRuntime package build、Next.js TypeScript検査、78ページ生成まで成功した。
- 実差分のbuild判定は、developmentでは`app-games-dev`だけBUILDし、`app-games-sdk-dev`、`app-games-preview-dev`、無効化済みPortalはSKIPする。将来mainでは`app-games`だけBUILDし、SDK／Preview ProjectはSKIPする。Deploymentは行っていない。

### 未確定・TODO監督への提出事項

- 現物Redisのrecord存在、index membership、status、createdAt、updatedAtは未照合である。理由は、通常問い合わせ2件の正確な`contact_...` IDと、秘密値を受け渡さずに使える承認済みread-only接続経路が現在の作業環境にないためである。
- 通知から`contact_...` IDと到着時刻だけを受け取れれば、本文、氏名、メールアドレスを扱わず対象を固定できる。既知のSDK Portal報告IDはそのまま照合可能である。
- T-33の完了後に同じ`REDIS_STORE_REQUEST_TIMEOUT`が88件再発し、Node process exitと別requestへの誤帰属を生んだ。監督DBではT-33がarchivedで、「再発時は新規TODO」と明記され、次番号は`T-39`である。履歴を戻さず、T-33再発を親参照する`T-39`として本修正と現物Redis照合を追跡する案をTODO監督へ提出する。
- Redis接続先、環境変数、外部設定、テスト投稿、push、PR、merge、Deploymentは一切変更・実行していない。

## 2026-07-30 — T-39 問い合わせ・報告メールへ保存済み受付IDを表示

### 利用者からの要望

- 現物Redis照合を待たず、次に届く通常問い合わせ、ゲーム内報告、SDK Portal報告から対象recordをメールだけで追跡できるようにする。
- 保存時に発行された正規`contact_...`／`report_...`を通知層へそのまま渡し、メール専用IDは作らない。
- 管理者新着、利用者受付確認、運営返信、追記、メール再送の件名とtext／HTML本文へ同じフルIDを維持する。
- 本文、氏名、メールアドレス等をログへ追加せず、テスト問い合わせ、push、PR、Deployment、TODO DB更新を行わない。

### 判断

- メール件名とID欄を`lib/support-email-content.ts`へ集約し、保存済みrecord ID一つから件名、text、HTMLを同時生成する。各routeで件名を個別組立てしない。
- 件名は`[Game Fields][問い合わせ|報告][フルID] ...`、本文冒頭は`受付ID：contact_...`または`報告ID：report_...`の選択・コピー可能な等幅ブロックへ統一する。
- 既存の送信有無、宛先、本文、Resend冪等キーは変えない。ゲーム内・SDK Portal報告へ新しい受付メールを追加せず、現在存在する管理者通知と運営返信だけを揃える。
- 現行の問い合わせ・報告メールテンプレートは日本語のみで、独立した英語メールテンプレートは存在しない。英語UI用の別メール経路は推測で追加しない。

### 実施結果

- 通常問い合わせの新着・利用者追記・管理者通知再送は、保存済み`contact.id`を共通管理者通知へ渡す。
- 通常問い合わせの利用者受付メールと運営返信・メールだけの再送は、保存済み`contact.id`を件名・text・HTMLへ維持する。
- ゲーム内報告とSDK Portal報告は同じ`deliverUserReportAdminNotification`を通し、保存済み`report.id`を新着・追記・再送へ維持する。
- 報告への運営返信とメールだけの再送も、保存済み`report.id`を件名・text・HTMLへ維持する。
- Telemetry、監査ログ、Redis schema、環境変数、外部設定へ本文、氏名、メールアドレス等の新しい記録を追加していない。

### 検証

- focused support／email testは22/22成功した。保存済みIDの伝播、問い合わせ・報告の管理者通知、問い合わせ受付、問い合わせ返信、報告返信の件名・text・HTML、メール層でのID非生成を確認した。
- 全体lintは成功した。
- 全体testは725/727成功した。基準checkpointの722/724へ新規3件が加算され、失敗2件は同じ既知問題（Node 24のJSON import属性、実装済みSDK Preview招待を否定する旧contract）である。
- 本体production buildはRuntime package build、Next.js TypeScript検査、78ページ生成まで成功した。
- build影響判定は`develop`で`app-games-dev`だけBUILD、`app-games`、`app-games-sdk`、`app-games-sdk-dev`、`app-games-sdk-portal`、`app-games-sdk-preview`、`app-games-preview-dev`はSKIPである。

### 未対応・保留

- 既に届いている通常問い合わせ2件の`contact_...`特定と現物Redis照合は別途継続し、本修正で完了扱いにしない。
- テスト問い合わせと実メール送信は行っていない。dev反映後の実メール確認は別承認後に行う。
- push、PR更新、Deploymentは行っていない。dev反映前に`app-games-dev`／`develop`／development／通知ID表示確認／想定1 Deployment／他Project BUILDなしを改めて報告して許可を待つ。

## 2026-07-31 — T-39 SDK Preview Room招待索引の不要writeを除去

### 利用者からの要望

- 取得不能になった旧ZIP／patchの探索を終え、`develop@f0d42d3bfed5e1a9faa4533befc20cb03e0d183a`の検証済みclean cloneへ、確認済み仕様を満たす新しい最小修正を実装する。
- SDK Preview Room GETの招待索引writeを0回、POST／PATCH成功時の必要な更新を各1回、実際のRoom解散時の削除を1回へ固定し、Room TTLとの整合を保つ。
- 非重要background失敗だけを安全なstructured telemetryへ変換し、Room状態、戦績、replay、SDK result等の重要write失敗は隠さない。
- retry、timeout、Redis接続先・namespace・環境変数、問い合わせ・報告・メールID対応を変更しない。
- raw Redis照合、T-40／T-41／T-42、外部write、commit、push、PR、Deploymentを行わない。

### 実装

- Room成功callbackの招待索引処理を単一helperへ集約した。read、active、list、debug-viewは索引writeなし、createは`SET` 1回、実際に適用されたcommandは`SET` 1回、単一Roomの解散成功は`DEL` 1回である。冪等commandと対象なしの解散はwriteしない。
- 招待索引はRoom本体と同じ`multiplayerRoomExpiryArgs()`を使用する。GETや冪等PATCHで招待索引だけのTTLを延長しない。
- post-response workは既定をcriticalにし、明示したbest-effort処理だけを応答後へ送る。best-effort失敗は内部で回収し、telemetry callbackの失敗もprocess-safeなsinkへ退避する。
- Redis失敗へ、固定enumのwork class、read／write／pipeline、REST／socket、command名、command件数、serialized bytesだけを付与した。Room code、playerId、Redis key/value、URL、tokenはfieldsへ入れない。
- Room／戦績／SDK resultの既存awaitを維持し、replay storeの失敗時`return false`を再throwへ修正した。realtime通知とTahoiyaの非重要なdecoy候補保存だけを明示的best-effortとした。
- 問い合わせ・報告・メールID関連ファイル、write retry、timeout値、接続設定、namespace、環境変数に差分はない。

### ローカル検証

- focused testは43/43成功した。GET系0回、POST 1回、適用済みPATCH 1回、冪等PATCH 0回、解散成功1回、対象なし解散0回をRedis fakeの実command数で確認した。
- 以前起動不能だった範囲に対応するRedis／Runtime系7 test fileは33/33成功し、依存不足は残っていない。
- best-effort Redis失敗はstructured telemetry 1件へ変換され、Unhandled Rejection 0件である。critical Redis writeは1回だけ実行され、telemetry記録後にrejectが呼出元へ伝播する。
- 全体lint、`git diff --check`、本体production buildは成功した。buildはRuntime package、Next.js TypeScript検査、78ページ生成まで完走した。
- 全体testは736/738成功した。失敗2件はclean baselineと同一のNode 24 JSON import attributeと、実装済みSDK Preview招待を否定する旧contractであり、新規失敗はない。

### 未実施

- raw Redis独立照合は、安全なread-only経路がないとの確認済み判断に従い再試行していない。診断API追加・credential取得も行っていない。
- 外部write、push、PR、Deploymentは行っていない。最終監査後、この記録を含むT-39のlocal commit 1件だけを作成してpush前で停止する。したがって15件の原因経路はローカル実装では閉じるが、app-games-devの稼働版は未変更である。

### 最終監査とT-37 build-impact

- `origin/develop`をread-only fetchし、baseとremoteがともに`f0d42d3bfed5e1a9faa4533befc20cb03e0d183a`であることを確認した。merge、rebase、cherry-pickは行っていない。
- 差分はT-39の25ファイルだけで、Migration、料金台帳、Dynamic asset、問い合わせ・報告・メールID実装、環境変数、Redis接続先・namespace、timeout、retryの変更はない。
- Vercelの基準commit実Deploymentをread-only確認した。develop pushでは6 ProjectすべてにGit連携Deployment recordが作られたが、`app-games-dev`だけがplatform差分としてbuild・READYとなり、`app-games`、`app-games-sdk`、`app-games-sdk-dev`、`app-games-sdk-portal`、`app-games-preview-dev`はIgnored Build StepでCANCELEDになった。
- 今回25パスをT-37判定器へ入力した結果も、`app-games-dev/develop`だけが`surface-affected:platform`でbuild、他5 Projectはbranch mismatch、surface unaffected、またはproject disabledでskipとなった。想定buildはdevelopment platformの1件だけである。

## 2026-08-01 — T-60再構築とT-60.1受入監査

### 依頼と開始状態

- workspace自動整理で消失したT-60未commit差分を再構築し、元のT-60.1要件に照らして独立監査するよう依頼された。
- `develop@17c331e18908120b26cab85a2132c987999a924e`をclean checkoutし、`origin/develop`と同一、`origin/main@85e702e7ed3b6acf5e7167d9fb3dcbe3a23c2389`も前回報告から更新なしと確認した。
- 元patchは保存されていないためbyte-for-byte復元ではなく、報告済み契約とT-60.1要件からテスト先行で再構築した。dirty checkoutのreset／stash／rebase、凍結checkoutの操作は行っていない。

### 受入監査で確認した不足

- 旧migration案は緩いarray parse後のnormalizerで不正legacy fieldを黙示修復し得たため、maintenance専用raw validatorが必要だった。
- branch由来environmentをDB自身のmarkerとして扱えず、schema 7には証明可能なDB markerがない。
- stable pointer固有の`source_revision`はschema 7に保存されず、current releaseから推測するとT-58相当の不整合を隠し得る。
- anomaly分類、canonical digestのfield網羅、runner／auditのexact artifact同一性は、個別の分類・field mutation・Git object traceで証明する必要があった。

### 実装判断

- 公開game operationsをv3→v2→v1のGET専用readerへ分離した。legacy fallbackのwrite-backを廃止し、管理PATCHのSETと明示maintenance CLIを別moduleにした。
- migrationはv2／v1のexact field、type、enum、message、updatedAt、duplicate、partial object、unknown field／IDをraw JSON段階で検証する。dry-run既定、applyは固定targetへの`SET ... NX`最大1回で、overwrite、delete、scan、TTL変更を行わない。
- schema snapshotは固定3 SELECTを一つの`REPEATABLE READ READ ONLY` transactionで実行する。DB markerとstable provenanceは`null`＋`unavailable:schema-7`とし、推測で埋めない。
- stable/current/partial/orphan/tombstone/lineage/public ID別multiple currentを独立分類し、返却する監査fieldをcanonical digestへ含め、配列順を正規化した。
- Platform管理GETはfull site-admin cookie token検証後だけPortalへservice HMAC付きrequestを送る。認証chainにsession touch、cookie refresh、last-seen、audit INSERT、Redis touchはない。全応答を`private, no-store`とする。
- exact Runtime契約を`@game-fields/sdk-runtime-artifact`へ集約した。requested lowercase 40hexとresolved commitの一致、exact tree、package全blob、manifest、server／AppSet／root hashをrunnerとauditで共有する。
- Preview grantを`@game-fields/sdk-preview-auth`、内部HMACを`@game-fields/sdk-service-auth`へ分離した。Previewはservice secret非consumerである。
- build gateはPlatform／Portal／Previewの実consumer依存を一般規則で判定し、`app-games-sdk-portal`を正式Portal consumerとした。

### ローカル検証と境界

- focused回帰、Portal／Preview typecheck、Runtime package build、repository verify、lint、`git diff --check`を成功させた。
- production marker 4件、development marker 3件の全7 Project direct fixture buildが成功した。実secret、migration prebuild、live service接続は使用していない。
- repository-wide testの失敗は、未変更の招待route契約testが未変更の既存SDK Preview招待実装を否定する既知baseline矛盾1件だけで、新規失敗はない。root aggregate typecheckの既存test fixture errorも変更surfaceのtypecheckとは分離して記録する。
- live DB／Redis／Blob／private Git artifact、production／development公開pageへ接続していない。Redis external dry-run／apply、Migration、DDL、DML、backfill、commit、push、PR、Deployment、T-48.1再実行は0件である。

### 判定

- ローカルの安全性欠陥は修正し、変更surfaceと全7 Project buildは回帰なし。
- ただしschema 7だけではDB自身のenvironment markerとstable source provenanceを証明できず、禁止されたschema変更や外部照合なしに受入PASSとはできない。
- 最終判定は`T-60 LOCAL IMPLEMENTATION PARTIAL／BLOCKED`。push、Deployment、T-48.1へ自動進行しない。

## 2026-08-01 — T-60.1耐久checkpoint保存と局所受入修正

### checkpoint

- 修正前のactive worktreeは`HEAD 17c331e18908120b26cab85a2132c987999a924e`、tracked変更31、untracked 20、deleted 0、合計51ファイルだった。status fingerprintは`2b39138c29e71f8499247d921a5deff913660e47471e2a894e0374af9e9fe802`、内容fingerprintは`f618c28cae9eb569afc8b9f9a1c95ff7a4dd86c57edfe2938fed3d356410e0b5`である。
- private `koromo2010/app-games-checkpoints`へ、workflowを含まない空treeの`main@cc72519054cfb962c9c3ba073619acd83d2a01a6`と、51ファイルsnapshotの`t-60.1/pre-remediation-17c331e@5a7c9e268e0b77b625d111d5b7a1bc3c26f88d9b`を一度のatomic pushで作成した。snapshot treeは`6ada367b433dac963f3141ff86de890296d5129d`である。
- remote 2 refを再取得し、snapshotの基準差分がM31／A20／D0、51/51 blobが保存時worktreeと一致することを確認した。active HEAD、index、status fingerprint、内容fingerprintはpush前後で不変だった。
- 使用したDeploy keyは`T-60.1 checkpoint temporary`、対象repo限定Read/writeである。秘密値は表示・記録せず、秘密鍵permission 600を維持した。撤去はcheckpoint不要化後の運用作業として残る。
- checkpoint以外の外部writeは0件である。製品`origin`、PR、Actions、Vercel Deployment、DB、Redis、Blob、SDK package Gitへwriteしていない。

### 前回T-60記録の訂正

- 前節の「runnerとauditがexact commit／full package treeを共有」はhot path回帰であり、T-60.1受入ではFAILだった。full commit／recursive tree／全blob／manifest／package root検証はPortal audit専用へ限定した。
- Preview Command runnerは既存の単一file経路を復元し、固定`server.bundle.js`を1回取得してgrantのbundle SHA-256と照合する。apply／presentのcallerからaudit full-tree resolver、commit、tree、blob readerへ到達しない。両経路が共有するのはimmutable locatorとSHA-256等のpure処理だけである。
- 前節で`app-games-sdk-portal`をDeployment consumerとした判定も訂正する。同ProjectはT-59で利用実態が確定するまでproject-disabled／SKIPを維持する。今回のPortal local typecheck／buildはDeployment build gateとは別の検証である。

### 局所修正

- schema snapshotへgame status、current release decision ID、stable manifest SHA-256、current manifest SHA-256と各availabilityを追加した。stable値はstable JSONB、current値はcurrent release JSONBから別々にcanonical計算し、他revision・branch・相手側から補完しない。
- latest decisionは`decided_at DESC, id DESC`で決定的に取得する。stable source provenanceとDB environment markerは引き続き`null`＋`unavailable:schema-7`であり、current releaseやbranchから推測しない。
- 複数game、同一gameの複数lineage、複数stable／current候補をfixture化し、game／release／lineage順を独立に変えてもdigestとanomalyが不変であること、各監査fieldの単独変更でintegrity digestが変わることを確認した。status、decision ID、stable／current manifest hashの不存在と不一致も独立anomalyで検出する。
- snapshot loaderをdependency injection可能な狭いtest seamにし、反復GET相当の各呼出しが`REPEATABLE READ READ ONLY`の固定3 SELECTだけを実行すること、DDL、DML、schema ensure、自動migrationを呼ばないことをquery traceで固定した。
- 公開game operationsの反復readはv3／v2／v1のGETだけで、mutation 0である。maintenance migrationは初回applyの`SET ... NX`最大1回、同一payload再適用write 0、NX race後の同一payloadは成功、別payloadは明示conflict、malformed／dry-run／既存target conflictはmutation 0である。
- 現差分はtracked 30、untracked 20、deleted 0、合計50ファイルである。修正前51件のうち`apps/sdk-preview/lib/preview-source.ts`はfull-tree reader追加を取り消して基準内容へ戻ったためdirty対象から外れた。checkpoint側の51ファイルsnapshotは不変である。

### 最終ローカル検証

- focused regressionは60/60 PASS。Snapshot／digest／migration／admin auth／Runtime caller／build gateを含む。
- `npm run verify`、単独ESLint、`git diff --check`はPASS。
- Portal／Previewの`tsc --noEmit`は各0診断。root aggregate typecheckは既存fixture由来51診断でredだが、現50変更パス由来は0診断である。
- Runtime package buildはPASS。direct Next buildはPlatform main／develop、Portal main／develop／disabled duplicate、Preview main／developの7/7 PASS。実secretとmigration prebuildは使用していない。
- Deployment build gateは`app-games`、`app-games-dev`、`app-games-sdk`、`app-games-sdk-dev`、`app-games-sdk-preview`、`app-games-preview-dev`の6件BUILD、`app-games-sdk-portal`だけproject-disabled／SKIPである。
- repository-wide testは769/770 PASS。失敗1件は未変更の`tests/room-invite-route-contract.test.ts`が未変更の`app/join/[roomCode]/InviteRoomJoiner.tsx`にある既存SDK Preview対応を否定するbaseline矛盾で、両ファイルの基準SHA差分は0である。

### 3層判定と残存依存

1. T-60.1が直接所有する局所差分は`PASS`。
2. T-60 end-to-endは`/games → loadGameDurationEstimates() → ensurePostgresSchema()`の既知write到達を統合するT-61.2／T-65待ち。このworktreeへ重複修正していない。
3. schema 7で証明不能なDB marker／stable provenanceはschema 8待ち。推測値でPASSにしない。

active HEADは基準SHAのままで、active commit、製品`origin` push、PR、Actions、Vercel Deployment、T-48.1、T-58、schema 8、main昇格は0件である。T-60全体をPASSとはせず、外部環境へ進まない。

## 2026-08-01 — T-65 SDK関連差分のローカル統合回帰

### 対象と境界

- `origin/develop@17c331e18908120b26cab85a2132c987999a924e`から専用のclean integration worktreeを作成し、T-61／T-61.1／T-61.2、T-62、T-63、T-64、T-66、T-67のLOCAL PASS差分を意味単位で統合した。
- T-60／T-60.1、T-61、T-62、T-63／T-64、T-66／T-67の各既存worktreeは変更していない。commit、push、PR、Actions、Deployment、Migration、SDK package再保存・再提出、公開環境・live storageへの接続は行っていない。
- 唯一の実コード競合はSDK Portal MCP routeだった。T-62の保存前asset gateとT-67の共有本文validationを手動で併存させ、認証応答の優先順を維持した。未commit差分の全体コピーは行っていない。

### 統合結果

- T-61はトップと`/games`を同じServer Component/read modelへ統合した。local production serverとSDK catalog／Redis fakeによる実HTTPでは、`/`、`/ja`、`/en`、`/games`がすべてSDKゲームを表示した。Redis 13 commandは`GET` 4件と`ZREVRANGE` 9件だけでwriteは0件だった。Postgres公開read経路にDDL／DMLはない。
- T-62は共有package asset validator、保存前gate、auditを統合した。外部private artifactや実Package提出は行わず、fixtureとlocal buildで検証した。
- T-63／T-64はstable IDを保存・URL・action keyに維持したまま、公開catalogから作るrequest-scoped表示metadata snapshotへユーザー向け名称解決を集約した。`sdk:link-lines`はjaで「道つなぎ」、enで「Link Lines」となり、unknown／private／deleted／catalog失敗はraw IDや非公開metadataでなく汎用「SDKゲーム」へ落ちる。
- T-66はouter Room API、Preview runner、browser／iframeを同じopaque traceとrevisionで関連付けるallowlist timing collectorを追加した。DEBUG代理Commandはactorとfinal viewerを保存Room・権限から再検証し、applyCommandと最終viewer向けpresentRoomを同じ後方互換runner batchへ集約した。同一revisionの追加DEBUG viewer GETは0、mutation HTTPは1、runner起動とpresentRoomは各1である。watcherの既取得revisionと遅着旧revisionを無視し、iframeは最終View通知・次frame後にCommandを完了する。
- T-67はsummary 120、details 12,000、page 200、reply 3,000の共有契約を本体、Portal、MCP、AI draft、内部API、Redis保存、管理画面、会話表示、通知メールへ適用した。入力を切って成功させる処理を除去し、12,001文字は保存0件の明示validation errorとした。1,200文字で「同一revisi」まで切れた旧fixture、12,000／12,001境界、冪等retryを回帰testで固定した。既存recordの補完・backfillはしていない。

### ローカル検証

- 統合focused testは116/116成功した。T-61 read-only、T-62 asset gate、T-63／T-64表示metadata、T-66 timing／roundtrip、T-67全文境界を含む。
- 全体testは810/811成功した。T-62統合によりNode 24 JSON import attributeの既知失敗は解消し、残る1件は実装済みSDK Preview招待を否定する旧contractだけである。新規回帰はない。
- root app source、SDK Portal、SDK Previewのtypecheck、全体lint、SDK shell test 8/8、game／SDK／help／migration／boundary gate、`git diff --check`は成功した。`packages/sdk-package-assets`は単独tsconfigを持たないsource-only packageであり、Portal typecheck/buildとfocused testで検査した。
- Platform production buildはTypeScript検査と78ページ生成、SDK Portal buildは15ページ生成、SDK Preview buildは5ページ生成まで成功した。local SDK build内のmigrationは明示的にskipされ、DDL／DMLや外部接続はない。
- `npm run verify`は基準にも存在する環境台帳漏れ`SDK_ACCOUNT_LINK_ALLOWED_ORIGINS`で停止した。独立問題としてT-68を採番し、今回の範囲では修正していない。停止後の各verify gateは個別に成功した。
- 実差分104パスのbuild影響は、`develop`で`app-games-dev`、`app-games-sdk-dev`、`app-games-preview-dev`がBUILDである。main系3 Projectはbranch mismatch、`app-games-sdk-portal`はdisabledでSKIPとなる。

### 未確認・次段階

- 指定された既存revision `e5b9293a5c3c46a892d631d0dfcfa7057c28aaae`のprivate artifactには接続していない。protocol-v1 portable bundle fixtureでpackage format／revision再生成不要の後方互換性を確認した。
- T-66の正式Preview実計測、private Package asset gate、実メール末尾、実Redis／Postgresは外部環境が必要なため未確認である。
- 後続Deploymentが許可された場合の対象は`develop`のdevelopment論理環境で、`app-games-dev`、`app-games-sdk-dev`、`app-games-preview-dev`のProduction target各1件、合計3件を想定する。目的はPlatform Command／表示／support、Portal support／asset gate、Preview runner timingの実機確認であり、他Projectのbuildは想定しない。明示許可までpush・Deploymentへ進まない。

## 2026-08-01 — T-68／T-69局所修正とT-65全体回帰

### 利用者からの要望

- T-65 local checkpoint `40b6d97961f2cb909d55596e819af4155d8e08c4`を凍結し、同commitから新しいdetached worktreeを作ってbaseline問題T-68／T-69だけを局所修正する。
- T-68は`SDK_ACCOUNT_LINK_ALLOWED_ORIGINS`のコード参照と環境台帳を一致させ、外部設定の実績を推測で作らない。
- T-69はSDK Preview対応を禁止する旧assertionを、通常RoomとSDK Preview Roomが共存するpositive contractへ置き換える。正規実装に問題がなければproductionコードを変更しない。
- focused検証後に`npm test`と`npm run verify`を完走させ、commit、push、Actions、Deployment、実環境操作は行わない。

### 判断

- T-68の実体は`app/api/sdk-account-link/route.ts`が参照する非Sensitiveな任意allowlistの台帳漏れだった。外部配置は確認していないため、`app-games`／`app-games-dev`のProductionを「未登録／未確認」と記録し、`config/environment-change-registry.json`は変更しない。
- T-69のproduction実装は、player認証済みの通常Room API 8件を先に探索し、見つからない場合だけ共通`/api/room-invites/` resolverからSDK Previewの固定revisionを解決し、取得したRoom revisionを`expectedRevision`として`room/join`へ渡す正規contractを既に満たしていた。このためproductionコードは変更せず、旧否定assertionだけをpositive assertionへ是正する。

### 実施結果

- `docs/ENVIRONMENT_VARIABLES.md`へ`SDK_ACCOUNT_LINK_ALLOWED_ORIGINS`の対象surface、Sensitive区分、未確認状態、空白／カンマ区切りのHTTPS origin契約、未設定時のコード既定origin利用を追加した。秘密値や実origin一覧は取得・記録していない。
- `tests/room-invite-route-contract.test.ts`は、通常Room API一覧、player認証、`PATCH`／`join-room`、SDK Preview resolver、通常探索が先であること、`room/join`、`expectedRevision`、固定revision endpointをpositive assertionで検査する。
- `tests/room-invite-sdk-preview-contract.test.ts`とproductionコードは変更していない。

### 検証

- 変更前は`npm run check:env-ledger`が`SDK_ACCOUNT_LINK_ALLOWED_ORIGINS` 1件だけで失敗し、招待contract 7件は旧generic test 1件だけ失敗、SDK Preview正規contractとinvite-index 6件は成功した。
- 修正後のfocused検証は7/7、環境台帳検査はコード参照60キー／変更依頼16件を網羅して成功した。
- 全体testは811/811成功した。T-65で残っていた旧SDK Preview招待contract失敗は解消し、新規失敗はない。
- `npm run verify`はversion、環境台帳、9ゲーム基準、SDK境界、SDK Help、7 migrations、SDK Shell 8/8、全体lintを含めて成功した。
- 差分は環境台帳文書、招待contract test、この開発ログだけで、productionコード、設定、package、依存関係に変更はない。Platform／SDK Portal／SDK Previewのproduction buildは再実行せず、T-65 checkpointで成功済みの3 surface buildを維持扱いとした。`npm test`内のRuntime package buildは成功した。

### 未対応・保留

- 外部Vercel変数の現在配置、実callback origin、実Room招待、正式Preview、live DB／Redis／Blobは確認していない。外部環境変数の登録・変更・削除も行っていない。
- commit、stage、branch作成、push、PR、Actions、Deploymentは行っていない。local checkpoint更新は別の明示許可を待つ。

## 2026-08-01 — T-74 SDK／公開read checkpointのローカル統合完了

### 利用者からの要望

- T-71を第一親、T-60.1を第二親として、T-65系SDK成果と公開read境界を隔離branchへ統合する。競合と追加修正は明示許可された範囲だけに限定し、全local gateがPASSした場合だけmerge commitと4文書finalizationの計2 commitを作る。
- push、PR、Actions、Deployment、production反映、DB／Redis／Blobその他のexternal writeは行わない。T-73Bの最終波及確認が終わるまで固定starter refを保持する。

### 統合と局所修正

- 正規checkpointはT-60.1 `dda0313273f7231232a8acae0a94fffd54f2b9a4`、T-65 `40b6d97961f2cb909d55596e819af4155d8e08c4`、T-71 `139f4ae8368a7646f70a18352b5f9db9f8adbf70`である。
- partial cloneのlocal fetchは固定tree内12 blob不足で停止した。許可された12 blob限定hydrateは成功したが、再fetchがtree外の到達履歴objectで停止したため再試行せず、canonical originから固定commit `4568d668c2e9542e89ddb058633d67b757f4e807`だけを1回direct fetchした。固定treeは`12d8c86d82ed8711bf21a12e3669ac1954f90706`、starter manifest SHA-256は`1cb62054b21519570aefcbfadfc0414ebb5a8da594fb0badc85bc0b26cdf11ae`、missing objectは0である。
- SDK Preview routeのTypeScript narrowingは、grant hashの存在確認直後にimmutable localへ固定し、async callbackへ渡した。変更は`apps/sdk-preview/app/server/[instanceId]/[gameId]/[revision]/route.ts`の2行だけで、non-null assertion、cast、grant型、validator、認証条件、エラー応答、test、lockfile、別sourceは変更していない。
- merge commitは`25b27cc096bd30b2176ba53209bf607b105cac41`、親はT-71、T-60.1の順、treeは`8661072b6610600fb084ac06d7fd33f419496c6f`。`develop@17c331e18908120b26cab85a2132c987999a924e`比は139パス、M97／A42／D0である。

### 検証

- focused 2 test fileは5/5、環境台帳は60 code key／16 change request、SDK境界、7 migrations、SDK Shell 8/8がPASSした。
- Runtime packages build、SDK package外部fixture、starterの入口・snapshot・ZIP・同梱SDK・型検査・契約test・1ゲーム完走・提出ZIPがPASSした。`npm test`は835/835、`npm run verify`はPlatform v0.1.1、DownloadMe v17、SDK contract v2、9ゲーム、SDK Help 6件、ESLintを含めPASSした。
- SDK Preview buildはTypeScriptと5ページ、Platform buildはTypeScriptと78ページ、SDK Portal buildはTypeScriptと15ページを生成してPASSした。Preview buildは局所修正直後の1回だけで重複実行していない。
- Portal migrationは`local/local`としてskipし、DB接続・DDL・DMLは0。Main Promotion同期5対象は`would-change=0`、Vercel build-impactは通常6 Projectを各surface affected、重複`app-games-sdk-portal`だけを`project-disabled`でSKIPと判定した。
- candidate treeは修正前`cb8e906c250e30cdbb2a7e97dcf4b6fd24981af4`から対象routeだけが変わり、修正後`8661072b6610600fb084ac06d7fd33f419496c6f`で2回一致した。139パス・M97／A42／D0、path union fingerprint `9de99b21b1bbb88457f4ab3f44db800b1ddb1dc9d647075268a9fd9e4b9c51ff`、status fingerprint `29e0d655d630b032ade883d108dcd388b85ddd201c2ee6b77e9d7344abf4718b`をcommit直前まで維持した。

### 関連コミット

- `25b27cc096bd30b2176ba53209bf607b105cac41` — `merge: integrate SDK and public-read checkpoints`

### 未対応・保留

- 判定は`T-74 LOCAL INTEGRATION COMPLETE／139-FILE TREE FIXED／T-73B FINAL RECHECK PENDING／PUSH PENDING`。T-73B完了まで固定local refを保持する。
- push、PR、Actions、Deployment、production反映、実環境確認、外部環境writeは未実施である。T-73Bの最終波及確認と、その後の個別許可を待つ。

## 2026-08-01 — T-76B T-62 package asset gateのsemantic reimplementation

### 回収境界

- T-76A recovery baseは`324efcdd5619062b64f091a0b3d8419b1197957a`（tree `5f3e3280a517953f12e89edb322d334c4e38bb15`）である。T-62由来25パスを、このbase上へexact recoveryではなく残存contract・consumer・test意図に基づくsemantic reimplementationとして新規実装した。
- code checkpointは`4547e2d125c660f9fd86943dd68941cfcf5e0abc`（tree `2b6c4d716fc72e369ffba746141734db63a906e7`）。差分は指定25パスだけのM17／A8／D0で、package-lock、exact回収済み6パス、後続overlay 4パスは変更していない。
- 残るoverlayは`apps/sdk-preview/app/server/[instanceId]/[gameId]/[revision]/route.ts`、`scripts/check-game-sdk-package.mjs`、`tests/game-visibility-source.test.ts`、`tests/room-invite-route-contract.test.ts`で、T-76Cまで凍結する。

### 実装と検証

- `@game-fields/sdk-package-assets`をpure deterministic validatorとして追加し、HTML、CSS、JavaScript／TypeScriptの静的参照、`src`／`href`／`poster`／`srcset`、CSS `url()`／`@import`、static／dynamic import、template literal、文字列連結、const／変数参照を解析する。parse errorと静的解決不能なasset候補はfail closedとした。
- `saveValidatedGamePackage`へREST、MCP、creator save、低水準Git save、developmentからmainへのartifact transferを集約した。asset拒否時はschema、DB、Git、Blob、Redis、audit、submission、publication、promotion、stable pointerを呼ばないfixtureを固定した。local CLIは指定された単一packageだけを同じvalidatorで監査する。
- focused regressionは54/54 PASS。`npm run check:sdk`、Portal／Preview typecheck、`npm run verify`、`npm run lint`、Runtime packages build、Platform／Portal／Previewのoffline build、`git diff --check`はPASSした。Portal migrationは`local/local`でskipし、DB接続は0である。
- root typecheckは53診断で非0だが、25対象pathの診断は0で、T-76A baseの既存診断から増えていない。全体testは816/822 PASS。残る6件はrecovery base／凍結overlay／隔離bundleのremote ref不足に由来し、25-path focused regressionではない。`test:sdk-package`は凍結中のcheckerがmodule profile 38を期待し、現contract 39との不一致で停止した。

### 外部境界

- private GitHub checkpoint mirrorは未作成であり、remote pushは試行していない。product repository、checkpoint repository、PR、Actions、Vercel、DB、Redis、Blob、OAuthへのwriteはすべて0である。

## 2026-08-01 — T-76C final four-path overlayのsemantic restoration

### 回収境界

- T-76Bはbaseline比較監査によりscoped passと確定した。T-76Cでは開始HEAD `3f19471877a84af0e09d6afce5084f12fea3748d`上の凍結4パスだけを、lost T-74 treeのexact recoveryではなく現行consumer、test、handoff、thread logを正本とするsemantic restorationとして更新した。
- code checkpointは`b72bfe1e69d2558ace2358cc3168d0067a2a355c`（tree `948809dff0af12323e3b8440f4bbc4302ea6082f`）。親との差分は指定4パスだけのM4／A0／D0で、baseline比は139パス、M97／A42／D0である。T-76B 25パス、T-76A非ログ109パス、`package-lock.json`は変更していない。

### 復元内容と検証

- SDK Preview routeは固定revisionの`server.bundle.js`を1回だけ取得し、grantのimmutableな`bundleSha256` localと取得bytesのSHA-256を照合する。legacy protocol-v1は`runGameSdkPortableServer`、`game-fields-command-batch-v1`は`runGameSdkPortableCommandBatch`へ渡し、共有timing collectorでbundle取得、hash、QuickJS、apply、presentのallowlist timingを保持する。full-tree resolver、recursive tree、package全blob取得、二重fetch、service HMAC secretは導入していない。
- SDK package checkerの唯一の旧profile固定値を38から正規contractの39へ更新した。visibility contract testは`GameLobbyRoute`、共有loader、`assembleGameLobbyPageData`、完全なgame集合を使うadmin read／save、正規`GameOperationDefinition[]`へ追従した。Room invite contract testは通常Room探索を先に維持し、共通resolver、固定revision、`expectedRevision`、SDK Preview `room/join`、成功後の`router.replace`をpositive contractとして固定した。productionのvisibility／invite実装は変更していない。
- focused regressionは29/29、SDK package外部tarball検査、SDK Preview typecheck／build、Portal typecheck／build、Platform offline build、Runtime packages build、`check:sdk`、`verify`、`lint`、`git diff --check`がPASSした。全体testは819/822、5-file比較は6 PASS／3 FAILで、T-76B比のB-PASS／C-FAILは0である。

### 残件と外部境界

- 残る3件はT-76A recovery baseの旧catalog inline GET assertion、SDK Preview側`createPreviewRuntimeArtifactReader` export不足、隔離bundleに`origin/sdk-starter-dev`／期待objectがないtest environment条件である。今回修正せず、T-76Dの指示まで凍結する。
- product／checkpoint remote push、PR、Actions、Vercel、DB、Redis、Blob、OAuth、live Package接続を含むexternal writeはすべて0である。

## 2026-08-01 — T-76D final T-60.1 remediationとstarter fixture復元

### 回収境界

- T-76Cはscoped passであり、最終HEAD `0f416bd44a445f895c508a1d2e0118ef6efce0b6`（tree `dd5d89b2bc2a5297cd18b2f7647209a3a33ebe33`）を固定開始点とした。pre-remediationのPreview full-tree reader要求は最終single-bundle runner契約と矛盾する旧test由来であり、authoritativeな復元元から除外した。
- code checkpointは`62afe308a08b83cf25ec5556fa486144444fa91c`。親との差分はschema snapshotと指定3 testのM4／A0／D0だけで、baseline比は引き続き139パス、M97／A42／D0である。Preview source／route、T-76B 25パス、T-76C 4パス、`package-lock.json`は変更していない。

### Semantic restoration

- Schema audit snapshotはschema version 7だけを受理し、単一のread-only／RepeatableRead transaction内のexactly 3 SELECTでgame、stable／candidate、current release、latest decisionを取得する。既存canonical manifest SHA-256 helperを再利用し、availability、status、tombstone、duplicate、orphan、partial／absent、decision／revision／manifest mismatchを決定的digestへ含めた。旧`package`／`decision` fieldを保持しつつ`candidate`／`latestDecision`を追加し、SQL executorとclockのdependency seamおよびquery／transaction fail-closedを固定した。
- Audit testは14/14へ復元し、full-tree resolverをPortal audit専用とした。Preview source／routeがreaderをexport／importしないnegative boundary、固定revisionの`server.bundle.js`単一取得、grant hash照合、legacy／batch runner、共有timingを確認する。Game-operation migrationは7/7で同一payloadの再applyとNX raceのidempotency、異payloadの明示conflict、破壊的write 0を確認した。Catalog testは分離後の`game-operations-read.ts`がv3／v2／v1をGET-onlyで読む現行構造へ追従した。

### Starter fixtureと検証

- canonical `refs/heads/sdk-starter-dev`がexact commit `4568d668c2e9542e89ddb058633d67b757f4e807`を指すことをread-onlyで確認し、そのcommitだけをone-shot fetchした。treeは`12d8c86d82ed8711bf21a12e3669ac1954f90706`、starter manifest SHA-256は`1cb62054b21519570aefcbfadfc0414ebb5a8da594fb0badc85bc0b26cdf11ae`、DownloadMe contractは17、contract versionは2である。local `refs/remotes/origin/sdk-starter-dev`を固定後、remote URLは再び無効化した。
- Focusedはaudit 14/14、migration 7/7、catalog 3/3、T-76C 29/29。保存済みT-60の同一7-file集合は後続追加1 entryを保持して61/61である。`npm test`は836/836で、T-76Cの822からaudit file-level import failure 1件が消え14 blockが復元され、migration 1 blockが追加されたため差引+14である。SDK package 39 profile、starter、SDK checker、7 migrations、verify、lint、Runtime packages、Portal／Preview typecheck、Platform／Portal／Preview offline buildはPASSした。root typecheckは既存40診断から増分0で、現行実数39、指定4パス由来0である。

### 外部境界

- canonical starterのremote readは1、product／external writeは0である。push、tag、PR、Actions、Vercel、DB、Redis、Blob、OAuthその他のdata-service writeは実施していない。

## 2026-08-02 — DownloadMeのproduction／development命名とSemVerを分離

### 利用者からの要望

- production用プラグインを`game-fields`、development用を`dev-game-fields`とし、developmentのDownloadMeはファイル名だけでも環境を判別できるようにする。
- `ver17`のようなDownloadMe専用counterを廃止し、今後はPlatform本体と同じ`0.2.0`等のSemVerを使う。
- production URLを宣言したDownloadMeがdevelopmentプラグインを選んで`ENVIRONMENT_MISMATCH`になる不整合を、個別ファイルの置換ではなく共通経路で修正する。

### 原因と実装

- `config/platform-release.json`へ版情報とdevelopment専用のchannel／Starter refを混在させ、DownloadMe template、Portal UI、MCP initializeにも`gameapp-dev`を直接記述していた。build時にenvironmentとPortal URLだけを切り替えたため、production成果にもdevelopmentプラグインが残った。
- 版の正本を`config/platform-release.json`、環境別名称の正本を`config/sdk-release-profiles.json`へ分離した。productionは`game-fields`／`GameFieldsDownloadMe-ver0.1.1.md`／`sdk-starter`、developmentは`dev-game-fields`／`GameFieldsDownloadMe-dev-ver0.1.1.md`／`sdk-starter-dev`である。
- `@game-fields/sdk-release-profiles`を追加し、DownloadMe生成、Portal表示・metadata、MCP initialize、handshake、Portal／Room URL、Starter manifestが同じresolverを使うようにした。DownloadMe版は`platformVersion`を直接使い、将来版`0.2.0`も追加counterなしで両環境のファイル名へ反映する。
- 明示channel、canonical Portal origin、Git branchの判定が未知または競合する場合はdevelopmentへfallbackせず停止する。旧整数版と反対環境のSemVer版URLは、そのDeploymentの現行DownloadMeへtemporary redirectする。
- 旧`ver17`だけを書き換えて`develop`へ直接pushできた一回限りのalignment workflow／scriptを削除した。release profile packageだけの変更でもPortal Deploymentが起動するようbuild-impact判定を追加した。

### 検証

- production／developmentのDownloadMeを実生成し、UTF-8 BOM、SemVer、environment、plugin、Portal、Starter ref、反対環境値0件を確認した。production route manifestでは旧`GameFieldsDownloadMe-ver17.md`とdevelopment版SemVer URLが現行production版へredirectされる。
- release／DownloadMe focused regressionは14/14、build-impact regressionは11/11、Starterの入口・snapshot・ZIP展開・同梱SDK install・型検査・契約test・1ゲーム完走・提出ZIPはPASSした。
- SDK Portalはdevelopment／productionの両profileでTypeScriptと15ページbuildがPASSした。migrationはそれぞれ`local/develop`、`local/main`としてskipされ、DB接続・DDL・DMLは0である。
- repository-wide test、`npm run verify`、ESLint、Runtime packages、PlatformのTypeScriptと78ページbuildはPASSした。

### 外部境界

- ローカルbranch `fix/downloadme-environment-profiles`だけを変更した。commit、push、PR、Actions、Vercel Deployment、DB／Redis／Blob write、ChatGPT側プラグインの登録・名称変更は実施していない。
- 配備前にChatGPT側でproduction `game-fields`、development `dev-game-fields`を実在させ、各canonical MCP endpointへ接続する必要がある。旧DownloadMeは履歴として保持し、削除・上書きしていない。

## 2026-08-02 — SDK初回導入Intake #1／#2のクリティカルブロッカー修正

### 利用者からの要望

- SDK導入を実際に進め、詰まった点をIntakeへ順番に記録する方針だったが、`game-fields`がプラグイン検索へ出ないIntake #1と、制作者URL予約が`SDK_INSTANCE_REGISTRY_NOT_CONFIGURED`で完全停止するIntake #2はクリティカルとして先行修正する。
- push、Vercel Deployment、Redeployは個別許可まで行わず、ローカル実装・検証と必要なProduction変数の保存だけをまとめる。

### 判断

- 初回利用者には既存プラグインの「更新」だけでなく、Developer mode、新規プラグイン名、環境別canonical MCP URL、`接続 → OAuth認証 → 更新`を一続きで案内する。
- 予約処理とhealthで同じinstance registry REST clientを使う。healthは書込みを行わない`PING`だけとし、資格未設定と接続不能を別codeでfail closedにする。
- Redis資格は変数名のfamilyごとにURL／Tokenを一組で解決し、`SDK_REDIS_REST_*`、`KV_REST_API_*`、`UPSTASH_REDIS_REST_*`の異なるfamilyを混ぜない。fetch例外、非2xx、不正JSONは秘密を含まない`SDK_INSTANCE_REGISTRY_UNAVAILABLE`へ正規化する。
- Platform／DownloadMe／SDK packageの版は同じSemVerを使い、今回の候補を`0.1.2`とする。productionは`game-fields`、developmentは`dev-game-fields`を維持する。

### 実施結果

- `START_GAME_FIELDS.md`へ、production／development profileから生成する新規プラグイン作成案内を追加した。
- SDK Portalの`/api/health`へ3秒上限のinstance registry probeを追加し、通常の予約・確定処理も同じclientへ集約した。MCP tool errorも未設定／一時接続不能を利用者向けの固定文へ変換する。
- Vercel `app-games-sdk`のProductionへ、既存`sdk-dev-redis`の`UPSTASH_REDIS_REST_URL`と`UPSTASH_REDIS_REST_TOKEN`をSensitiveで登録した。値は記録していない。`app-games-sdk-preview`、本体、dev本体には追加していない。新Deploymentは作成していない。
- 当初案内した`SDK_REDIS_REST_URL`／`TOKEN`は実登録名ではなかったため、環境変更registryの旧依頼を取消し、実際の`UPSTASH_*`2件を`registered`として記録した。

### 検証

- focused regression 18/18 PASS。`UPSTASH_*`実登録名、資格family不混在、未設定、network例外、不正応答、healthのread-only `PING`、production／development別の新規プラグイン案内を確認した。
- `npm run lint` PASS、`npm test` 847/847 PASS、`npm run build` PASS（Platform 78ページ）。
- SDK Portalは`local/main`と`local/develop`でmigrationをskipしDB接続・DDL・DML 0のまま、両profileとも15ページbuild PASS。SDK Previewもmain／developの両profileで5ページbuild PASS。
- `npm run verify`、`npm run test:sdk-package`、development／production両profileの`npm run test:sdk-starter`、`git diff --check` PASS。旧`0.1.1`を直書きしていたSDK境界・外部tarball・Starter提出物の検査は、版の正本から`0.1.2`を読むよう共通化した。

### 未対応・保留

- detached HEAD上のローカル差分であり、commit、push、PR、Actions、Vercel Deployment／Redeploy、dev／production実機確認は未実施。
- 次の外部反映前に対象Project、branch、環境、想定Deployment数と他Projectへの波及を確定し、明示許可を得る。配備後は`app-games-sdk`の`/api/health`で現行schemaと`instanceRegistry.status: ok`／`namespace: production`を確認し、その後に同じ制作者アカウントからURL名`krm`の予約を再試行する。

## 2026-08-02 — Intake #1／#2 dev反映と本体SemVer不一致の停止

### 実施結果

- `develop`を`a8885d370e2047ad9f5daba8cf1655e411584e98`から`7a68b52c48b4bd949d7a39ace07c5345a5867ccd`へforceなしで更新した。treeは公開前のローカル計算とGitHub生成で`5054b68c4c609b39eeb5c2bb5033917bb9cea6de`に一致した。
- Vercelは`app-games-dev`、`app-games-sdk-dev`、`app-games-preview-dev`が同commitで`READY`となった。`app-games`、`app-games-sdk`、`app-games-sdk-preview`、重複`app-games-sdk-portal`はすべてIgnored Build Stepで`CANCELED`となり、対象外Projectのbuild／配備は0件だった。手動Redeployは行っていない。
- `https://sdk-dev.game-fields.com/api/health`はschema 7、`instanceRegistry.status: ok`、`namespace: development`を返した。`GameFieldsDownloadMe-dev-ver0.1.2.md`にも新規プラグイン作成、canonical MCP URL、接続、OAuth、更新の案内が生成された。

### 不整合と判断

- 実配備ページでDownloadMeと本文が`0.1.2`、`config/app-release.json`を読むfooterが本体版`0.2.0`となり、利用者要望の「本体と同じ版」に反することを確認した。従来のversion検査はSDK内の一致だけを見て、本体SemVerとの一致を検査していなかった。
- 誤版`0.1.2`の`sdk-starter-dev`は公開せず停止した。`config/app-release.json@0.2.0`を版の上位正本として、Platform、DownloadMe、SDK package、Runtime、Portal、Previewを`0.2.0`へ揃え、本体との不一致を`check:versions`で拒否する局所修正へ切り替えた。

### `0.2.0`補正のローカル検証

- `npm run verify`、repository-wide test 847/847、`git diff --check`がPASSした。本体SemVerとPlatform版の不一致を拒否する回帰検査を追加した。
- `npm run test:sdk-package`は`game-fields-game-sdk-0.2.0.tgz`を外部fixtureへinstallし、公開exportと必須module profileを確認してPASSした。
- development／production両profileの`npm run test:sdk-starter`は、入口、公開Git用snapshot、ZIP展開、同梱SDK install、型検査、契約test、1ゲーム完走、提出ZIPまでPASSした。生成物は外部公開していない。
- Platform 78ページ、SDK Portal 15ページ、SDK Preview 5ページの`0.2.0` production buildがPASSした。追加push、Deployment、Redeployは行っていない。

### 未対応・保留

- `0.2.0`修正はローカル検証後、追加の`develop` pushとdev 3 Projectの新Deploymentが必要になる。2026-08-02に利用者から、補正commit 1回の`develop` push、`app-games-dev`／`app-games-sdk-dev`／`app-games-preview-dev`の自動Deployment、実機確認後の`sdk-starter-dev@0.2.0`更新について明示許可を得た。本項を含む補正commitを反映対象とする。
- `main`、production、npm公開、`sdk-starter`、手動Redeploy、PRは対象外のまま維持する。`sdk-starter-dev`は正しい`0.2.0` dev Deploymentとhandshake確認後にだけ更新する。
## 2026-08-02 — Intake #1／#2をmain・productionへ昇格

### 利用者からの要望

- devで確認済みのSDK初回導入Intake #1／#2とPlatform 0.2.0を、同じ実装のままmain・production・安定版Starterへ反映する。
- 無関係なVercel Projectを配備せず、npm公開は今回の対象外とする。

### 判断

- 旧mainの昇格履歴を失わないよう、developの検証済みtreeを第一親、旧mainを第二親とするmerge commitへmain／developを揃える。force pushは使わない。
- production対象は`app-games`、`app-games-sdk`、`app-games-sdk-preview`の3 Projectだけとし、dev 3 Projectと重複`app-games-sdk-portal`はIgnored Buildで停止する。
- 安定版Starterは共通release設定からproduction profileを生成し、`game-fields`、`GameFieldsDownloadMe-ver0.2.0.md`、`sdk-starter`を手編集せず固定する。

### 実施結果

- main／developをmerge commit `14eb253776ea2bcb8b8b55dcd3a36335788fb940`、tree `4b1da20ebec5fd7a5690468c71229ae9ec1cbd18`へforceなしで統一した。
- production Deploymentは`app-games` `dpl_4EjEua6CgAY3MeDPyYVHWpNWAkUk`、`app-games-sdk` `dpl_3S6SxxDQSBsYwFQsxzAuaCe13dpA`、`app-games-sdk-preview` `dpl_A1rVdSCBpxMrBgb2F8nzqqgNkF1T`で、3件ともREADY。main更新波のdev 3件と重複PortalはCANCELEDだった。
- 履歴統合のdevelop更新では内容差分0だったが、`app-games-dev`だけが`diff-unavailable`として保守的に1回buildされ、`dpl_5j3is8hKBPRn3qk4hx8u6Her2ruG`が同一treeでREADY。他6件はCANCELEDだった。
- `UPSTASH_REDIS_REST_URL`／`UPSTASH_REDIS_REST_TOKEN`は`app-games-sdk` Productionで再デプロイされ、`/api/health`がschema 7、instance registry `ok`、namespace `production`を返した。秘密値は記録していない。
- 安定版`sdk-starter`を`af05b9cb2b3997647cbdd5edbf400830c53db607`、tree `0a4873f040d8b2faf81847546564026eec91b1dc`へforceなしで更新した。Starter branch由来のVercel 7件はすべてCANCELEDだった。

### 検証

- `npm run check:versions`、lint、全847 test、production profileのStarter外部install・契約検査・完走デモ・repository snapshot生成がPASSした。
- 本番Portalは`GameFieldsDownloadMe-ver0.2.0.md`、`game-fields`、本番MCP URL、`sdk-starter`、新規プラグイン作成から接続・OAuth・更新までの案内を返した。
- production 3 Deploymentのerror／fatal Runtime Logは0件。安定版Starterをbranchから再取得し、manifestと同梱SDK tarballのGit blobが生成物と一致した。

### 関連コミット

- `14eb253` — SDK onboarding fixes and Platform 0.2.0 production promotion
- `af05b9c` — production SDK starter 0.2.0

### 未対応・保留

- 同じ制作者アカウントからURL名`krm`の予約を再試行し、Intake #2の利用者導線を完走確認する。
- npmの`@game-fields/game-sdk@0.2.0`公開は今回実施していない。

## 2026-08-02 — SDK公開リンク404とAI不具合報告503のcritical対応

### 利用者からの要望

- SDK制作者URLとAIが返したゲームURLが404になり、同じ会話からの不具合報告下書きも
  `support_draft_unavailable`で作成できないため、最優先で原因特定・修正・dev確認・本番反映を行う。
- devで確認後に同じtreeをmainへ昇格し、VercelはPlatformとSDK Portalだけを配備する。
  Preview、npm、Starter、DB schema、第三者ゲスト参加機能は変更しない。

### 原因と判断

- `publish_mock`のMCP／REST両経路が、保存したMockに対して正式Package用の
  `/{slug}/games/{gameId}`を返していた。実在routeは`/{slug}/mock/{gameId}`である。
- 制作者slugは実在しても、ブラウザの接続アカウントが所有者と一致しない場合に
  `notFound()`となり、利用者が再接続できなかった。存在しないslugの404とは分離する。
- 不具合報告一覧の読取は成功し、下書きのRedis `SET ... NX`だけが503だった。
  catchが原因分類を残さないため、Production資格の未設定・認証拒否・接続失敗を区別できなかった。

### ローカル実装と検証

- Mock URLと制作者再接続URLを共通生成し、MCP／REST両経路で同じ契約を使う。
  所有者不一致は対象slugへ戻る再接続画面とし、所有権やゲスト権限は変更しない。
- AI不具合報告下書きの保存失敗は、秘密と本文を除外した既存Redis observability項目だけを
  `support.draft`失敗Telemetryへ記録する。
- focused 18/18、lint、repository-wide 849/849、Platform 78ページ、SDK Portal 15ページ、
  SDK Preview 5ページのbuildがPASSした。SDK migrationは`local/local`としてskipされ、
  DB接続・DDL・DMLは0だった。

### 外部反映

- 利用者から`develop` push、devの`app-games-dev`／`app-games-sdk-dev`配備、
  `app-games` Production Redis資格の必要時修正、同一treeの`main`昇格、
  productionの`app-games`／`app-games-sdk`配備と実機下書き確認まで許可を得た。
- GitHub連携でcommit `31780b9feb785e396439554786786124ea4f3b20`、tree
  `c9f95ce36f81c645c25715ebcc8fd48f2312fe45`を作成し、`develop`へforceなしで更新した。
  devは`app-games-dev` `dpl_5GNkNM77zgdtyYfH6k5RmAp5DcUE`と`app-games-sdk-dev`
  `dpl_BncpfcFBR1h5XsRFD9NiNfP2S4gE`がREADY、対象外5 ProjectはCANCELEDとなった。
- dev healthはschema 7、instance registry `ok`、namespace `development`を返した。
  `/krm`は404ではなく`/api/account-link/start?returnTo=%2Fkrm`へ307となり、
  `dev-game-fields`の確認用draftは`submitted:false`と承認URLを返した。運営へ送信していない。
- devで確認した同じcommitへ`main`をforceなしでfast-forwardした。productionは`app-games`
  `dpl_7Ly2XV9YLuVf1oMaLTMuCD34s3qc`と`app-games-sdk`
  `dpl_F2po85AgncPCWEBi8ngSfaRt6fpS`がREADY、対象外5 ProjectはCANCELEDとなった。
- production healthはschema 7、instance registry `ok`、namespace `production`を返した。
  `/krm`はアカウント再接続へ307、実在する`/krm/mock/corners`は200、旧
  `/krm/games/corners`も無言404ではなく再接続へ307となった。
- `game-fields`の確認用draftも`submitted:false`と承認URLを返したため、`app-games`
  ProductionのRedisは書込み可能と確定し、環境変数変更は0件とした。dev／productionの
  確認用draftはいずれも送信せず、7日TTLで失効する。
- dev／productionの対象4 Deploymentでerror／fatal Runtime Logは0件だった。
  Preview、npm、Starter、DB schema、第三者ゲスト参加機能は変更していない。

## 2026-08-04 — T-89/T-90 localized Preview navigation root fix

### 利用者からの要望

- T-90で確認された、locale prefix付きPreview URLからPortalへ現在状態を通知できない問題を、
  統合済みT-26／T-89／T-90 treeから根本修正する。
- T-89の正式runtime計測は別途dev反映が必要なため、local contract readinessとformal measurementを
  混同しない。

### 判断

- Preview navigation parserは、既存`lib/app-locale.ts`の正規locale定義を参照し、
  `/sdk-preview/...`、`/ja/sdk-preview/...`、`/en/sdk-preview/...`だけを受理する。
- unsupported locale、creator／game／revision不正、壊れたURL encodingはfail closedにする。
  Portalのorigin／event.source検証、postMessage target origin、history制御、T-89 timing意味論は変更しない。

### 実施結果

- `lib/sdk-preview-navigation-contract.ts`の共通parserへlocale-aware path contractを追加した。
- localized creator／game detail、revision保持、invalid locale／stateのbehavior testを追加した。
- T-89計測コードは変更せず、T-90 root fixと直接関連する2ファイル、および本ログだけをcheckpoint対象とした。

### 検証

- localized navigation／T-89 timing・correlation／T-26 fixed-scope focused suite: 64/64 PASS
- repository-wide `npm test`: 884/884 PASS
- lint、TypeScript noEmit、Platform／SDK Portal／SDK Preview build: PASS
- product push、Vercel Deployment、main／production、normal Room、DB／Redis／Blob／OAuth write: 0
- T-89 formal Preview measurement、T-90 real browser verification: dev反映待ち

### 関連コミット

- 本項目を含むT-89/T-90 local checkpoint commit — localized Preview navigation contract root fix

### 未対応・保留

- dev push／Deploymentのpreflightと、正式PreviewでのT-89 timing計測およびT-90 browser Back／Forward確認は、
  別途明示許可後に実施する。
