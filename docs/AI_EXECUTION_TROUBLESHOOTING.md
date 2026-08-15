# AI実行トラブルシューティング

この文書は、tool discovery、schema、MCP response、parser、binding、read-only検査で詰まった場合の自己回復手順である。新しい権限やproduct writeを許可する文書ではない。許可、停止、保存、正式resultは`DEVELOPMENT_EXECUTION_RULES.md`に従う。

## 1. 原則

- 解析上の不確実性を、製品不具合、identity不一致、外部blockerへ変換しない。
- 推測でfield名を増やさず、現行tool schema、server source、関連test、秘密を含まないstructured responseの順で確定する。
- parser修正、source確認、許可済みread-only確認は同じ作業内で行い、それだけで正式resultを作らない。
- read-only retryや非product-write handshakeを、product write件数と混同しない。
- opaque値、secret、Cookie、token、bindingは表示、転記、永続化、ログ出力しない。

## 2. 正本の探索順

tool名、request、responseが不明な場合は次を確認する。

1. 現在読み込まれているtool metadata／input schema
2. 対象branch／commitのserver routeと公開型
3. 同じ契約を固定するtest
4. `docs/SDK_HANDSHAKE.md`と`config/sdk-authoring-contract.json`
5. `sdk/entry/START_GAME_FIELDS.md`
6. 許可された範囲の実response

説明文とsourceが違う場合はsourceだけへ黙って合わせず、正本文書とcontract testも同じcandidateで直す。

指定ファイルを取得できない場合は、対象branchのcanonical Git、`app-games-checkpoints`、共有済み領域、Library、current pointerを探索してから、利用者へ添付を依頼する。過去の同名ファイルを最新版と推測しない。

## 3. MCP CallToolResultの固定parser

Game Fields Portalのtool resultはCallToolResult wrapperとして扱う。

```text
IF transport_or_rpc_error:
  classify the error; do not inspect a success payload.

IF result.isError == true:
  classify the tool error before reading success fields.

payload := result.structuredContent

IF payload is absent AND result.content contains exactly one JSON text item:
  parse that text once as compatibility fallback.

IF payload is still not an object:
  inspect schema/source; do not guess field paths.
```

canonical pathは次のとおり。

| 値 | path |
| --- | --- |
| handshake verdict | `structuredContent.accepted` |
| handshake problems | `structuredContent.problems` |
| opaque binding | `structuredContent.environmentBinding` |
| post-handshake identity | `structuredContent.sdkIdentity` |
| proposal | `structuredContent.proposal` |
| proposal ID | `structuredContent.proposal.id` |
| proposal request ID | `structuredContent.proposal.requestId` |
| review URL | `structuredContent.reviewUrl` |

`proposalId`、`response.proposalId`、wrapper直下の`environmentBinding`等を候補検索しない。wrapperをpayloadとして扱わない。秘密を含み得るraw response全体を報告へ保存しない。

## 4. Handshake

handshake requestは`docs/SDK_HANDSHAKE.md`の必須fieldをすべて送る。AI authoring client名は`ChatGPT Work`または`Claude Code`だけを使用する。

`accepted`はserverのaggregate verdictである。`accepted=true`は、requestに含まれるprotocol、handshake version、authoring client、environment、canonical MCP URL、onboarding profile、Platform／SDK／contract version、required capabilitiesが一致したことを表す。

- `accepted=false`: `problems[*].code`を読み、request訂正、tool更新、真の互換性blockerを区別する。
- `accepted=true`: 同じ条件をclient側で再判定して否定しない。矛盾する別の実観測がない限り「acceptedだがidentity未確認」としない。
- accepted responseのbindingは`structuredContent.environmentBinding`から一度だけ取得し、同一tool flowの変数に保持する。
- bindingが解析上見つからない場合は固定parserとsourceを確認する。実際に欠落していれば、個別指示で禁止されていない限りhandshakeを再取得できる。
- handshake response自体にpost-handshake用`sdkIdentity`を要求しない。

handshakeを再実行する場合も、盲目的に同じparserを反復せず、先にrequestとresponse contractを訂正する。個別指示がhandshake回数を明示制限している場合はその制限を優先する。

## 5. Bindingとpost-handshake identity

accepted handshake後のすべてのSDK toolへ、取得したbindingを変更せず渡す。別chat、OAuth identity、client、origin、environmentへ再利用しない。

post-handshake responseでは`structuredContent.sdkIdentity`を確認する。`targetEnvironment`、`canonicalMcpUrl`、release、`onboardingProfileId`が固定対象と違う場合は、そのidentityで次のread／writeへ進まない。

field path不明、wrapper誤認、binding抽出失敗はidentity不一致ではない。固定parserを直してから判定する。

## 6. Proposalと冪等reconciliation

`prepare_module_profile_update`はactive profileを変更せず、Portal owner承認用proposalを保存するproduct writeである。

成功時は同じtool flowで次を行う。

1. `isError`がfalseであることを確認する。
2. `structuredContent.proposal.id`を取得する。
3. 同じbindingで`get_game_module_profile_proposal`を呼ぶ。
4. proposal ID、request ID、status、exact diff、依存関係、影響、警告、base revision／digest、catalog／identity、audit、review URLをread-backする。
5. `activeProfileChanged=false`、`humanApprovalRequired=true`、statusがpendingであることを確認する。
6. Portal owner承認待ちとして停止する。approve／rejectやactive反映をAIが代行しない。

proposal callの結果が不明な場合は、別request IDや二件目proposalを作らない。同一request IDの冪等契約と既存proposalのread-backで照合する。validationでDB INSERT前に拒否されたことをcontractまたはread-backで確認できた場合だけproduct write 0件とする。

read-back失敗は二件目proposalの根拠にならない。許可済みread-only復旧を行い、成功結果を確認できるまでwriteを増やさない。

## 7. Browser・Vercel・証拠

一つのbrowser経路が失敗しても、別の許可済みbrowser、公開HTTP、read-only endpointで同じ値を確認できないか調べる。画面取得失敗を製品不具合と断定しない。

匿名Vercel確認では次を記録する。

- acquisition route
- target DeploymentまたはURL
- commit／revision等のidentity
- acquired at
- 判定した値と、未確認項目

認証画面へ到達したら進めず、匿名情報と製品runtimeを混同しない。認証済みVercel control planeが現在の依存点の場合だけ利用者操作へ切り替える。

同じ検査でDevTools操作やスクリーンショットが反復する場合は、運用手順を増やすだけで終えず、秘密を含まない診断表示、revision表示、計測hook、read-only endpoint等の製品改善候補へ登録する。

## 8. 正式停止へ変換する前のchecklist

次をすべて確認する。

- 現行tool名とschemaを確認した
- wrapperと`structuredContent`を分離した
- `isError`を先に判定した
- canonical pathをsourceまたはtestで確認した
- read-only／非product-writeの復旧余地を確認した
- 同一request IDでreconciliationした
- 未許可writeを増やしていない
- 利用者返却済みの証拠を再要求していない
- 残っているのが解析問題ではなく真の外部依存である

一つでも未実施なら、正式resultを作らず同じ作業内で自己回復を続ける。
