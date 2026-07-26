Warning: truncated output (original token count: 85678)
Total output lines: 4596

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

- `c7488c0` — `d…35678 tokens truncated…示は本体プレイヤー認証の証明ではない。

### 検証

- 最新dev画面で1人の部屋作成、ゲーム開始、隔離iframe読込、3難易度表示をブラウザ確認した。
- 匿名状態でWord DB候補や固定秘密語が返らず、再取得可能な認証エラーになることを確認した。

### 未対応・保留

- 実Word DBから返る`surface / reading / difficulty / tags`の最終E2Eは、本体へ実際にログインした同一ブラウザセッションで再取得する必要がある。
- Preview外枠の「認証済みセッション」固定表示は実際の本体認証状態と誤認し得るため、実セッション連動または確認用identityであることが分かる表示への変更を別途検討する。

## 2026-07-24 — SDK共通設定画面のゲーム別宣言

### 利用者からの要望

- SDK共通設定画面の「最大人数」「ラウンド数」「制限時間」を固定3項目にせず、ゲームによって存在しない項目を表示しない。
- `online-room`で必須にする設定は制限時間だけとする。
- 制限時間の初期値と選択肢もPlatform固定にせず、ゲーム側から変更できるようにする。

### 判断

- ゲームpackageの`settings`宣言を共通設定画面の唯一の表示元とし、Platform Shellは宣言されていない最大人数・ラウンド数・難易度・モード等を追加しない。
- `online-room`では`platformRole: "time-limit"`を持つ設定を正確に1項目要求する。`defaultValue`、`options`、任意の選択肢表示名をゲーム側の正本とし、0秒を含めた場合だけ制限なしを選べるようにする。
- `platformRole: "maximum-players"`と`"round-count"`は、共通Shellの人数上限またはラウンド進行にも意味を渡したいゲームだけが任意宣言する。
- 新規モックは`mock/preview.json`へ設定宣言を必須保存する。保存済み旧モックは閲覧不能にしないため、従来の60秒候補だけを互換補完する。
- Previewの選択値は外側Shellから`GameFieldsPreset.state.settings`へ同期し、ゲーム固有iframeは値を参照するだけとする。本実装は同じmanifest宣言、`defaultSettings`、AppSetの`settings`引数を使う。

### 実施結果

- 公開SDKへ設定値、選択肢表示名、Platform role、初期値、単位、補足文と厳格な設定schema検査を追加した。オンラインRoomの制限時間、設定キー重複、型、範囲、選択肢、初期値不一致を拒否する。
- `SdkPreviewGameShell`の固定「最大人数・ラウンド数・制限時間」UIを削除し、`SdkPreviewSettingsControl`でゲーム宣言からboolean／number／select／textを描画するようにした。最大人数・ラウンド数の表示と共通進行への利用もrole宣言時だけにした。
- 制限時間UIはゲームが宣言した初期値・候補・候補表示名を使い、変更時に共通timerとiframe設定を同期する。
- Portalの旧PUT経路とOAuth MCP `publish_mock`の両方で`preview.json`を検証し、設定宣言を`manifest`へ保存するようにした。Preview runtimeは保存宣言を本体Shellへ返す。
- スターター、ゲーム生成雛形、SDK WordWolf実証AppSetを新しい設定契約へ移行し、制限時間の既定値とtimer接続を追加した。
- SDK API、Mockガイド、共通要件、ゲーム仕様、DownloadMe、外部package構想、ChatGPT向け資料、引き継ぎ資料へ現行仕様を反映した。

### 検証

- `npm test`成功（492件）。
- `npm run lint`成功。環境変数台帳60キー、9ゲーム共通要件、SDK依存境界を確認した。
- `npm run test:sdk-package`成功。公開tarballの外部fixture install、Runtime、resource、React UIの公開exportを確認した。
- `npm run test:sdk-starter`成功。入口、公開Git snapshot、ZIP、同梱SDK install、型検査、契約テスト、完走デモ、提出ZIPを確認した。
- `npm run build`成功。本体77ページを生成した。
- `npm run build:sdk`成功。SDK Portal 14ページを生成した。
- `npm run build:sdk-preview`成功。隔離Preview 5ページを生成した。
- `git diff --check`成功。

### 未対応・保留

- GitHubへのpushとdevelop deploymentはまだ行っていない。
- `main`、本番SDK、npm package versionはこの変更では更新しない。

## 2026-07-24 — SDK語彙プールの正式名称

### 利用者からの指摘

- AIことば当てモックが`rare-words`を独自に「レア語彙」と表示しており、Platform側の正式名称と定義がなかった。
- 当該poolはたほい屋候補の母集団と重なるが、読みが難しい語だけでなく、読みは平易でも意味を知る人が少ない語や意味が難しい語を含む。

### 判断

- 公開pool IDは既存クライアント互換のため変更しない。
- 正式名を`general-words`＝「一般語彙」、`rare-words`＝「低認知語彙」、`word-pairs`＝「審査済みワードペア」とする。
- 低認知語彙は実効Zipf値が0以上3未満の有効語とし、たほい屋候補と母集団は重なるが、たほい屋専用、難易度審査済み、またはお題採用済みを意味しない。
- `rare-words`の`easy / normal / hard`は読みの難しさではなく、低認知語彙内の相対的な認知・出現頻度を表す。

### 実施結果

- 公開SDKに`GAME_SDK_CONTENT_POOL_DEFINITIONS`を追加し、各poolの固定ID、正式表示名、定義、難易度選択方式をクライアントと制作AIから参照可能にした。
- package README、SDK API、module catalog、ゲーム仕様書へ同じ名称と境界を記載した。
- 新規の画面・仕様では「レア語彙」「難読語彙」を推測表示せず、公開定義の「低認知語彙」を使う。
- 本人所有の`test10-1 / ai-word-guess`モックも「標準語彙／レア語彙」から「一般語彙／低認知語彙」へ更新した。保存revisionは`4db2eb4b9815c78e9cf672ebd7d6caa771368662`。

### 検証

- `npm test`成功（493件）。
- `npm run lint`成功。環境変数台帳60キー、9ゲーム共通要件、SDK依存境界を確認した。
- `npm run test:sdk-package`成功。公開tarballを外部fixtureへinstallし、語彙プール定義の公開exportを確認した。
- `npm run test:sdk-starter`成功。
- `git diff --check`成功。

### 未対応・保留

- SDK本体の変更はまだGitHubへpushしていない。`main`、本番SDK、npm package versionも更新していない。

## 2026-07-24 — SDK内部語彙の非公開化とPreview認証引き継ぎ

### 利用者からの指摘

- 低認知語彙はSDKへ開放せず、たほい屋候補も同様にPlatform内部だけで扱う。
- SDK Portalではログイン済みと表示されるのに、ゲーム開始時のWord DB・AI APIが`PLAYER_AUTH_REQUIRED`で停止する。

### 判断

- 公開`content-source`は`general-words`と`word-pairs`だけとする。低認知語彙、たほい屋の未審査候補、審査結果、採用済みお題を一つの内部境界として扱い、公開名を与えない。
- 公開型から外すだけでなく、任意文字列による直接要求もサーバーで拒否する。
- 過去に公開した低認知語彙のopaque IDから語釈を再取得できないよう、ID暗号化のversionと鍵導出domainを`gfc2`へ更新する。
- Portalと本体devの別origin間では通常Cookieを共有しない。Portalは対象origin・制作者・60秒に限定した署名コードをfragmentで渡し、本体は`/api/sdk-preview`だけに効く制作者別HttpOnly Cookieへ交換する。
- Preview限定セッションを通常プレイヤーCookieへ変換せず、ゲーム本体・アカウント・ほかの制作者Previewへ権限を拡張しない。

### 実施結果

- 公開SDKのpool定数・定義・`drawWords`型から`rare-words`を削除し、`drawWords`を一般語彙専用にした。
- Platform adapterから低認知語彙loaderを削除した。`rare-words`と`tahoiya-candidates`の直接要求を拒否する回帰テストを追加した。
- opaque word／pair IDを`gfc2`へ更新し、word IDへ公開poolを暗号化して保持するようにした。旧`gfc1`はdecodeしない。
- package README、SDK API、module catalog、ゲーム仕様、外部package構想、module inventory、引き継ぎ資料を「一般語彙・審査済みワードペアだけ公開」へ更新した。
- SDK Portalの制作者トップとゲーム画面から60秒の署名fragmentを発行し、本体`/api/sdk-preview/session`で8時間のPreview API限定セッションへ交換する導線を追加した。
- Word DBとAI APIは、通常プレイヤーCookieまたは対象制作者のPreview限定Cookieを受理する。限定Cookieは`/api/sdk-preview` pathだけへ送信する。
- `test10-1 / ai-word-guess`から語彙種類selectを削除し、`drawWords({ pool: "general-words" })`へ固定した。制限時間はゲーム側の`preview.json`で既定60秒、30／60／90／120秒を宣言した。
- 同モックをrevision`1e430352a7741910644bdfb6b42671e9f404481c`として保存し、4ファイルを配信元Git revisionから読み戻してローカル本文との完全一致を確認した。

### 検証

- 公開pool、低認知語彙・たほい屋pool拒否、opaque ID v2、Preview署名scope、限定Cookie交換を含む対象テスト18件成功。
- `npm test`成功（496件）。
- `npm run lint`成功。環境変数台帳60キー、9ゲーム共通要件、SDK依存境界を確認した。
- `npm run test:sdk-package`成功。外部fixtureへinstallした公開packageで、低認知語彙poolが公開exportに含まれないことを確認した。
- `npm run test:sdk-starter`成功。入口、公開Git用snapshot、ZIP、同梱SDK install、型検査、契約テスト、完走デモ、提出ZIPを確認した。
- `npm run build`成功。本体77ページと`/api/sdk-preview/session`を生成した。
- `npm run build:sdk`成功。SDK Portal 14ページを生成した。
- `npm run build:sdk-preview`成功。隔離Preview 5ページを生成した。
- AIことば当てのJavaScript構文検査に成功し、低認知語彙・たほい屋pool・語彙選択UIがないこと、一般語彙固定要求を確認した。

### 未対応・保留

- SDK本体とPreview認証修正はまだGitHubへpushしていないため、現在のdev本体では新しい限定セッション交換は未反映。
- `main`、本番SDK、npm package versionはこの変更では更新しない。

## 2026-07-24 — SDK共通モジュールの未接続監査

### 利用者からの要望

- Word DB、設定、Preview認証以外にも、契約または「接続済み」表示だけが存在し、実処理へ未接続の共通機能がないか確認する。
- SDK変更の回帰確認に使う既存クライアントをPlatform側から改版しない。特に本人所有の`test10-1 / ai-word-guess`は、明示依頼がない限りコード、設定、保存revisionを変更しない。

### 判断

- 未審査Previewで意図的にメモリ模擬する機能と、採用済みSDK Runtimeにも接続先がない機能を分けて扱う。
- module registryへ実装名があることや、module labに見本UIがあることだけを「完成接続」と判定しない。ゲーム固有stateからの入力、Platform側の権限検査、永続化、別セッション同期、結果後hookまで実経路を確認する。

### 調査結果

- Previewの`result`はゲーム固有の標準勝敗を受け取らず、参加者配列順と仮点で表示している。`standard-outcome` helperは公開されているが、Preview Shellおよび採用済みSDK Room Viewとの結果受渡し契約へ未接続。
- `stats`、`rating`、`replay`はPreview上の予定文言だけで、SDK Platform adapterの保存後hook、共通戦績、rating、本人向けreplay storeへ未接続。
- SDK timerは期限表示と成功Command後のresetまではあるが、Preview Shellは`timer:expired`を処理せず、採用済みSDK Runtimeにも期限後reconcile、受付猶予、時間切れCommand、連続放置・復帰処理がない。
- PreviewのRoom作成、参加、revision、復帰、解散はReactメモリ内の模擬で、Redis、別ブラウザ、WebSocket、polling fallbackへ接続していない。採用済みSDK用API／Redis／revision watcher自体は存在するが、保存済み制作者ゲームの画面は引き続き`/sdk-preview/...`へ遷移し、正式Runtimeを描画する本体Shellへ未接続。
- `spectators`はPreviewの視点切替だけで、採用済みSDK側には公開policy、grant、匿名観戦API、ゲーム別公開snapshotがない。
- `debug`はPreview内のダミー・視点・中断UIだけで、採用済みSDK RoomのサーバーCommand、ダミー参加者整理、active-room除外、ゲーム固有state補正へ未接続。
- Room内の設定値保存はあるが、ゲーム別・プレイヤー別の設定既定値を共通`room-defaults`へ保存・復元するSDK接続がない。
- Previewのルール画面はゲームpackageの具体的ルールを受け取らず共通説明だけを表示し、プレイヤーメニューの表示名も連携済み本人情報ではなく確認用固定表示。
- `result-share`、`ai-activity`、広告、トランプ、描画、Word DB、LLMにはPreview上の具体的な接続経路がある。ただし結果共有は仮結果を参照し、描画strokeのRoom保存・同期は別途online-room接続が必要。

### 未対応・保留

- 今回は監査のみで、SDKコード、AIことば当て、保存済みrevision、GitHub branch、deploymentは変更していない。
- 修正順は、固有結果契約、サーバー時間切れ、正式SDK ShellとRoom transport、結果後の戦績系hook、観戦・DEBUG、設定既定値の順が妥当。
## 2026-07-24 — SDK未接続機能の順次接続

### 要望・判断

- 「接続済み」表示だけで実処理へつながっていないSDK機能を、固有結果、時間切れ、正式Room、戦績系、観戦、DEBUG、個人既定値、ルール表示の順で接続する。
- AIことば当ては既存クライアントの回帰確認に使うため、コード・設定・保存済みrevisionを変更しない。
- 未審査Previewと承認済み正式Runtimeを混ぜず、正式Runtimeは静的server registryに登録されたmoduleだけを動かす。

### 実装

- AppSet transitionへ全参加者の`standardResult`を追加し、共通結果画面が参加順から仮順位・仮点数を生成する処理を削除した。
- `expireAppTurn`、server deadline、turn sequence、grace、連続時間切れ、本人だけの5秒短縮、明示復帰をSDK基本セットへ追加した。
- `/sdk-games/[gameId]`へ正式Room Shellを追加し、Cookie認証、Redis CAS、active room、一覧、Realtime、設定、開始、プレイ、結果、再戦、解散を承認済みmoduleへ接続した。
- 保存後hookから標準結果を`wordwolf-sdk`専用の戦績、rating、playbackへ冪等保存する。playbackは共通結果だけを使い、固有秘密stateを保存しない。
- SDK観戦を既存の署名grantとhost policyへ接続した。SDK snapshotは匿名席、phase、timer、確定結果だけを許可し、ゲーム固有stateを展開しない。
- DEBUG資格を持つhostだけがlobbyでダミーを追加・削除できるserver Commandを追加した。
- `manifest.rules`を追加し、`manifest.settings`とともに正式Shellへ宣言駆動表示する。設定値はRoomへ同期し、宣言済みの有効値だけをアカウント別の次回既定値として保存する。
- SDK package境界検査、starter、公開資料を新しいresult、timeout、DEBUG、rules契約へ更新した。
- 最終監査で、非hostの結果復帰がhost専用`room/rematch`を直接送る不整合と、SDK観戦APIだけが4文字Roomコードへ狭める不整合を検出した。結果更新を端末ごとに保留する共通復帰規約へ接続し、`room/confirm-lobby-return`が全員分揃うまでserver側でも次ゲーム開始を拒否する。結果中の解散でも結果を保持し、観戦はSDKの4〜12文字コードを受理する。

### 検証・保留

- `npm test`: 501件成功。
- `npm run build`: 本体Production build成功。
- `npm run lint`、SDK Portal build、隔離Preview build、SDK配布tarballの外部install検査、starterの型・契約・完走・提出ZIP検査が成功した。
- developへのpush・dev deployment・ログイン済み複数ブラウザE2Eは未実施。
- AIことば当てのコード・設定・保存済みrevisionは変更していない。

## 2026-07-24 — SDK共通接続のdevelop反映

### 利用者からの要望

- 検証済みのSDK共通接続変更をGitHubの`develop`へpushする。

### 実施結果

- `origin/develop`の`082ce011e01a`から、SDK設定宣言、公開語彙境界、Preview認証、正式Room・結果・時間管理・戦績・観戦・DEBUG・個人既定値・ルール表示・全員復帰確認を含む変更をfast-forwardで反映した。
- GitHub上の実装先頭コミットは`01a6644`、最終実装コミットは`a0cc5b1`。
- AIことば当てのコード、設定、保存済みrevisionは変更していない。

### 検証

- push前にリモートを再取得し、`origin/develop`がローカル履歴の祖先で、競合や他者の未取込更新がないことを確認した。
- 実装コミット時点で501テスト、lint、本体・SDK Portal・隔離PreviewのProduction build、SDK配布package・starter検査が成功済み。

### 未対応・保留

- dev deploymentの完了状態と、ログイン済み複数ブラウザでの実機E2Eは別途確認する。
- `main`、本番SDK、npm package versionは今回更新しない。

## 2026-07-24 — SDK Previewの認証切れ再調査

### 利用者からの報告

- develop反映後も、固定した`test10-1 / ai-word-guess`で1人開始後に秘密語を取得できず、AI APIも待機のままになる検証結果が示された。
- 回帰確認用クライアントは改版せず、SDK／共通側で原因を調査する。

### 調査・判断

- Vercelの本体dev実行ログで、同時刻の`POST /api/sdk-preview/content-source`が401、`POST /api/sdk-preview/session`も401だった。Word DBのSQL・抽選処理へ到達する前の認証拒否である。
- SDK Portal側の同ゲームURLも307を返し、Cloud Browserは本体のログイン画面へ転送された。検証ブラウザには有効なPortal本人セッションがなく、署名fragmentからPreview限定Cookieへの交換に成功した記録もなかった。
- 認証を不要にして内部素材やAIを公開するのではなく、Preview resourceの401を共通認証切れとして扱い、ゲーム固有エラーへ埋没させない。

### 実装

- `SdkPreviewSessionGate`に共通の再認証要求contextを追加し、Word DBまたはAI APIが401を返した時点でゲームShellを停止して、SDK Portalからの再ログイン案内へ戻す。
- session交換・検証、Word DB、AI APIの同一origin要求へCookie送信を明示した。
- `/api/sdk-preview/llm`の401を`PLAYER_AUTH_REQUIRED`へ統一した。
- AIことば当てのコード、設定、保存済みrevisionは変更していない。

### 検証・保留

- `npm test`成功（502件）。Preview限定セッション交換と、resource認証切れでShellを停止する回帰テストを含む。
- `npm run lint`成功。
- 本体、SDK Portal、隔離PreviewのProduction build成功。
- SDK配布tarballの外部install検査と、starterの型・契約・完走・提出ZIP検査に成功。
- Cloud Browserはログイン画面で停止しているため、有効な本人セッションを使ったWord DB本文とAI応答の最終E2Eは未確認。資格情報を入力せず、認証済み利用者操作を残す。
- GitHubへのpushとdev deploymentは未実施。`main`、本番SDK、npm package versionは変更しない。

## 2026-07-24 — SDK Preview認証切れ修正のdevelop反映

### 利用者からの要望

- 検証済みのSDK Preview認証切れ修正をGitHubの`develop`へpushする。

### 実施結果

- `origin/develop`の`e8afe5d9073c`から、共通Session Gate、Preview Shell、Word DB／AI APIの認証切れ応答、回帰テスト、関連資料をfast-forwardで反映した。
- GitHub上の実装コミットは`281e75ae9fc8`。
- AIことば当てのコード、設定、保存済みrevisionは変更していない。

### 検証・保留

- push前にGitHub上の`develop`が`e8afe5d9073c`と一致すること、作業treeがクリーンで差分が対象7ファイルだけであることを確認した。
- 実装コミット時点で502テスト、lint、本体・SDK Portal・隔離PreviewのProduction build、SDK配布package・starter検査が成功済み。
- dev deploymentの完了状態と、ログイン済み本人セッションでのWord DB／AI API最終E2Eはpush後に確認する。
- `main`、本番SDK、npm package versionは今回更新しない。

## 2026-07-24 — SDK Previewログイン済みE2Eの再開確認

### 作業目的

- develop反映後の`test10-1 / ai-word-guess`を固定クライアントのまま開き、Portal本人認証、隔離Runtime、Word DB、AI APIを実機で順に確認する。

### 調査結果

- 再読込前の古いタブでは、Portal外枠と本体Preview Shellは表示され、実Roomも作成できたが、隔離Runtimeの署名URLはすでに期限切れで開始できなかった。
- SDK Portalのゲーム画面を再読込すると、共通Session Gateが古いRuntimeを継続せず、Game Fields本体devの再ログイン画面へ遷移した。認証切れをWord DB障害として継続表示しない修正は実機で確認できた。
- 検証ブラウザには有効な本体dev本人セッションがなく、資格情報を入力していないため、Word DB取得本文とAI応答の最終E2Eまでは到達していない。
- AIことば当てのコード、設定、保存済みrevisionは変更していない。

### 未対応・保留

- 本体devへ本人がログインし、自動的にSDK Portalへ戻った後、同じゲームで新規Roomを作成して秘密語取得とAI応答を確認する。
- 今回はコード、外部設定、deploymentを変更していない。

## 2026-07-24 — SDK Preview Word DB中継500の安全な診断

### 作業目的

- ログイン成功後も`test10-1 / ai-word-guess`の秘密語取得が失敗するため、固定クライアントを変更せず、共通`content-source`中継の500発生箇所を特定できるようにする。

### 調査結果

- 本体devへの再ログイン後、Preview専用セッション交換は`200`、新規Room作成とゲーム開始も成功した。
- 同じ実行の`POST /api/sdk-preview/content-source`は`500`で、認証401とは別の次段階まで到達している。
- 現行Routeは内部例外を安全な共通エラーへ変換していたが、失敗段階やPostgreSQLの5桁コードを観測ログへ残しておらず、テーブル、列、権限、接続のどこで失敗したかを区別できなかった。

### 判断

- AIことば当てのコード、設定、保存済みrevisionは変更しない。
- 共通observability schemaを通し、失敗した段階、content operation、許可済みのエラーコード、PostgreSQLの5桁コードだけを記録する。秘密語、SQL、リクエスト本文、例外message・stackは記録しない。

### 実施結果

- `/api/sdk-preview/content-source`へ段階追跡と共通`createRequestTelemetry`による`sdk.resource`失敗イベントを追加した。
- 入力、session、rate-limit、Runtime定義、module profile、content sourceのどこで失敗したかを`phase`で区別できる。
- 外部設定とAIことば当て本体は変更していない。

### 検証

- 全502テスト、lint、本体Production buildが成功した。
- 診断イベントは共通observability schemaとruntime allowlistを通り、未許可フィールドや例外本文を直接出力しない。

### 未対応・保留

- `develop`へ反映して同じ操作を再実行し、Vercel Runtime Logsの`phase`、`operation`、`databaseCode`から500の具体原因を確定する。
- 原因に応じたDBまたは共通content-source修正と、Word DB取得からAI応答までの最終E2Eは未実施。

## 2026-07-24 — SDK Preview Word DBの42P01確定と共通語彙DBへの統一

### 診断反映と実機結果

- 安全な診断変更をGitHubの`develop`へforceなしで反映した。GitHubコミットは`d9e49cae9178`で、本体dev deploymentがREADYになった後に固定クライアント`test10-1 / ai-word-guess`を再実行した。
- Room `GF50`でPreview限定セッション交換、Room作成、隔離Runtime接続、ゲーム開始までは成功した。
- 同じ実行の`POST /api/sdk-preview/content-source`は500になり、共通`sdk.resource`イベントから`phase=content-source`、`operation=drawWords`、`errorCode=NEONDBERROR`、`databaseCode=42P01`を確認した。秘密語、SQL、リクエスト本文、例外message・stackは記録していない。

### 原因と判断

- 一般ゲーム語の読取先は環境別アプリDBの`shared_word_catalog`と`shared_word_pool_evaluations`だったが、dev本体を新しい分離Neon DBへ切り替えた後、この外部公開表を作るDDL／migrationが存在しなかった。
- 一般ゲーム語はmain／developで共有するコンテンツで、共通`word-master-neon`を正本とする既存DB責務に合わせる。devアプリDBへ語彙表を複製せず、既存の`SHARED_VOCABULARY_DATABASE_URL`／`VOCABULARY_DATABASE_URL`経路を使う。外部環境変数とDBは変更しない。

### 実装

- `lib/general-game-word-repository.ts`を追加し、共通単語DBの`active_words`から固有名詞を除外した実効Zipf 4.5〜6.5の語を読み取る。
- 難易度は簡単5.5〜6.5、普通5.0以上5.5未満、難しい4.5以上5.0未満へ投影する。既存の難易度混合率と当日重複除外は維持する。
- SDKの一般単語、ワードアウト、コードインターセプトを同じRepositoryへ統一した。Word pairとdefinitionも従来どおり共通単語DBを使う。
- 最初のdev反映`a8d28db0d2bd`後、Room `GF62`では`drawWords`が200になり、続く`findDefinitions`だけが`databaseCode=42501`で失敗した。dev分岐が共通DBの内部`words`／`word_definitions`表を読んでいたため、SDK content repositoryの一般語、ペア、語釈を環境に関係なく公開済み`active_*` viewへ統一した。
- 内部語彙表へ戻らないソース境界の回帰テストを追加した。
- AIことば当てのコード、設定、保存済みrevisionは変更していない。

### 検証・保留

- `npm test`成功（全503件）。
- `npm run lint`成功。
- 本体、SDK Portal、隔離PreviewのProduction build成功。
- 修正を`develop`へ反映した後、新規Roomで秘密語取得とAI応答までのログイン済み実機E2Eを行う。成功後に本項と既知問題の状態を確定する。
- `main`、本番SDK、npm package versionは変更しない。

## 2026-07-24 — SDK Previewを正式Roomと同一契約へ戻す難易度の調査

### 利用者からの要望

- 未審査コードの隔離を理由にローカル模擬へ縮退したSDK Previewを、当初想定した本体共通Roomへ戻せるか確認する。
- SDKで完成したrevisionをゲームごとに作り直さず、同じ実行契約のまま正式版へ昇格できる持続的な構造を優先する。

### 調査結果

- 署名Cookie認証、Redis CAS、active room、一覧、再接続、解散、revision通知、閲覧者別Viewを持つ正式SDK Room基盤は既に実装されている。
- 現在のPreview Shellは部屋コード、参加者、phase、revisionをReact stateで保持し、隔離iframeの`GameFieldsPreset`もゲーム固有状態をブラウザ内で実行するため、外側Shellのtransportだけを差し替えてもゲーム状態は端末間同期されない。
- 保存済みgame packageはHTML／CSS／browser JavaScript中心で、正式Roomが必要とするserver AppSetをrevisionに含めない。現行の正式server registryは審査済みmoduleの静的importだけを許可し、保存revisionを動的server codeとして実行しない。
- したがって単純なgit revertではなく、保存revisionへclient surfaceとserver AppSetの両方を含め、Previewでも正式版でも同じAppSetを隔離されたserver実行境界から呼ぶ経路が必要である。
- iframe隔離、revision Git保存、Portal、共通Room Runtime、Word DB、LLM gateway、timer等は再利用可能で、基盤全体の作り直しではない。

### 判断

- 参加者だけを共通Roomへつなぎ、ゲーム固有状態をブラウザに残す部分修正は、同期済みに見える二重構造を再発させるため採用しない。
- AIことば当ては現在のUI assetを維持できるが、ブラウザ内のゲーム遷移をserver AppSetへ一度移す必要がある。以後のゲームは制作時からclientとAppSetを同じrevisionへ保存する。
- 正式昇格をrevisionの状態変更だけにするには、未審査AppSetを本体プロセスへ直接importせず実行できるserver側の隔離runnerと、承認済みrevisionをproduction catalogへ指す仕組みが未実装である。

### 未対応・保留

- server側隔離runnerの方式、revision package schema、Preview Room APIへの接続、承認catalogを設計・実装する。
- AIことば当てのコード、設定、保存済みrevision、`develop`、`main`、外部設定は今回変更していない。

## 2026-07-24 — hash固定AppSetを正式Roomのまま昇格するSDK基盤

### 利用者からの要望

- AIことば当ては基盤の検証用とし、AI固有要件へ共通部分を寄せない。
- AIことば当てを載せる際は、検査済みAppSetを昇格工程で改造しない。
- 既存AIことば当てを無改造で流し、失敗箇所をSDKの指示・生成物・bridge不足として特定する。

### 実装

- game packageを正式クライアント、portable server bundle、AppSet原文、manifestの一つの不変revisionとして保存するschemaとbuild／readiness検査を追加した。
- Portalは受信時にserver bundleとAppSet原文のSHA-256を再計算し、candidate revisionへ保存する。OAuth MCPへ`publish_game_package`を追加し、Work／Codexから秘密トークンを展開せず同じ経路で提出できるようにした。
- 未審査AppSetを本体プロセスへimportせず、QuickJS WASMの新規module／contextで1呼出しごとに実行する。memory 32 MiB、stack 1 MiB、execution 750 ms、bundle／request／response各1 MiBを上限とし、host network、filesystem、process、環境変数、Platform adapterを公開しない。
- portable protocolはWord DBとLLMをeffectとして要求し、本体が承認済みadapterを実行して同じAppSet呼出しへ結果を戻す。ブラウザには`GameFieldsRoom.subscribe/send`だけを公開し、resource adapterやゲーム状態の正本を置かない。
- Preview Roomを本体共通Room API、Redis CAS、active room、一覧、再接続、解散、閲覧者別Viewへ接続した。candidateと正式版の差はcatalog channelとpackage revisionだけである。
- candidate→development→stableはpackage revision、server bundle hash、AppSet原文hash、manifestをそのままコピーする。再build、変換、AppSet補正を昇格処理へ入れない。
- development／stable catalogからSDKゲームカード、正式Shell、戦績、rating、replayを`publicGameId`で汎用登録する。AIことば当て固有の共通分岐は追加していない。

### 無改造fixtureの結果

- 旧AIことば当てのAppSet原文は変更せず、SHA-256
  `ed0aa3543b61d2417532eca1cd3fb31868603d2a06e2929df2a568a0b6413e8b`
  のまま診断した。
- `GAME_SDK_PACKAGE_GAME_ID_MISMATCH`、`GAME_SDK_CLIENT_ROOM_BRIDGE_MISSING`、
  `GAME_SDK_CLIENT_RESOURCE_BRIDGE_FORBIDDEN`、
  `GAME_SDK_CLIENT_LOCAL_GAME_ADAPTER_FORBIDDEN`を独立して検出した。
- これらをAI固有変換で通さず、新SDKのスターター、DownloadMe、readiness診断、
  正式Room bridgeの必要条件へ反映した。
- 新SDKで一度作った検証用AI AppSetはSHA-256
  `bad5f5743698f35aaccf1b0939855b1fb63ad4d185bbfaadbcf99eef3e7a8504`
  に固定した。SDKを`0.1.1`へ更新して再packageしてもAppSet原文hashは同一で、
  Word DB秘密非漏洩、LLM失敗時のrevision不変、複数人手番同期の3テストが成功した。

### リリースと検証状況

- additiveな共通機能追加のためSDK contractは`1`を維持し、Platform／SDK packageを
  `0.1.1`、DownloadMeを`ver10`へ更新した。
- 公開SDK tarballを外部fixtureへinstallし、portable-serverを含む公開exportを確認した。
- スターターの展開、同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIP検査に成功した。
- package clientとportable serverのgrantを別audienceへ分離した。ブラウザから
  `server.bundle.js`、package manifest、AppSet原文を取得できず、server runnerは
  実行直前にbundle SHA-256を再計算して固定grantと不一致なら拒否する。
- package保存は対象subtreeを完全置換し、前revisionの未提出assetを新commitへ残さない。
  1 MiBを超えるportable bundleは提出時に拒否し、昇格元が検査中に変わった場合は
  競合として止める。runner URLも設定済み隔離originと対象revisionのpathへ固定した。
- 隔離AppSetの閲覧系呼出しへ認証player単位のrate limitを追加した。正式クライアント用
  asset grantは8時間、内部server grantは10分とし、長いRoomでも遅延読込assetを維持しつつ
  server実行権限を短命に保つ。
- lint成功。全513テスト成功。本体、SDK Portal、隔離Previewの3環境Production build成功。
- 最初の`develop`反映`44008ba45302`では、クリーンcheckoutからbuildする隔離Previewだけが
  `@game-fields/game-sdk/portable-server`の未生成`dist`を解決できずVercel buildで停止した。
  AppSet実行やpackage内容の問題ではない。SDK Portalと同じくPreviewの`predev`／`prebuild`で
  公開SDK workspaceを先にbuildし、ローカルの先行生成物へ依存しない手順へ統一した。
- 検証用AI AppSet原文hash
  `bad5f5743698f35aaccf1b0939855b1fb63ad4d185bbfaadbcf99eef3e7a8504`
  とserver bundle hash
  `7388ce50765c49baee4e673b2c3ddb20335a249e490d7f303fc97019e6768cf8`
  は最終検査後も不変である。
- `develop`への反映、dev deployment、candidate package提出、development昇格、
  複数ブラウザの正式Room実機E2Eは続けて確認する。
- `main`、本番SDK、npm registryは未変更。

## 2026-07-25 — SDK最上位設計監査（第6〜第10）

### 監査方針

- 個別修正を先行させず、正本・環境・package不変性・Runtime互換性・securityに続いて、障害復旧、Resource原価、観測性、保存・削除、SDK利用者体験を一周した。
- 本項ではコードと現行文書の調査結果だけを固定する。実装変更、外部設定変更、push、deployment、E2Eは行っていない。

### 第6監査：障害復旧・冪等性

- RedisのRoom作成、revision CAS、Room・index・active roomの削除はLuaで原子的に処理され、個別の戦績、rating、replayもevent IDまたは`SET NX`で重複保存を防いでいる。
- 一方、保存Roomはpackage revision、package root hash、Runtime／各契約version、settings snapshotを持たない。stableは各requestで最新channel pointerを解決するため進行中Roomが別revisionへ移り得る。candidateはrevisionがstore namespaceへ入るため再提出後に既存Roomを継続できない。
- portable Resource effectの結果は1回のserver invocation内のmemoryにしかなく、effect IDもresource・operation・request JSONだけである。Runner応答消失、再試行、process障害で同じLLM／content処理を再実行し得る。
- Command契約に`commandId`と保存済みreceiptがない。CAS成功後に応答だけ失われた場合、再送は`STALE_REVISION`となり、直前の成功結果を返せない。
- 結果保存はCAS後の`after()`からstatsとreplayを並列実行する。durable outboxと`result-confirmed → result-persisting → completed`がなく、CAS後のprocess障害や部分成功を回収できない。
- package／mock再提出は同一内容でも毎回Git commitを作るが、MCP toolは`idempotentHint: true`を宣言している。Git成功後のDB失敗も再試行で別revisionを作る。
- realtime通知はbest effortだがpollingで回復できる。Room本体はRedis消失時の復旧元とSLOが未定義である。

### 第7監査：Resource・費用

- package、Runner、Room state、LLM prompt／schema／timeout、content件数には個別上限がある。Runnerはbundle／request／response各1 MiB、memory 32 MiB、stack 1 MiB、実行750 ms、Room recordは512 KiBに制限される。
- 課金Resourceのrate limitはIPとplayerだけで、Creator、Package、Room、Command、task、日次／月次budgetを持たない。1 Commandは最大8 effectを要求でき、すべてLLM生成にもできる。
- Redis limiter障害時は全policyがfail-openであり、Game Fields負担のLLMも無制限に通り得る。
- OpenAIとstandard Groq、Geminiに明示的な出力token上限がなく、provider fallbackの複数試行も1回分のrate limitとしてしか数えない。
- provider、model、latencyは記録するが、入力／出力token、provider試行別利用量、推定／確定原価、billing source別集計、Creator／Package帰属、hard spend ceilingがない。
- stable RuntimeはLLM moduleを持つpackageへhigh qualityを一律許可し、task単位のentitlementや費用tierを持たない。
- content sourceは1 effectで最大100件、1 invocationで最大8 effectを許可する。一般語は難易度別最大500件ずつをDBから読み、毎回memoryでfilter／shuffleする。package／Room単位quotaとcache方針がない。
- Room HTTPのJSON bodyは`request.json()`前のsize検査がなく、隔離Runnerやuploadにある入力上限が共通Command routeにはない。

### 第8監査：観測性・ログ

- 閉じたfield allowlist、HMACによるRoom／actor／event参照、request／trace ID、安全なerror code化は良好である。
- 正式SDK Room routeは構造化eventを持つが、candidate Room route、隔離Runner、SDK Portalのpackage保存・昇格、Resource effectには同じ観測境界がない。Portalの`instrumentation.ts`は観測runtimeを持たないことを明示している。
- 正式RoomでもRuntime catalog解決はtelemetry生成より前で、catalog障害をroute eventへ残せない。Resource eventにはpackage revision、channel、Room、Command、effect、billing source、token利用量がない。
- `post-response-work.ts`とrealtime失敗だけが生の例外を`console.error`へ渡し、外部SDK例外のmessage／stackを保存しない規約を迂回する。
- candidate Roomは認証以外の上位失敗を`SDK_PREVIEW_RUNTIME_FAILED`へまとめ、内部にも段階ログを残さない。Runnerのmemory／timeout／bundle不正も安全な応答codeだけで、件数、revision、所要時間を運用側で追えない。
- resultのstats／replay eventは個別に観測できるが、同じrequest traceやoutbox IDがなく、Room結果Commandから部分保存までを横断できない。
- Room一括解散は`affected`を渡すがschemaは`affectedCount`だけのためruntime sanitizerで件数が落ちる。

### 第9監査：保存・削除

- Roomは最終更新から6時間のTTLとhost解散を持ち、通常replayは既定30日、player別settings既定値は2年で失効する。OAuth tokenは平文で保存せず、認可codeとrefresh tokenは交換時に行を削除する。
- Creator、Game、Revision、channel公開を停止・tombstone・削除するAPIがない。`sdk_games`はDB上Creator削除へcascadeするが、Creator削除自体の導線がない。
- packageとmockはGit branchへappend-only commitとして残る。DB pointerを消しても過去asset／sourceはGit履歴に残り、公開停止、権利取下げ、保持期間後の物理purge方針がない。
- 本体アカウント削除は別SDK DBの`owner_player_id`、OAuth grant、Creator環境を失効させない。期限切れ／revoked OAuth code、grant、動的clientの定期cleanupもない。
- SDK schemaはrequest中の`CREATE TABLE IF NOT EXISTS`と`ALTER TABLE IF NOT EXISTS`で更新され、version付きmigration、rollback、backup／restore検証がない。
- DBはcandidate／development／stableの現在pointerだけを持ち、昇格者、from／to revision、理由、時刻を持つappend-only監査台帳がない。
- Room、player defaults、戦績、replay、運用issue、OAuth、Creator mapping、Git packageごとのデータ分類・保持・削除matrixがない。

### 第10監査：SDK利用者体験

- 現行DownloadMe ver10は`platform/sdk 0.1.1`と`formal-room-preview`等を要求し、公開`sdk-starter` branchを取得する。しかし2026-07-25確認時の公開branch先端`389cb319`はDownloadMe ver9、SDK 0.1.0で、game package build／promotion診断も含まない。手順どおりならstarter manifest検査で制作開始前に必ず停止する。
- developのstarter clientは正式`GameFieldsRoom`だけを使う一方、`check:mock`は旧`GameFieldsPreset.registerGame()`、start／abort／rematch等を必須とする。promotion readinessは同じ`registerGame()`とbrowser Resource bridgeを禁止するため、静的mock承認と正式clientを同じ`mock/`で満たせない。
- `npm run test:sdk-starter`は`check:mock`を実行しないため、上記の相互矛盾を検出しない。
- DownloadMeはWork／CodexではOAuth MCPの`publish_mock`／`publish_game_package`を使い、legacy management token scriptを使わないとする。一方、starterの`AGENTS.md`、`START_HERE.md`、`MOCK_GUIDE.md`は`npm run publish:*`を正規手順として要求する。MCP finalizeはmanagement tokenを返さないため、新規OAuth制作はstarter側の手順を実行できない。
- promotion readinessの自動判定はgame ID、play mode、bridge文字列、禁止browser Resource文字列だけを検査する。必須module契約、settings整合、標準結果、秘密View、外部通信、package root、asset、Command冪等性を確認せず、`promotionReady: true`が実際の昇格安全性より強い表現になっている。
- candidate Roomの上位例外は汎用codeへ潰れ、Creatorはpackage revision、Runner段階、effect段階、再試行可否を画面から判断できない。
- manifestの`minimumPlayers: 1`を全gameへ推奨しつつ公開catalogも同じ値を人数表示へ使うため、本来複数人必須のゲームで公開人数表示とAppSet開始条件がずれる。Preview用最小人数と実ゲーム最小人数を分離していない。
- starterの安全境界、AppSet分離、閲覧者別View、正式Roomとhash固定昇格の説明自体は一貫しており、基礎教材としての方向性は良い。

### 検証状況

- `git ls-remote`と公開branch取得で、`sdk-starter`先端`389cb319`の`starter-manifest.json`がver9／0.1.0であることを確認した。
- `npm run test:sdk-starter`は依存未導入のため`tsc: not found`で停止した。続く依存導入は実行環境のnpm cache／tar展開エラーで完了せず、製品testの成否判定には使用していない。作成された不完全な`node_modules`は削除し、作業treeをクリーンへ戻した。
- 次の実装では、Room固定契約を最初に導入し、その識別子をCommand receipt、effect journal、result outbox、quota、observability、retentionへ共通利用する。公開starter同期と二段階Preview契約の解消はE2E前のblocking項目とする。

## 2026-07-25 — SDK最上位設計監査の一括実装

### Room・Runtime契約

- Platform Room schemaをv2へ更新し、Room開始時に`packageRevision`、`packageRootSha256`、Runner Runtime、SDK／Room／Resource／Client Bridge各契約version、settings snapshotを固定した。
- stable／development／candidateのいずれも、既存Roomは保存済み契約から明示Revisionを解決する。channel pointer更新やcandidate再提出で進行中Roomを別Revisionへ移さない。
- `commandId`と作成`requestId`をHTTP Client、Mock Runtime、Platform Runtime、保存Roomへ追加した。同じactor・revision・payloadの再送は保存済みreceiptから`applied: false`を返し、ID再利用の内容衝突は拒否する。
- effectは環境、Runtime、Package Revision、Room、Command、effect IDへ束縛したRedis journalで、実行前`pending`、成功後`completed`を保存する。成功結果は再利用し、結果不明の課金処理を自動再実行しない。LLMは1 Command最大1 effectとした。
- 結果保存はRoomと同じCAS内でoutboxへ追加し、`result-confirmed → result-persisting → completed`と60秒leaseで回収する。失敗はconfirmedへ戻し、後続read／Commandで同じevent IDを再開する。playbackへRoom固定Runtime契約も保存する。

### Package・channel・環境

- Package全fileをUTF-8 path順、text LF、再帰key順JSON、binary exact byteでcanonical tree hash化し、`packageRootSha256`をRevision registry、channel pointer、Room契約、token、catalogへ通した。
- Package Revisionとchannel履歴をappend-only tableへ分離した。同一rootの再提出は既存Revisionを返し、昇格はblob再コピーではなくRevision pointerを更新する。公開停止はpointerだけを外し、論理削除は新規catalog／Preview／昇格から即時除外する。
- `GAME_FIELDS_ENV`をproduction、development、candidate-preview、sdk-portal、testへ限定した。未知値はfail-closedとし、SDK Room、effect、quota keyへ環境namespaceを含めた。
- Preview grantをenvironment、channel、package、revision、Room用途、role、audienceへ束縛した。client／server audienceと短命server grantの分離は維持した。

### Security・Resource・観測

- SDK Room mutationへIP、player、Creator、Package、Roomの同時quotaを追加し、この課金・実行境界だけはlimiter障害時にfail-closedとした。Command body 128 KiB、Room record 512 KiB、Package 128 files／合計5 MiB／1 file 2 MiB、1 game 100 Revision、1 Creator 64 gameを上限とした。
- Package uploadでtext encoding、binary magic MIME、active SVG、埋込HTMLを追加検査した。WASM／ZIPは許可extension外で、Runnerのmemory 32 MiB、stack 1 MiB、execution 750 ms、入出力・bundle各1 MiBとBrowser CSP `connect-src 'none'`を維持した。
- SDK LLMはplayerとPackageの両budget、standard限定、provider output上限を持ち、budget store障害時は生成しない。課金Resource eventへPackage Revision、Room、Command、effect、token数、原価・billing帰属用fieldを追加した。
- candidate Room、stable catalog、effect、result outbox、post-response、realtimeを同じ構造化telemetryへ通した。外部例外本文・stackを生の`console.error`へ渡さず、相関用IDはHMAC参照だけを保存する。

### 保存・削除

- `docs/SDK_DATA_LIFECYCLE.md`を追加し、Room、effect、settings、replay、戦績、Package、channel、OAuth、運用issueの正本・保持・削除matrixを固定した。
- OAuth期限切れcode、期限切れrefresh grant、revoke後30日経過grantをOAuth store maintenanceで物理削除する。
- Account削除は、SDK内部APIでOAuth grant失効、所有Creator無効化・匿名表示化、所有game tombstoneを先に行う。本体側はplayer別replay、戦績、rating、SDK settingsを冪等削除し、Redis account、最後にPostgreSQL accountを消す。SDK側失敗時はaccountを残して再試行可能にする。
- Package Revisionとchannel履歴は開始済みRoomと監査証跡のため通常削除では残し、新規resolveだけを停止する。

### Starter・Client責務

- StarterのMock検査を正式`GameFieldsRoom.subscribe/send`へ統一し、旧`GameFieldsPreset`、browser Resource bridge、browser-local正本を禁止した。`npm run check`はMock、契約test、promotion診断を一続きで実行する。
- Work／Codexの正規提出経路をOAuth MCPへ統一し、management token scriptはlegacy互換名へ移した。promotion readinessへsettings、秘密View、host権限、stale revision、外部通信禁止の検査を追加した。
- `minimumPlayers`を公開・通常Roomの実人数とし、debug Previewだけに任意の`previewMinimumPlayers`を追加した。Starterは公開2人、Preview 1人とした。
- package iframeのPlatform側白背景、白枠、shadow、角丸、装飾paddingを外し、ShellはRoom UI、配置、サイズだけを持つ。

### 検証・未反映

- `npm run lint`成功。公開SDK packを外部fixtureへinstallする`npm run test:sdk-package`成功。
- `npm test`成功（全522件）。追加回帰はRuntime固定、command receipt、effect journal、outbox再開、Package root、環境namespace、複合quota、active asset検査、token scopeを含む。
- `npm run test:sdk-starter`成功。未回答の配布仕様書は拒否し、一時的な回答済みfixtureで型検査、契約test、1ゲーム完走、promotion診断、game package／提出ZIP、公開repository snapshot一致まで確認した。
- 本体、SDK Portal、隔離Previewの3つのProduction build成功。
- SDK Portal PostgreSQLを`001`〜`003`の番号付きmigration、checksum台帳、明示runnerへ移した。request内のDDLを廃止し、Runtimeはversion 3未適用時にfail-closedとする。Vercel buildでは`app-games-sdk-dev/develop`と`app-games-sdk/main`だけがDeployment前にmigrationを適用し、失敗時はbuildを止める。
- Starter参照を安定版`sdk-starter`とdevelopment候補`sdk-starter-dev`へ分離した。`config/platform-release.json`の`starterRef`をDownloadMe、manifest、生成・検査へ同時反映し、現行0.1.1／ver10は`sdk-starter-dev`を参照する。安定版ver9／0.1.0は変更しない。
- migration／Starter分離後にも`npm run lint`、全522テスト、`npm run test:sdk-starter`、本体・SDK Portal・隔離Previewの3 Production buildを再実行し、すべて成功した。ローカルSDK Portal buildではdeploy migrationがProject／branch gateによりskipされることも確認した。
- push、deployment、DB migration実適用、複数ブラウザの接続済み実機E2E、`sdk-starter-dev` branch公開はまだ行っていない。DownloadMe ver10はdev Starter公開完了まで取得不能である。
- Room schema v1には固定Runtime契約がなく安全なv2自動変換ができないため、本番反映前に新規v1 Roomを止め、既存Roomを解散または6時間TTLで排出する。v1継続readerを別途用意しない限り、この切替確認をdeploymentのblocking条件とする。

## 2026-07-25 — SDK監査実装のdevelop反映と実環境確認

### GitHub・Starter

- SDK監査、migration、Starter分離を含む109ファイルのtree
  `dceae06a24de2fb1a4cbac457960b07117fa0df3`を`develop`へ反映した。
  GitHub commitは`4e67b0983a6450d196b949d18e8effdbfd7081ec`である。
- development用Starter snapshot 36ファイルをtree
  `5c3efac828521e90a33d690b4f475b16bbda8f18`、
  commit`4e1b2772e6207febb763b7a9a11382f8b891dac1`として
  `sdk-starter-dev` branchへ公開した。
- 公開`starter-manifest.json`からDownloadMe ver10、Platform／Starter／SDK 0.1.1、
  SDK handshake／contract 1、ref `sdk-starter-dev`を再取得して確認した。
- stableの`sdk-starter`はver9／SDK 0.1.0の
  `389cb31924d78964e3393e0bab7c845519d55b9b`から動かしていない。

### Deployment・migration

- GitHub commit`4e67b098`から起動した以下3 Deploymentがすべて`READY`になった。
  - `app-games-dev`: `dpl_8MwRXzVYYyQPcxCNnxyygGhLmTkv`
  - `app-games-sdk-dev`: `dpl_8PHth63zHc2F7BYjGVy6ghNhprh1`
  - `app-games-preview-dev`: `dpl_H8cmVC9saFbmxpdsVZYDp7zU6LLo`
- SDK Portal buildで`001_sdk_registry.sql`、`002_sdk_portal_runtime.sql`、
  `003_immutable_packages_and_lifecycle.sql`を順に適用した。公開
  `GET https://sdk-dev.game-fields.com/api/health`は
  `status: ok`、`schemaVersion: 3`を返した。
