import {
  normalizeTopicDictionarySource,
  getTopicKey,
  getTopicWords,
  normalizeTopicPairDistance,
  normalizeTopicWord,
  isValidWordWolfTopic,
  isStrictProperNounTopic,
  pickFallbackTopic,
  type TopicDictionarySource,
  type TopicPairDistance,
  type WordWolfTopic,
} from "@/lib/wordwolf";
import {
  gameLlmFallbackNotice,
  generateGameLlmText,
  resolveGameLlmMode,
  type GameLlmMode,
} from "@/lib/game-llm";
import type { GameGenerationMeta } from "@/lib/game-ai-types";
import { formatGameFeedbackContext, retrieveGameFeedback } from "@/lib/game-feedback-store";
import { loadStoredWordWolfRoom } from "@/lib/wordwolf-room-store";
import {
  findReusableWordWolfTopic,
  loadExperiencedWordWolfWords,
  loadWordWolfCatalogWords,
  rememberWordWolfTopicCandidate,
  rememberWordWolfTopicExperience,
} from "@/lib/wordwolf-topic-catalog";
import { parseLlmJson } from "@/lib/llm-json";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { emitObservabilityEvent, observabilityErrorCode } from "@/lib/observability";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";

const baseTopicPrompt =
  "ワードウルフ用のお題ペアを1組作ってください。3-6人で3周ほど話す前提です。日本語で、共通点を話せるが同じ言葉の言い換えではない組み合わせにしてください。JSONのみで返してください: {\"villageWord\":\"...\",\"wolfWord\":\"...\",\"reason\":\"...\"}";

const wordwolfTopicPromptVersion = "wordwolf-topic-v2";

function localGenerationMeta(retrievedFeedbackIds: string[]): GameGenerationMeta {
  return {
    provider: "local",
    model: "local-topic-data",
    mode: "local",
    promptVersion: wordwolfTopicPromptVersion,
    latencyMs: 0,
    retrievedFeedbackIds,
  };
}

function normalizeList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeTopicHint(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function isTopicAllowed(topic: WordWolfTopic, excludeKeys: string[], excludeWords: string[]) {
  const excludedKeys = new Set(excludeKeys);
  const excludedWords = new Set(excludeWords.map(normalizeTopicWord).filter(Boolean));

  return !excludedKeys.has(getTopicKey(topic)) && getTopicWords(topic).every((word) => !excludedWords.has(word));
}

function parseTopic(
  text: string,
  pairDistance: TopicPairDistance,
  dictionarySource: Extract<TopicDictionarySource, "llm" | "proper-noun">,
): WordWolfTopic | null {
    const parsed = parseLlmJson<Partial<WordWolfTopic> & {
      alternativeCandidates?: unknown;
      pairIsCanonical?: unknown;
      sharedNameCue?: unknown;
    }>(text);
    if (!parsed) return null;
    if (!parsed.villageWord || !parsed.wolfWord) return null;

    if (dictionarySource === "proper-noun") {
      const alternatives = Array.isArray(parsed.alternativeCandidates)
        ? [...new Set(parsed.alternativeCandidates.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))]
        : [];
      if (alternatives.length < 4 || parsed.pairIsCanonical !== false || parsed.sharedNameCue !== false) return null;
    }

    const topic = {
      villageWord: String(parsed.villageWord).trim(),
      wolfWord: String(parsed.wolfWord).trim(),
      reason: String(parsed.reason || "近いカテゴリだが体験や用途が違うペアです。"),
      source: "llm",
      fallbackExhausted: false,
      dictionarySource,
      pairDistance,
      sourceMode: dictionarySource === "proper-noun" ? "proper-noun" : "llm",
    } satisfies WordWolfTopic;

    return isValidWordWolfTopic(topic) && (dictionarySource !== "proper-noun" || isStrictProperNounTopic(topic)) ? topic : null;
}

