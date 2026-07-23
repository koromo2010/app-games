import { normalizeTopicDictionarySource, type TopicDictionarySource, type TopicPairDistance } from "@/lib/wordwolf";
import type { ClueLogVisibility, ClueMode, GameMode, Room } from "@/lib/wordwolf-game-types";
import { DebugWordGenerationTest, type DebugWordGenerationResult } from "../components/DebugWordGenerationTest";
import { RoomTimeLimitControl } from "../components/RoomTimeLimitControl";
import { inputClass, primaryButtonClass } from "./styles";
import { lobbyRounds, normalizeRoundsTotal } from "./wordwolf-room-adapter";
import type { WordDifficulty } from "@/lib/word-selection-protocol";

type Props = {
  room: Room;
  isHost: boolean;
  isStarting: boolean;
  allowedWolfCount: number;
  wolfCountOptions: number[];
  onGameModeChange: (value: GameMode) => void;
  onWolfCountChange: (value: number) => void;
  onRoundsTotalChange: (value: number) => void;
  onClueModeChange: (value: ClueMode) => void;
  onTurnTimeLimitChange: (value: number) => void;
  onRandomizeTurnOrderChange: (value: boolean) => void;
  onTopicDictionarySourceChange: (value: TopicDictionarySource) => void;
  onTopicHintChange: (value: string) => void;
  onTopicPairDistanceChange: (value: TopicPairDistance) => void;
  onTopicDifficultyChange: (value: WordDifficulty) => void;
  onClueLogVisibilityChange: (value: ClueLogVisibility) => void;
  onTestWordGeneration: (forceNew: boolean) => Promise<DebugWordGenerationResult>;
  onStartGame: () => void;
};

