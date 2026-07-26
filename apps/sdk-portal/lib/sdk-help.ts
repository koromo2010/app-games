export type SdkHelpEntry = {
  id: string;
  title: string;
  question: string;
  answer: string;
  keywords: string[];
  relatedToolNames: string[];
};

/** SDK画面と制作AIの回答で共有するHelp正本。 */
export const SDK_HELP_ENTRIES: readonly SdkHelpEntry[] = [
  {
    id: "support-conversations",
    title: "報告後の運営とのやりとり",
    question: "送った不具合報告へ返信したり、運営からの回答を確認できますか？",
    answer:
      "はい。SDK Portalのサポート画面から本人が直接返信できます。AIはlist_support_threads・get_support_threadで本人の報告だけを確認し、prepare_support_replyで返信下書きを作れますが、その時点では投稿されません。返されたapprovalUrlを制作者本人が開き、内容を確認・必要なら修正して「返信を送信」を押した場合だけ投稿され、状態が「オープン」へ戻ります。",
    keywords: ["報告", "不具合", "返信", "やりとり", "状態", "オープン", "サポート"],
    relatedToolNames: ["list_support_threads", "get_support_thread", "prepare_support_reply"],
  },
  {
    id: "human-approved-ai-reporting",
    title: "AIによる報告下書きと人間承認",
    question: "AIから不具合報告を送れますか？",
    answer:
      "AIはprepare_support_reportで報告下書きを作れますが、その時点では送信されません。返されたapprovalUrlを制作者本人が開き、内容を確認・必要なら修正して「報告を送信」を押した場合だけ正式な報告になります。AIだけで人間承認を省略するtoolはありません。",
    keywords: ["AI", "不具合報告", "下書き", "同意", "承認", "prepare_support_report"],
    relatedToolNames: ["prepare_support_report"],
  },
  {
    id: "package-candidate-and-formal-submission",
    title: "提出候補の準備と正式提出",
    question: "AIはゲームを正式提出できますか？",
    answer:
      "AIは、制作者が制作を依頼しているゲームについて、完成したpackageを検査し、publish_game_packageで「提出候補」として保存できます。これは正式提出ではありません。正式提出は、制作者本人がSDKのマイゲーム画面で内容を確認し、「正式提出」を押したときだけ成立します。",
    keywords: ["提出", "正式提出", "提出候補", "AI", "フラグ", "publish_game_package", "package"],
    relatedToolNames: ["publish_game_package"],
  },
  {
    id: "submission-permission",
    title: "AIが提出候補を準備できる条件",
    question: "AIは勝手に提出候補を作れますか？",
    answer:
      "いいえ。AIは、ログイン中の制作者アカウントが所有する制作環境とゲームだけを操作でき、制作フロー上でpackage準備へ進んでよい状態を確認してから提出候補を保存します。他人のゲーム、未検査のpackage、正式提出操作は対象外です。",
    keywords: ["権限", "許可", "フラグ", "勝手", "所有者", "本人", "提出候補"],
    relatedToolNames: ["list_creator_environments", "get_game_module_requirements", "publish_game_package"],
  },
  {
    id: "after-formal-submission",
    title: "正式提出後の流れ",
    question: "正式提出するとすぐ本番公開されますか？",
    answer:
      "いいえ。正式提出後は運営のSDK作品採用候補になります。運営が検査・審査し、SDKからmainへの採用を明示的に実行したゲームだけが本番公開へ進みます。制作者や制作AIにはmainへ昇格する権限はありません。",
    keywords: ["提出後", "審査", "採用", "昇格", "main", "本番", "公開"],
    relatedToolNames: [],
  },
  {
    id: "draft-game-persistence",
    title: "未提出ゲームの保存",
    question: "正式提出していないゲームは後から見つけられますか？",
    answer:
      "はい。最初のモックをSDKへ保存したゲームは、正式提出の有無にかかわらず制作者アカウントのマイゲームへ表示されます。提出候補の準備と、制作物の保存・一覧表示は別の状態です。",
    keywords: ["未提出", "下書き", "試作", "保存", "マイゲーム", "一覧"],
    relatedToolNames: ["publish_mock", "list_creator_environments"],
  },
];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ja");
}

export function searchSdkHelp(query: string, limit = 5) {
  const normalized = normalize(query);
  const terms = normalized.split(/[\s、。,.!?！？・/]+/).filter(Boolean);
  const entries = SDK_HELP_ENTRIES.map((entry) => {
    const title = normalize(entry.title);
    const question = normalize(entry.question);
    const answer = normalize(entry.answer);
    const keywords = entry.keywords.map(normalize);
    const score = terms.reduce((total, term) => {
      if (title.includes(term)) return total + 6;
      if (question.includes(term)) return total + 5;
      if (keywords.some((keyword) => keyword.includes(term) || term.includes(keyword))) return total + 4;
      if (answer.includes(term)) return total + 1;
      return total;
    }, 0);
    return { entry, score };
  })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(limit, 10)))
    .map(({ entry }) => entry);

  return {
    query,
    entries,
    count: entries.length,
    instruction: entries.length > 0
      ? "回答はHelp正本のanswerを優先し、権限や提出状態を推測で補わないでください。"
      : "該当するHelpがありません。仕様を推測せず、制作者へ質問を言い換えてもらってください。",
  };
}
