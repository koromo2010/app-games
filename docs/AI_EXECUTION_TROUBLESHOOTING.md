# AI実行トラブルシューティング

`APPLIES_WHEN`: tool discovery、schema、MCP response、parser、binding、browser、helper、read-only検査で詰まったとき。

`DOES_NOT_APPLY`: taskの権限、停止、保存、正式resultを決めるとき。

`AUTHORITY`: [`DEVELOPMENT_EXECUTION_RULES.md`](./DEVELOPMENT_EXECUTION_RULES.md)

この文書は実行経路が詰まった場合の自己回復サテライトである。新しい権限やproduct writeを許可せず、許可と停止は正本、保存と正式resultは正本が委任した記録runbookに従う。

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
  classify the tool error before reading success fields; do not run success assertions.

payload := result.structuredContent

IF payload is absent AND result.content contains exactly one JSON text item:
  parse that text once as compatibility fallback.

IF payload is still not an object:
  inspect schema/source; do not guess field paths.
```

このparserで保持済みresponseを再解析できる間はtoolを再callしない。transport結果が失われている場合だけ、各節の冪等回復規則へ進む。

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

### 外部responseの即時capture

再取得不能、tool invocation上限付き、または後続write判断の根拠となるresponseでは、外部call前に新規保存pathとwriterを準備し、call後の最初の処理として同じtool flow内でcaptureする。

1. raw responseは同じflowの変数にだけ保持し、schemaに基づくsafe projectionからbinding、secret、Cookie、token、password、認証header、個人情報を除く。
2. `node scripts/write-immutable-json.mjs <new-path.json>`へsafe projectionをstdinで渡す。response本文をcommand引数、stdout、会話へ展開しない。
3. helperのtemporary file write、`fsync`、close、atomic rename、JSON parse、deep equality、SHA-256、read-backがPASSしたことを確認する。
4. そのcaptureをcheckpoint repositoryの新規immutable pathへ保存してremote read-backする。ここまで完了してからMarkdown result、追加call、proposal等へ進む。

machine outputの初回保存に`apply_patch`を使わない。Markdownは保存済みJSONから生成する二次成果物とする。writer未検証のworkspaceでは、外部call前にsynthetic fixtureを1回PASSさせる。

captureが失敗してもresponseが変数に残る間は外部toolを再callせず、同じresponseを別の新規pathへ保存する。response自体を失った場合は、保持済みtranscriptやartifactを探索してから冪等契約と個別のcall上限に従う。保存失敗を新しいproduct writeや別request IDの理由にしない。

`write-immutable-json.mjs`は既存pathを上書きせず、既知のsecret-bearing keyを検出した場合は保存前に停止する。generic helperの検査だけに依存せず、呼出側で現行schemaに基づくallowlist projectionを作る。

## 4. Handshake

handshake requestは`docs/SDK_HANDSHAKE.md`の必須fieldをすべて送る。AI authoring client名は`ChatGPT Work`または`Claude Code`だけを使用する。

`accepted`はserverのaggregate verdictである。`accepted=true`は、requestに含まれるprotocol、handshake version、authoring client、environment、canonical MCP URL、onboarding profile、Platform／SDK／contract version、required capabilitiesが一致したことを表す。

- `accepted=false`: `problems[*].code`を読み、request／parser訂正、tool更新、真の互換性blockerを区別する。現在のDownloadMeとsourceから期待値を訂正できる場合は同じ作業内で再handshakeし、別environment、旧版、非公式mirrorへは切り替えない。
- `accepted=true`: 同じ条件をclient側で再判定して否定しない。矛盾する別の実観測がない限り「acceptedだがidentity未確認」としない。
- accepted responseのbindingは`structuredContent.environmentBinding`から一度だけ取得し、同一tool flowの変数に保持する。
- bindingが解析上見つからない場合は固定parserとsourceを確認する。実際に欠落していれば、個別指示で禁止されていない限りhandshakeを再取得できる。
- handshake response自体にpost-handshake用`sdkIdentity`を要求しない。

handshakeを再実行する場合も、盲目的に同じparserを反復せず、先にrequestとresponse contractを訂正する。`accepted=false`そのものは正式resultのterminal boundaryではない。訂正不能な真の互換性不一致、接続不能、または個別指示が明示したhandshake invocation上限に到達した場合だけ停止する。

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

proposal IDが取得できない場合、`get_game_module_profile_proposal`をrequest IDで呼ばない。同toolはproposal IDを要求する。回復順は次のとおり。

1. 最初のCallToolResultを固定parserで再解析する。
2. transport outcomeが不明でproposal IDもない場合だけ、freeze済みの同一request ID・同一payloadで`prepare_module_profile_update`を冪等replayする。serverは既存proposalがあれば同じproposalを返す。このreplayは二件目のlogical product writeへ数えない。
3. `structuredContent.proposal.id`を取得後、`get_game_module_profile_proposal`でread-backする。
4. 明示されたtool invocation上限へ到達している場合、または同一payloadを再構成できない場合はreplayせず`WRITE_OUTCOME_UNKNOWN`で停止する。

永続化前validationで拒否された場合、製品上の意図を変えないserialization／schema表現の訂正だけは、同じrequest IDで同じ作業内に行える。module decision、対象、理由等の意味内容が変わる訂正は新しいproduct判断なので、現在の明示許可がなければ行わない。

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

## 8. 利用者PC向けhelperとPowerShell

この節は、実行計画を同じ作業内で再計画する上位原則の具体化であり、新しい停止条件を追加しない。

利用者PCでしか実行できない操作へ到達しても、未検証scriptの反復実行を利用者へ依頼しない。次の順で進める。

1. 対象file、path、address、key、current value、workspace候補等が未確定なら、最小のread-only確認だけを先に依頼する。
2. 返却値を固定し、長文の部分置換、path入力、SHA入力等を要しない完成scriptまたはpackageを作る。
3. 提示前に、利用可能な範囲で構文解析、静的検査、mock／fixture、dry-runを使い、正常系だけでなく次を一括確認する。
   - Windows path separator、空白、文字code、quoting
   - workspace候補が0件、1件、複数件の場合
   - 外部commandのstdout、stderr、exit codeの組合せ
   - 対象操作が既に完了している場合の冪等停止
   - 途中failure時に未許可writeや二重writeへ進まないこと
   - logの保存先、秘密・個人pathのsanitization、利用者が返却する情報
4. 対象OSで完全実行できない場合は、その未検証範囲を明示し、最初からwriteを伴う長いhelperを渡さず、短いread-only discoveryで前提を埋める。
5. 利用者実行でhelper自体のfailureが判明した場合は、それを新しい外部blockerにしない。観測された一行だけを直さず、同じfailure classと残りの全分岐を横断監査してから一つの修正版を出す。

利用者の操作または環境が真の依存点であっても、helperの設計・検証不足は実行側の内部問題である。新しい権限、利用者専用の秘密操作、仕様判断または外部service障害が必要になるまでは、正式resultや次指示の境界にしない。

### Windows改行と変更file集合

PowerShellのdouble-quoted string内では、`` `r ``と`` `n ``がregex engineへ渡る前に実改行へ展開される。raw textを改行で分割する場合はsingle-quoted regexを使う。

```powershell
$lines = @($raw -split '\r\n|\n|\r')
```

``-split "`r?`n"``のようにPowerShell escapeとregex quantifierを混在させない。native commandのstdoutが既に行配列なら、いったん連結して再分割せず、その配列を正規化する。

変更fileの一致判定では、表示行数やraw multiline stringを比較しない。actual／expectedの双方について、空行除去、trim、path separator統一、`Sort-Object -Unique`を行い、集合の両方向差分を計算する。

```powershell
$actual = @($gitLines | ForEach-Object { $_.Trim().Replace('\', '/') } |
    Where-Object { $_ } | Sort-Object -Unique)
$expected = @($expectedLines | ForEach-Object { $_.Trim().Replace('\', '/') } |
    Where-Object { $_ } | Sort-Object -Unique)
$missing = @($expected | Where-Object { $_ -notin $actual })
$unexpected = @($actual | Where-Object { $_ -notin $expected })
$equal = $missing.Count -eq 0 -and $unexpected.Count -eq 0
```

helperは成功・停止の両方で`actual count`、`expected count`、`missing`、`unexpected`、`equal`を表示する。集合不一致では後続writeへ進まない。

`actual count`は正しいのに`expected count`だけが1となり、その1要素の表示内に複数pathと改行が残る場合は、repository差分ではなく改行parserの不具合として扱う。期待file数へ合わせて判定を緩めず、raw input、正規化後の各要素、両方向差分を確認してparserを直す。

### Git stderrとexit code

Gitは成功時にも進捗やverify情報をstderrへ書くことがある。`$ErrorActionPreference = "Stop"`のscopeでnative commandのstderrをstdoutへ`2>&1`で混合すると、Windows PowerShellでは成功したGitのstderrがPowerShell error recordとなり得る。

Gitのstdoutとstderrは分離し、成否は非空stderrではなくcommand直後の`$LASTEXITCODE`で判定する。stderrはsecretと個人pathを除いた診断にだけ使い、exit code 0ならwarning／progressとして保持する。exit codeが非0の場合だけ停止し、stdout解析やwriteへ進まない。

```powershell
$gitLines = @(& git -C $repo diff --name-only $base $head 2> $gitStderrPath)
$gitExitCode = $LASTEXITCODE
if ($gitExitCode -ne 0) {
    throw "git diff failed with exit code $gitExitCode"
}
```

### one-click launcherの完了条件

- 外側の`.cmd`は固定相対pathから`.ps1`を起動し、PowerShellのexit codeを保持する。
- 成功・停止のどちらでも`pause`等により利用者が最終markerと診断を読むまでwindowを閉じない。
- scriptはwrite前にbase／HEAD／parent／tree／変更file集合を照合し、`missing`または`unexpected`が1件でもあればfail closedとする。
- 修正版packageは旧版を上書きせず新しい識別子とhashを持たせ、利用者には一つの現行packageだけを再実行してもらう。
- Windowsを直接実行できない場合も、LF、CRLF、lone CR、順序違い、重複、空行、spaceを含むpath、Git成功＋非空stderr、Git失敗をfixtureで確認する。静的確認だけを「Windows実行済み」と報告しない。

## 9. 正式停止へ変換する前のchecklist

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