function getTopicRequestOptions(request: Request) {
  const url = new URL(request.url);
  const legacyMode = url.searchParams.get("mode");

  return {
    excludeKeys: normalizeList(url.searchParams.get("exclude")?.split(",") ?? []).slice(0, 500),
    excludeWords: normalizeList(url.searchParams.get("excludeWords")?.split(",") ?? []).slice(0, 500),
    dictionarySource: normalizeTopicDictionarySource(url.searchParams.get("source") ?? legacyMode),
    pairDistance: normalizeTopicPairDistance(url.searchParams.get("distance") ?? legacyMode),
    topicHint: normalizeTopicHint(url.searchParams.get("hint")),
  };
}

async function generateLlmTopic(
  excludeKeys: string[],
  excludeWords: string[],
  pairDistance: TopicPairDistance,
  dictionarySource: Extract<TopicDictionarySource, "llm" | "proper-noun">,
  topicHint: string,
  mode: Exclude<GameLlmMode, "local">,
  feedbackContext: string,
  retrievedFeedbackIds: string[],
) {
  const distancePrompt = dictionarySource === "proper-noun"
    ? pairDistance === "near"
      ? "固有名詞の『近い』です。同じ広いカテゴリで共通点はすぐ分かる一方、片方を見ても相方が一意に絞れない組み合わせにしてください。同じ作品内の二人、定番ライバル、隣接する時代、前後編、同じシリーズの代表2作、二大ブランドのような狭い兄弟ペアは禁止です。"
      : pairDistance === "wide"
        ? "固有名詞の『遠い』です。人物なら人物、作品なら作品、場所なら場所という型を揃えつつ、共通する広い文脈を一つ挟んでつながる二段連想の組み合わせにしてください。片方の名前から相方を直接連想する定番関係は禁止です。"
        : "固有名詞の『普通』です。同じ大きな文脈に属するが、狭い分類・時代・地域・用途は異なる組み合わせにしてください。同業二強、宿敵、隣接時代、同一シリーズなど、片方の名前だけで相方を当てられる関係は禁止です。"
    : pairDistance === "near"
      ? "ペアの距離は近い設定です。誰でも共通点をすぐ理解できる類語・兄弟語・同じ用途の組み合わせにしてください。ただし完全な同義語や単なる言い換えは避け、話すと違いが出る余地を残してください。"
      : pairDistance === "wide"
        ? "ペアの距離は遠い設定です。Aから共通語を一つ挟んでBにつながるくらいまで離してよいです。例: A -> 共通語 -> B の二段連想で同じ広い文脈に戻れる組み合わせにしてください。物は物、場所は場所、人物は人物、作品は作品など意味のレイヤーは必ず揃えてください。同じ語群の一番有名なものと二番目に有名なものを並べるのは避けてください。"
        : "ペアの距離は普通設定です。以前の広めに近い塩梅で、大きな共通文脈はあるが、分類・体験・使う場面がはっきり違う組み合わせにしてください。近すぎる隣同士は避け、ただし一言では共通点を説明できる距離にしてください。";

  const prompt =
    excludeKeys.length > 0
      ? `${baseTopicPrompt}\n${distancePrompt}\n最近出たので避けるペア: ${excludeKeys.join(", ")}`
      : `${baseTopicPrompt}\n${distancePrompt}`;

  const topicKindPrompt =
    dictionarySource === "proper-noun"
      ? [
          "Proper noun mode: use only reasonably famous proper nouns that ordinary Japanese players are likely to know.",
          "Allowed types include people, fictional characters, works, brands/products, organizations, facilities, regions, landmarks, and events.",
          "Pair the same semantic type and layer: person with person, character with character, work with work, brand/product with brand/product, place/landmark with place/landmark, organization with organization.",
          "Prefer categories where several other famous alternatives also exist, so early clues do not uniquely identify the answer. Good examples: convenience-store chains, coffee chains, universities, train lines, theme parks, video platforms, sports teams, long-running TV shows, manga magazines, game consoles, smartphone brands, and city landmarks.",
          "Do not use common category words, subject names, abstract concepts, or ideology words as proper nouns. Bare legal categories such as 民法, 刑法, 商法, 憲法, 法律, 条例 are common nouns and are strictly forbidden. A law-related answer is allowed only when it has a distinctive full proper name such as 日本国憲法; named people, works, events, treaties, places, and institutions are preferred.",
          "Do not pair the most famous item and the second most famous item in the same narrow group. Prefer a third/fourth option, a different subfield, or a two-hop association that still shares a broad context.",
          "The pair must belong to a category with at least six plausible well-known candidates. List at least four other plausible candidates in alternativeCandidates; neither chosen answer may appear in that list.",
          "Set pairIsCanonical to false only after confirming the names are not a famous duo, rivalry, direct predecessor/successor, adjacent eras, two sides of one event, or the standard two examples people mention together.",
          "Set sharedNameCue to false only when the two names do not share a revealing title pattern, franchise name, numbered sequence, organization prefix, or distinctive suffix that exposes their relationship.",
          "Avoid uniquely iconic one-of-one names where a generic clue immediately reveals the answer, such as a single nationally symbolic mountain, a once-in-a-generation athlete, or an overwhelmingly famous mascot with no plausible alternatives.",
          "Do not choose pairs whose main shared clue is just 'very famous'. They must share a broad category with at least 3 plausible wrong guesses players might imagine.",
          "Avoid obscure names, private/internal names, and pairs that require specialist knowledge.",
        ].join(" ")
      : [
          "General word mode: use common Japanese nouns, not proper nouns.",
          "Pair the same semantic type and layer: object with object, place with place, activity/concept with activity/concept, person/living thing with the same kind.",
        ].join(" ");
  const studyScopePrompt =
    dictionarySource === "proper-noun"
      ? "Also include school-study friendly named topics when useful: historical events, eras, wars, reforms, treaties, laws, classical works, named theorems, named theories, people, places, and institutions. Keep the pair on the same learning layer. Avoid bare subject terms such as capitalism/socialism, supply/demand, inflation/deflation, function/equation, or photosynthesis/respiration unless they are part of a recognized proper name."
      : "";

  const avoidLines = [
    topicKindPrompt,
    studyScopePrompt,
    topicHint
      ? `Theme hint is a hard requirement: the pair must be directly related to "${topicHint}". If the hint is a game, subject, genre, person, place, historical field, or hobby, choose words from that field. Do not ignore the hint. Do not use the hint itself unless it is a natural topic word.`
      : "",
    "Do not pair an object with a place, a person with a work, or an abstract concept with a concrete object.",
    dictionarySource === "proper-noun"
      ? "Before answering, test each selected name by itself. If an ordinary player could guess the other answer from the name alone without hearing any clue, reject the pair and choose a less canonical relation. Return JSON with villageWord, wolfWord, reason, alternativeCandidates (at least 4 strings), pairIsCanonical (must be false), and sharedNameCue (must be false)."
      : "",
    excludeWords.length > 0 ? `exclude words used today: ${excludeWords.join(", ")}` : "",
  ].filter(Boolean);
  const promptWithExclusions = [
    `${prompt}${avoidLines.length > 0 ? `\n${avoidLines.join("\n")}` : ""}`,
    feedbackContext,
  ].filter(Boolean).join("\n\n");

  const generated = await generateGameLlmText(promptWithExclusions, mode);
  const topic = parseTopic(generated.text, pairDistance, dictionarySource);
  return topic
    ? {
        ...topic,
        generation: {
          provider: generated.provider,
          model: generated.model,
          mode: generated.mode,
          billingSource: generated.billingSource,
          promptVersion: wordwolfTopicPromptVersion,
          latencyMs: generated.latencyMs,
          retrievedFeedbackIds,
        },
      }
    : null;
}