- 3 ProjectともDeployment後1時間のVercel集約runtime errorは0件だった。

### 公開API smoke

- 公開handshakeはHTTP 200でPlatform／SDK 0.1.1、SDK contract 1、
  Room schema 2、development環境、7 capabilityを返した。
- OAuth authorization server／protected resource metadataはHTTP 200で、
  authorization code、refresh token、PKCE S256、`sdk:creator`／`sdk:mock`
  scopeを公開した。
- 未認証のMCPは401、内部Runtime catalogとPreview Runtimeは403、
  隔離Runnerは`SERVER_RUNTIME_FORBIDDEN`の403となり、内部境界が公開されていない。
- 次のblocking作業は、新しいWork／CodexスレッドからDownloadMe ver10と
  `sdk-starter-dev`を取得し、AIことば当てを無改造の検査対象として
  candidate提出、development昇格、複数ブラウザ正式Roomまで通す接続済みE2Eである。
- 初回`sdk-starter-dev`公開では6 Vercel Projectがbranchを検出し、本体3件は
  既存Ignored Build StepでCANCELEDになった。一方、SDK Portal 2件はbranch gateが
  実行されずNext.js root不足、隔離Preview 1件はRoot Directory
  `apps/sdk-preview`不足でERRORとなった。公開Starterと稼働中aliasには影響しない。
