# 既知課題・バグ監査

最終監査: 2026-07-24

この文書は、再調査を減らし、次に直す範囲を選びやすくするための監査記録である。将来構想ではなく、現在のコードで確認できた事実を記録する。状態が「修正済み」の項目は、同じ問題を再導入しないための回帰確認点として残す。

## 2026-07-27 dev app → main appでRuntime Bundle実体が移送されない

状態: package移送と空Git初期化の修正実装・本番package Git初期化済み／既存リリース再昇格確認待ち（2026-07-27、migration 006・回帰テスト追加）

旧昇格処理はdevのrevision、hash、manifest等のDB snapshotだけをmainの
`sdk_app_releases`へ保存し、dev専用package Gitの`server.bundle.js`等をmain専用
package Gitへ移していなかった。本番Previewはmain package Gitを読むため、grant検証を
通過した後に`SERVER_RUNTIME_BUNDLE_NOT_FOUND`となった。

修正後はdev Portalから固定revisionのpackage全ファイルをservice認証付きで取得し、
main Portalでpackage root、server bundle、AppSet原文、manifestを再検証する。検証済み
ファイルをmain package Gitへ完全置換保存し、そのmain commitを本番Previewのmanifest
呼出しで確認してからDBの現在リリースを切り替える。migration 006の
`source_revision`はdev commit、従来の`revision`はmain実行commitを保持する。
artifact取得、hash検証、main Git保存、本番Runtime確認のいずれかが失敗した場合は
現在リリースを変更しない。dev由来のrollbackも同じ再移送を行う。
main`9f94a90`の本体・SDK Portal・SDK Previewはすべて`READY`で、
SDK schema version 5、dev artifact source往復`ok`、最終Deploymentの
error／fatal Runtime log 0件を確認した。残るのは旧方式で登録済み
「コトバに迫れ」を管理画面の直近MFA付き操作で同じdev版から再昇格し、
実体移送と正式Room作成を確認する作業である。

再昇格の初回試行では、dev package取得、全ファイル検査、hash照合までは成功したが、
main package Git書込みが503になった。診断追加後にGitHub正本を確認すると、
`koromo2010/game-fields-sdk-mocks`は権限付きtokenからrepository metadataを読める一方、
branchが1本もない空repositoryだった。従来のhealthはrepositoryの`permissions.push`だけを
見て`mainTarget: ok`と誤判定し、保存処理は存在しないdefault branchを基点に
`sdk-previews`を作ろうとして停止していた。

本番repositoryには管理用`.game-fields-storage`だけを持つ`main`初期commitと
`sdk-previews` branchを作成した。保存処理は、将来同じ空repositoryへ接続した場合も
Contents APIで最初のcommitを作成してから保存branchを作る。healthは書込権限だけでなく
保存branchまたはdefault branchのref読取まで確認し、空repositoryを成功扱いしない。

## 2026-07-27 SDK本番の正式Room作成がPreviewの403で失敗する

状態: セキュリティ再修正実装済み・本番公開鍵取得／コード固定済み・第2段階配備／実機確認待ち（2026-07-27、回帰テスト追加）

`game-fields.com`の`POST /api/game-sdk/ai-word-guess/rooms`は503
`GAME_SDK_REMOTE_RUNNER_UNAVAILABLE`、同時刻の`preview.game-fields.com`は
server runner入口で403を返した。PortalとPreviewは同じmain commitだったため、
古いDeploymentではなく、別Projectへ個別登録した`SDK_PREVIEW_SIGNING_SECRET`を
同一値として扱ったcross-project HMAC検証が原因だった。環境台帳は「同じ値」と
記録していたが、存在・再デプロイだけを確認し、実際のgrant往復を確認していなかった。

当初はPortal発行grantの検証をPortal自身の公開APIへ移したが、これは正式公開の
完了条件を満たさない。client tokenがURL queryに8時間残り、Previewの全検証が
公開APIの可用性へ依存するためである。

再修正では、Portal値からEd25519秘密鍵を導出してclient／server grantへ署名し、
Previewは固定した公開鍵だけでローカル検証する。汎用検証APIは削除する。client入口は
60秒grantをURL fragmentへ置き、交換ページがfragmentを履歴から即時消去してPOSTした
後だけ、Preview自身の8時間・HttpOnly・Path限定Cookieへ交換する。server grantは
10分、audience・environment・channel・revision・bundle hashを従来どおり固定する。
Preview側の秘密値はローカルCookieと同一revision asset tokenだけに使い、両Projectの
秘密値一致を正式Room起動の前提から外す。server runnerの拒否理由は安全な機械コードで
本体Telemetryまで運び、利用者レスポンスでは引き続き一時障害へ正規化する。

同時監査で、問い合わせ通知メールの失敗が`.catch(() => undefined)`で完全に
握り潰されることも確認した。問い合わせ保存と通知送信を別イベントへ分け、
通知失敗は個人情報や事業者の生エラーを含めず`contact.notification`へ記録する。

## 最優先: 本人確認と秘密情報

### 1. APIがログインした本人を確定できない

状態: 修正済み（2026-07-13）

監査時の事象:

- `app/api/player-account/route.ts` はログイン成功時にプレイヤー情報を返すが、署名済みのサーバーセッションCookieを発行しない。
- ブラウザ側のログイン状態は `lib/player-session.ts` のlocalStorageフラグであり、APIの本人証明には使えない。
- 公開ゲームはリクエストの `playerId` / `actorId` をそのまま使う。個人利用ゲームも `loadStoredPlayerSession(actorId)` でIDの存在を確認するだけで、リクエスト送信者との結び付きを検証しない。
- `app/api/player-session/route.ts` はクライアント指定IDでセッション情報を保存できるため、保存済みIDの存在確認だけでは認証にならない。

影響: 他プレイヤー、ホスト、手番プレイヤーを名乗った操作や、戦績の不正更新をサーバー側で防げない。

対応: `lib/player-auth.ts` で署名・期限付きHttpOnly Cookieを発行し、プレイヤー・戦績・設定・フィードバック・全オンライン部屋APIのactorをCookieから取得する。クライアント指定IDは本人証明に使わない。

### 2. ワードウルフとたほい屋の部屋取得が秘密を含む

状態: 修正済み（2026-07-13）

監査時の事象:

- `app/api/wordwolf/rooms/route.ts` と `app/api/tahoiya/rooms/route.ts` は、閲覧者別に整形せず部屋全体を返す。
- ワードウルフでは合言葉、狼ID、村側・狼側の両ワードがクライアントへ届く。
- たほい屋では合言葉、本物の説明、偽説明の作成者、選択肢の正解フラグなどがフェーズに関係なく届く。

影響: 通常画面で隠しても、通信内容を見れば答えと役割が分かり、合言葉も参加制限として機能しない。

対応: WordWolfとTahoiyaに閲覧者別sanitizerを追加した。合言葉は有無を示すマーカーだけ、役割・正解・投稿者・投票はフェーズと本人に必要な範囲だけ返す。通常のお題生成も認証済みサーバーCommand内で実行する。

### 3. 部屋の更新・削除権限をサーバーで保証できない

状態: 修正済み（2026-07-13）

監査時の事象:

- ワードウルフの部屋POST/DELETEは、認証済みホストかを確認しない。
- たほい屋はactorIdと部屋メンバーを比較するが、actorId自体が本人のものかを確認できない。
- `ownerId` / `fallbackHostId` をクエリで受け取る一括削除も、本人セッションから導出されていない。

影響: 部屋コードや公開レスポンスのIDを知る第三者が、設定・進行・勝敗・削除を改変できる。

対応: 作成・参加・開始・最終回答・削除は認証actorと保存済み部屋を照合する。WordWolf/Tahoiyaの参加はCAS再試行型Commandへ移し、一括削除は認証済みhostIdだけを使用する。ロビー設定・プロフィール・デバッグ操作・次ラウンドも個別Commandへ移し、既存部屋をRoom全体POSTで上書きする互換経路は廃止した。

## 高優先: ゲーム進行と競合

### 4. ワードウルフの3人以上の決選候補が投票できない

状態: 修正済み（2026-07-13、回帰テストあり）

