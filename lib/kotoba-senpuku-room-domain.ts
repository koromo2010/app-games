import { randomInt } from "node:crypto";
import { commonGameTimeoutGraceMs } from "@/lib/game-timer/policy";
import {
  isFullyRevealedKotobaSenpukuWord,
  kotobaSenpukuChallengeLogMessage,
  kotobaSenpukuDebugWords,
  kotobaSenpukuKanaKey,
  maskKotobaSenpukuWord,
  nextKotobaSenpukuSurvivorIndex,
  normalizeKotobaSenpukuWord,
  pickKotobaSenpukuTheme,
  resolveKotobaSenpukuWinnerIds,
  type KotobaSenpukuEvent,
  type KotobaSenpukuRoom,
  type KotobaSenpukuRoundResult,
} from "@/lib/kotoba-senpuku";
import { playerTimeLimitSeconds, recordPlayerTimeout } from "@/lib/player-timeout-policy";

export function timedOut(room: KotobaSenpukuRoom, seconds: number, now = Date.now()) {
  return Boolean(room.phaseStartedAt && seconds > 0 && now >= room.phaseStartedAt + seconds * 1000 + commonGameTimeoutGraceMs());
}

export function addLog(room: KotobaSenpukuRoom, message: string) {
  return { ...room, log: [message, ...room.log].slice(0, 30) };
}

export function fillMissingSecrets(room: KotobaSenpukuRoom, targetIds = room.players.map((player) => player.id)) {
  const themeId = room.theme?.id ?? "meal";
  const candidates = kotobaSenpukuDebugWords[themeId] ?? kotobaSenpukuDebugWords.meal;
  const used = new Set(Object.values(room.secrets));
  const secrets = { ...room.secrets };
  let cursor = 0;
  for (const player of room.players) {
    if (!targetIds.includes(player.id)) continue;
    if (secrets[player.id]) continue;
    while (cursor < candidates.length && used.has(candidates[cursor])) cursor += 1;
    const word = candidates[cursor] ?? `ことば${cursor + 1}`;
    secrets[player.id] = word;
    used.add(word);
    cursor += 1;
  }
  return { ...room, secrets, submittedIds: [...new Set([...room.submittedIds, ...targetIds])] };
}

export function allSecretsSubmitted(room: KotobaSenpukuRoom) {
  return room.players.every((player) => Boolean(room.secrets[player.id]));
}

export function beginBattle(room: KotobaSenpukuRoom) {
  const masks = Object.fromEntries(room.players.map((player) => [player.id, maskKotobaSenpukuWord(room.secrets[player.id] ?? "", [])]));
  const activePlayerIndex = room.randomFirstTurn && room.players.length > 0 ? randomInt(room.players.length) : 0;
  const activePlayer = room.players[activePlayerIndex];
  return addLog({
    ...room,
    phase: "battle",
    masks,
    calledKana: [],
    exposedIds: [],
    activePlayerIndex,
    turnNumber: 1,
    roundEvents: [],
    phaseStartedAt: Date.now(),
  }, room.randomFirstTurn
    ? `最初の手番は、抽選で${activePlayer?.name ?? "最初のプレイヤー"}に決まりました。`
    : `最初の手番は${activePlayer?.name ?? "最初のプレイヤー"}です。参加順に進行します。`);
}

export function beginRound(room: KotobaSenpukuRoom, round: number) {
  return {
    ...room,
    phase: "secret" as const,
    round,
    theme: pickKotobaSenpukuTheme(room.history),
    secrets: {},
    submittedIds: [],
    masks: {},
    calledKana: [],
    exposedIds: [],
    roundSignals: Object.fromEntries(room.players.map((player) => [player.id, 0])),
    activePlayerIndex: 0,
    turnNumber: 1,
    log: [`第${round}ラウンドを開始します。秘密語を入力してください。`, ...room.log].slice(0, 30),
    phaseStartedAt: Date.now(),
  };
}