- Dashboard設定のドリフトへ依存しないよう、Starter snapshotのPortal／隔離Preview
  Rootへ公式`vercel.json`の`ignoreCommand`を追加した。`main`／`develop`以外は
  source側でも終了コード0とし、ゲーム提出ZIPにはこれらrepository用guardを含めない。

## 2026-07-25 — DownloadMe ver11のAI実行契約化

### 利用者からの要望

- DownloadMeは人間向けの自然な説明書ではなく、人間にはむしろ理解しにくく、
  AIが直接解釈する言葉と構造にする。

### 判断

- 意図的な暗号化や秘密情報の埋込みは行わず、読みづらさを安全境界にも使わない。
- 人間向けの導入説明はSDK Portalへ分離し、DownloadMe本体は定数、述語、
  global invariant、状態遷移、tool呼出し、停止条件、定型出力で構成する
  宣言的なAI実行契約とする。
- 入口契約の表現とMock公開手順が変わるためver10を上書きせずver11へ改版し、
  development Starterだけを`downloadMeVersion: 11`へ進める。安定版
  `sdk-starter`のver9／SDK 0.1.0は変更しない。

### 実施結果

- `sdk/entry/START_GAME_FIELDS.md`を`GF-AECP/11`形式へ変更し、
  `C0`定数、`I01`〜`I15`不変条件、`P_MOCK`／`P_FORMAL`完了述語、
  `S0`〜`S7`状態機械として制作フローを再定義した。