監査時の事象: `docs/game-concept.md` では、候補が2人の場合だけ候補者本人を投票から外し、3人以上なら候補者も投票する。監査時の `getVoteVoters` と `wordWolf-command-domain` は、決選候補数に関係なく候補者全員を除外し、画面説明も「候補以外だけ」と表示していた。

影響: 3人以上が同票になった決選投票が確定ルールと異なる。

対応: 2候補では候補外、3候補以上では候補を含む全員を投票者とし、画面説明も分岐した。`tests/wordwolf-game-flow.test.ts` で両方を固定した。

### 5. ワードウルフの同時参加競合が画面上で成功扱いになる

状態: 修正済み（2026-07-13）

監査時の事象:

監査時は参加・ロビー設定・開始などをクライアントが部屋全体としてPOSTし、`setAndSaveRoom` が保存失敗を待たず楽観表示していた。`saveRoomToStore` は409を含む失敗を握りつぶすため、同じrevisionから2人が参加すると片方がRedisのCASに負けても、再読込まで参加できたように見えた。

影響: 同時参加、参加直後の開始、設定変更の競合で、プレイヤー消失や画面の巻き戻りが起こり得る。

対応: WordWolf/Tahoiyaの参加を専用CommandとRedis CAS再試行へ移し、クライアントは保存済みレスポンスを受け取ってから参加成功を表示する。開始・ロビー設定・プロフィール・デバッグ操作・次ラウンドもCommand化した。部分設定CommandはCAS競合時に最新Roomへ再適用するため、別項目の同時変更で互いを巻き戻さない。

### 6. ワードウルフ戦績がCAS成功前に確定する

状態: 修正済み（2026-07-13）

監査時の事象: `saveStoredWordWolfRoom` は結果部屋をRedisへCAS保存する前に `recordWordWolfGameResults` を呼んでいた。同じrevisionから異なる結果更新が競合すると、CASに負けた結果が先に戦績イベントを確定し、実際に保存された部屋結果と食い違う可能性があった。

影響: 勝敗・レーティングと最終部屋状態が一致しない。結果イベントが冪等なため、後から正しい結果で上書きもされない。

対応: 結果部屋のCAS成功後だけ戦績イベントを記録する順序へ変更した。Redis保存成功後・戦績記録前にプロセスが停止した場合のoutbox再送は今後の耐障害性改善として残る。

### 7. ワードウルフ以外の期限判定が取得順に左右される

状態: 修正済み（2026-07-13、境界テストあり）

監査時の事象: たほい屋、ワードスケール、ことば潜伏戦は、GET時のreconcileと操作後のreconcileが同じ締切を別経路で判定していた。締切後でも先に操作PATCHが届けば内容を取り込んでから遷移し、先にGETが届けば時間切れ遷移するため、結果がリクエスト順に依存していた。

影響: 同じ送信タイミングでも、ポーリングとの競合によって受付可否が変わる。

対応: `GAME_TIMEOUT_GRACE_MS`（標準5000ms）を共通化し、Tahoiya・ワードスケール・ことば潜伏戦は期限後の操作を適用する前に同じreconcileを実行する。締切＋猶予の境界は `tests/game-timer-policy.test.ts` で固定した。

## 中優先: 入力上限と検証

### キャンバス所有者の退出後に管理不能になる

状態: 修正済み（2026-07-16、回帰テストあり）

共同キャンバスの所有者がAPI経由で退出すると、残存参加者がいても`ownerId`が退出者のまま残り、全消去と部屋削除ができなくなる経路があった。退出時に最古の残存参加者へ所有権を移すよう修正し、部屋削除APIへ共通レート制限も追加した。

### 8. ことば潜伏戦の長音符が選べず最初から公開される

状態: 修正済み（2026-07-13、回帰テストあり）

秘密語には長音符「ー」を入力できる一方、文字スキャン候補に「ー」がなく、マスクでは呼び出し前から自動公開されていた。長音符を独立した候補へ追加し、選ばれるまで伏せるよう統一した。

### 9. アップロード画像の容量上限がない

状態: 修正済み（2026-07-13）

監査時の事象: ワードウルフの画像アップロードは、画像種別だけを確認してData URL全体をプレイヤー・部屋・localStorage・Redisへ保存し、ファイルサイズ、デコード後寸法、保存文字数の上限がなかった。

影響: 大きな画像で部屋JSONとRedis通信が肥大化し、保存失敗、同期遅延、ブラウザストレージ超過を起こし得る。

対応: WordWolfの画像選択を150KB以下に制限し、共通セッション正規化でもData URLを20万文字以下に制限した。長期的なオブジェクトストレージ移行と寸法の再エンコードは別改善として残る。

### 10. 回帰テストがない

状態: 一部修正（2026-07-13）

監査時は必須検証がlint、共通要件の文字列監査、production buildだけであり、投票、決選投票、同時投稿、タイムアウト、CAS競合、閲覧者別サニタイズの自動テストがなかった。

追加済み: 純粋domainの決選投票表、期限直前・受付猶予後の境界。未追加: Redisを使う同revision競合、認証Cookie、閲覧者別レスポンススキーマの統合テスト。

## 次の推奨修正順

1. Redisテスト環境を用意し、CAS競合・認証Cookie・閲覧者別サニタイズの統合テストを追加する。
2. CAS保存後の戦績記録をoutbox化し、保存直後のプロセス停止から再送できるようにする。
3. アバターをサーバー側で寸法制限・再エンコードし、将来はオブジェクトストレージへ移す。
4. ワードウルフ以外も含む全Commandへ、保存済みreceiptを使う冪等な`commandId`処理を共通化する。ワードウルフの開始・発言・投票・逆転回答は状態ベースの重複判定とフェーズscopeまで対応済み。

## 2026-07-23 SDKゲームのRoom lifecycleとRealtimeが本体契約へ未接続

状態: 修正済み（2026-07-23、回帰テストあり）

採用済みSDKゲームは作成・取得・Commandの汎用HTTPまで接続されていたが、1人1active room、参加可能な部屋一覧、ロビー／結果後の解散、revision通知がなく、本体8ゲームと復帰・同期契約が異なっていた。

SDK用Redis Room StoreへTTL、索引、active-room claim、一覧、host解散を集約し、公開Client Runtimeへ復元・一覧・解散・watcherを追加した。WebSocketは`game = sdk:<game-id>`と4〜12文字の部屋コード、revision、時刻だけを運び、クライアントは通知後に認証済みHTTPから閲覧者別Viewを再取得する。未審査Previewと`main`未登録moduleは引き続き接続できない。

## 2026-07-21 言語URLの開発起動確認

### locale proxyの内部rewriteが同じURLへredirectする

状態: 修正済み（2026-07-21、回帰テストあり）

`/ja/games` を既存App Routerの `/games` へrewriteした後、Next.jsがproxyを内部URLでも再実行し、再び `/ja/games` へ307 redirectする経路があった。rewrite時に渡した `x-app-locale` がある内部再実行はそのままApp Routerへ進め、外部の接頭辞なしURLだけを言語付きURLへredirectするよう分岐した。

## 2026-07-23 Postgres既存アカウントのログイン直後に401になる

状態: 修正済み（2026-07-23、回帰テストあり）

`APP_DATABASE_URL`を正本にするstrict環境では、ログイン成功時にパスワード情報を含むアカウント全体のRedisミラーを止めていた。一方、Redisにプレイヤープロフィールがない場合も安全なセッションだけを作成せず、署名Cookie発行後の`/api/player-session`が401になっていた。新規登録直後はRedisセッションが存在するため、Postgresだけに残る既存アカウントでだけ発生した。

ログイン・メール更新時の共通`ensurePlayerAccountSession`で、RedisセッションがなければPostgresアカウントから公開プロフィールだけを再作成する。パスワードハッシュ、salt、メールアドレスはRedisセッションへ保存しない。

## 2026-07-23 未確認の復旧メールでデバッグ権限を取得できる

状態: 修正済み（2026-07-23、回帰テストあり）

復旧用メールの登録・変更は現在のプレイヤーパスワードだけを確認し、入力したメールアドレスの所有者を確認していなかった。サイト管理者メールを知っているプレイヤーがその文字列を登録すると、管理者メール一致によるデバッグ資格が即時に付与される状態だった。

