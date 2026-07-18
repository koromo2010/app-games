# たほい屋・旧外部語彙ハーベスター退避記録

2026-07-18、たほい屋のお題生成を「共通単語DBの完成済み再利用 → 判定済み候補 → 未判定10語の認知率審査」に統一したため、外部語彙APIを巡回してGitHub上の候補JSONを増やす旧フローを実行経路から外した。

## 退避したもの

- `.github/workflows/generate-tahoiya-candidates.yml`
- `scripts/generate-tahoiya-candidates.ts`
- `lib/tahoiya-source-library.ts`
- `package.json` の `tahoiya:generate`
- `lib/tahoiya-topic-catalog.ts` に残っていた旧一括説明審査、旧source reviewed Set、未参照のZipf直接抽出・保存関数

削除直前の完全な実装はGitコミット `d888234e6d98ce3663764e15b4197a7e5d252c4f` から復元できる。コードを再配置して復活させる場合も、現在の通常出題へ直接つながず、共通単語DBへの管理用インポートとして再設計する。

## 残した互換資産

- `data/tahoiya-candidates.json`
- `ensureTahoiyaGitCandidates`
- 管理画面の旧カタログ移行API
- 旧Redis候補の互換読み取り

これらは過去候補と出題履歴を共通DBへ冪等移行するために残している。移行完了が本番で確認できるまでは削除しない。

## 現行の正本

- 未判定・難易度判定: `tahoiya_word_screenings`
- 完成済みお題: `tahoiya_topics` / `word_definitions`
- 参加者別の既出履歴: `game-history:v2:tahoiya:<playerId>`
- 実行フロー: `app/api/tahoiya/topic/route.ts`
