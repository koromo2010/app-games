# Mock workspace

`GAME_SPEC.md`が確定した後、AIは既存の`index.html`、`styles.css`、`mock.js`をゲーム固有slotとして編集します。Game Fieldsの広場、ヘッダー、入室、部屋、参加者、ルール、デバッグ、結果導線は保存URLの外側にあるため、このフォルダへ複製しません。共通操作は`GameFieldsPreset.registerGame()`へゲーム固有処理を登録して接続します。

単語・ワードペア・読み・語釈が必要なら、モック内へ初期Word DBや固定単語配列を作らず、`GameFieldsPreset.resources.contentSource`を使います。難易度は`easy | normal | hard`をrequestへ渡し、取得失敗時は偽データへ切り替えません。