入力メールは即時保存せず、1時間有効の確認メールを送る。メール内リンクを開いた後に明示承認POSTを行った場合だけ `email_verified_at` とともに確定する。パスワード再設定と管理者メール一致による自動付与は確認済みメールだけを対象とし、管理画面からの個別付与は維持する。導入前の既存メールは一度きりのDB migrationで未確認へ移し、現在のパスワードとログイン中本人IDを確認した再送操作から再承認できる。再送後は以前の確認リンクを無効化する。

## 2026-07-23 未確認メールの登録先とパスワード変更手段が分からない

状態: 修正済み（2026-07-23、回帰テストあり）

未確認の既存メールはDBに保持されている一方、マイページはアドレスを一切表示しなかったため、どの登録先へ確認メールを再送するのか利用者が判断できなかった。また、ログイン中にパスワードを変更する導線がなく、現在のパスワードを再確認する通常の変更手順を利用できなかった。

本人専用のアカウント取得APIでだけ復旧メールをマスクしたヒントとして返し、保存セッションやlocalStorageには含めない。マイページでは現在の登録先と新しいメール入力を分離する。パスワード変更は署名済みCookieの本人IDと現在のパスワードをサーバーで照合し、現在とは異なる新しいパスワードだけを受理する。新パスワードの2回入力はクライアントの入力ミス検出として扱う。

## 2026-07-23 確認メール再送のパスワード欄が分かりにくく、送信失敗理由も判別できない

状態: 修正済み・dev実機確認済み（2026-07-23、回帰テストあり）

未確認メールの再送ボタンは新規メール登録フォームの下に置かれ、そのフォーム内の「現在のパスワード」を共用していた。どの操作にパスワードが必要か分かりにくく、再送時に新しいメールアドレスも必要に見えた。また、Resendが送信を拒否してもすべて`EMAIL_SEND_FAILED`へ潰していたため、dev実行ログから送信元未確認やAPIキー不備を区別できなかった。

再送を独立したフォームへ変更し、マスク済み登録先、再送には新しいメールアドレスが不要であること、再送専用の現在パスワード欄、再送ボタンを同じ枠にまとめた。Resendのエラーは本文や個人情報を保存せず、認証設定、送信元未確認、テスト送信先制限、送信枠、レート制限、その他へ分類する。初回の実送信はResend Dashboardで送信ドメインが`Not Started`だったため拒否された。Resendの案内どおりDKIM・SPF・MXを設定して`game-fields.com`をVerifiedにした後、devの確認メール再送と受信に成功した。

## 2026-07-23 ワードウルフの投票完了後に競合警告が出て自己投票もできる

状態: 修正済み（2026-07-23、回帰テストあり）

devのデバッグプレイで、最後の投票が成功して結果フェーズへ進んだ約1秒後に、同じ投票者から別command IDの投票がもう一度送られて409になった。保存済み結果は正しい一方、クライアントは重複した2通目だけを失敗として「投票を反映できませんでした」と表示していた。また、投票候補に操作者本人が含まれ、API側も自己投票を拒否していなかった。

投票送信中は同期refとUI状態の両方で全候補ボタンを即時ロックする。サーバーは対象投票者の票がすでに保存されていれば、最新Roomを`applied: false`で返す冪等な成功扱いとする。自己投票は投票候補から除外し、共通のサーバー投票検証でも拒否する。

## 2026-07-23 オンライン操作の重複導線と古い応答による巻き戻り

状態: 修正済み（2026-07-23、回帰テストあり）

横断監査で、共通クライアントにはポーリングや別操作で新しいrevisionを取得した後、先に送った操作・時間切れ要求の遅い応答が古いRoomを再設定する導線が残っていた。共通の結果・デバッグ・プロフィールボタンもReact state更新前の同一tickでは複数回起動できた。

ワードウルフ固有では、開始・発言・投票・逆転回答の専用Routeが単発CASだけを行い、同じrevisionから別プレイヤーの操作が重なると片方を再適用せず失敗させていた。Commandにゲーム番号・フェーズ・ラウンドのscopeがなく、遅延要求を次フェーズの状態へ適用する危険もあった。名前とお題ヒントは入力の各キーでRoom Actionを送っていた。

共通修正として、同じ部屋では現在より大きいrevisionだけを採用する `preferLatestOnlineRoom` を全オンラインゲームの通常操作・時間切れ応答へ適用し、共通操作ボタンを同期refでもロックした。共通永続化へCAS競合時の論理Command再適用helperを追加した。

ワードウルフ修正として、4種のゲーム進行Commandへscopeを付け、同じフェーズ内のCAS競合だけ最新Roomへ最大6回再適用する。すでに反映済みの操作は成功扱い、別ゲーム・別フェーズ・別ラウンドの遅延操作は拒否する。開始・発言・投票・逆転回答・部屋Lifecycleを同期ロックし、ロビーRoom Actionを直列化した。名前とお題ヒントはblurまたはEnter時だけ保存する。

## 2026-07-23 デバッグ用ダミーを削除できず、画面遷移も点滅して重い

状態: 修正済み（2026-07-23、回帰テストあり）

ワードウルフにはダミー追加Commandだけがあり、既存の退出処理は「結果からロビーへ戻っていない通常参加者」だけを対象にしていた。ダミーは自動的に復帰済み扱いになるため、画面にもサーバーにも削除経路がなかった。

ホスト・デバッグ中・ロビー・ダミー対象という4条件を共通権限で検査する個別削除Commandを追加した。通常参加者やホスト自身は対象にできない。追加・一覧・削除UIはワードウルフのロビー設定と参加者一覧から共通デバッグメニューへ移し、ゲーム側はCommandだけを注入する。デバッグOFF時にもダミーを全員整理し、人数依存設定と復帰状態を正規化する。

体感速度の調査では、ゲームのController／Layout分割自体ではなく、locale接頭辞のない内部リンクが毎回`/ja/...`へredirectされる追加往復、アカウント確認後にactive room取得を始める直列待ち、広場生成中のRedis／Postgres重複取得が主因候補だった。内部リンクを現在localeへ直接向け、session確認とactive room取得を並列化し、運用設定とプレイ時間sampleへ短時間cache・同時load共有を追加した。

遷移開始から120msを超えた場合だけ共通オーバーレイを表示し、短い遷移では出さない。WordWolf、Tahoiyaを含むオンラインゲームの初期部屋復元も共通loading表示へ揃え、未復元ロビーが一瞬表示される点滅を防いだ。

## 2026-07-23 DEBUGウィンドウ内が横に分断されて大きな空白ができる

状態: 修正済み（2026-07-23、回帰テストあり）

非モーダル化した共通`DebugToolWindow`の外枠はFlexboxだったが、縦方向を明示していなかった。既定の横方向にタイトルバーと本文が並び、タイトルバーが左側の空白領域、デバッグ操作が右端の細い領域へ分断されていた。

外枠を明示的な縦方向Flexboxへ変更し、スクロール本文へウィンドウ全幅と縮小可能な最小幅を指定した。契約テストでタイトルバーと本文の縦配置、および本文の全幅利用を固定した。

## 2026-07-23 たほい屋のDEBUGメニューでダミーを削除できない

状態: 修正済み（2026-07-23、回帰テストあり）

共通`DebugParticipantControls`導入後も、たほい屋だけはゲーム固有ツールに旧「ダミーを追加」ボタンを残し、ダミー一覧・個別削除Commandを接続していなかった。DEBUGをOFFにしてもダミーと得点等の関連状態が残り、ダミー用のactive-room索引も作成されていた。削除後の操作対象IDと、開始・復帰確認から返る古いRoom応答にも分割後の不整合があった。

たほい屋を共通ダミー管理UIへ接続し、ホスト・DEBUG中・ロビー・ダミー対象の4条件をサーバーで検証する個別削除Commandを追加した。個別削除とDEBUG OFFは、得点、偽説明、投票、時間切れ状態、回答者、復帰状態を現在の参加者へ正規化する。ダミーはactive-room索引の対象外とし、旧索引も削除操作時に解放する。削除したダミーが操作対象ならホストへ戻し、途中削除後のダミー表示名も重複させない。

さらに、ラウンド開始、復帰確認、お題スキップのRoom反映を単調revision規則へ揃えた。共通メニュー接続の契約テストと、ダミー関連状態の純粋関数テストを追加した。

