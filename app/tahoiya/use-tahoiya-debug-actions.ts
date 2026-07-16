import type { Dispatch, SetStateAction } from "react";
import type { TahoiyaRoom, TahoiyaRoomAction, TahoiyaTopic } from "@/lib/tahoiya-types";
import { getAnswerer, getDefinitionWriters } from "./use-tahoiya-view-model";

type RunAction = (action: TahoiyaRoomAction, persistDefaults?: boolean) => Promise<TahoiyaRoom | null>;
type StringSetter = Dispatch<SetStateAction<string>>;
type Params = { room: TahoiyaRoom | null; playerId: string; isHost: boolean; isDebugMode: boolean; skipReason: string; skipComment: string; isSkipping: boolean; runRoomAction: RunAction; setRoom: Dispatch<SetStateAction<TahoiyaRoom | null>>; setActivePlayerId: StringSetter; setDefinitionInput: StringSetter; setSelectedOptionId: StringSetter; setPolishMessage: StringSetter; setSkipReason: StringSetter; setSkipComment: StringSetter; setMessage: StringSetter; setIsSkipping: Dispatch<SetStateAction<boolean>> };

export function useTahoiyaDebugActions(params: Params) {
  const autoFillTestDefinitions = async () => { const room = params.room; if (room?.phase !== "writing") return; const saved = await params.runRoomAction({ type: "debug-fill-definitions", actorId: params.playerId, round: room.round }); if (!saved) return; const voter = saved.playMode === "all-vote" ? saved.players[0] : getAnswerer(saved); if (voter) params.setActivePlayerId(voter.id); params.setSelectedOptionId(""); };
  const autoFillTestVotes = async () => { const room = params.room; if (room?.phase === "voting" && room.options.length) await params.runRoomAction({ type: "debug-fill-votes", actorId: params.playerId, round: room.round }); };
  const skipDebugTopic = async () => {
    const room = params.room; if (!room || !params.isHost || !params.isDebugMode || room.phase === "lobby" || !params.skipReason || params.isSkipping) return;
    if (!room.topicGeneration) return params.setMessage("このお題には生成情報がないため、フィードバックを保存できません。");
    params.setIsSkipping(true); params.setMessage("");
    try {
      const feedback = await fetch("/api/game-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artifactId: `tahoiya:${room.code}:${room.round}:${room.word}:debug-skip`, artifactText: `単語=${room.word} / 読み=${room.reading ?? ""} / 語釈=${room.realDefinition} / 注記=${room.topicNote}`, game: "tahoiya", task: "tahoiya.topic", rating: "bad", reasonTags: [params.skipReason, "debug-skip"], comment: params.skipComment, playerId: params.playerId, generation: room.topicGeneration, settings: { playerCount: room.players.length, playMode: room.playMode, difficulty: room.topicDifficulty, debugMode: true }, outcome: { skipped: true, phase: room.phase } }) });
      if (!feedback.ok) { const data = await feedback.json().catch(() => ({})) as { error?: string }; throw new Error(data.error || "フィードバックを保存できませんでした。"); }
      const round = room.round + 1; const query = new URLSearchParams({ roomCode: room.code, round: String(round), difficulty: room.topicDifficulty }); const response = await fetch(`/api/tahoiya/topic?${query}`, { cache: "no-store" }); const topic = await response.json() as TahoiyaTopic & { error?: string };
      if (!response.ok || !topic.word || !topic.realDefinition) throw new Error(topic.notice || topic.error || "次のお題を生成できませんでした。");
      const saved = await params.runRoomAction({ type: "debug-replace-topic", actorId: params.playerId, round, topic }); if (!saved) throw new Error("次のお題を部屋へ保存できませんでした。");
      params.setRoom(saved); params.setSkipReason(""); params.setSkipComment(""); params.setDefinitionInput(""); params.setSelectedOptionId(""); params.setPolishMessage(""); const writer = getDefinitionWriters(saved)[0]; if (writer) params.setActivePlayerId(writer.id); params.setMessage("フィードバックを保存し、次のお題へ進みました。");
    } catch (error) { params.setMessage(error instanceof Error ? error.message : "お題をスキップできませんでした。"); } finally { params.setIsSkipping(false); }
  };
  const abortGame = async () => { const room = params.room; if (!room || room.phase === "lobby" || !room.debugMode) return; const saved = await params.runRoomAction({ type: "abort-game", actorId: params.playerId }); if (saved) { params.setDefinitionInput(""); params.setSelectedOptionId(""); params.setPolishMessage(""); } };
  return { autoFillTestDefinitions, autoFillTestVotes, skipDebugTopic, abortGame };
}