- 旧文書内で混在していたMock公開のCLI表現を解消し、新規Work／Codexは
  OAuth MCPの`publish_mock`／`publish_game_package`だけを使う契約へ統一した。
- SDK Portalへ「DownloadMeはAI向け実行契約なので、そのまま添付する」案内を追加し、
  配布URL、Content-Disposition、同期script、旧ver1〜10からのredirectをver11へ更新した。
- Starter manifest、Starter E2E、OAuth／MCP配布テスト、現行資料をver11へそろえ、
  development用`GameFieldsDownloadMe-ver11.md`を生成した。

### 検証

- DownloadMe／OAuth／MCPの対象テスト7件が成功した。
- `npm run test:sdk-starter`が成功し、公開snapshot、SDK install、型検査、
  契約テスト、1ゲーム完走、昇格診断、正式package、提出ZIPまで確認した。
- `npm run lint`成功、`npm test`全522件成功、本体とSDK Portalの
  Production buildが成功した。
- ローカルSDK Portal buildではDB migrationが`local/local`のdeploy gateにより
  skipされ、DownloadMe ver11生成後にbuildが成功した。

### 未対応・保留

- 変更はローカルcommitへ固定した。`develop` pushは外部公開の
  明示承認待ちであり、SDK-dev Deploymentと`sdk-starter-dev` snapshot更新も
  まだ行っていない。