## 2026-07-23 公開ゲーム4本のDEBUGダミー管理が旧追加UIのまま

状態: 修正済み（2026-07-23、回帰テストあり）

公開ゲームのうちワードスケール、ワードソナー、ワードアウト、大富豪は、ゲーム固有ツールに旧「ダミーを追加」ボタンだけを残し、共通`DebugParticipantControls`の一覧・個別削除へ未接続だった。ワードウルフとたほい屋で整備したダミー管理規約を、公開ゲーム全体へ適用できていなかった。

4ゲームを共通ダミー管理UIへ接続し、ホスト・DEBUG中・ロビー・ダミー対象という削除条件を各Storeで再検証する`debug-remove-player` Commandを追加した。個別削除とDEBUG OFFはロビー復帰状態を現在の参加者へ正規化し、ダミーのactive-room索引を作らず、旧索引も削除時に解放する。途中削除後も重複しない共通の名前採番を使い、ワードスケールの並べ替え役と大富豪の代理操作対象が削除対象だった場合はホストへ戻す。

`config/game-registry.json`で`private: true`のノーザンブランチ、コードインターセプト、キャンバスは今回の対象外とした。

## 2026-07-23 DEBUGダミー参加者Commandがゲーム別Storeへ重複

状態: 修正済み（2026-07-23、回帰テストあり）

共通UIへの横展開後も、ホスト・ロビー・DEBUG中の認可、ダミー生成、個別削除、DEBUG OFF時の掃除、ロビー復帰状態、active-room索引の除外と旧索引解放が8つのゲーム別Storeへほぼ同じ形で残っていた。privateのノーザンブランチとコードインターセプトは共通参加者UIの個別削除にも未接続だった。

`lib/online-room-debug-participants.ts`へ参加者Commandのapplication層を設け、8ゲームを同じ処理へ接続した。Store側には人数上限、Player生成、得点・並べ替え役・代理操作対象・チーム等のゲーム固有補正だけを残した。ノーザンブランチとコードインターセプトも共通UIから追加・一覧・個別削除でき、コードインターセプトは参加者変更後にダミーのチームを再調整する。オンライン参加者を持たないキャンバスは適用対象外。

## 2026-07-23 オンラインRoom APIの認証・Telemetry・エラー処理が8ゲームへ重複

状態: 修正済み（2026-07-23、共通契約テストあり）

8ゲームの`rooms/route.ts`へ、公開範囲、Cookie認証、GET三分岐、参加者照合、言語検査、レート制限、デバッグ資格、Telemetry、DELETE、エラー応答がコピーされていた。ゲームごとの修正時に認証・ログ・エラー変換の横展開が漏れる余地があり、Route合計は1,558行になっていた。

`lib/online-room-route-factory.ts`へHTTP application境界を集約し、全8ゲームを同じRoute契約へ接続した。POSTのhost・初期参加者・言語、PATCHのactor・参加者プロフィールは認証セッションから上書きする。ゲーム側は共通形のStore操作と安全なTelemetry項目、宣言的なエラー表だけを提供する。大富豪のダミー進行復旧はStoreへ、たほい屋のAI付き開始は専用applicationへ移し、固有処理をRouteへ残さない構成にした。キャンバスは登録上`local-pass-and-play`で共同描画専用の別契約のため対象外。

## 2026-07-24 SDK-devの閲覧視点がDEBUG最小化で消える

状態: 修正済み（2026-07-24、回帰テストあり）

SDK-devの閲覧視点はDEBUG本文内の`select`として実装されていたため、ウィンドウを最小化するとほかの操作と一緒に消え、ゲーム画面を広く使いながら視点だけ切り替えられなかった。

共通`DebugToolWindow`へ最小化中も表示する任意の固定領域を追加した。SDK-devは閲覧視点をこの領域へ移し、参加者と観戦者を直接選べる`aria-pressed`付きボタン群へ変更した。固定領域を渡さない既存ゲームの最小化表示は従来どおりタイトルバーだけとする。

## 2026-07-24 SDK Portalでログイン済みでもPreviewのWord DB・AI APIが401になる

状態: 修正済み（2026-07-24、回帰テストあり）

SDK Portalと本体devは別originのため、PortalのログインCookieは本体の`/api/sdk-preview/content-source`と`/api/sdk-preview/llm`へ送られない。それにもかかわらずPreview外枠が確認用identityを「認証済みセッション」と表示し、実際のAPI認証も完了したように見えていた。結果として、ゲーム開始後のWord DB取得だけが`401 PLAYER_AUTH_REQUIRED`で停止した。

Portalの本人セッションから、対象origin・制作者slug・60秒に限定した署名コードをURL fragmentで渡す。本体はfragmentを即時消去して、制作者ごとのPreview API専用HttpOnly Cookieへ交換する。このCookieは8時間、`SameSite=Lax`、`/api/sdk-preview`限定で、通常のプレイヤーCookieや本体アカウント権限へ昇格させない。Word DBとAI APIは通常プレイヤー認証またはこの限定セッションを受理する。

## 2026-07-24 SDKから内部用の低認知語彙を取得できる

状態: 修正済み（2026-07-24、回帰テストあり）

公開SDKの`content-source`へ`rare-words`を追加していたため、低認知語彙を外部ゲームが抽選できた。たほい屋候補そのものは公開していなかったが、候補母集団と重なる内部選定用データまで公開契約に含める状態だった。

公開poolを`general-words`と`word-pairs`だけへ限定し、低認知語彙、たほい屋の未審査候補、審査結果、採用済みお題を型・定数・資料・サーバー検証の全段で非公開にした。`rare-words`や`tahoiya-candidates`を文字列で直接送っても拒否する。旧`gfc1` opaque IDは`gfc2`への更新で無効化し、過去に取得した内部語の語釈も再取得できない。

## 2026-07-24 SDK共通moduleがPreview表示だけで正式Runtimeへ未接続

状態: 修正済み（2026-07-24、回帰テストあり）

固有結果、server時間切れ、正式Room transport、戦績・rating・playback、
観戦、DEBUG、個人設定既定値、ゲーム固有ルール表示を承認済みSDK Runtimeへ
接続した。結果未提出時の仮順位・仮点数は廃止し、観戦とplaybackには
ゲーム固有秘密stateを渡さない。

正式Shellの最初のclient kindはdevelop限定の`wordwolf-sdk`である。別ゲーム
を承認する際は、client kind、戦績game type、観戦可否、設定・ルール宣言を
静的server registryへ追加する。未審査Previewを正式Runtimeへ動的昇格させない。

## 2026-07-24 SDK正式Roomの結果復帰と観戦コード長が共通契約と異なる

状態: 修正済み（2026-07-24、回帰テストあり）

正式Shellの結果画面は全参加者へ`room/rematch`を送らせていたが、このCommandは
host専用なので、非hostの「部屋に戻る」は失敗していた。またhostが解散すると
結果画面自体を消していた。Room更新を共通の結果復帰規約へ接続し、hostがlobbyへ
戻した更新を各端末で保留して、本人の席を確認した参加者だけが明示的に復帰する。
各参加者の`room/confirm-lobby-return`が揃うまではserver側でもゲーム固有の開始
Commandを拒否する。結果中の解散では結果を保持し、復帰操作だけを無効化する。

SDK Roomは4〜12文字を正式契約にしていたが、観戦APIのtarget正規化だけが組み込み
ゲーム用の4文字固定関数を使っていた。観戦APIもゲーム種別に応じたRealtimeコード
正規化へ統一した。

## 2026-07-24 SDK Previewの認証切れがWord DB障害に見える

状態: 修正済み（2026-07-24、回帰テストあり。ログイン済み実機E2Eは未確認）

dev実行ログでは、SDK Portalの制作者ゲームURLが本人セッションなしで307転送され、
本体Previewの`/api/sdk-preview/session`と`/api/sdk-preview/content-source`が401を
返していた。Word DBのSQLや抽選処理へ到達する前の認証拒否だったが、固定クライアント
側には素材取得失敗としてだけ見え、外側Shellはゲームを継続していた。