export function advanceTurn(room: KotobaSenpukuRoom, message: string) {
  const activePlayerIndex = nextKotobaSenpukuSurvivorIndex(room.players.map((player) => player.id), room.exposedIds, room.activePlayerIndex);
  const next = room.players[activePlayerIndex];
  return addLog({
    ...room,
    activePlayerIndex,
    turnNumber: room.turnNumber + 1,
    phaseStartedAt: Date.now(),
  }, `${message} 次の手番は${next?.name ?? "次のプレイヤー"}です。`);
}

export function finishRound(room: KotobaSenpukuRoom, simultaneousEliminatedIds: string[] = []) {
  const winnerIds = resolveKotobaSenpukuWinnerIds(room.players.map((player) => player.id), room.exposedIds, simultaneousEliminatedIds, room.secrets);
  const winnerId = winnerIds.length === 1 ? winnerIds[0] : null;
  const survivalBonus = Object.fromEntries(room.players.map((player) => [player.id, winnerIds.includes(player.id) ? 3 : 0]));
  const signals = Object.fromEntries(room.players.map((player) => [player.id, (room.roundSignals[player.id] ?? 0) + survivalBonus[player.id]]));
  const totalScores = Object.fromEntries(room.players.map((player) => [player.id, (room.totalScores[player.id] ?? 0) + signals[player.id]]));
  const result: KotobaSenpukuRoundResult = {
    round: room.round,
    theme: room.theme ?? pickKotobaSenpukuTheme(room.history),
    secrets: { ...room.secrets },
    signals,
    survivalBonus,
    calledKana: [...room.calledKana],
    events: [...room.roundEvents],
    eliminatedIds: [...room.exposedIds],
    winnerId,
    winnerIds,
  };
  return addLog({
    ...room,
    phase: "result",
    roundSignals: signals,
    totalScores,
    history: [...room.history.filter((item) => item.round !== room.round), result],
    masks: Object.fromEntries(room.players.map((player) => [player.id, room.secrets[player.id] ?? ""])),
    phaseStartedAt: null,
  }, winnerIds.length === 1
    ? `${room.players.find((player) => player.id === winnerIds[0])?.name ?? "最後の1人"}の勝利です。`
    : winnerIds.length > 1
      ? `${winnerIds.map((id) => room.players.find((player) => player.id === id)?.name).filter(Boolean).join("、")}の同率勝利です。`
      : "勝者なしで終了しました。");
}

export function shouldFinishRound(room: KotobaSenpukuRoom) {
  const hiddenCount = room.players.filter((player) => !room.exposedIds.includes(player.id)).length;
  return hiddenCount <= 1;
}

export function performScan(room: KotobaSenpukuRoom, kana: string) {
  const actor = room.players[room.activePlayerIndex];
  if (!actor || room.calledKana.includes(kana)) return room;
  const calledKana = [...room.calledKana, kana];
  const hitTargets = room.players.filter((player) => (
    !room.exposedIds.includes(player.id)
    && [...(room.secrets[player.id] ?? "")].some((character) => kotobaSenpukuKanaKey(character) === kana)
  ));
  const masks = Object.fromEntries(room.players.map((player) => [
    player.id,
    maskKotobaSenpukuWord(room.secrets[player.id] ?? "", calledKana, room.exposedIds.includes(player.id)),
  ]));
  const newlyExposed = room.players.filter((player) => !room.exposedIds.includes(player.id) && isFullyRevealedKotobaSenpukuWord(room.secrets[player.id] ?? "", calledKana));
  const exposedIds = [...new Set([...room.exposedIds, ...newlyExposed.map((player) => player.id)])];
  const eliminatedNames = newlyExposed.map((player) => player.name).join("、");
  const message = hitTargets.length
    ? `${actor.name}が「${kana}」を探知。${hitTargets.length}人に命中しました。${eliminatedNames ? `${eliminatedNames}が脱落しました。` : ""}`
    : `${actor.name}が「${kana}」を探知。誰にも命中しませんでした。`;
  const event: KotobaSenpukuEvent = { type: "scan", turn: room.turnNumber, actorId: actor.id, kana, hitIds: hitTargets.map((player) => player.id), eliminatedIds: newlyExposed.map((player) => player.id), createdAt: Date.now() };
  const changed = addLog({ ...room, calledKana, masks, exposedIds, roundEvents: [...room.roundEvents, event].slice(-300) }, message);
  if (shouldFinishRound(changed)) return finishRound(changed, newlyExposed.map((player) => player.id));
  if (hitTargets.length > 0 && room.continuousScan && !exposedIds.includes(actor.id)) return addLog({ ...changed, phaseStartedAt: Date.now() }, `命中したため、${actor.name}は続けて行動します。`);
  const turnEndMessage = exposedIds.includes(actor.id)
    ? `${actor.name}が脱落したため、手番を終了します。`
    : hitTargets.length > 0
      ? "連続探知なしの設定のため、手番を終了します。"
      : "誰にも命中しなかったため、手番を終了します。";
  return advanceTurn(changed, turnEndMessage);
}

