import type { Dispatch, SetStateAction } from "react";
import { normalizeCommonTimeLimit } from "@/lib/game-room-config";
import { isPlayerAuthenticated } from "@/lib/player-session";
import type { TahoiyaAnswererMode, TahoiyaDifficulty, TahoiyaPlayMode, TahoiyaRoom, TahoiyaRoomAction, TahoiyaRoomChoice, TahoiyaTopic } from "@/lib/tahoiya-types";
import type { DebugWordGenerationResult } from "../components/DebugWordGenerationTest";
import { applyTahoiyaSpecialAction, createEmptyRoom, createPlayer, createRoomInStore, deleteHostedRoomsFromStore, getOwnerId, listJoinableRoomsFromStore, loadActiveRoomFromStore, loadRoomDefaultsFromStore, saveRoomDefaultsToStore } from "./tahoiya-room-adapter";

type RunAction = (action: TahoiyaRoomAction, persistDefaults?: boolean) => Promise<TahoiyaRoom | null>;
type Params = { room: TahoiyaRoom | null; playerId: string; playerName: string; avatarColor: string; avatarImage: string | null; passphrase: string; joinCode: string; runRoomAction: RunAction; setRoom: Dispatch<SetStateAction<TahoiyaRoom | null>>; setActivePlayerId: Dispatch<SetStateAction<string>>; setJoinableRooms: Dispatch<SetStateAction<TahoiyaRoomChoice[]>>; setMessage: Dispatch<SetStateAction<string>> };