- 実環境へ反映後、新しいWork／Codexスレッドでver11を添付し、
  状態機械形式をAIが最後まで解釈できることを接続済みE2Eで確認する。

## 2026-07-25 — DownloadMe ver11のdevelop公開

### 利用者からの要望

- ローカルcommit `a934d52`のDownloadMe ver11変更を
  `koromo2010/app-games`の`develop`へpushする。

### 実施結果

- GitHub連携で11ファイルのblobを照合し、ローカル`a934d52`と同じtree
  `f792b4fddf45146078027dff7126d27161cc1f6a`を
  GitHub commit `889113a77a7cfb2edf1f8a5f8f193e9beb95d187`として
  `develop`へfast-forwardした。force更新は使用していない。
- development Starter 38ファイルをtree
  `b14c3fb9fbb31015d95d375612b074c45130a806`、
  commit `eab69e165e86f76811994dfe69a102f01e730867`として
  `sdk-starter-dev`へfast-forwardした。
- 公開Starter manifestでDownloadMe ver11、Platform／Starter／SDK 0.1.1、
  handshake／contract 1、ref `sdk-starter-dev`を再取得した。
- stableの`sdk-starter`はver9／SDK 0.1.0の
  `389cb31924d78964e3393e0bab7c845519d55b9b`から動かしていない。
- `main`とnpm packageは変更していない。

### 検証

- `develop`のGitHub commitから起動した`app-games-dev`、
  `app-games-sdk-dev`、`app-games-preview-dev`の3 Deploymentは
  すべて`READY`になり、いずれもcommit `889113a`を取得している。
- `https://sdk-dev.game-fields.com/GameFieldsDownloadMe-ver11.md`はHTTP 200で、
  配信内容のSHA-256がcommit内のver11ファイルと一致した。
- 旧`GameFieldsDownloadMe-ver10.md`はHTTP 307でver11へ転送され、
  転送後の内容もver11と一致した。
- 公開`/api/health`は`status: ok`、`schemaVersion: 3`を返した。
- `sdk-starter-dev`更新を検出した6 Vercel Projectはすべて
  source側branch guardにより`CANCELED`となり、不要buildとERRORは発生しなかった。

### 関連コミット

- `889113a` — DownloadMe ver11のAI実行契約を`develop`へ反映。
- `eab69e1` — development Starterをver11へ更新。

### 未対応・保留

- 次は新しいWork／Codexスレッドへ公開DownloadMe ver11を添付し、
  AIことば当てを固定検査対象としてcandidate提出、development昇格、
  複数ブラウザ正式Roomまで接続済みE2Eを行う。

## 2026-07-25 — ChatGPT側gameapp-dev定義の版ずれ確認

### 利用者からの要望

- `gameapp-dev`の最新版を0.1.1と案内したが、ChatGPTのプラグイン管理画面では
  バージョン注記が`dev-8`であり、数値が一致しない理由を確認する。

### 判断

- `0.1.1`はSDK Portalがhandshakeで返すPlatform／SDK package版であり、
  ChatGPTへ登録したApp定義のバージョン注記ではない。先の「プラグイン最新版は
  0.1.1」という案内は層を混同していたため訂正する。
- DownloadMe `ver11`、Platform／SDK package `0.1.1`、SDK handshake `1`、
  Room schema `2`、ChatGPT App定義の注記`dev-8`は別々の版系列として扱う。

### 実施結果

- 利用者の管理画面で、現在接続中の`gameapp-dev`はバージョン名`dev mode`、
  バージョン注記`dev-8`と確認した。
- Workのtool discoveryで読み込まれる定義は、handshakeの
  `requiredCapabilities`が旧4件までで、現行Portalに存在する
  `publish_game_package`も公開していなかった。
- 公開`/.well-known/game-fields-sdk`はPlatform／SDK package `0.1.1`、
  capability 7件を返した。したがって、Portal serverだけが現行化され、
  ChatGPT側App定義は更新前の状態である。

### 未対応・保留

- ChatGPTのプラグイン管理画面で`gameapp-dev`を更新し、更新後の新規チャットで
  `publish_game_package`と7 capabilityを含む現行tool schemaが見えることを
  実機確認する。今回は外部App設定を変更していない。

## 2026-07-25 — 旧ChatGPT tool schemaの再発防止とDownloadMe ver12

### 利用者からの要望

- ver11への更新と新規チャットを案内した後も、保存済み制作者環境からver10、
  安定版`sdk-starter`、旧4 capabilityを参照した同じ問い合わせが届く状態を解消する。

### 判断