export function performChallenge(room: KotobaSenpukuRoom, targetId: string, guessInput: string) {
  const actor = room.players[room.activePlayerIndex];
  const target = room.players.find((player) => player.id === targetId);
  if (!actor || !target || target.id === actor.id || room.exposedIds.includes(target.id)) return room;
  const guess = normalizeKotobaSenpukuWord(guessInput);
  const correct = guess === room.secrets[target.id];
  const exposedIds = correct ? [...new Set([...room.exposedIds, target.id])] : room.exposedIds;
  const masks = correct ? { ...room.masks, [target.id]: room.secrets[target.id] } : room.masks;
  const event: KotobaSenpukuEvent = { type: "challenge", turn: room.turnNumber, actorId: actor.id, targetId: target.id, guess: room.showWordGuessInLog ? guess : "", correct, eliminatedIds: correct ? [target.id] : [], createdAt: Date.now() };
  const changed = addLog(
    { ...room, exposedIds, masks, roundEvents: [...room.roundEvents, event].slice(-300) },
    kotobaSenpukuChallengeLogMessage({ actorName: actor.name, targetName: target.name, guess, correct, showGuess: room.showWordGuessInLog }),
  );
  return shouldFinishRound(changed) ? finishRound(changed) : advanceTurn(changed, "秘密語を回答したため、手番を終了します。");
}

export function reconcileProgress(room: KotobaSenpukuRoom) {
  if (room.phase === "secret") {
    let next = room;
    for (const player of room.players.filter((item) => !room.secrets[item.id])) {
      if (timedOut(room, playerTimeLimitSeconds(room.secretTimeLimitSeconds, room.playerTimeouts, player.id))) {
        next = recordPlayerTimeout(next, player.id, player.name);
        next = fillMissingSecrets(next, [player.id]);
      }
    }
    if (allSecretsSubmitted(next) || timedOut(room, room.secretTimeLimitSeconds)) {
      if (!allSecretsSubmitted(next)) {
        for (const player of room.players.filter((item) => !next.secrets[item.id])) next = recordPlayerTimeout(next, player.id, player.name);
        next = fillMissingSecrets(next);
      }
      return beginBattle(next);
    }
    return next;
  }
  const active = room.players[room.activePlayerIndex];
  if (room.phase === "battle" && timedOut(room, active ? playerTimeLimitSeconds(room.turnTimeLimitSeconds, room.playerTimeouts, active.id) : room.turnTimeLimitSeconds)) {
    const player = room.players[room.activePlayerIndex];
    const changed = player ? recordPlayerTimeout({ ...room, roundEvents: [...room.roundEvents, { type: "timeout" as const, turn: room.turnNumber, actorId: player.id, createdAt: Date.now() }].slice(-300) }, player.id, player.name) : room;
    return advanceTurn(changed, `${player?.name ?? "手番プレイヤー"}は時間切れのため、手番を終了します。`);
  }
  return room;
}

