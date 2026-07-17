import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { isValidWordWolfTopic, type TopicDictionarySource, type TopicPairDistance, type WordWolfTopic } from "@/lib/wordwolf";
import type { ClueLogVisibility, ClueMode, GameMode, Room, WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import type { DebugWordGenerationResult } from "../components/DebugWordGenerationTest";
import { normalizeWolfCount } from "./wordwolf-room-adapter";
import { normalizeWordDifficulty, type WordDifficulty } from "@/lib/word-selection-protocol";
import type { GameGenerationMeta } from "@/lib/game-ai-types";
import type { WordWolfDebugTrace } from "@/lib/wordwolf-topic-types";

type RunRoomAction = (action: WordWolfRoomAction, persistDefaults?: boolean) => Promise<Room | null>;

export function useWordWolfLobbyActions(room: Room | null, runRoomAction: RunRoomAction) {
  const updateConfig = (config: Partial<Pick<Room, "clueLogVisibility" | "gameMode" | "wolfCount" | "clueMode" | "randomizeTurnOrder" | "turnTimeLimitSeconds" | "topicDictionarySource" | "topicPairDistance" | "topicDifficulty" | "topicHint">>) => {
    if (!room || room.phase !== "lobby") return;
    void runRoomAction({ type: "update-config", config }, true);
  };

  const addSeat = () => { if (room) void runRoomAction({ type: "debug-add-player" }); };
  const setClueLogVisibility = (value: ClueLogVisibility) => updateConfig({ clueLogVisibility: value });
  const setGameMode = (value: GameMode) => updateConfig({ gameMode: value });
  const setWolfCount = (value: number) => { if (room) updateConfig({ wolfCount: normalizeWolfCount(value, room.players.length) }); };
  const setClueMode = (value: ClueMode) => updateConfig({ clueMode: value });
  const setRandomizeTurnOrder = (value: boolean) => updateConfig({ randomizeTurnOrder: value });
  const setTurnTimeLimit = (value: number) => updateConfig({ turnTimeLimitSeconds: normalizeCommonTimeLimit(value) });
  const setTopicDictionarySource = (value: TopicDictionarySource) => updateConfig({ topicDictionarySource: value });
  const setTopicPairDistance = (value: TopicPairDistance) => updateConfig({ topicPairDistance: value });
  const setTopicDifficulty = (value: WordDifficulty) => updateConfig({ topicDifficulty: normalizeWordDifficulty(value) });
  const setTopicHint = (value: string) => updateConfig({ topicHint: value.slice(0, 80) });

  const testWordGeneration = async (forceNew: boolean): Promise<DebugWordGenerationResult> => {
    if (!room) throw new Error("部屋の設定を読み込めませんでした。");
    const params = new URLSearchParams({ test: "1", roomCode: room.code, source: room.topicDictionarySource, distance: room.topicPairDistance, difficulty: room.topicDifficulty });
    if (forceNew) params.set("forceNew", "1");
    if (room.topicHint.trim()) params.set("hint", room.topicHint.trim().slice(0, 80));
    const response = await fetch(`/api/wordwolf/topic?${params.toString()}`, { cache: "no-store" });
    const topic = (await response.json()) as Partial<WordWolfTopic> & {
      error?: string;
      diagnosticCode?: string;
      debugPreview?: boolean;
      debugTrace?: WordWolfDebugTrace;
      generation?: GameGenerationMeta;
    };
    if (!response.ok) throw new Error(`${topic.error || "ワードを生成できませんでした。"}${topic.diagnosticCode ? `（${topic.diagnosticCode}）` : ""}`);
    const candidateItems = topic.debugTrace?.candidates?.map((candidate) => ({
      title: `${candidate.surface}${candidate.partner ? ` / ${candidate.partner}` : ""}`,
      status: candidate.outcome,
      fields: [
        { label: "判定", value: `${candidate.decision} / ${candidate.reasonCode}` },
        { label: "実質Zipf・重み", value: `${candidate.wordwolfEffectiveZipf.toFixed(2)} / ${candidate.selectionWeight.toFixed(3)}` },
        { label: "理由", value: candidate.pairReason },
        { label: "保存", value: `評価=${candidate.evaluationPersisted ? "済" : "失敗"} / draft=${candidate.draftPersisted ? "済" : "未保存"}` },
      ],
    }));
    if (topic.debugPreview && topic.debugTrace) {
      return {
        fields: [
          { label: "生成経路", value: topic.debugTrace.pipeline },
          { label: "結果", value: "採用可能なペアなし" },
        ],
        items: candidateItems,
        notice: topic.notice,
        generation: topic.generation,
      };
    }
    if (typeof topic.villageWord !== "string" || typeof topic.wolfWord !== "string" || !isValidWordWolfTopic({ villageWord: topic.villageWord, wolfWord: topic.wolfWord })) {
      throw new Error(topic.notice || topic.error || "ワードを生成できませんでした。");
    }
    const validTopic = topic as WordWolfTopic;
    return {
      fields: [
        { label: "生成経路", value: validTopic.debugTrace?.pipeline ?? "direct-llm" },
        { label: "市民ワード", value: validTopic.villageWord },
        { label: "ウルフワード", value: validTopic.wolfWord },
        { label: "組み合わせの意図", value: validTopic.reason },
      ],
      items: candidateItems,
      notice: validTopic.notice,
      generation: validTopic.generation,
    };
  };

  return { addSeat, setClueLogVisibility, setGameMode, setWolfCount, setClueMode, setRandomizeTurnOrder, setTurnTimeLimit, setTopicDictionarySource, setTopicPairDistance, setTopicDifficulty, setTopicHint, testWordGeneration };
}
