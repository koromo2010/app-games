import registry from "../config/game-registry.json";
import { canvasLobbyRetentionMs } from "./canvas-lobby-board.ts";
import { codeInterceptDefaults, codeInterceptMaximumCardCount, codeInterceptMinimumCardCount } from "./code-intercept.ts";
import { drawingCanvasLimits } from "./drawing-canvas.ts";
import { gameRatingConfig } from "./game-rating.ts";
import { resolveGameReplayPolicy } from "./game-replay-policy.ts";
import { commonTimeLimitMaxSeconds, commonTimeLimitOptions } from "./game-room-config.ts";
import { commonGameTimeoutGraceMs } from "./game-timer/policy.ts";
import { defaultHodoaiConfig, hodoaiTechnicalPlayerLimit } from "./hodoai-talk.ts";
import { hodoaiCompactCardThreshold } from "./hodoai-arrange.ts";
import { defaultKotobaSenpukuConfig } from "./kotoba-senpuku.ts";
import { multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import { nigoichiMaximumAssociationWords, nigoichiMaximumTotalCards } from "./nigoichi.ts";
import { northernRules } from "./northern-branch-game.ts";
import { onlineRoomListPageSize, onlineRoomPassphraseMaximumLength, onlineRoomPlayerLimits } from "./online-room-policy.ts";
import { unverifiedPlayerAccountRetentionMs } from "./player-account-retention.ts";
import { consecutiveTimeoutLimit, reducedPlayerTimeLimitSeconds } from "./player-timeout-policy.ts";
import { rateLimitPolicies } from "./rate-limit-core.ts";
import { TAHOIYA_CORRECT_VOTE_POINTS, TAHOIYA_FOOLED_VOTE_POINTS } from "./tahoiya-scoring.ts";

export type HyperparameterOrigin = "過去指定" | "コード抽出" | "追加候補";
export type HyperparameterControl = "環境変数" | "部屋設定" | "固定値" | "未実装" | "派生値";

export type AdminHyperparameter = {
  id: string;
  label: string;
  currentValue: string;
  recommendedValue?: string;
  origin: HyperparameterOrigin;
  control: HyperparameterControl;
  note: string;
  source: string;
};

export type AdminHyperparameterGroup = {
  id: string;
  title: string;
  kind: "common" | "game";
  summary: string;
  items: AdminHyperparameter[];
};

export type AdminHyperparameterCatalog = {
  generatedAt: number;
  groups: AdminHyperparameterGroup[];
};

function item(
  id: string,
  label: string,
  currentValue: string,
  origin: HyperparameterOrigin,
  control: HyperparameterControl,
  note: string,
  source: string,
  recommendedValue?: string,
): AdminHyperparameter {
  return { id, label, currentValue, origin, control, note, source, ...(recommendedValue ? { recommendedValue } : {}) };
}

function gameTitle(id: string, fallback: string) {
  return registry.find((game) => game.id === id)?.title ?? fallback;
}

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? Math.floor(value) : fallback;
}

function wordWolfCooldownDays() {
  return integerEnvironment("WORDWOLF_PAIR_COOLDOWN_DAYS", 30, 1, 3650);
}

