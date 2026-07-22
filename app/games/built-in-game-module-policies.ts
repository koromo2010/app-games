import type { GameModuleDecision, GameModulePolicy } from "./game-definition-source";

type CapabilityPolicy = GameModulePolicy["capabilities"];

const enabled = (): GameModuleDecision => ({ mode: "enabled" });
const disabled = (reason: string): GameModuleDecision => ({ mode: "disabled", reason });

const standardOnline = (options: {
  llm?: boolean;
  resultShare?: boolean;
} = {}): CapabilityPolicy => ({
  onlineRoom: enabled(),
  timer: enabled(),
  debug: enabled(),
  spectators: disabled("このゲームはまだ観戦用presentationを採用していないため"),
  stats: enabled(),
  rating: enabled(),
  replay: enabled(),
  resultShare: options.resultShare
    ? enabled()
    : disabled("このゲームはまだ共通結果共有moduleを採用していないため"),
  llm: options.llm
    ? enabled()
    : disabled("ゲーム進行にLLMを使用しないため"),
});

/**
 * Built-in games explicitly opt into or out of every optional module here.
 * Do not infer a capability from an adjacent implementation detail: an online
 * room does not imply spectators, and persisted results do not imply rating.
 */
export const builtInGameCapabilityPolicies = {
  wordwolf: standardOnline({ llm: true }),
  tahoiya: standardOnline({ llm: true }),
  "northern-branch": standardOnline(),
  hodoai: standardOnline({ resultShare: true }),
  "kotoba-senpuku": standardOnline(),
  nigoichi: standardOnline({ resultShare: true }),
  "code-intercept": standardOnline({ resultShare: true }),
  canvas: {
    onlineRoom: disabled("勝敗を持つオンライン部屋ではなく共同描画機能として提供するため"),
    timer: disabled("開始・終了フェーズを持たない共同描画機能のため"),
    debug: enabled(),
    spectators: disabled("観戦者と参加者を区別するゲーム進行を持たないため"),
    stats: disabled("得点・勝敗を持たないため"),
    rating: disabled("得点・勝敗を持たないため"),
    replay: disabled("現時点では描画履歴を対戦リプレイとして保存しないため"),
    resultShare: disabled("対戦結果画面を持たないため"),
    llm: disabled("描画機能にLLMを使用しないため"),
  },
  daifugo: standardOnline({ resultShare: true }),
} satisfies Record<string, CapabilityPolicy>;

export function builtInCapabilityPolicy(gameId: string): CapabilityPolicy {
  const policy = builtInGameCapabilityPolicies[gameId as keyof typeof builtInGameCapabilityPolicies];
  if (!policy) throw new Error(`Game module policy is missing for ${gameId}.`);
  return policy;
}