- ChatGPT側でプラグインを更新しても、既存チャットへ読み込まれたtool schemaは
  差し替わらない。古い制作チャットへ新しいDownloadMeを追加して継続させず、
  更新後に作成した新しいWork／Codexチャットへ最新版だけを添付させる。
- 保存済み制作者環境とゲームはChatGPTの会話ではなくSDKアカウント側が正本であり、
  新しいチャットから`list_creator_environments`で再取得する。チャット移行のために
  制作者環境を作り直したり新しいslugを予約したりしない。
- `requiredCapabilities`をMCP入力schemaの固定enumにすると、capability追加のたびに
  古いschemaが未知名を送れずhandshake前に停止する。構文上有効な将来名を許可し、
  未提供名はserver側の`CAPABILITY_UNAVAILABLE`で返す。
- 入口契約と利用者導線が変わるためver11を上書きせず、DownloadMeとdevelopment
  Starterをver12へ上げる。安定版`sdk-starter` ver9／SDK 0.1.0は正式E2E前のため
  変更しない。

### 実施結果

- `get_sdk_handshake.requiredCapabilities`を自由なkebab-case文字列へ変更し、
  1件64文字、最大64件に制限した。SDK coreは未知の有効名を
  `CAPABILITY_UNAVAILABLE`、不正な構文を`INVALID_REQUEST`として区別する。
- DownloadMe ver12は添付されたDownloadMeが1件かつver12であることを入口で検査し、
  古い添付または7 capabilityを受け付けないtool schemaでは、新規チャットへの
  切替定型文を出して停止する。
- SDK Portalに、プラグイン更新後は必ず新しいチャットを作り、ver12だけを添付する
  ことと、保存済み環境は新しいチャットから再取得できることを表示した。
- 旧DownloadMe URL 1〜11はver12へ転送する設定とし、development Starter manifestを
  `downloadMeVersion: 12`へ更新した。
- 先の記録を訂正し、現在のWork tool discoveryでは`gameapp-dev`の8 toolと
  7 capability入力が見え、公開development Portalへのhandshakeは
  `accepted: true`であることを確認した。管理画面の`dev-8`は別の表示注記である。

### 検証

- 全523テスト成功。
- Starter E2E成功。公開snapshot／ZIP一致、SDK install、型検査、契約テスト、
  デモ完走、提出ZIPまで確認した。
- `npm run lint`成功。
- 本体production buildとSDK Portal production build成功。
- live `gameapp-dev`からPlatform／SDK 0.1.1、7 capabilities、
  `accepted: true`を確認した。ver12と自由文字列schemaは未公開のため、
  dev Deployment後の再確認が必要。

### 未対応・保留

- 変更を`develop`へ反映し、3開発Deploymentの`READY`、ver12配布、
  ver11 URLの転送、自由文字列schema、`sdk-starter-dev` ver12を実機確認する。
- 更新後に作成した新しいWork／Codexチャットでver12を単独添付し、
  保存済み制作者環境の再取得から制作を再開できることを正式E2Eで確認する。

## 2026-07-25 — DownloadMe ver12のdevelop公開

### 利用者からの要望

- ローカルcommit `8367bf1`の旧ChatGPT tool schema再発防止と
  DownloadMe ver12変更を`koromo2010/app-games`の`develop`へpushする。

### 実施結果

- ローカル`8367bf1`と同じtree
  `23c549929140a7e1862af9da86fa021c2e6c8ed3`をGitHub commit
  `ed27ec8ae8fb5824bde610afb707dfc2d42b1898`として`develop`へ
  fast-forwardした。force更新は使用していない。
- development Starter 38ファイルをtree
  `2c455eb43f6092e59258f394d76608a8f7be51ba`、commit
  `ceda501bf1aa3c52a106f7ec4d68151be440c11d`として
  `sdk-starter-dev`へfast-forwardした。
- 公開Starter manifestはDownloadMe ver12、Platform／Starter／SDK 0.1.1、
  handshake／contract 1、ref `sdk-starter-dev`である。
- stableの`sdk-starter`はver9／SDK 0.1.0のまま変更していない。
  `main`とnpm packageも変更していない。

### 検証

- `develop`のGitHub commitから起動した`app-games-dev`、
  `app-games-sdk-dev`、`app-games-preview-dev`の3 Deploymentは
  すべて`READY`になり、commit `ed27ec8`を取得している。
- `https://sdk-dev.game-fields.com/GameFieldsDownloadMe-ver12.md`は
  HTTP 200で、配信内容のSHA-256
  `692a561b49f6139ee4eeb6fb2839af37f26c00826ac5b373130b52bd1a3c8476`が
  commit内ファイルと一致した。
- 旧`GameFieldsDownloadMe-ver11.md`はHTTP 307でver12へ転送された。
  公開`/api/health`は`status: ok`、`schemaVersion: 3`を返した。
- live `gameapp-dev`でPlatform／SDK 0.1.1、7 capabilities、
  `accepted: true`を確認した。
- `sdk-starter-dev`更新を検出した6 Vercel Projectはすべて
  branch guardにより`CANCELED`となり、不要buildは実行されなかった。

### 関連コミット

- `ed27ec8` — DownloadMe ver12と旧schema再発防止を`develop`へ反映。
- `ceda501` — development Starterをver12へ更新。

### 未対応・保留

- プラグイン更新後に作成した新しいWork／Codexチャットへver12だけを添付し、
  保存済み制作者環境の再取得からCandidate提出まで正式E2Eを行う。

## 2026-07-25 — 一般語easyに低認知語「度者」が混入する

### 利用者からの要望

- SDK PreviewのAIことば当てで、難易度「簡単」にもかかわらず、一般には知られて
  いない「度者」が秘密語として出題された原因を調査する。

### 判断

- AIことば当て固有の難易度受渡しは正常で、保存packageはRoom設定の
  `wordDifficulty`をそのまま`general-words`の`drawWords`へ渡している。
- 問題は共通の一般ゲーム語Repositoryにある。現在の候補条件は
  `active_words`、非固有名詞、実効Zipf帯だけであり、「一般ゲーム語として審査済み」
  という公開SDK契約上の条件を検査していない。
- 2026-07-24の共通単語DB切替前は、環境別アプリDBの
  `shared_word_pool_evaluations`で`standard-game`、`eligible`、
  `general_game_pool`、難易度flagを要求していた。未定義relation障害を解消する際、
  読取先を共通DBの`active_words`へ変更したことで、この品質ゲートが失われた。
- 個別語を共通DB全体でrejectすると、たほい屋等の別用途まで失う。修正時は共通DBへ
  一般ゲーム用のgame-specific eligibility／難易度審査を保持し、SDK、
  ワードアウト、コードインターセプトが同じ審査済みviewを読む形にする。

### 実施結果

- Vercelの実行ログで、該当AIことば当てがcandidate packageから
  `drawWords`、`findDefinitions`、秘密語プロフィール生成をすべて成功させている
  ことを確認した。モック固定語彙やLLM生成語へのfallbackではない。
- 該当package revisionの`source/app-set.ts`を確認し、
  `difficulty: settings.wordDifficulty`で共通content sourceへ要求していることを
  確認した。
- `easy`要求はeasy 100%であり、RepositoryのSQL上は実効Zipf 5.5〜6.5だけを返す。
  したがって「度者」は共通DBで非固有名詞かつeasy帯として扱われている。
  読取専用DB接続値はローカルにないため、個別行の正確なZipf値・読み・出典は
  この調査では直接取得していない。
- 旧カタログ移行処理は取込語を一律`proper_noun = FALSE`、`status = active`とし、
  品詞や一般ゲーム適格性を移していないことも確認した。このためZipfだけでは
  古語・専門語・辞書的には実在する低認知語を除外できない。

### 検証

- 現行develop commitとVercelの対象Deploymentが同じ共通Repository実装を使用して
  いることを確認した。
- 保存packageの難易度受渡しと、ライブの`drawWords`成功を照合した。
- コード、DB、Vercel、保存package、公開状態は変更していない。

### 未対応・保留

- 共通DBへ一般ゲーム用の審査済みeligibilityと難易度を導入し、旧
  `standard-game`適格語を移行する。
- 「度者」を一般ゲーム対象外にしたうえで、easy／normal／hardの候補を一括監査する。
- SDKだけでなく、同じRepositoryを使うワードアウトとコードインターセプトも
  回帰確認する。

## 2026-07-25 — 一般ゲーム語を保存済み分類へ戻す

### 利用者からの要望

- 旧一般語プールにはeasy／normal／hardを分類した保存済みフラグがあるため、
  Zipf値から分類し直さず、その分類を使う形で修正する。

### 判断

- 新しい品質判定や「度者」だけのブラックリストは作らない。
- 旧`shared_word_pool_evaluations`の`standard-game`適格行が持つ
  `general_game_pool`と`difficulty_*`を、共通DB既存の
  `word_game_eligibility`へ3つの有効行として保存する。
- Repositoryは`standard-game`、`general_game_pool`、保存済み難易度flagが
  すべて揃うactive語だけを返す。これによりSDK、ワードアウト、
  コードインターセプトが同じ審査済み集合を使う。

### 実施結果

- `lib/general-game-word-classification.ts`へ保存済み分類契約と旧行の正規化を追加した。
- `lib/general-game-word-repository.ts`からZipf帯による難易度再生成を除去し、
  共通DBの保存済みeligibilityを参照するSQLへ戻した。
- `scripts/import-legacy-general-game-classifications.ts`を追加した。dry-runを既定とし、
  共通DB側の対応語が不足する場合はapplyを拒否し、適用時は旧分類を冪等同期する。
- 現行仕様文書と環境変数台帳を保存済み分類基準へ更新した。

### 検証

- 対象テスト35件成功。
- `npm run lint`成功。
- `npm test`全525件成功。
- `npm run build`成功。
- SDKの`general-words`、ワードアウト、コードインターセプトが同じ
  `general-game-word-repository`を使うことを確認した。

### 未対応・保留

- この作業環境には旧DB読取用および共通DB管理用の接続設定がないため、
  分類移行のdry-run／applyは未実行。DB、Vercel、公開環境は変更していない。
- develop反映前に移行元の審査済み件数、共通DB対応件数、難易度別件数をdry-runで
  照合し、不足0件を確認してからapplyする。
- コードは未コミット・未push。devでeasy抽選に低認知語が混入しないことの
  実機確認は、分類同期とdevelop反映後に行う。

## 2026-07-25 — 一般ゲーム語分類移行のdry-run停止

### 利用者からの承認

- 共通Word DBへ旧347語の保存済み分類を適用し、`develop`へpushする承認を得た。

### 実施結果

- 保存済み分類を参照するRepository、冪等移行スクリプト、回帰テスト、仕様文書を
  `develop`へforceなしで反映した。
- `app-games-dev`のProduction buildを一時dry-run実行経路として使い、秘密値を
  出力せず移行元と移行先のschemaを検査した。
- 共通語彙DB管理接続は利用可能だったが、`LEGACY_WORD_DATABASE_URL`は
  `app-games-dev`へLinkされていなかった。既存のDB互換接続も
  `shared_word_catalog`と`shared_word_pool_evaluations`を持たず、
  `LEGACY_GENERAL_GAME_CLASSIFICATION_SOURCE_NOT_FOUND`で適用前に停止した。
- 一時build hookは撤去し、通常のbuildへ戻した。共通Word DBへの書込みは
  1件も実行していない。

### 検証

- 実装時点で`npm test`全525件、`npm run lint`、`npm run build`が成功した。
- dry-run失敗は分類件数や不足語ではなく、旧分類DBへの接続未配置によるものと
  buildログで確認した。

### 未対応・保留

- 旧`app-games-neon`の`shared_word_catalog`と
  `shared_word_pool_evaluations`をSELECTできる読取専用URLを、
  `app-games-dev` Productionの`LEGACY_WORD_DATABASE_URL`へ一時Linkする。
- Link後にdry-runで一意分類347件・不足0件を確認し、共通DBへ冪等適用する。
- 適用後に一時変数を削除し、easy抽選で「度者」が対象外かつ審査済み語だけに
  なることをSDK、ワードアウト、コードインターセプトで確認する。