export function useTahoiyaLobbyActions(params: Params) {
  const { room, playerId, playerName, passphrase, runRoomAction } = params;
  const refreshJoinableRooms = async () => params.setJoinableRooms(await listJoinableRoomsFromStore());
  const createRoom = async () => {
    if (!isPlayerAuthenticated() || !playerId || !playerName) return params.setMessage("先に広場でログインしてください。");
    const ownerId = getOwnerId();
    if (!await deleteHostedRoomsFromStore(ownerId, playerId)) return params.setMessage("プレイ中の部屋があるため、新しい部屋は作れません。その部屋へ戻ってください。");
    const host = createPlayer(playerName, params.avatarColor, params.avatarImage, playerId);
    const defaults = await loadRoomDefaultsFromStore(playerId, ownerId);
    const saved = await createRoomInStore(createEmptyRoom(host, passphrase, ownerId, defaults), playerId);
    if (!saved) return params.setMessage("部屋を作成できませんでした。");
    params.setRoom(saved); void saveRoomDefaultsToStore(saved); params.setActivePlayerId(host.id); params.setMessage("");
  };
  const joinRoom = async (targetCode = params.joinCode) => {
    if (!isPlayerAuthenticated() || !playerId || !playerName) return params.setMessage("先に広場でログインしてください。");
    const code = targetCode.trim().toUpperCase();
    const activeRoom = await loadActiveRoomFromStore(playerId);
    if (activeRoom && activeRoom.code !== code) { params.setRoom(activeRoom); params.setActivePlayerId(playerId); params.setMessage(`すでに部屋 ${activeRoom.code} に参加しています。1人が保持できる部屋は1つです。`); return; }
    try { const joined = await applyTahoiyaSpecialAction(code, { type: "join-room", passphrase }); params.setRoom(joined); params.setActivePlayerId(playerId); params.setMessage(""); }
    catch (error) { params.setMessage(error instanceof Error && error.message === "Bad passphrase" ? "合言葉が違います。" : "部屋に参加できませんでした。開始済み・満員でないか確認してください。"); }
  };
  const updateConfig = (config: Extract<TahoiyaRoomAction, { type: "update-config" }>["config"]) => { if (room?.phase === "lobby") void runRoomAction({ type: "update-config", actorId: playerId, config }, true); };
  const setDebugMode = (enabled: boolean) => { if (room?.phase !== "lobby") return; void runRoomAction({ type: "set-debug", actorId: playerId, enabled }); if (!enabled) params.setActivePlayerId(playerId); };
  const addTestPlayer = () => { if (room?.phase === "lobby" && room.debugMode) void runRoomAction({ type: "debug-add-player", actorId: playerId }); };
  const removeWaitingPlayer = async (targetPlayerId: string, targetPlayerName: string) => {
    if (!room || room.phase !== "lobby" || room.hostId !== playerId) return;
    if (!window.confirm(`${targetPlayerName}さんを復帰待ちから退出させますか？`)) return;
    await runRoomAction({ type: "remove-waiting-player", actorId: playerId, targetPlayerId });
  };
  const testWordGeneration = async (forceNew: boolean): Promise<DebugWordGenerationResult> => {
    if (!room) throw new Error("部屋の設定を読み込めませんでした。");
    const query = new URLSearchParams({ test: "1", roomCode: room.code, difficulty: room.topicDifficulty }); if (forceNew) query.set("forceNew", "1");
    const response = await fetch(`/api/tahoiya/topic?${query}`, { cache: "no-store" });
    const topic = await response.json() as TahoiyaTopic & { error?: string; registeredCount?: number; batch?: Array<{ accepted: boolean; word: string; reading: string; realDefinition: string; note: string; difficulty: "easy" | "standard" | "extreme"; difficultyReason: string; genre: string; sourceLibrary: string }> };
    if (!response.ok) throw new Error(topic.notice || topic.error || "ワードを生成できませんでした。");
    if (forceNew && topic.batch) { const labels = { easy: "対象外（簡単）", standard: "秘境", extreme: "魔境" } as const; return { fields: [{ label: "一括審査", value: `${topic.batch.length}件` }, { label: "候補DBへ登録", value: `${topic.registeredCount ?? 0}件（全プレイヤー未使用）` }], items: topic.batch.map((item) => ({ title: item.word, status: item.accepted ? `採用・${labels[item.difficulty]}` : "除外", fields: [{ label: "読み", value: item.reading }, { label: "説明", value: item.realDefinition }, { label: "絶対評価の理由", value: item.difficultyReason }, { label: "分野・素材元", value: `${item.genre} / ${item.sourceLibrary}` }, { label: "注記", value: item.note }] })), notice: "10件を相対比較せず、RAGフィードバック基準で個別に絶対評価しました。採用語は履歴を付けず候補DBへ登録済みです。", generation: topic.generation }; }
    if (!topic.word || !topic.realDefinition) throw new Error(topic.notice || topic.error || "ワードを生成できませんでした。");
    return { fields: [{ label: "ワード", value: topic.word }, { label: "読み", value: topic.reading ?? "" }, { label: "本物の説明", value: topic.realDefinition }, { label: "注記", value: topic.note }], notice: topic.notice, generation: topic.generation };
  };
  const testDifficultyScreening = async (): Promise<DebugWordGenerationResult> => {
    if (!room) throw new Error("部屋の設定を読み込めませんでした。");
    const query = new URLSearchParams({ roomCode: room.code, difficulty: room.topicDifficulty, screenDifficulty: "1" });
    const response = await fetch(`/api/tahoiya/topic?${query}`, { cache: "no-store" });
    const data = await response.json() as { error?: string; persisted?: boolean; persistedCount?: number; generation?: TahoiyaTopic["generation"]; screening?: Array<{ difficulty: "extreme" | "standard" | "rejected"; word: string; verdict: "known" | "borderline" | "ordinary-unknown" | "almost-nobody-knows"; exclusionFlags: Array<"sensitive" | "university" | "company" | "place">; estimatedRecognitionPercent: number; confidence: number; reason: string }> };
    if (!response.ok || !data.screening) throw new Error(data.error || "難易度を審査できませんでした。");
    const labels = { known: "既知寄り", borderline: "境界", "ordinary-unknown": "一般には不明", "almost-nobody-knows": "ほぼ誰も知らない" } as const;
    const exclusionLabels = { sensitive: "センシティブ", university: "大学名", company: "企業名", place: "地名" } as const;
    const extremeCount = data.screening.filter((item) => item.difficulty === "extreme").length;
    const standardCount = data.screening.filter((item) => item.difficulty === "standard").length;
    const flaggedCount = data.screening.filter((item) => item.exclusionFlags.length > 0).length;
    const recognitionRejectedCount = data.screening.filter((item) => item.difficulty === "rejected" && item.exclusionFlags.length === 0).length;
    return {
      fields: [
        { label: "先行審査", value: `${data.screening.length}語` },
        { label: "魔境ライン合格（認知率0〜1%）", value: `${extremeCount}語` },
        { label: "秘境ライン合格（認知率1%超〜14%）", value: `${standardCount}語` },
        { label: "認知率による対象外（15%以上）", value: `${recognitionRejectedCount}語` },
        { label: "除外フラグあり", value: `${flaggedCount}語` },
        { label: "判定済みDBへ保存", value: data.persisted ? `${data.persistedCount ?? data.screening.length}語` : "保存失敗" },
      ],
      items: data.screening.map((item) => ({
        title: item.word,
        status: item.difficulty === "extreme"
          ? `魔境ライン合格・${labels[item.verdict]}`
          : item.difficulty === "standard"
            ? `秘境ライン合格・${labels[item.verdict]}`
            : item.exclusionFlags.length > 0
              ? `除外・${item.exclusionFlags.map((flag) => exclusionLabels[flag]).join("・")}`
              : `認知率対象外・${labels[item.verdict]}`,
        fields: [
          { label: "除外フラグ", value: item.exclusionFlags.length > 0 ? item.exclusionFlags.map((flag) => exclusionLabels[flag]).join("・") : "なし" },
          { label: "一般成人の推定認知率", value: `${item.estimatedRecognitionPercent}%` },
          { label: "判定確信度", value: `${item.confidence}%` },
          { label: "理由", value: item.reason },
        ],
      })),
      notice: "共通DBの未判定10語を説明なしでLLMへ渡し、魔境・秘境の両ラインを分類して判定済み候補として保存しました。プレイヤーの出題履歴には追加していません。",
      generation: data.generation,
    };
  };
  return { refreshJoinableRooms, createRoom, joinRoom, addTestPlayer, removeWaitingPlayer, setDebugMode, setAnswererMode: (value: TahoiyaAnswererMode) => updateConfig({ answererMode: value }), setPlayMode: (value: TahoiyaPlayMode) => updateConfig({ playMode: value }), setTopicDifficulty: (value: TahoiyaDifficulty) => updateConfig({ topicDifficulty: value }), setManualAnswerer: (value: string) => updateConfig({ answererId: value }), setShowRealDefinitionToWriters: (value: boolean) => updateConfig({ showRealDefinitionToWriters: value }), setActionTimeLimit: (value: number) => updateConfig({ actionTimeLimitSeconds: normalizeCommonTimeLimit(value) }), testWordGeneration, testDifficultyScreening };
}