export function loadAdminHyperparameterCatalog(): AdminHyperparameterCatalog {
  const replay = resolveGameReplayPolicy();
  const storageThreshold = integerEnvironment("STORAGE_ALERT_THRESHOLD_PERCENT", 80, 1, 100);
  const common: AdminHyperparameterGroup = {
    id: "common",
    title: "全体共通",
    kind: "common",
    summary: "全ゲームの部屋、タイマー、戦績、保存、負荷対策に関わる値です。",
    items: [
      item("common-player-limits", "ゲーム別の最大人数", `ウルフ${onlineRoomPlayerLimits.wordwolf}・たほい屋${onlineRoomPlayerLimits.tahoiya}・ノーザン${onlineRoomPlayerLimits.northernBranch}・スケール${onlineRoomPlayerLimits.hodoai}・ソナー${onlineRoomPlayerLimits.kotobaSenpuku}・アウト${onlineRoomPlayerLimits.nigoichi}・コード${onlineRoomPlayerLimits.codeIntercept}`, "過去指定", "固定値", "満室一覧からの除外、直接参加拒否、復元時の切り詰めに共通利用します。", "lib/online-room-policy.ts", "adminから安全範囲内で変更可能にする"),
      item("common-room-ttl", "部屋の有効期限", `${multiplayerRoomTtlSeconds / 3600}時間`, "コード抽出", "固定値", "最後の更新からこの時間を過ぎた部屋は期限切れとして扱います。", "lib/multiplayer-room-lifecycle.ts", "利用状況を見て6〜24時間で調整"),
      item("common-room-list-page", "部屋一覧の1回取得数", `${onlineRoomListPageSize}件`, "コード抽出", "固定値", "Redisと画面の負荷を抑えるページサイズです。", "lib/online-room-policy.ts", "負荷計測を見て24〜50件"),
      item("common-passphrase-length", "合言葉の最大長", `${onlineRoomPassphraseMaximumLength}文字`, "コード抽出", "固定値", "全オンライン部屋に共通の入力上限です。", "lib/online-room-policy.ts"),
      item("common-timer-options", "持ち時間の選択肢", commonTimeLimitOptions.map((value) => value === 0 ? "なし" : `${value}秒`).join("・"), "コード抽出", "固定値", `技術上限は${commonTimeLimitMaxSeconds}秒です。`, "lib/game-room-config.ts", "プレイデータを見て選択肢を増減"),
      item("common-timeout-grace", "締切後の通信猶予", `${commonGameTimeoutGraceMs()}ms`, "コード抽出", "環境変数", "締切直前の送信が通信遅延だけで失敗しないための猶予です。", "GAME_TIMEOUT_GRACE_MS / lib/game-timer/policy.ts"),
      item("common-timeout-strikes", "短縮までの連続時間切れ", `${consecutiveTimeoutLimit}回`, "過去指定", "固定値", "この回数連続で時間切れになると、その本人だけ持ち時間を短縮します。", "lib/player-timeout-policy.ts"),
      item("common-timeout-reduced", "時間切れ後の短縮時間", `${reducedPlayerTimeLimitSeconds}秒`, "過去指定", "固定値", "本人が復帰操作をするまで使用する持ち時間です。", "lib/player-timeout-policy.ts"),
      item("common-rating", "初期レート", `${gameRatingConfig.initial}`, "コード抽出", "環境変数", "ゲーム別レートの開始値です。", "GAME_RATING_INITIAL / lib/game-rating.ts"),
      item("common-rating-provisional", "初心者補正の試合数", `${gameRatingConfig.provisionalGames}試合`, "コード抽出", "環境変数", `期間中K=${gameRatingConfig.provisionalK}、以後K=${gameRatingConfig.establishedK}で計算します。`, "GAME_RATING_PROVISIONAL_GAMES / GAME_RATING_PROVISIONAL_K / GAME_RATING_ESTABLISHED_K"),
      item("common-replay-retention", "プレイバック保存期間", `${replay.retentionDays}日`, "コード抽出", "環境変数", "通常のプレイバックを保持する日数です。", "GAME_REPLAY_RETENTION_DAYS / lib/game-replay-policy.ts"),
      item("common-replay-favorites", "お気に入り保存上限", `${replay.favoriteLimit}件`, "コード抽出", "環境変数", "期限を越えて残せるお気に入りの上限です。", "GAME_REPLAY_FAVORITE_LIMIT / lib/game-replay-policy.ts"),
      item("common-account-retention", "メール未登録アカウント保持", `${unverifiedPlayerAccountRetentionMs / 86400000}日`, "コード抽出", "固定値", "最終利用からこの期間を過ぎたメール未登録アカウントを削除対象にします。", "lib/player-account-retention.ts"),
      item("common-storage-alert", "ストレージ警告率", `${storageThreshold}%`, "過去指定", "環境変数", "Neon、Redis、Blobがこの使用率以上になると運営へ通知します。", "STORAGE_ALERT_THRESHOLD_PERCENT / lib/storage-capacity-monitor.ts"),
      item("common-room-rate", "部屋操作のレート制限", `1人${rateLimitPolicies.roomMutation.player?.limit ?? 0}回/分・IP${rateLimitPolicies.roomMutation.ip?.limit ?? 0}回/分`, "追加候補", "固定値", "連打や暴走クライアントからRedisを守る安全値です。", "lib/rate-limit-core.ts", "adminでは閲覧のみ。変更時は負荷試験必須"),
      item("common-word-zipf", "単語のZipf値", "DB移行前・未実装", "過去指定", "未実装", "Zipf自体は客観値として保存し、ゲームごとの採用範囲だけを調整します。", "共通ワードDB計画", "共通保存範囲3.0〜7.0、採用範囲はゲーム別"),
      item("common-word-feedback-min", "単語評価を反映する最低票数", "未実装", "過去指定", "未実装", "少数の評価だけで単語を除外しないための下限です。", "共通ワードDB計画", "まず5票から検証"),
      item("common-word-feedback-ratio", "単語を除外する低評価率", "未実装", "過去指定", "未実装", "最低票数を満たした後に判定する割合です。", "共通ワードDB計画", "まず低評価60%以上から検証"),
    ],
  };

  const groups: AdminHyperparameterGroup[] = [
    common,
    {
      id: "wordwolf", title: gameTitle("wordwolf", "ワードウルフ"), kind: "game", summary: "お題ペア、狼人数、周回、発言と投票の調整値です。", items: [
        item("wordwolf-players", "人数範囲", `3〜${onlineRoomPlayerLimits.wordwolf}人`, "過去指定", "固定値", "狼が成立する最低3人と技術上限です。", "lib/online-room-policy.ts"),
        item("wordwolf-rounds", "周回数", "初期3周・1〜4周", "コード抽出", "部屋設定", "ホストが部屋ごとに選びます。", "lib/wordwolf-room-store.ts"),
        item("wordwolf-wolves", "狼の人数", "初期1人", "コード抽出", "部屋設定", "最大は参加人数から自動計算し、常に市民が過半数になります。", "lib/wordwolf-room-store.ts"),
        item("wordwolf-turn-time", "1人の持ち時間", "初期なし", "コード抽出", "部屋設定", "順番発言と逆転回答に使います。", "app/wordwolf/WordWolfGame.tsx"),
        item("wordwolf-pair-cooldown", "同じペアの再出題間隔", `${wordWolfCooldownDays()}日`, "過去指定", "環境変数", "参加者の誰かが期限内に見たペアを除外します。", "WORDWOLF_PAIR_COOLDOWN_DAYS / lib/wordwolf-topic-history-store.ts"),
        item("wordwolf-daily-history", "当日経験語の保持", "3日", "コード抽出", "固定値", "同日の単語重複を避ける履歴キーの保持期間です。", "lib/wordwolf-topic-history-store.ts"),
        item("wordwolf-pair-distance", "お題の距離", "初期：ふつう", "コード抽出", "部屋設定", "近い・ふつう・遠いの難易度選択です。", "app/wordwolf/WordWolfGame.tsx"),
        item("wordwolf-llm-candidates", "LLM確認へ渡す類似候補数", "共通DB方式は未実装", "過去指定", "未実装", "基準語から複数候補を取り、LLMでペアとして成立するか確認する構想です。", "共通ワードDB計画", "10件程度"),
        item("wordwolf-feedback-threshold", "お題ペアの評価反映条件", "最低票・割合は未実装", "追加候補", "未実装", "Good−Badの優先だけでなく、除外条件も明示的な値にします。", "lib/wordwolf-topic-catalog.ts", "最低5票かつBad率60%以上で一時除外"),
      ],
    },
    {
      id: "tahoiya", title: gameTitle("tahoiya", "たほい屋"), kind: "game", summary: "単語の再出題、説明、投票、得点の調整値です。", items: [
        item("tahoiya-players", "人数範囲", `3〜${onlineRoomPlayerLimits.tahoiya}人`, "コード抽出", "固定値", "通常プレイの最低人数と技術上限です。", "lib/online-room-policy.ts"),
        item("tahoiya-time", "説明・投票の持ち時間", "初期なし", "コード抽出", "部屋設定", "説明入力と投票に共通で使用します。", "lib/tahoiya-room-store.ts"),
        item("tahoiya-correct-points", "本物を当てた得点", `${TAHOIYA_CORRECT_VOTE_POINTS}点/票`, "過去指定", "固定値", "本物の説明へ正しく投票した人が得ます。", "lib/tahoiya-scoring.ts"),
        item("tahoiya-fooled-points", "偽説明でだました得点", `${TAHOIYA_FOOLED_VOTE_POINTS}点/票`, "過去指定", "固定値", "自分の偽説明へ入った票ごとに得ます。", "lib/tahoiya-scoring.ts"),
        item("tahoiya-cooldown", "同じ単語の再出題間隔", "未実装", "過去指定", "未実装", "参加者の誰かが期限内に見た単語を除外します。", "共通ワードDB計画", "TAHOIYA_WORD_COOLDOWN_DAYS=90"),
        item("tahoiya-unseen", "未使用判定", "DB移行前・未実装", "過去指定", "未実装", "参加者全員が未使用の単語だけを候補にする絶対条件です。", "共通ワードDB計画", "誰か1人でも使用済みなら除外"),
        item("tahoiya-priority", "未使用候補の優先順", "Good−Bad→Good数→Bad少→使用少→最終使用が古い", "過去指定", "固定値", "未使用条件を守った上で、高評価候補を先に消化します。", "lib/tahoiya-topic-catalog.ts"),
        item("tahoiya-mode", "初期プレイ方式", "回答者1人・回答者はランダム", "コード抽出", "部屋設定", "全員投票方式や回答者指定へ変更できます。", "app/tahoiya/TahoiyaGame.tsx"),
        item("tahoiya-feedback-threshold", "単語評価の除外条件", "最低票・割合は未実装", "追加候補", "未実装", "悪い単語を自動で候補から外す条件です。", "lib/tahoiya-topic-catalog.ts", "最低5票かつBad率60%以上"),
      ],
    },
    {
      id: "northern-branch", title: gameTitle("northern-branch", "ノーザンブランチ"), kind: "game", summary: "手札、市場、勝利点、カード構成のバランス値です。", items: [
        item("northern-players", "人数範囲", `2〜${onlineRoomPlayerLimits.northernBranch}人`, "コード抽出", "固定値", "初期資金と手番進行が対応する人数です。", "lib/online-room-policy.ts"),
        item("northern-hand", "手札上限", `${northernRules.handLimit}枚`, "コード抽出", "固定値", "資源取得、生産、購入、ダング発生の全処理に使います。", "lib/northern-branch-game.ts", "プレイテスト後に6〜8枚を比較"),
        item("northern-victory", "勝利点", `${northernRules.victoryPoints}点`, "コード抽出", "固定値", "この点数へ最初に到達した人が勝ちです。", "lib/northern-branch-game.ts", "ゲーム時間を見て8〜12点で調整"),
        item("northern-market", "市場の公開枚数", "5枚", "コード抽出", "固定値", "商品と建物を合わせた公開オファー数です。", "lib/northern-branch-game.ts"),
        item("northern-products", "各商品の山札枚数", "各2枚", "コード抽出", "固定値", "7種類の商品を2枚ずつ山札へ入れます。", "lib/northern-branch-data.ts"),
        item("northern-starting-funds", "開始資金", "席順で3・4・5・6", "コード抽出", "固定値", "後手ほど高い開業資金を持つ補正です。", "lib/northern-branch-game.ts"),
        item("northern-dung-value", "ダングの価値", "−1", "追加候補", "固定値", "手札を圧迫する負債カードとしての強さです。", "lib/northern-branch-data.ts", "家畜戦略の勝率を見て調整"),
        item("northern-turn-time", "手番の持ち時間", "タイマーなし", "追加候補", "未実装", "長考対策として導入候補ですが、複合操作なので他ゲームと別値が必要です。", "未実装", "まず120秒＋通信猶予"),
      ],
    },
    {
      id: "hodoai", title: gameTitle("hodoai", "ワードスケール"), kind: "game", summary: "カード枚数、ことば回数、並べ替え、協力得点の調整値です。", items: [
        item("scale-players", "人数範囲", `2〜${hodoaiTechnicalPlayerLimit}人`, "コード抽出", "固定値", "0〜120の数字カードと同期量から決めた技術上限です。", "lib/hodoai-talk.ts"),
        item("scale-rounds", "ことばを出す回数", `初期${defaultHodoaiConfig.roundsTotal}回・1〜4回`, "コード抽出", "部屋設定", "複数カードがある場合は各回まとめて提出します。", "lib/hodoai-talk.ts"),
        item("scale-cards", "1人のカード枚数", `初期${defaultHodoaiConfig.cardsPerPlayer}枚・1〜5枚`, "過去指定", "部屋設定", "人数×枚数ぶんの重複しない数字を配ります。", "lib/hodoai-talk.ts"),
        item("scale-number-range", "秘密の数字範囲", "0〜120", "コード抽出", "固定値", "表示は120を上、0を下にします。", "lib/hodoai-talk.ts"),
        item("scale-sorter", "並べ替え担当", "毎ゲームランダム1人", "過去指定", "派生値", "担当者だけが並べ替えと確定を行います。", "lib/hodoai-talk.ts"),
        item("scale-score", "逆転数による得点", "0個=3点・1個=2点・2〜3個=1点・4個以上=0点", "コード抽出", "固定値", "最終順序に残った前後逆転の数から協力得点を決めます。", "lib/hodoai-talk.ts", "プレイ結果を見て段階を再検討"),
        item("scale-compact", "小型カードへ切替", `${hodoaiCompactCardThreshold}枚以上`, "追加候補", "固定値", "カードが多いときに詳細プレビュー付きの小型表示へ切り替えます。", "lib/hodoai-arrange.ts"),
        item("scale-clue-time", "ことば提出の持ち時間", "初期なし", "コード抽出", "部屋設定", "同時入力フェーズの制限時間です。", "lib/hodoai-talk.ts"),
        item("scale-arrange-time", "並べ替えの持ち時間", "初期なし", "コード抽出", "部屋設定", "並べ替え担当だけに適用する制限時間です。", "lib/hodoai-talk.ts"),
      ],
    },
    {
      id: "kotoba-senpuku", title: gameTitle("kotoba-senpuku", "ワードソナー"), kind: "game", summary: "探知、直接回答、ログ、秘密語、手番の調整値です。", items: [
        item("sonar-players", "人数範囲", `2〜${onlineRoomPlayerLimits.kotobaSenpuku}人`, "コード抽出", "固定値", "2人戦だけ秘密語を2文字以上にします。", "lib/online-room-policy.ts"),
        item("sonar-rounds", "ラウンド数", `${defaultKotobaSenpukuConfig.roundsTotal}回固定`, "コード抽出", "固定値", "現状は最後の1人または同時全滅までの1ゲームです。", "lib/kotoba-senpuku.ts"),
        item("sonar-continuous", "連続探知", defaultKotobaSenpukuConfig.continuousScan ? "初期あり" : "初期なし", "過去指定", "部屋設定", "当たったときに続けて探知できるかを選びます。", "lib/kotoba-senpuku.ts"),
        item("sonar-guess", "秘密語への直接回答", defaultKotobaSenpukuConfig.allowWordGuess ? "初期あり" : "初期なし", "過去指定", "部屋設定", "相手の秘密語を直接当てる行動を許可します。", "lib/kotoba-senpuku.ts"),
        item("sonar-log", "直接回答のログ表示", defaultKotobaSenpukuConfig.showWordGuessInLog ? "初期：回答を見せる" : "初期：回答を隠す", "過去指定", "部屋設定", "直接回答時に、入力した回答語をログで見せるか選びます。", "lib/kotoba-senpuku.ts"),
        item("sonar-first", "最初の手番", defaultKotobaSenpukuConfig.randomFirstTurn ? "初期ランダム" : "入室順", "コード抽出", "部屋設定", "ランダムまたは入室順を選びます。", "lib/kotoba-senpuku.ts"),
        item("sonar-word-length", "秘密語の最低文字数", "2人戦2文字・3人以上1文字", "コード抽出", "派生値", "ひらがなと長音符だけを受け付けます。", "lib/kotoba-senpuku.ts"),
        item("sonar-time", "秘密語・手番の持ち時間", "初期なし", "コード抽出", "部屋設定", "秘密語入力と個人手番を別々に設定します。", "lib/kotoba-senpuku.ts"),
        item("sonar-kana", "探知対象の文字群", "基本かな＋長音符", "追加候補", "固定値", "濁点・半濁点・小書きかなを同じ文字群として処理します。", "lib/kotoba-senpuku.ts"),
      ],
    },
    {
      id: "nigoichi", title: gameTitle("nigoichi", "ワードアウト"), kind: "game", summary: "カード配布、連想語、余り推理、難易度、得点の調整値です。", items: [
        item("out-players", "人数範囲", `2〜${onlineRoomPlayerLimits.nigoichi}人`, "コード抽出", "固定値", "部屋の募集人数もこの範囲で設定します。", "lib/nigoichi.ts"),
        item("out-cards", "1人のカード枚数", `初期2枚・総数${nigoichiMaximumTotalCards}枚以内`, "コード抽出", "部屋設定", "総カード数は人数×配布枚数＋余り1枚です。", "lib/nigoichi.ts"),
        item("out-associations", "1人の連想語数", `初期1個・最大${nigoichiMaximumAssociationWords}個`, "コード抽出", "部屋設定", "必要なカード枚数との整合から人数別上限も自動計算します。", "lib/nigoichi.ts"),
        item("out-difficulty", "単語の難易度", "初期ふつう・簡単/ふつう/難しい", "コード抽出", "部屋設定", "現状はローカル語彙の難易度区分を使用します。", "lib/nigoichi-room-store.ts"),
        item("out-correct", "余り正解点", "人数−1点", "過去指定", "派生値", "参加人数が多いほど正解ボーナスが増えます。", "lib/nigoichi.ts"),
        item("out-wrong-votes", "自分のカードへの誤投票", "1票につき−1点", "コード抽出", "派生値", "正解ボーナスから、自分のカードが受けた誤投票数を引きます。", "lib/nigoichi.ts"),
        item("out-total-cards", "総カード技術上限", `${nigoichiMaximumTotalCards}枚`, "追加候補", "固定値", "画面と秘密情報の送信量を守る上限です。", "lib/nigoichi.ts", "UI検証後に再評価"),
        item("out-zipf", "難易度別Zipf範囲", "共通DB方式は未実装", "過去指定", "未実装", "Zipf値を変更せず、採用範囲だけを難易度ごとに持ちます。", "共通ワードDB計画", "簡単5.0〜7.0・普通4.0〜6.0・難しい3.0〜5.0から検証"),
      ],
    },
    {
      id: "code-intercept", title: gameTitle("code-intercept", "コードインターセプト"), kind: "game", summary: "秘密カード、暗号桁数、ポイント、ダメージの明示指定値です。", items: [
        item("code-players", "人数範囲", `4〜${onlineRoomPlayerLimits.codeIntercept}人`, "過去指定", "固定値", "2チーム各2人以上、人数差1人以内で開始できます。", "lib/code-intercept.ts"),
        item("code-cards", "秘密カード数 C", `初期${codeInterceptDefaults.cardCount}枚・${codeInterceptMinimumCardCount}〜${codeInterceptMaximumCardCount}枚`, "過去指定", "部屋設定", "番号付き秘密単語の枚数です。", "lib/code-intercept.ts"),
        item("code-length", "暗号桁数 Y", `初期${codeInterceptDefaults.fixedCodeLength}桁・2〜C`, "過去指定", "部屋設定", "固定モードまたは毎ラウンド選択モードで決めます。", "lib/code-intercept.ts"),
        item("code-mode", "桁数モード", "初期：固定", "過去指定", "部屋設定", "固定／毎ラウンド選択。毎ラウンド選択では両チームが同時確定します。", "lib/code-intercept.ts"),
        item("code-points", "チーム初期ポイント X", `${codeInterceptDefaults.initialPoints}点`, "過去指定", "固定値", "現状は部屋作成後に変更できません。", "lib/code-intercept.ts", "プレイテスト後にadmin設定化"),
        item("code-miss", "伝達失敗ダメージ", `${codeInterceptDefaults.miscommunicationDamage}点`, "過去指定", "固定値", "味方が自チームの暗号を外したときの自チームダメージです。", "lib/code-intercept.ts"),
        item("code-intercept", "傍受成功ダメージ", `${codeInterceptDefaults.interceptionDamage}点`, "過去指定", "固定値", "敵に暗号を完全一致で当てられたときのダメージです。", "lib/code-intercept.ts"),
        item("code-start", "傍受開始ラウンド", `第${codeInterceptDefaults.interceptionStartsAtRound}ラウンド`, "過去指定", "固定値", "第1ラウンドは過去ヒントがないため傍受しません。", "lib/code-intercept.ts"),
        item("code-time", "各入力の持ち時間", "初期なし", "コード抽出", "部屋設定", "桁数選択、ヒント、回答のフェーズに使います。", "lib/code-intercept.ts"),
        item("code-clue-length", "ヒント1個の最大長", "40文字", "追加候補", "固定値", "通信量と直接答えを書き込むリスクを抑える技術上限です。", "lib/code-intercept.ts"),
      ],
    },
    {
      id: "canvas", title: gameTitle("canvas", "キャンバス"), kind: "game", summary: "保存期間、描画量、線、ズーム、共同編集機能の調整値です。", items: [
        item("canvas-players", "共同部屋の最大人数", "12人（試作）", "追加候補", "固定値", "現在はゲームレジストリ上の試作上限です。", "config/game-registry.json", "描画同期の負荷試験後に確定"),
        item("canvas-retention", "ロビー落書きの保存期間", `${canvasLobbyRetentionMs / 86400000}日`, "コード抽出", "固定値", "線とRedisキーを最後の更新から保持する期間です。", "lib/canvas-lobby-board.ts"),
        item("canvas-strokes", "保存ストローク上限", `${drawingCanvasLimits.maxStrokes}本`, "追加候補", "固定値", "古い線から切り詰めて送信量を制限します。", "lib/drawing-canvas.ts", "実測サイズを見て300〜1000本"),
        item("canvas-points", "1ストロークの座標上限", `${drawingCanvasLimits.maxPointsPerStroke}点`, "追加候補", "固定値", "長時間ドラッグによる巨大データを防ぎます。", "lib/drawing-canvas.ts"),
        item("canvas-width", "線の太さ", `${drawingCanvasLimits.minWidth}〜${drawingCanvasLimits.maxWidth}`, "コード抽出", "固定値", "ペンと消しゴムに共通の入力範囲です。", "lib/drawing-canvas.ts"),
        item("canvas-opacity", "線の透明度", "10〜100%", "コード抽出", "固定値", "5%刻みで選びます。", "app/canvas/CanvasGame.tsx"),
        item("canvas-zoom", "ズーム範囲", "0.5〜2.0倍・0.1刻み", "追加候補", "固定値", "ボタン、ショートカット、Ctrl＋ホイールで変更します。", "app/canvas/CanvasGame.tsx"),
        item("canvas-board-size", "ロビーキャンバス寸法", "1600×1200px", "追加候補", "固定値", "共同部屋は画面幅に合わせた4:3表示です。", "app/canvas/CanvasGame.tsx"),
        item("canvas-features", "機能フラグ", "レイヤー・全画面・塗り・スポイト・ズーム・募集", "追加候補", "固定値", "ロビー落書きと共同部屋で機能を個別にON/OFFできます。", "lib/canvas-features.ts", "adminの公開管理と統合候補"),
      ],
    },
  ];

  return { generatedAt: Date.now(), groups };
}
