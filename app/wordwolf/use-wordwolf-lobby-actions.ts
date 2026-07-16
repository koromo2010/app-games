import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { isValidWordWolfTopic, type TopicDictionarySource, type TopicPairDistance, type WordWolfTopic } from "@/lib/wordwolf";
import type { ClueLogVisibility, ClueMode, GameMode, Room, WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import type { DebugWordGenerationResult } from "../components/DebugWordGenerationTest";
import { normalizeWolfCount } from "./wordwolf-room-adapter";

type RunRoomAction = (action: WordWolfRoomAction, persistDefaults?: boolean) => Promise<Room | null>;

export function useWordWolfLobbyActions(room: Room | null, runRoomAction: RunRoomAction) {
  const updateConfig = (config: Partial<Pick<Room, "clueLogVisibility" | "gameMode" | "wolfCount" | "clueMode" | "randomizeTurnOrder" | "turnTimeLimitSeconds" | "topicDictionarySource" | "topicPairDistance" | "topicHint">>) => {
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
  const setTopicHint = (value: string) => updateConfig({ topicHint: value.slice(0, 80) });

  const testWordGeneration = async (forceNew: boolean): Promise<DebugWordGenerationResult> => {
    if (!room) throw new Error("部屋の設定を読み込めませんでした。");
    const params = new URLSearchParams({ test: "1", roomCode: room.code, source: room.topicDictionarySource, distance: room.topicPairDistance });
    if (forceNew) params.set("forceNew", "1");
    if (room.topicHint.trim()) params.set("hint", room.topicHint.trim().slice(0, 80));
    const response = await fetch(`/api/wordwolf/topic?${params.toString()}`, { cache: "no-store" });
    const topic = (await response.json()) as WordWolfTopic & { error?: string };
    if (!response.ok || !isValidWordWolfTopic(topic)) throw new Error(topic.notice || topic.error || "ワードを生成できませんでした。");
    return { fields: [{ label: "市民ワード", value: topic.villageWord }, { label: "ウルフワード", value: topic.wolfWord }, { label: "組み合わせの意図", value: topic.reason }], notice: topic.notice, generation: topic.generation };
  };

  return { addSeat, setClueLogVisibility, setGameMode, setWolfCount, setClueMode, setRandomizeTurnOrder, setTurnTimeLimit, setTopicDictionarySource, setTopicPairDistance, setTopicHint, testWordGeneration };
}