export function WordWolfLobbySettings({
  room,
  isHost,
  isStarting,
  allowedWolfCount,
  wolfCountOptions,
  onGameModeChange: setGameMode,
  onWolfCountChange: setWolfCount,
  onRoundsTotalChange,
  onClueModeChange: setClueMode,
  onTurnTimeLimitChange: setTurnTimeLimit,
  onRandomizeTurnOrderChange: setRandomizeTurnOrder,
  onTopicDictionarySourceChange: setTopicDictionarySource,
  onTopicHintChange,
  onTopicPairDistanceChange: setTopicPairDistance,
  onTopicDifficultyChange: setTopicDifficulty,
  onClueLogVisibilityChange: setClueLogVisibility,
  onTestWordGeneration: testWordGeneration,
  onStartGame: startGame,
}: Props) {
  return (
                    <fieldset disabled={!isHost} className="mt-4 space-y-3 disabled:opacity-75">
                      {!isHost && (
                        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                          ルール設定はホストだけが変更できます。
                        </p>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-700">狼不在</p>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setGameMode("wordwolf")}
                            aria-pressed={room.gameMode === "wordwolf"}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              room.gameMode === "wordwolf"
                                ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            なし
                          </button>
                          <button
                            type="button"
                            onClick={() => setGameMode("may-no-wolf")}
                            aria-pressed={room.gameMode === "may-no-wolf"}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              room.gameMode === "may-no-wolf"
                                ? "border-amber-500 bg-amber-50 text-amber-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            あり
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">狼の人数</p>
                        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {wolfCountOptions.map((count) => (
                            <button
                              key={count}
                              type="button"
                              onClick={() => setWolfCount(count)}
                              disabled={count > allowedWolfCount}
                              aria-pressed={room.wolfCount === count}
                              className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                                room.wolfCount === count
                                  ? "border-rose-500 bg-rose-50 text-rose-950 shadow-sm"
                                  : count > allowedWolfCount
                                    ? "border-slate-200 bg-slate-100 text-slate-400"
                                    : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {count}人
                              {count > allowedWolfCount ? "（人数待ち）" : ""}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          5人以上で2人以上にできます。狼不在ありの回で狼が出ない場合は0人になります。
                        </p>
                      </div>
                      <label className="block text-sm font-medium text-slate-700">
                        周回数
                        <select
                          value={room.roundsTotal}
                          onChange={(event) => onRoundsTotalChange(normalizeRoundsTotal(Number(event.target.value)))}
                          className={`mt-1 ${inputClass}`}
                        >
                          {lobbyRounds.map((round) => (
                            <option key={round} value={round}>
                              {round}周
                            </option>
                          ))}
                        </select>
                      </label>
                      <div>
                        <p className="text-sm font-medium text-slate-700">{"\u767a\u8a00\u306e\u9032\u3081\u65b9"}</p>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setClueMode("turn")}
                            aria-pressed={room.clueMode === "turn"}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              room.clueMode === "turn"
                                ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {"\u9806\u756a"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setClueMode("simultaneous")}
                            aria-pressed={room.clueMode === "simultaneous"}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              room.clueMode === "simultaneous"
                                ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {"\u5168\u54e1\u540c\u6642"}
                          </button>
                        </div>
                      </div>
                      <RoomTimeLimitControl label="持ち時間" value={room.turnTimeLimitSeconds} onChange={setTurnTimeLimit} />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{"\u767a\u8a00\u9806"}</p>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setRandomizeTurnOrder(true)}
                            aria-pressed={room.randomizeTurnOrder}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              room.randomizeTurnOrder
                                ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {"\u30e9\u30f3\u30c0\u30e0"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRandomizeTurnOrder(false)}
                            aria-pressed={!room.randomizeTurnOrder}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              !room.randomizeTurnOrder
                                ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            {"\u5165\u5ba4\u9806"}
                          </button>
                        </div>
                      </div>
                      <label className="block text-sm font-medium text-slate-700">
                        お題ソース
                        <select
                          value={room.topicDictionarySource}
                          onChange={(event) =>
                            setTopicDictionarySource(normalizeTopicDictionarySource(event.target.value))
                          }
                          className={`mt-1 ${inputClass}`}
                        >
                          <option value="llm">一般単語</option>
                          <option value="proper-noun">固有名詞</option>
                        </select>
                      </label>
                      {room.topicDictionarySource === "llm" && <div>
                        <p className="text-sm font-medium text-slate-700">単語の知名度</p>
                        <div className="mt-1 grid grid-cols-3 gap-2">
                          {([[
                            "easy", "簡単",
                          ], [
                            "normal", "普通",
                          ], [
                            "hard", "難しい",
                          ]] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setTopicDifficulty(value)}
                              aria-pressed={room.topicDifficulty === value}
                              className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                                room.topicDifficulty === value
                                  ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                                  : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>}
                      <label className="block text-sm font-medium text-slate-700">
                        お題の方向性
                        <input
                          key={`${room.code}:${room.topicHint}`}
                          defaultValue={room.topicHint}
                          onBlur={(event) => {
                            const normalized = event.currentTarget.value.trim().slice(0, 80);
                            if (normalized !== room.topicHint) onTopicHintChange(normalized);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            event.currentTarget.blur();
                          }}
                          className={`mt-1 ${inputClass}`}
                          maxLength={80}
                          placeholder="例: 夏、映画、食べ物、スポーツ"
                        />
                      </label>
                      <div>
                        <p className="text-sm font-medium text-slate-700">ペアの距離</p>
                        <div className="mt-1 grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setTopicPairDistance("near")}
                            aria-pressed={room.topicPairDistance === "near"}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              room.topicPairDistance === "near"
                                ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            近い
                          </button>
                          <button
                            type="button"
                            onClick={() => setTopicPairDistance("balanced")}
                            aria-pressed={room.topicPairDistance === "balanced"}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              room.topicPairDistance === "balanced"
                                ? "border-cyan-500 bg-cyan-50 text-cyan-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            普通
                          </button>
                          <button
                            type="button"
                            onClick={() => setTopicPairDistance("wide")}
                            aria-pressed={room.topicPairDistance === "wide"}
                            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${
                              room.topicPairDistance === "wide"
                                ? "border-amber-500 bg-amber-50 text-amber-950 shadow-sm"
                                : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            遠い
                          </button>
                        </div>
                      </div>
                      {room.debugMode && (
                        <DebugWordGenerationTest onGenerate={testWordGeneration} />
                      )}
                      <label className="block text-sm font-medium text-slate-700">
                        発言ログ
                        <select
                          value={room.clueLogVisibility}
                          onChange={(event) =>
                            setClueLogVisibility(event.target.value as ClueLogVisibility)
                          }
                          className={`mt-1 ${inputClass}`}
                        >
                          <option value="result">ゲーム終了後だけ表示</option>
                          <option value="always">常に表示</option>
                        </select>
                      </label>
                      <button
                        onClick={startGame}
                        disabled={!isHost || isStarting}
                        className={`w-full ${primaryButtonClass}`}
                      >
                        {isStarting ? "お題生成中..." : "ゲーム開始"}
                      </button>
                    </fieldset>
  );
}
