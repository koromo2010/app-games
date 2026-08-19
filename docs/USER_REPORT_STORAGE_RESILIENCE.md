# 報告inventory・索引耐障害化

改善要望・バグ報告の本文と一覧索引が不一致になった場合でも、本文を一覧から消失させず、安全に観測・復旧判断するための契約を定義する。公開問い合わせ（`contact_...`）ではなく、`report_...`の報告だけが対象である。

## 保存schema

- 一覧索引: `user-reports:v1`
- 本文: `user-report:v1:<report-id>`
- 本文TTL: 最終更新から180日
- inventory上限: 1環境につき1,000件
- developmentの共有Redisでは、Redis clientが上記logical keyへ`app-dev:`を付ける。アプリコードや監査CLIはphysical prefixを手入力しない。

productionとdevelopmentは別inventoryとして扱う。同じreport IDの本文が両環境に存在する場合は`CROSS_ENVIRONMENT_DUPLICATE_ID`であり、自動修復対象にしない。

## 一覧の読取

`lib/user-report-storage-audit.ts`が本文keyを`SCAN`で有界列挙し、索引と突き合わせる。`KEYS`は使用しない。

- `SCAN COUNT 100`、最大100 page
- 本文、索引、統合inventoryはいずれも最大1,000件
- 本文は100件ずつ`MGET`し、監査時だけ同じbatchで`TTL`を読む
- 正常にparseできる本文を一覧の正本候補とし、索引にない本文も表示する
- 表示順は`updatedAt`降順、`createdAt`降順、report ID昇順
- 上限到達または走査未完了は正常な全件一覧として扱わず、warningを返す

管理APIはfull管理者セッションにだけ本文を返す。通常一覧には本文を含まない安全なstorage auditを併記し、完全なreport IDを指定した直接検索では対象本文、TTL、最大1,000件の索引だけを読む。管理画面の直接検索はread-onlyで、MFA step-upや状態変更を行わない。

## 分類

| code | 意味 |
| --- | --- |
| `BODY_AND_INDEX_OK` | parse可能な本文が索引に1件だけあり、TTLも契約内 |
| `BODY_PRESENT_INDEX_MISSING` | 本文はあるが索引にない |
| `INDEX_PRESENT_BODY_MISSING` | 索引はあるが本文がない |
| `INDEX_DUPLICATE` | 同じreport IDが索引に複数ある |
| `BODY_MALFORMED` | 本文JSONまたは公開report schemaをparseできない。keyと本文内IDの不一致を含む |
| `BODY_TTL_ANOMALY` | 本文TTLが1秒未満、180日超、または取得不能 |
| `CROSS_ENVIRONMENT_DUPLICATE_ID` | 同じreport IDの本文がproductionとdevelopmentの両方にある |

走査上限、索引上限、不正な本文key、不正な索引要素、直接検索のnot foundは別のwarning codeで返す。不正な本文keyを1件でも観測した走査は完全なinventoryと判定しない。本文、player ID、メール、自由記述はstorage auditへ複製しない。

## 索引自己修復

既存本文に対する報告者追記、管理者返信、状態更新、通知状態更新は、本文のCAS保存と同じLua transaction内で次を行う。

1. 対象report IDを索引から全件除去する。
2. 対象report IDを索引先頭へ1件だけ追加する。
3. 索引を1,000件へtrimする。
4. trim対象のIDが索引内に残っていないことを確認してから、その本文を削除する。

これによりorphan bodyは次の正規mutationで索引へ戻り、duplicate indexも対象IDについて解消する。read-only一覧や監査は索引を書き換えない。

## environment境界

SDK Portalから本体support APIへのservice authorizationには期待環境を署名対象として含め、同じ値を`X-Game-Fields-SDK-Environment`で送る。本体は`APP_ENV`とruntime identityから期待環境を決め、headerまたは署名payloadが一致しなければ`support_environment_mismatch`（409）でbody parse、rate-limit、報告保存より前に拒否する。

環境を解決できない場合もfail closedとする。legacyの他service endpointは、期待環境を明示しない限り従来のmethod・path署名を維持する。

## read-only監査とdry-run

次のCLIは環境markerがすべて一致する場合だけ起動する。`--apply`は存在せず、Redisへのwrite commandを生成しない。

```bash
npm run audit:user-reports -- --environment development
npm run audit:user-reports -- --environment development --report-id report_00000000-0000-4000-8000-000000000000
```

必要な一致条件は`--environment`、`APP_ENV`、`REDIS_ENV`、branch／Vercel runtimeから導く期待環境である。出力は`mode: read-only`、`writesPerformed: 0`を持つ。

全件監査にはdeterministicなrepair dry-runを併記する。候補actionは索引再構築、正常本文のTTL再設定、malformed本文の手動確認だけで、`applySupported: false`である。走査未完了、不正索引、malformed本文があるplanは承認可能と判定しない。production修復は別の明示承認、直前のfresh監査、backup／rollback設計なしに実行しない。

## 実装と回帰

- inventory・分類: `lib/user-report-storage-audit.ts`
- deterministic dry-run: `lib/user-report-repair-plan.ts`
- 一覧・mutation: `lib/user-report-store.ts`
- 管理API・UI: `app/api/admin/user-reports/route.ts`、`app/admin/AdminSupportInboxPanel.tsx`
- environment署名: `packages/sdk-service-auth`、`app/api/internal/sdk-support/route.ts`
- CLI: `scripts/audit-user-report-storage.ts`
- failure matrix: `tests/user-report-storage-resilience.test.ts`
