# サイト管理画面

`/admin` は、ゲーム進行とは独立したサイト共通設定の管理画面である。現在はサイト名、トップページの検索結果タイトル、検索結果説明文（snippet候補）、サイトアイコンを編集できる。検索サービスは検索語やページ内容に合わせて説明文を組み替えることがあるため、設定した説明文が必ずそのまま表示されるとは限らない。

## 認証

- サーバー環境変数 `SITE_ADMIN_PASSWORD` を推奨し、未設定時だけ既存の `DEBUG_MODE_PASSWORD` を互換利用する。
- プレイヤーログイン、非公開ゲームキーとは共有しない。Cookieと管理画面権限はデバッグ資格と分離する。
- 成功時は署名付きHttpOnly Cookie `game-fields-site-admin` を発行する。
- CookieはSameSite=Strict、本番Secure、全パス有効、12時間で失効する。
- ログイン試行、設定保存、画像アップロードは共通レート制限を通す。

## 保存と反映

- テキストと公開中の画像URLはRedis `site-settings:v1` を正本とする。
- Redis未設定または読み取り失敗時は安全な初期値を表示し、未設定環境では保存を拒否する。
- アイコン元画像はクライアントで中央を正方形に切り抜き、192×192px PNGへ変換する。
- サーバーは容量、MIME type、ファイルsignatureを再検証してVercel Blob `site-icons/` へ保存する。
- 保存後はメタ情報、サイト名表示、構造化データ、manifest、faviconへ反映する。

主なファイルは `app/admin`、`app/api/admin`、`app/site-icon/route.ts`、`lib/site-settings*`、`lib/site-admin-auth*`、`lib/site-icon-image*`。