Preview Shellの全resource要求へ同一origin Cookieを明示し、Word DBまたはAI APIが
401を返した場合は`PLAYER_AUTH_REQUIRED`へ統一してゲームShellを停止し、SDK Portal
での再ログインが必要な共通Session Gateへ戻す。AI APIの401も安定した同一コードで
返す。認証を省略してWord DBやAIを匿名公開する変更は行わない。

## 2026-07-24 SDK Previewの一般単語取得が42P01で失敗する

状態: 修正済み・共通DB移行／dev回帰確認済み（2026-07-25、回帰テストあり）

`test10-1 / ai-word-guess`のログイン済み実機確認で、Preview限定セッション交換、
Room作成、隔離Runtime接続、ゲーム開始までは成功したが、
`POST /api/sdk-preview/content-source`の`drawWords`が500になった。安全な共通診断
イベントで、失敗段階は`content-source`、PostgreSQLコードは未定義relationを表す
`42P01`と確認した。

一般ゲーム語の読取実装は環境別アプリDBの`shared_word_catalog`と
`shared_word_pool_evaluations`を参照していたが、dev本体を分離した新しいNeon DBには
この外部選定表を作るmigrationがなかった。一方、一般ゲーム語はmain／developで
共有する語彙であり、既存の共通`word-master-neon`が正本である。

最初の修正では一般ゲーム語Repositoryを共通単語DBの`active_words`へ統一したが、
旧選定表に保存されていた一般ゲーム適格性と難易度フラグを移さず、Zipf値だけから
難易度を再生成した。このため`easy`へ低認知の仏教語「度者」が混入した。

再修正では、旧`shared_word_pool_evaluations`の審査済み分類を、共通DB既存の
`word_game_eligibility`へ`standard-game`適格性、`general_game_pool`フラグ、
`difficulty_easy | difficulty_normal | difficulty_hard`フラグとして冪等同期する。
Repositoryは3条件が揃う語だけを読み、SDKのWord DB、ワードアウト、
コードインターセプトで共通利用する。単語本体やZipf値は変更しない。

2026-07-25に読取ロールへ旧2表の一時`SELECT`権限を付与し、旧選定347行を
surface＋readingで346語へ正規化した。初回dry-runで共通DBに不足していた27語だけを
旧カタログから冪等追加し、再dry-runの対応346語・不足0を確認してから分類を適用した。
適用後の有効分類はeasy 119語、normal 164語、hard 63語である。devの読取専用
回帰確認では全件対応・不足0に加え、「度者」が3条件を満たす審査済み集合に
含まれないことを確認した。一時build hookは撤去し、通常buildへ戻す。

最初のdev反映では`drawWords`が200になった後、続く`findDefinitions`が`42501`
（権限不足）になった。SDK content repositoryのdev分岐が共通DBの内部
`words`／`word_definitions`表を読んでいたためである。制作者ゲームへ渡す内容は
環境に関係なく公開済みデータだけに限定し、一般語、ペア、語釈をすべて
`active_*` view経由へ統一した。内部表へ戻らないソース境界もテストで固定する。

## 2026-07-24 SDK Preview Roomがブラウザ模擬で正式昇格を検証できない

状態: 共通基盤の修正実装済み・dev実機確認待ち（2026-07-24、回帰テストあり）

従来Previewは外見上Roomコード、参加者、revisionを表示していたが、実体はReactと
iframe内JavaScriptのローカルstateだった。別端末参加、Redis CAS、再接続、
閲覧者別Viewを使わず、保存revisionもserver AppSetを含まなかったため、SDKで
完成したゲームを同じ実行物のまま正式版へ昇格できなかった。

正式packageをクライアントasset、portable server bundle、AppSet原文、manifestの
一つのcommitとして保存する。正式Previewは本体共通Room APIを使い、未審査AppSetは
QuickJS WASMで呼出しごとに隔離する。guestが要求できる外部処理はWord DB／LLMの
宣言済みeffectだけで、DB、Redis、認証、環境変数、networkは渡さない。

Portalは受信時にserver bundleとAppSet原文のSHA-256を再計算し、
運営の`SDK → main`採用でrevision、2つのhash、manifestをそのままコピーする。
昇格時の再build、変換、AppSet補正は行わない。旧AIことば当てを無改造で診断した結果、
ゲームID不一致、Room bridge欠落、browser resource bridge、browser-local adapterの
4件を別々の安定診断コードとして検出した。これらはAI固有fallbackで隠さず、SDKの
説明・生成物・bridge不足を見つける回帰fixtureとして保持する。

package clientとserver runnerのgrantは別audienceへ分け、ブラウザ用routeから
server bundle、package manifest、AppSet原文を取得できないようにする。server runnerは
保存revisionから取得したbundleのSHA-256を実行直前に再計算し、昇格元に固定したhashと
違う場合は実行しない。これによりclient URLの漏えいをserver実行権限へ昇格させず、
保存先で実体だけが変わった場合も固定AppSetの検証として扱わない。

package更新ではGit subtreeを完全置換して前revisionのasset残留を防ぎ、1 MiB超の
portable bundleは提出時に拒否する。昇格UPDATEは検査した元revisionと両hashの一致を
条件にし、並行再提出があれば409で停止する。本体はPortalから受け取るrunner URLも
環境別の固定Preview originと対象revisionのpathへ限定する。

## 2026-07-25 SDK更新後も既存チャットが旧capability schemaで停止する

状態: 修正実装済み・dev公開確認待ち（2026-07-25、回帰テストあり）

ChatGPT側で`gameapp-dev`を更新しても、すでに開いているチャットへ読み込まれた
tool schemaは差し替わらない。加えて、handshakeの`requiredCapabilities`を
Portal提供機能の固定enumにしていたため、新しいDownloadMeが追加したcapability名を
旧schemaから送れず、handshakeを呼ぶ前に制作AIが停止して同じ問い合わせを繰り返した。

MCP入力schemaは構文上有効なcapability文字列を受け付け、未提供名をserver側の
`CAPABILITY_UNAVAILABLE`として返す契約へ変更する。DownloadMe ver13とPortalは、
古いDownloadMeまたは固定enumが読み込まれたチャットでは継続せず、プラグイン更新後に
作成した新しいWork／Codexチャットへver13だけを添付するよう明示する。
保存済み制作者環境はアカウントから再取得し、新しいURLを作らない。

## 2026-07-25 SDK正式Shellの復元前に新規Roomを作ると409になる

状態: 修正実装済み・dev実機確認待ち（2026-07-25、回帰テストあり）

formal package Shellは初期表示で`readActiveRoom()`を実行していたが、その完了前から
新規作成・参加UIを操作できた。前のRoomへ参加中のプレイヤーが短い復元待ちの間に
「部屋を作る」を押すと、Redisの1人1active room契約が正しく新規作成を拒否し、
画面には`PLAYER_ACTIVE_ROOM`だけが表示された。終了済み、期限切れ、欠損Roomを
自動解除するStore側の処理ではなく、Shell初期化と利用者操作の競合だった。

candidate／mainで共有するSDK active-room復元hookを追加し、確認中は
作成・参加UIを出さず、既存Roomがあればそのまま復帰する。別タブとの競合等で
`PLAYER_ACTIVE_ROOM`が返った場合もactive Roomを再取得して復帰する。進行中Roomを
黙って破棄せず、result Roomから新規Roomへ移れる既存Runtime契約もテストで固定する。

## 2026-07-26 SDK正式Package Shellに部屋解散導線が表示されない

状態: 修正済み・dev公開済み（2026-07-26、回帰テストあり。ログイン済み実機E2Eは未確認）

candidate Previewと昇格後で共有する`GameSdkFrame`へ移行したPackageでは、
`dissolveRoom`のClient RuntimeとRedis上のRoom・一覧・active room索引整理は
実装済みだったが、Platform-ownedの`OnlineRoomLifecycleActions`を描画していなかった。
このため必須module profileに`dissolution`があっても、hostがロビーまたは結果から
解散できず、1人1active room契約によって新しいRoom作成も止まる状態になった。

