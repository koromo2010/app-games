# @game-fields/game-runtime

Game Fields本体だけが利用する非公開のplatform Runtimeです。

- 署名済みセッションから解決したidentityを受け取る
- 作成者をhost、それ以外の認証済み利用者をplayerとしてgame moduleへ渡す
- 保存Roomをplatform metadataで包み、公開RoomViewだけを返す
- `expectedRevision`と永続化CASの両方で競合を拒否する
- game moduleによるRoomコード変更やrevision飛び越しを拒否する

Redis、Cookie、Postgresなどの本体実装はこのpackageへ入れません。Game Fields本体の`lib/game-sdk-platform-adapter.ts`が、それらをprivate dependencyとして注入します。