export async function generateWordWolfTopicResponse(request: Request, playerIds: string[], previewOnly = false, forceNew = false) {
  const { excludeKeys, excludeWords, dictionarySource, pairDistance, topicHint } = getTopicRequestOptions(request);
  const [experiencedWords, catalogWords] = await Promise.all([
    loadExperiencedWordWolfWords(playerIds).catch(() => []),
    forceNew ? loadWordWolfCatalogWords().catch(() => []) : Promise.resolve([]),
  ]);
  const allExcludeKeys = excludeKeys;
  const allExcludeWords = normalizeList([...excludeWords, ...experiencedWords, ...catalogWords]);
  const requiresLlm = dictionarySource === "llm" || dictionarySource === "proper-noun";
  const feedbackRecords = requiresLlm
    ? await retrieveGameFeedback({
        game: "wordwolf",
        task: "wordwolf.topic",
        queryTags: [dictionarySource, pairDistance, topicHint].filter(Boolean),
      }).catch(() => [])
    : [];
  const feedbackContext = formatGameFeedbackContext(feedbackRecords);
  const retrievedFeedbackIds = feedbackRecords.map((record) => record.id);
  const remember = async (topic: WordWolfTopic) => {
    if (previewOnly) {
      await rememberWordWolfTopicCandidate(topic).catch(() => undefined);
    } else {
      await rememberWordWolfTopicExperience(topic, playerIds).catch(() => undefined);
    }
  };

  if (!forceNew) {
    const reusableTopic = await findReusableWordWolfTopic({
      dictionarySource,
      pairDistance,
      topicHint,
      playerIds,
      blockedWords: allExcludeWords,
    }).catch(() => null);
    if (reusableTopic) {
      await remember(reusableTopic);
      return Response.json(reusableTopic);
    }

    const localTopic = pickFallbackTopic(allExcludeKeys, dictionarySource, pairDistance, allExcludeWords, topicHint);
    if (!localTopic.fallbackExhausted) {
      const topic = { ...localTopic, generation: localGenerationMeta(retrievedFeedbackIds) };
      await remember(topic);
      return Response.json(topic);
    }
  }

  const mode = requiresLlm ? await resolveGameLlmMode() : "local";
  if (forceNew && mode === "local") {
    return Response.json({ error: "新規ワード生成に利用できるAI APIがありません。" }, { status: 503 });
  }
  const localTopic = pickFallbackTopic(allExcludeKeys, dictionarySource, pairDistance, allExcludeWords, topicHint);
  if (!requiresLlm || mode === "local") {
    const topic = { ...localTopic, notice: gameLlmFallbackNotice, generation: localGenerationMeta(retrievedFeedbackIds) };
    await remember(topic);
    return Response.json(topic);
  }

  try {
    const topic = await generateLlmTopic(
      allExcludeKeys,
      allExcludeWords,
      pairDistance,
      dictionarySource === "proper-noun" ? "proper-noun" : "llm",
      topicHint,
      mode,
      feedbackContext,
      retrievedFeedbackIds,
    );
    if (topic && isTopicAllowed(topic, allExcludeKeys, allExcludeWords)) {
      await remember(topic);
      return Response.json(topic);
    }
  } catch (error) {
    emitObservabilityEvent("error", "ai.generation", { game: "wordwolf", operation: "topic", outcome: "failed", errorCode: observabilityErrorCode(error) });
  }

  if (forceNew) {
    return Response.json({ error: "AIによる新規ワード生成に失敗しました。もう一度お試しください。" }, { status: 503 });
  }

  const topic = {
    ...localTopic,
    notice: gameLlmFallbackNotice,
    generation: localGenerationMeta(retrievedFeedbackIds),
  };
  await remember(topic);
  return Response.json(topic);
}

export async function GET(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.aiGeneration, { playerId: player.id });
    if (limited) return limited;
    const url = new URL(request.url);
    const previewOnly = url.searchParams.get("test") === "1";
    const roomCode = url.searchParams.get("roomCode")?.trim().toUpperCase() ?? "";
    const room = roomCode ? await loadStoredWordWolfRoom(roomCode).catch(() => null) : null;
    if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
    if (!room.players.some((item) => item.id === player.id)) return Response.json({ error: "Room action is not allowed" }, { status: 403 });
    if (!previewOnly || !room.debugMode || room.hostId !== player.id) {
      return Response.json({ error: "Topics are generated through the authenticated room command" }, { status: 403 });
    }
    const forceNew = url.searchParams.get("forceNew") === "1";
    return generateWordWolfTopicResponse(request, room.players.map((item) => item.id), true, forceNew);
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    return Response.json({ error: "Failed to generate topic preview" }, { status: 500 });
  }
}