`GameSdkFrame`を共通RoomライフサイクルUIへ接続し、ロビーと結果だけhostへ解散を
表示する。確認後に`runtime.dissolveRoom(code)`を呼び、ロビーではRoomを閉じて
新規作成画面へ戻し、結果では結果表示を保持したまま復帰だけを無効にする。
非hostの結果復帰も、hostのロビー更新をいったん保持して本人の
`room/confirm-lobby-return`を通す共通規約へ揃えた。進行中には解散を表示せず、
moduleが必須でない場合にも表示しない。Shell接続、確認、Runtime呼出し、一覧再取得を
契約テストへ追加し、既存のSDK HTTP縦断テストでRoom本体・参加者active room索引の
整理と、別の現行active roomを誤って消さないことを継続検査する。

## 2026-07-26 SDK正式Package Shellの必須module監査が旧Preview経路だけで通過する

状態: 修正済み・dev公開済み（2026-07-26、全Shell module回帰テストあり）

解散導線の欠落を受けて必須moduleを再監査したところ、既存の
「全moduleに実装定義がある」テストは旧Preview Shellのregistryを確認しており、
candidateと昇格後で共有する正式Package経路`GameSdkFrame`の実装を検査していなかった。
このためmodule名とRuntime Commandが存在していても、ShellのUI接続が移行されていない
回帰を検出できなかった。

正式Package経路では、非hostのロビー退出、進行タイマーの表示と時間切れ復旧、
共通DEBUGでのダミー参加者操作、Room設定のプレイヤー別既定値、非プレイ面の広告枠、
動的に昇格したPackageの観戦導線が同じ理由で不足していた。各機能を
module profileとRoom View permissionでgateして共通Shellへ接続し、退出時の参加者削除と
active room索引解放、DEBUG操作のロビー限定認可もHTTP／Runtime縦断テストで固定した。

新しい契約テストはShell groupのcatalog全17件と実装証拠の対応を完全一致で検査する。
module追加時は証拠定義の追加が必須になり、各既存moduleも正式PackageのUI、Command、
Runtimeまたは公開経路の接続が消えると失敗する。

## 2026-07-26 SDK正式PackageのDEBUG監査がダミー操作だけで通過する

状態: 修正済み・dev公開済み（2026-07-26、DEBUG縦断回帰テストあり）

必須Shell moduleの再監査で`debug`を実装済みと判定していたが、契約テストが確認したのは
ダミー追加・削除だけだった。正式Packageの`GameSdkFrame`には閲覧視点、安全な主要状態
進行、時間切れ・切断・入力拒否の再現、自動進行がなく、SDK文書の「デバッグUI」全体を
満たしていなかった。旧Previewや個別ゲームのDEBUG画面が存在しても、candidateと昇格後で
共有する正式Package経路の実装証拠にはならない。

共通DEBUGウィンドウへhost本人・各参加者・観戦者の読取専用View切替、1手・次の主要状態・
結果までの安全な自動進行、現在手番の時間切れ、参加者の切断／復帰、入力拒否検証を追加した。
自動進行はAppSetの`expireAppTurn`を使い、ゲーム固有stateのphase文字列を直接書き換えない。
閲覧ViewはCommand actorへ流用せず、入力拒否はRoomを保存しない。既存の進行中断は
`room/abort`へ接続済みである。

既存Roomが固定している旧package bundleでも動作するよう、Platform Runtimeが新DEBUG
Commandを旧Runtimeの`room/expire-timer`へ変換する互換bridgeを追加した。自動進行では
連続放置状態を増やさず、時間切れ再現だけが通常のtimeout状態を更新する。Shell、HTTP、
Client Runtime、Platform adapter、旧bundle互換を縦断テストへ固定し、配布Starterも
全DEBUG Commandと表示項目を列挙しなければ検査に失敗するようにした。

## 2026-07-26 SDK正式Packageのライフサイクル監査が表示導線に偏っている

状態: 修正済み・dev公開済み（2026-07-26、競合・認可・保存順序の回帰テストあり）

DEBUG対応後に正式Packageの検査範囲をShell表示からRoom lifecycle全体へ広げたところ、
遅着したHTTP Command／timer応答がwatcherで取得済みの新revisionを巻き戻す経路、
結果後に別Roomへ移った参加者のactive索引を旧Roomの再戦が奪う経路、非参加者が
playing／result Viewや共通timer Commandへ到達できる経路が残っていた。Room一覧にも
表示中の候補から直接参加する操作がなく、コードの再入力が必要だった。

共通Shellはwatcherと全直接応答を同じrevision単調増加処理へ統合し、一覧へ参加操作を
追加した。Redis CASはactive索引が別Roomを指している場合に上書きせず、Room作成時の
索引競合も原子的に拒否する。ダミー参加者はactive索引を持たない。Platform Runtimeは
非参加者へ参加前のlobby Viewだけを匿名で返し、join以外のCommandとplaying／result Viewを
拒否する。`room/abort`もplayingだけに制限した。

あわせて、manifest設定をRoom作成・更新の最終境界で型・選択肢・数値範囲・宣言キーへ
正規化した。module profileで無効なDEBUG、timer、設定、再戦、解散と、LLM／content
resource、feedback、観戦、戦績系capabilityはUIだけでなく認証adapterでも拒否する。
結果Roomはresult outboxを完了してから解散し、戦績・rating・playback保存が処理中または
失敗中ならRoomを保持する。

## 2026-07-26 改善・バグ報告が保存されても運営から閲覧できない

状態: 修正済み（2026-07-26、回帰テストあり）

共通メニューの「改善・バグ報告」は認証済みプレイヤーから報告を受け付け、
Redisへ本文と新着索引を保存していたが、管理画面に一覧も取得APIもなかった。
送信者には成功表示が出る一方、運営はRedisを直接参照しなければ内容を確認できなかった。
また、新着索引は1,000件へ切り詰めても索引外の本文キーを削除せず、保持期限もなかった。

`/admin`へfull管理者だけが利用できる「報告」を追加し、一覧、詳細、ページ、報告種別、
オープン／確認中／ユーザー返信待ち／対応済み／終了の状態を表示する。状態変更は直近MFAを必須とし、
本文を監査ログへ複製せず状態だけを記録する。旧形式は未対応として読み込む。
新規・更新本文は最終更新から180日で失効し、索引上限から外れた本文も同じ保存処理で
削除する。

## 2026-07-26 お問い合わせが通知メール失敗時に運営から閲覧できない

状態: 修正済み（2026-07-26、回帰テストあり）

公開お問い合わせフォームはRedisへ保存後、購読管理者へメール通知していたが、送信失敗を
利用者向け成功応答から切り離して握りつぶしていた。管理画面に保存内容の閲覧経路がなく、
メール未設定・購読者なし・一時障害では運営が問い合わせを発見できなかった。本文キーにも
保持期限がなく、1,000件の索引から外れた本文が残り続けた。

`/admin`へfull管理者用の「お問い合わせ」を追加し、一覧、詳細、返信先、分類、
通知メール結果、対応状態を確認できるようにした。状態変更は直近MFAと監査ログを必須とする。
旧形式は未対応・通知結果不明として読み込む。新規・更新本文は最終更新から365日で失効し、
索引上限から外れた本文も削除する。送信者には報告・問い合わせとも受付IDを表示する。

## 2026-07-26 報告・問い合わせを受信後に双方でやりとりできない

状態: 修正済み（2026-07-26、回帰テストあり）

運営受信箱は本文の閲覧と状態変更だけで、返信、会話履歴、送信者側の確認・追記経路が
なかった。SDK制作者はゲーム画面から報告を送れても運営回答を確認できず、公開
お問い合わせもメール失敗時に継続手段がなかった。AIにも本人の報告を扱うtoolがなく、
新規報告を許可する場合に人間同意を強制する境界もなかった。

報告と問い合わせへ共通の会話履歴と`open`／`in-progress`／`waiting-user`／
`resolved`／`closed`状態を追加した。運営返信は既定で`waiting-user`、報告者・
問い合わせ者の追記は`open`へ戻る。返信・状態・メール配送結果はCAS更新し、同時操作で
新しいメッセージを巻き戻さない。

SDK Portalの`/support`へ本人所有reportだけの一覧・詳細・追記を追加した。OAuth MCPは
同じ本人所有reportを一覧・詳細確認できる。AIの新規報告は`prepare_support_report`、
既存reportへの返信は`prepare_support_reply`で7日間の下書きを作るだけで、Portalの
本人確認済み承認画面から内容を確認・修正して送信するまで運営受信箱、会話履歴、
対応状態を変更しない。AI用の直接投稿toolは提供しない。
公開問い合わせは受付メールと秘密付き専用ページから履歴確認・追記できる。秘密値は
URL fragmentで配布し、通常のページ要求とreferrerへ送らない。会話・AI下書きは既存の
保持期限とアカウント削除へ含める。