## 2026-07-25 — 旧分類DBの読取権限不足で再停止

### 利用者による外部設定

- `app-games-dev`のProductionへ`LEGACY_WORD_DATABASE_URL`をProject Variable・
  Sensitiveとして登録した。

### 実施結果

- dry-run専用build hookを一時的に`develop`へ反映し、新しい環境変数を読み込む
  Production Deploymentを作成した。
- 旧DBへの接続と`shared_word_catalog`の存在確認は通ったが、
  `vocabulary_migration_reader`による`shared_word_pool_evaluations`の読取が
  PostgreSQL `42501`で拒否された。
- dry-runは旧分類の取得中に停止しており、共通Word DBへの書込みは行っていない。
- 一時build hookを撤去し、`develop`を通常buildへ戻す。

### 検証

- hook反映前に`npm run lint`、全525テスト、`npm run build`が成功した。
- Vercel build logで対象commit、`app-games-dev/develop`、権限不足の対象表と
  PostgreSQLコードを確認した。接続文字列や秘密値は記録していない。

### 未対応・保留

- `app-games-neon/main/neondb`で`vocabulary_migration_reader`へ
  `shared_word_catalog`と`shared_word_pool_evaluations`の`SELECT`を付与する。
- 付与後にdry-runを再実行し、一意分類347件・不足0件の場合だけapplyする。
- 移行完了後に`LEGACY_WORD_DATABASE_URL`と一時読取権限を削除する。

## 2026-07-25 — 審査済み一般ゲーム語の共通DB移行完了

### 利用者による外部設定

- `app-games-neon/main/neondb`で`vocabulary_migration_reader`へ
  `public` schemaの`USAGE`と、`shared_word_catalog`、
  `shared_word_pool_evaluations`の`SELECT`を付与した。
- 接続文字列や秘密値はログ、文書、commitへ記録していない。

### dry-run・不足語同期

- 権限付与後のdry-runで、旧選定347行、surface＋reading正規化後346語、
  easy 119／normal 164／hard 63を確認した。
- 初回は共通DBの対応319語・不足27語だった。内訳はreading違いでsurfaceだけ一致が
  3語、surface自体が存在しないものが24語で、inactiveや曖昧一致はなかった。
- `--sync-missing-words`で審査済み旧選定行に対応する不足27語だけを
  旧カタログのsurface、reading、Zipf、文字数から冪等追加した。既存語と既存Zipfは
  変更していない。
- 再dry-runで対応346語、不足0、全診断0を確認した。

### 分類適用・回帰確認

- `--apply`を一度だけ実行し、346語へ`standard-game`、
  `general_game_pool`、各`difficulty_*`の3条件を冪等同期した。
- 適用結果はeasy 119語、normal 164語、hard 63語である。
- その後の読取専用dry-runでも旧347行、346語、対応346語、不足0を再確認した。
  `regressionChecks.unreviewedEasyTermExcluded`は`true`で、「度者」は審査済み
  General Game Poolに含まれない。
- DB適用Deployment `dpl_Dhk2kFYru2GppnhV8pmKXyhZVqno`は`READY`。
  読取回帰Deployment `dpl_hYtVCPDTRyChXJojX8CJmPsX1SQy`で上記件数を確認した。

### コード・検証

- `scripts/import-legacy-general-game-classifications.ts`へ件数固定の安全停止、
  不足語の限定同期、match診断、適用後集計、回帰確認を追加した。
- 一時Vercel build hookは最終commitで撤去し、通常の
  `npm run build:runtime-packages && next build`へ戻す。
- ローカルで`npm run lint`、`npm test`全525件、`npm run build`が成功した。
- `develop`へはforceなしで反映し、`main`、stable Starter、npmは変更していない。

### 未対応・保留

- `app-games-dev` Productionの`LEGACY_WORD_DATABASE_URL`を削除する。
- 旧DBで`vocabulary_migration_reader`の旧2表`SELECT`とschema `USAGE`をrevokeする。
- 外部設定削除後、通常buildの再デプロイで現行Deploymentへ旧接続が残らないことを
  確認する。

## 2026-07-25 — SDK formal package共通Shellのphase別モジュール化

### 利用者からの要望

- WordWolf／たほいやにあるフィードバック、履歴保存、結果共有をSDKゲームでも
  ゲーム固有実装ではなく共通モジュールとして使う。
- manifestのルールをページ下部へ常設せず、共通トップバナーから開けるようにする。
- 部屋設定等はロビーだけに表示し、対戦中は既定で消してゲーム領域を優先する。

### 判断

- 保存済みAIことば当てのAppSet、client、package revisionは変更しない。
  formal packageの外側にあるPlatform Shellとruntime catalogの接続を修正する。
- phaseごとの既定を、lobby=`参加者・部屋設定・開始`、
  playing=`トップバナー・中断・全幅game iframe`、
  result=`標準結果・再戦・履歴・匿名共有・フィードバック`とする。
- ルール本文はmanifestを正本とし、全phaseで本体共通`GameTopBanner`の
  `GameRulesDialog`から開く。
- `feedback`を独立した39番目のmodule IDとして追加する。Portalで人間が確定した
  module profileをdevelopment／stable runtime catalogへ渡し、画面だけでなく
  stats／rating／replay保存とLLM artifact captureにも同じ採否を使う。

### 実施結果

- formal package Shellを`GameSdkShellHeader`へ接続し、共通トップバナー、ルール、
  共通メニュー、プレイヤーメニュー、AI通信表示を利用するようにした。
- playingでは共通サイド欄を描画せずgame iframeを全幅化し、hostの中断操作だけを
  トップバナーへ移した。部屋設定はlobby限定、結果用moduleはresult限定である。
- standard resultを共通表示し、`replay`は本人の`/users/me`、`result-share`は
  `PLAYERn`形式の匿名共有へ接続した。`stats`、`rating`、`replay`の永続化も
  保存済みmodule profileへ連動する。
- LLM成功effectのresponseだけをRoom単位・最大8件・Room TTLで一時保存する
  feedback targetを追加した。promptは保存しない。candidate／approved双方の
  participant-only result APIから取得し、既存`GameFeedbackPanel`へ接続した。
- 保存されたGood／Bad・理由・自由記述は既存共通feedback storeへ入り、次回の
  同一SDK game/task生成でuntrustedな参考例として利用する。入力promptを優先し、
  合計20,000文字を超えるfeedback例は追加しない。
- module catalogを全39件（Platform固定7、共通Shell17、進行helper11、
  resource 4）へ更新した。development配布契約は旧ver12を上書きせず
  `GameFieldsDownloadMe-ver13.md`／`downloadMeVersion: 13`へ進め、
  ver12までをver13へ一時redirectする。

### 検証

- SDK Shell、module profile伝播、結果phase membership、匿名共有、feedback RAGの
  対象テスト34件成功。
- `npm test`全528件成功。
- `npm run lint`成功。
- `npm run test:sdk-starter`成功。入口、公開Git用snapshot、ZIP展開、同梱SDK
  install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。
- 本体`npm run build`成功。
- SDK PortalはDB migrationを実行しない直接`next build`でproduction build成功。

### 未対応・保留

- コードは未コミット・未pushで、DB、Vercel、保存済みpackage revisionは
  変更していない。
- `develop`反映後にAIことば当ての実Roomで、ロビーの部屋設定、playing全幅表示、
  トップバナーのルール、中断、resultの履歴・匿名共有・feedbackを複数ブラウザで
  人間確認する。
- development Starter branchとPortalのver13公開は、今回の変更を明示承認後に
  forceなしで反映する。

## 2026-07-25 — SDK active Room復元中の新規作成競合を共通修正

### 利用者からの要望

- AIことば当ての新revision確認時に表示された`PLAYER_ACTIVE_ROOM`も、
  ゲーム固有ではなくSDK共通Room側で解消する。

### 判断

- Redis Storeはすでにresult、期限切れ、欠損、非参加Roomを移動可能としており、
  進行中かつ本人が参加中のRoomだけを安全に拒否していた。
- 原因はformal package Shellが初回`readActiveRoom()`完了前から新規作成UIを
  操作可能にしていた初期化競合である。進行中Roomの索引を強制削除せず、
  復元を先行し、競合時は既存Roomへ戻す。

### 実施結果

- candidate／development／stableのformal package Shellと旧静的SDK Shellで使う
  `useGameSdkActiveRoomRestore`を追加した。
- active Room確認中は作成・参加画面の代わりに復元中表示を出し、確認後だけ入口を
  有効にする。参加中Roomがあれば自動接続する。
- 別タブ等との競合で`PLAYER_ACTIVE_ROOM`が返った場合もactive Roomを再取得し、
  「進行中の部屋へ戻りました」と表示して復帰する。
- result Roomを残したまま新規Roomへ移動でき、旧結果Roomの解散で新Roomのactive
  索引を消さないことをRuntime縦断テストへ追加した。

### 検証

- `npm run lint`成功。39モジュール境界、環境変数台帳、9ゲーム共通要件、
  SDK migrationを含む。
- `npm test`全528件成功。
- 本体、SDK Portal、隔離Previewのproduction build成功。
- `npm run test:sdk-starter`成功。ver13の入口、公開Git用snapshot、ZIP展開、
  同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。

### 未対応・保留

- `develop`へ反映後、AIことば当ての実Roomで初回復元中に作成操作が出ないこと、
  既存Roomへの自動復帰、result後の新規Room作成を人間確認する。

## 2026-07-25 — AIことば当てを結果presentation契約へ移行

### 利用者からの要望

- AIことば当てを、共通結果Shell、多言語終了理由、安全な共有要点、本人用詳細ログを
  持つ現行SDK契約へ移行する。

### 判断

- AppSetの機械判定用`reason`は安定した内部codeのまま保持し、画面・共有・履歴には
  `presentation.reason`の日英文言を渡す。
- `presentation.highlights`は共有して安全な最大3件、
  `presentation.playLog`は参加者本人向けの最大50件とし、秘密語、内部player ID、
  prompt等は含めない。
- 旧Roomの不足fieldはclient側で空配列等へ正規化し、保存済みRoomの復元で新clientが
  例外にならないようにする。
- sandbox iframe内でbuttonの既定submitが伝播しない環境にも対応するため、
  form submitを残した上で最終回答buttonの明示click handlerを追加する。

### 実施結果

- 協力・対戦のstandard resultへ、日英の終了理由、匿名`PLAYERn`表記の共有要点、
  時系列プレイログを追加した。完了した最後の1手もログへ含める。
- 旧Room viewの`history`、`targetOptions`、`revealedSecrets`等が欠損しても
  clientが描画できる後方互換処理を追加した。
- 正式packageをCandidate revision
  `74e45e07fe1feb7855c2e246cdd358569e4d280c`として保存した。
  package rootは
  `b3b24bb5afc875a369ca79d17c859334a3ae8e183c6eb7c916836463c18c3504`、
  AppSet SHA-256は
  `13da5558a798c5f7421451d1d7d632ee19e69e604648b9effeade0615c6f3afc`、
  server bundle SHA-256は
  `a868160e762ba1e1d0663795ffbc2491ceaebb25e3bfb039f2d0741b0786a7ff`で固定した。

### 検証

- TypeScript build、package build、契約テスト3件が成功した。
- 保存済みCandidateを正式Roomで復元し、最終回答buttonからRoom revisionが進み、
  AI判定後に誤答が人間向け表示で履歴へ追加されることを確認した。
- 20手を完走し、共通結果Shellに「手数上限に達したため終了」、履歴、共有、
  feedbackが表示され、ゲーム固有結果に20手の推理履歴が表示されることを確認した。
- AI生成物は生JSONではなく「ゲーム進行に使うデータを生成しました」と表示された。
- 現Candidate由来の新規browser例外はなく、確認されたgame client例外は途中で破棄した
  旧revisionだけに限定される。

### 未対応・保留

