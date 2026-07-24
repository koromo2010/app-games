# Mock workspace

`GAME_SPEC.md`が確定した後、AIは既存の`index.html`、`styles.css`、`mock.js`をゲーム固有slotとして編集します。フォルダ名は旧称の`mock`ですが、昇格packageへそのまま収録される正式クライアントです。Game Fieldsの広場、ヘッダー、入室、部屋、参加者、ルール、デバッグ、結果導線は外側にあるため、このフォルダへ複製しません。

画面は`GameFieldsRoom.subscribe()`でAppSetの閲覧者別Viewを描画し、`GameFieldsRoom.send()`でCommandだけを送ります。ブラウザ内に正本のゲーム状態を持ちません。

単語・ワードペア・読み・語釈やLLMが必要なら、クライアントから直接取得せずAppSetの`context.resources`を使います。取得失敗時は状態を進めず、再試行できるエラーとして表示します。