## 2026-07-26 改善・バグ報告フォームがゲーム進行中の再描画で消える

状態: 修正済み（2026-07-26、回帰テストあり）

共通メニューの報告フォームは種別・概要・詳細をReact stateだけに保持していたため、
ゲームのフェーズ変更等で共通ヘッダーが再生成されると、送信前の入力が失われた。

フォームの下書きを同じタブの`sessionStorage`へ入力変更ごとに一時保存し、
コンポーネント再生成または同じタブの再読込時に復元する。送信成功後は空フォームの
保存時に削除し、タブを閉じた後まで保持しない。Storageが利用できない環境では例外を
握りつぶし、従来どおり報告送信を利用できる。

## 2026-07-26 アカウント削除後も報告・フィードバック・個人設定が残る

状態: 修正済み（2026-07-26、回帰テストあり）

アカウント削除の従属データ処理は戦績、リプレイ、SDKゲーム設定だけを削除していた。
共通バグ報告のplayer IDと自由記述、AI生成物へのフィードバック、組み込みゲームの
Room設定既定値、ワードウルフのペア履歴、一般ゲーム語の日次履歴がRedisへ残った。
共通フィードバックと報告の索引上限から外れた本文キーも削除されなかった。

アカウント本体を消す前の冪等な従属データ削除へ、報告、共通フィードバック、
組み込み／SDK設定既定値、単語履歴を追加した。共通フィードバックはincremental SCANで
本人recordだけを本文とtask索引から削除する。Room設定既定値は最終保存から2年、
ワードウルフのペア履歴はcooldown終了後3日で自動失効し、索引上限から外れた報告・
フィードバック本文も保存時に削除する。

未確認アカウントの1か月保持Cronも、PostgreSQLの一括DELETEとRedis本体の直接削除を
やめ、対象IDを列挙して同じ従属データ処理が成功してからアカウント本体を削除する。
旧Redisアカウントのメール索引と、たほい屋の通常・端末補助履歴も同じ処理で削除する。
## 2026-07-26 改善・バグ報告が管理者メールへ届かず、問い合わせと管理タブが分かれている

状態: 修正済み（2026-07-26、回帰テスト・build・dev反映あり、実メール受信確認待ち）

管理者アカウントの`receive_contacts`購読は公開問い合わせだけを対象にし、ゲーム内またはSDK Portalから届く改善要望・バグ報告と報告者の追記は管理画面へ保存されるだけで、管理者メールを送っていなかった。問い合わせ側だけに管理者通知の失敗理由・再送を追加したため、報告タブには同じ操作が表示されず、利用者へ誤った確認先を案内していた。

既存購読を「問い合わせ・報告を受け取る」へ拡張し、新規報告と報告者の追記も同じ管理者宛先へ冪等通知する。送信状態、最終試行日時、安全な失敗理由を報告へ保存し、管理画面から直近MFAと監査ログを伴って再送できる。管理画面の「報告」と「お問い合わせ」は一つの「問い合わせ・報告」受信箱へ統合し、作成日時順に混在表示して種別バッジで判別する。

commit `44f0ad3`を`develop`へ公開し、`app-games-dev` Deployment `dpl_9JxESXspH4vbChdQc8gwtsfuxxC9`のREADYと`dev.game-fields.com`へのaliasを確認した。残る確認は、管理画面からの再送結果と実メール受信の照合である。

## 2026-07-27 管理画面の返信でパスキー承認後に何も起きない

状態: 修正済み（2026-07-27、回帰テストあり、dev実機確認待ち）

問い合わせ・報告への運営返信にも、対応状態変更や管理者通知再送と同じ直近MFAを
要求していた。さらに、mainとdevは同じWebAuthn RP IDを使いながら管理者DBを分離
しているのに、認証optionsの`allowCredentials`を空にしていた。ブラウザが別環境で
登録したパスキーを返すと、devの実行ログでは`POST /api/admin/passkeys`が
`SITE_ADMIN_PASSKEY_NOT_FOUND`で400になった。失敗表示は受信箱上部だけにあり、
返信欄までスクロールした管理者には無反応に見えた。

運営返信はfull管理者セッションと監査ログで許可し、追加のパスキー再確認を外した。
対応状態変更、管理者通知再送、昇格、重要設定等は引き続き直近MFAを要求する。
パスキー認証は現在の環境DBへ登録済みのCredential IDだけを候補にし、transport hintは
固定しない。Vercelの`develop` branchではdev Originをコードから選ぶ。返信結果は
操作中フォームの直上へ表示し、曖昧な通信失敗の再試行では同じrequest IDを再利用する。

## 2026-07-27 mainとdevのパスキーが同じRP IDへ登録される

状態: コード修正済み（dev配備・資格情報の再登録・通常ログイン確認待ち）

前項では、mainとdevが同じRP ID `game-fields.com`を使いながらDBだけを分離する設計を
維持し、`allowCredentials`を環境DBのCredential IDへ絞ることで対処していた。
しかしRP IDは端末側のパスキー名前空間であり、同じメール由来のuser handleも共通だった
ため、devでの再登録が端末上のmain用資格情報を置換または混在させる余地が残った。
DB側に別々の古いCredential IDが残ると、USBキーへの誘導、端末内パスキーが見つからない、
`SITE_ADMIN_PASSKEY_NOT_FOUND`等の不整合につながる。

mainはRP ID `game-fields.com`、devはRP ID `dev.game-fields.com`へ分離する。
develop判定は`GAME_FIELDS_ENV`、Vercel Project名、Git branchの順に利用でき、
devへ親RP ID `game-fields.com`を手動指定した場合はfail closedで拒否する。
設定したOriginがRP IDの同一hostまたはsubdomainでない場合も拒否する。
旧devパスキーは新RP IDでは利用できないため、dev配備後にMFAを一度リセットし、
`dev.game-fields.com`用パスキーを再登録して通常ログインを確認する。

## 2026-07-27 メール送信の部分失敗と通信再試行でリンク・会話が不整合になる

状態: 修正済み（2026-07-27、回帰テスト・lint・buildあり）

メール経路の失敗・再試行を横断監査したところ、AI下書きから承認した報告追記が過去の
スレッド通知済み状態だけで管理者メールを省略する経路、運営返信メールだけが失敗した後に
会話を追加せず再送する経路がない状態、パスワード再設定メールの失敗後も60秒制限だけが
残る状態、確認メール再送の失敗で以前届いた有効なリンクまで無効化する状態があった。
また、公開問い合わせ、本体報告、問い合わせ者追記、SDK Portal追記は通信切断後の
再試行ごとに新しいrequest IDを生成し、同じ内容と通知を重複保存できた。

AI承認追記は新しいメッセージのinsert結果で通知を判定する。失敗した運営返信メールは
保存済みメッセージと同じResend冪等キーでメールだけを再送し、会話を増やさない。
再設定メール失敗時は該当試行の未配送トークンと60秒制限だけを解除する。確認メール再送は
新しい配送成功まで以前のリンクを残し、失敗時は以前のpending tokenへ戻す。利用者向け
各フォームは送信成功までrequest IDを保持し、serverはrequest IDからrecord／message IDを
決定して同一操作の再試行を冪等化する。

## 2026-07-27 SDK正式Previewの新しい配備だけserver grantが403になる

状態: コード修正・development署名鍵再Link・dev再配備済み
（2026-07-27、正式PreviewからのRoom作成再確認待ち）

`moi-dev`の正式PreviewでスカルのRoom作成を行うと、本体
`POST /api/sdk-preview/moi-lab/games/skull/rooms`が503
`GAME_SDK_REMOTE_RUNNER_UNAVAILABLE`を返した。同時刻のSDK Portalによる
`GET /api/preview-runtime/moi-lab/skull`は200で新しいgrantを発行していたが、直後の
SDK Preview `POST /server/moi-lab/skull/<revision>`は403だった。