- Candidateから`development`へのhash固定昇格は未実施である。
- 現在の制作者向け`gameapp-dev`接続はpackage提出までで昇格toolを公開していない。
  内部promotion APIは`SDK_ACCOUNT_LINK_SECRET`によるservice署名専用であり、
  この作業環境には署名値がない。DB直書きや秘密値の持ち出しは行わない。
- operator用の安全なpromotion callableを追加するか、既存の署名済み運用経路から
  上記Candidate revisionを`development`へ昇格し、同一revision／SHA-256、
  development実Room、履歴保存、共有文を再確認する。

## 2026-07-25 — 本人所有Candidateのdevelopment昇格tool

### 利用者からの要望

- AIことば当てのCandidate移行を続けるため、所有者確認付きの安全な昇格toolを
  追加する。

### 判断

- OAuth接続した一般制作者へは、本人所有Candidateをdevelopmentへ移す権限だけを
  提供する。stable昇格、channel解除、他制作者の操作は公開しない。
- 昇格入力には`publish_game_package`が返したrevision、package root SHA-256、
  server bundle SHA-256、AppSet原文SHA-256をすべて必須とする。現在のCandidateと
  1件でも異なれば停止し、保存物を再build、変換、補正しない。
- stable公開は従来どおり、本体管理者セッションと直近MFAからサービス署名APIを
  呼ぶ運営経路だけに残す。

### 実施結果

- SDK OAuth MCPへ`promote_game_package_to_development`を追加した。
- tool呼出し時に、OAuthのplayer IDと制作者slugの所有者を照合し、development
  Portal以外では拒否する。
- 共通promotion serviceへCandidate／development source選択、期待hash照合、
  隔離Runtime manifest再検査、CAS付きpointer更新、append-only履歴記録を集約した。
  既存のMFA付き内部promotion APIも同じserviceを使う。
- OAuth許可画面へ正式package保存と本人Candidateのdevelopment昇格を明示し、
  stable／本体DB／管理画面／他人環境へアクセスできないことを表示した。
- AI実行契約をver15へ更新した。所有者が明示的に昇格を求めた場合だけ、提出応答の
  revisionと全hashをそのままtoolへ渡し、応答の同一性を再確認する。

### 検証

- `npm run lint`成功。
- `npm test`全532件成功。
- 本体、SDK Portal、隔離Previewのproduction build成功。
- `npm run test:sdk-starter`成功。ver15入口、公開Git用snapshot、ZIP展開、
  同梱SDK install、型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。
- source回帰テストで本人所有確認、development環境限定、全hash必須、
  stable tool非公開を固定した。

### 未対応・保留

- `develop`へ反映し、SDK Portal deployment完了後に新toolを再取得する。
- AIことば当てCandidate revision `74e45e07fe1feb7855c2e246cdd358569e4d280c`
  を同一hashのままdevelopmentへ昇格し、development実Roomを確認する。

## 2026-07-26 — 広場表示と昇格経路の設計修正

### 利用者からの要望

- 広場の既存カードを残し、PC／スマホ対応の簡易一覧表示と切替ボタンを追加する。
  選択は`localStorage`へ保存し、公開状態、タグ、参加中Room、入室導線を維持する。
- SDK専用の白枠を廃止し、本番と同じ`GameFrame → AppSet`を使う。
- 従来の`SDK → dev → main`理解を破棄する。SDK作品の`SDK → main`採用と、
  本体コードの`dev → main`反映を独立させる。`dev`はmainの検証環境に限定する。

### 判断

- SDK制作者はpackage提出までとし、devまたはmainへ昇格するMCP toolを持たない。
- 運営のSDK採用はcandidateのrevisionと全hashを再照合し、main採用カタログへ直接
  固定する。本体コード反映はGitHub branchの別操作とする。
- `dev → main`はmain側管理画面だけに置き、main/develop SHAの再確認と
  fast-forward可能性を条件に`force: false`で更新する。

### 実施結果

- 広場へカード／簡易一覧の切替と保存、共通の入室／復帰判定を追加した。
- formal SDK shellを共通`GameSdkFrame`へ移し、candidate Previewとmainで共有した。
  legacy Preview外側の白いborder、背景、shadowも除去した。
- 管理画面へ「SDK作品採用」と「dev反映」の独立sectionを追加した。
- SDK promotion serviceをcandidateからmain採用カタログへの直接反映へ変更し、
  制作者向けdevelopment昇格toolをOAuth MCPとDownloadMeから削除した。
- 本体`dev → main`用のGitHub compare、SHA再確認、非force ref更新APIと監査記録を
  追加した。書込資格は本番本体だけに置く新規環境変数として台帳化した。

### 検証

- 新しい直接採用、hash固定、dev fast-forwardの単体テストを追加した。
- DownloadMe ver15を新契約から再生成した。
- `npm run lint`成功。環境変数台帳61キー、9ゲーム共通要件、SDK境界、
  SDK migration 3件とESLintを確認した。
- `npm test`全537件成功。
- 本体、SDK Portal、隔離Previewのproduction build成功。
- `npm run test:sdk-starter`成功。入口、公開Git snapshot、ZIP展開、同梱SDK install、
  型検査、契約テスト、1ゲーム完走、提出ZIPを確認した。
- 人間E2E用に本体dev serverを`127.0.0.1`固定で起動し、ブラウザ操作検査を開始した。
  ただし作業環境には`agent-browser`とPlaywright browser実体がなく、Cloud Browserは
  localhostを`ERR_BLOCKED_BY_CLIENT`で拒否したため、画面操作の完了確認はdev公開後へ
  持ち越した。production buildとソース回帰テストは通過している。

### 前記録の訂正

- 直前の「本人所有Candidateのdevelopment昇格tool」は今回の設計判断で撤回した。
  `promote_game_package_to_development`は公開せず、AIことば当てを含むSDK作品を
  developmentへ昇格する未対応項目も破棄する。

### 外部設定

- Vercel Team `game-fields` / Project `app-games` のProductionへ
  `GAME_FIELDS_GITHUB_RELEASE_TOKEN`をSensitiveで登録した。
- tokenは`koromo2010/app-games`だけを対象とするFine-grained personal access tokenで、
  Repository permissionはContents read/writeに限定した。
- 秘密値はGit・文書へ保存していない。新しいProduction Deploymentでの読込と
  管理画面からの実機確認は、本変更のmain反映後に行う。

## 2026-07-26 — 管理者MFAの復旧導線

### 利用者からの要望

- dev管理画面でメールとパスワードの後に既存パスキーを要求されたが、復旧モードの
  管理者アカウント画面にMFA再設定の操作がなく、通常ログインへ戻れなかった。

### 判断

- パスワード更新だけでは既存パスキーは解除しない。マスターパスワードによる
  復旧セッションに限り、対象管理者の全パスキーと旧復旧コードを無効化する。
- リセット後は復旧モードを無効化し、メールとパスワードによる次回ログインで
  WebAuthnの新規登録フローを再利用する。操作は確認ダイアログと監査ログを必須にする。

### 実施結果

- 復旧モードの管理者一覧へ「MFAを再設定」を追加した。
- 対象管理者のパスキーと復旧コードを削除する復旧専用APIとstore処理を追加した。
- 通常の管理者セッションからのMFAリセットは403で拒否する。

### 検証

- `npm run lint`成功。
- `npm test`全537件成功。
- 本体production build成功。

### 未対応・保留

- `develop`へのpushとdevへの反映、MFAリセットまでは完了した。
- devで新しいパスキーをブラウザへ保存した後、サーバー検証が失敗した。原因は
  `SITE_ADMIN_WEBAUTHN_ORIGIN`が未設定で、本番Originだけが既定許可されていたこと。
- `app-games-dev` Productionへ
  `SITE_ADMIN_WEBAUTHN_ORIGIN=https://dev.game-fields.com`を登録し、再デプロイ後に
  パスキー登録と通常ログインを実機確認する。
- 通常ログイン確認後、`SITE_ADMIN_BREAK_GLASS_ENABLED`を削除して再デプロイする。

## 2026-07-26 — 昇格管理のdev試作表示と環境変数変更マスター

### 利用者からの要望

- 昇格管理をいきなりmainへ入れず、まずdev管理画面で確認できるようにする。
- 環境変数の設定依頼時にGit側の管理台帳更新が漏れない仕組みを入れる。

### 判断

- devではSDK→mainとdevelop→mainの候補・差分・UIを表示するが、実行ボタンを無効化し、POST APIも従来どおりmain限定とする。
- 現在配置のMarkdown台帳とは別に、進行中の設定依頼を`config/environment-change-registry.json`で機械可読に管理する。案内前に`requested`登録し、登録・再デプロイ・実機確認を別状態として進める。

### 実施結果

- `develop`の管理画面へ「昇格管理」を試作表示し、devであることと実更新不能を明示した。
- devのGET APIからSDK候補とmain/develop比較を読めるようにした。両POST APIのmain限定境界は維持した。
- 環境変数変更マスターとCI検査を追加し、今回の管理パスワード、break-glass削除依頼、WebAuthn Origin追加依頼を登録した。

### 検証

- `npm run lint`成功。環境変数コード参照61件と変更依頼3件の整合を確認した。
- 全537テスト成功。
- production build成功。

### 未対応・保留

- `develop`へpush後、`app-games-dev`のDeploymentがREADYになることと、管理画面の昇格管理タブを実機確認する。
- `SITE_ADMIN_WEBAUTHN_ORIGIN`登録・再デプロイ・パスキー通常ログイン確認後、マスターの状態を進める。
- 復旧完了後に`SITE_ADMIN_BREAK_GLASS_ENABLED`を削除し、再デプロイ・無効化を確認する。

## 2026-07-26 — SDK制作者ダッシュボードのひな形

### 利用者からの要望

- 正式提出しなかった試作も含め、アカウントにぶら下がるゲームを後からすべて
  見つけられるようにする。
- SDK側にクライアント制作者向けUIを用意し、標準ONの共通モジュールも管理したい。

### 判断

- 正式提出は本番採用候補へ送る操作として維持し、制作物の保存・一覧表示とは分離する。
- SDKアカウントの`owner_player_id`を本人境界にし、所有する全制作環境を横断して
  `draft / mock / submitted / development / stable`のゲームを表示する。
- 必須モジュールは解除不可のまま維持し、「解除可能」または任意のモジュールだけを
  既存module policy画面からON/OFFする。
- ひな形段階では人間向け提出ボタンを設けず、未提出ゲームには制作チャットから
  正式packageを検査・提出する現行導線を案内する。

### 実施結果

- SDK Portalへ`/dashboard`の「マイゲーム」を追加した。
- 提出前、正式提出済み、採用確認中、採用済みの状態、ゲーム確認URL、制作環境への
  導線とアカウント集計を表示する。
- 各ゲームから「共通モジュール設定」を開く導線を追加した。
- SDKトップとアカウントメニューからマイゲームへ移動できるようにした。
- SDK制作環境のプレイ画面にも、所有者だけに表示する
  「マイゲーム・編集」導線を追加した。一般プレイヤーには表示せず、
  編集権限も従来どおり所有者確認を必須とする。

## 2026-07-26 — SDK Help正本とAI検索

### 利用者からの要望

- 制作AIが「提出候補の準備」と「本人による正式提出」の違いなどを質問された際、
  現行仕様に基づいて回答できるHelpを用意する。

### 判断

- DBを先に増やさず、版管理・レビュー・回帰検査ができる機械可読なHelpレジストリを
  正本とする。
- 人間向けHelp画面とAI向けMCP検索を同じ正本から生成し、回答の二重管理を避ける。
- Help検索は読み取り専用とし、該当項目がない場合は仕様を推測しないよう応答する。

### 実施結果

- SDK Portalへ`/help`を追加した。
- MCPへ読み取り専用`search_sdk_help` toolを追加した。
- 提出候補、正式提出主体、AIの所有者境界、提出後の運営審査、未提出ゲームの保存を
  初期Helpとして登録した。
- lint、全538テスト、SDK Portal production buildに成功した。