一つ前のSDK Preview Deploymentでは同じスカルrevisionのserver routeが24時間で
696件すべて200だったのに対し、新しいDeploymentでは4件すべて403だった。AppSetや
スカル固有処理へ到達する前のserver grant検証で失敗しており、共通Platformの
配備世代・署名またはscope不整合である。従来は403を一律に返し、signature、
environment、instance、game、revisionのどこが不一致かをログから判別できなかった。

SDK Previewはgrant拒否を安全な理由別の構造化ログへ記録する。SDK Portalのhealthは
対応Previewへ固定scopeの署名probeを送り、Room作成前にPortal／Previewの署名・環境一致を
検出する。本体remote runnerはネットワーク例外と408／502／503／504だけを1回再試行し、
401／403は専用の`GAME_SDK_REMOTE_RUNNER_AUTH_FAILED`として利用者表示と運用調査を分ける。

修正配備後のPortal healthは当初503`SDK_PREVIEW_SIGNING_MISMATCH`、Previewの安全な理由は
`TOKEN_INVALID`だったため、両Projectのdevelopment用`SDK_PREVIEW_SIGNING_SECRET`が
一致していないことまで確定した。`app-games-sdk-dev`と`app-games-preview-dev`へ同じ
Team Shared Variableを再Linkして再デプロイし、Portal healthの200、
`status: ok`、`previewSigning: ok`を確認した。

## 2026-07-27 管理画面で問い合わせ・報告の初回本文が二重表示される

状態: 修正・dev配備済み（2026-07-27、回帰テストあり）

統合した管理受信箱は、初回投稿を上部の「内容」に表示したうえで、同じ本文を
「やりとり」の先頭メッセージとしてもう一度手動描画していた。保存データや
`messages`配列の重複ではなく、管理画面だけの表示重複だった。

初回投稿は「内容」に一度だけ表示し、「返信・追記」は保存済み追加メッセージがある場合
だけ表示する。会話データ、メール本文、SDK Portalと問い合わせ者向け会話画面は変更しない。
## 2026-07-27 管理者パスキーの登録方針と復旧権限が不整合

状態: 修正済み・dev実機確認待ち（2026-07-27、登録・認証・復旧scope回帰テストあり）

管理者パスキーは端末内認証器を要件としていたが、登録optionsは
`preferredAuthenticatorType: "localDevice"`という推奨だけで、
`authenticatorAttachment: "platform"`を強制していなかった。このためUSBキーとして
登録された資格情報を、後から認証側だけ`internal`へ限定すると、Windows Helloに
一致する資格情報がなくログインできなかった。

さらに、緊急用のbreak-glass復旧画面は「設定変更不可」と表示していたが、
管理者アカウント保存・削除APIは`recovery` scopeのとき直近MFA検査を省略しており、
マスターパスワードだけで管理者追加、パスワード更新、削除ができた。画面から隠れた
通常管理APIの一部も`recovery` scopeで読取可能だった。

新規登録はplatform attachment、discoverable credential、user verification、
`internal` transportをすべて必須にした。復旧コード利用後はWindows Hello再登録へ
誘導し、登録成功後に通常セッションへ切り替える。端末内パスキーが残る場合だけ、
古い外部キー登録を削除できる。break-glassは管理者一覧、ダッシュボード、監査ログの
読取とMFAリセットだけに制限し、管理者追加・更新・削除と通常管理APIをサーバー側で
拒否する。

## 2026-07-27 通常管理者の「パスキー初期化」がdevから消えた

状態: 修正・dev配備済み（2026-07-27、回帰テスト・lint・buildあり、実機表示確認待ち）

break-glass復旧scopeを制限した際、管理者一覧の初期化ボタンとAPIを復旧モード専用に
変更し、通常のfull管理者が自分のパスキーを初期化する既存経路まで塞いでいた。
これはmainとdevで分ける仕様ではなく、認証強化の過剰制限だった。

通常のfull管理者には自分自身の「パスキー初期化」を再表示し、実行前に直近MFAを
クライアントとAPIの両方で必須にする。他の管理者を通常セッションから初期化する操作は
引き続き拒否し、break-glassの「MFAを再設定」と通常管理APIの制限は維持する。

## 2026-07-27 昇格操作に判断理由と実行者の一貫した履歴がない

状態: 修正済み（2026-07-27、回帰テストあり。migration 005の環境適用待ち）

`SDK-dev → dev`、`SDK → main`、`dev app → main app`、アプリ復元、
`develop → main`の操作経路は存在したが、SDK DBのリリース履歴には判断理由と
実行者がなく、却下を追加専用で記録する経路もなかった。SDK candidate採用では
`sdk_games`のstable pointer更新、channel履歴、新release追加が別query／transactionに
分かれ、後段失敗時に採用状態と履歴が食い違う余地もあった。

migration 005で`sdk_release_decisions`を追加し、SDK candidateとdev appの
承認・却下・復元について、対象revision、package root、server bundle、
AppSet hash、理由、実行管理者、日時、対応releaseを保存する。採用・復元は
現在版更新、新release、決定履歴を同じtransactionで確定する。管理画面は
理由を5〜500文字で必須入力し、対象版の直近判断とリリース履歴を表示する。
`develop → main`も理由を必須とし、main/develop SHA、実行者、日時とともに
既存の管理者監査ログへ保存する。

AIによる問い合わせ・報告は引き続き下書き作成までに限定し、本人がPortalで
確認・修正・送信するまで保存しない。管理者認証障害時はbreak-glassで通常承認を
直接実行せず、MFAを復旧してfull sessionへ戻してから承認する境界を維持する。

## 2026-07-27 SDK正式Packageのplaying中にDEBUGとダミー操作が消える

状態: 修正・dev配備済み（2026-07-27、Platform／HTTP／Shell回帰テストあり、実機確認待ち）

正式PreviewのスカルでDEBUGダミーを追加して開始すると、共通ヘッダーのDEBUGボタンが
消え、ダミー手番でゲームを進められなかった。共通ShellはDEBUG表示をPackageが返す
`permissions.canDebug`だけで判定していたため、固定済みの旧revisionやplaying Viewが
古い値を返すと、署名済みhostセッションに権限があってもDEBUG全体が隠れた。
また既存の「閲覧視点」は読取Viewだけを切り替え、iframeからのゲームCommandは常に
host identityで送っていたため、ダミー視点を選んでもダミーの合法手にはならなかった。

Platform adapterが署名済みセッション、保存Roomのhost、manifestとmodule profileから
DEBUG権限を最終確定し、保存Roomからダミー属性と接続状態もRoom Viewへ復元する。
共通DEBUG固定領域には「閲覧視点」と別に「操作対象」を追加し、playing中に選んだ
ダミーのidentityでゲーム固有Commandだけを通常Domainへ通す。対象がダミーでない場合、
権限のないhost、playing以外、内側の`room/*`共通Commandはサーバーで拒否する。
自動進行は従来どおりPackageの時間切れ遷移を使い、結果画面までDEBUG表示を維持する。

## 2026-07-27 SDK正式Packageの交換ページ後にゲームが表示されない

状態: 修正・ローカル検証済み（2026-07-27、dev配備／実機確認待ち）

Project間のcommitが揃って正式Previewページを開けるようになった後も、
ゲーム固有領域には「ゲームを開けませんでした」とだけ表示された。本体dev、
SDK Portal、Preview runnerのRuntime LogではRoom読取、Command、server runnerが
すべて200だった一方、`package-open`はGET 200の後に必要な交換POSTが1件もなかった。

正式Package iframeは`allow-same-origin`を付けずopaque originとして隔離している。
交換ページはURL fragmentの60秒grantを`fetch()`で同じURLへPOSTしようとしていたが、
opaque originのブラウザ境界で送信前に拒否され、catchの失敗文だけを表示していた。

隔離を弱めず、交換ページだけ`allow-forms`と自originへの`form-action`を許可した。
fragmentは従来どおり履歴から即時消去し、単一・4KB以下の
`application/x-www-form-urlencoded`本文でPOSTする。Previewはgrant検証後に
Path限定HttpOnly Cookieを設定して303でPackageへ遷移する。Package本体のCSPは
引き続き`form-action 'none'`であり、iframeへ`allow-same-origin`は追加しない。
