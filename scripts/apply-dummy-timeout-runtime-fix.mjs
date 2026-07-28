import fs from "node:fs";

function replaceExactly(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) return source;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
}

const runtimePath = "packages/game-sdk/src/runtime.ts";
let runtime = fs.readFileSync(runtimePath, "utf8");

runtime = replaceExactly(runtime,
`        let playerTimeouts = currentPlayerTimeouts;
        if (
          command.type === "room/expire-timer"
          || command.type === "room/debug-simulate-timeout"
        ) {
          for (const playerId of timedOutPlayerIds) {
            playerTimeouts = recordGameSdkPlayerTimeout(
              playerTimeouts,
              playerId,
              context.now,
            );
          }
        }
`,
`        const dummyPlayerIds = new Set(
          room.players
            .filter((player) => player.isDummy === true)
            .map((player) => player.id),
        );
        let playerTimeouts = {
          ...currentPlayerTimeouts,
          statuses: Object.fromEntries(
            room.players.map((player) => [
              player.id,
              player.isDummy === true
                ? { consecutiveTimeouts: 0, reducedTime: false }
                : currentPlayerTimeouts.statuses[player.id]
                  ?? { consecutiveTimeouts: 0, reducedTime: false },
            ]),
          ),
        };
        if (
          command.type === "room/expire-timer"
          || command.type === "room/debug-simulate-timeout"
        ) {
          for (const playerId of timedOutPlayerIds) {
            if (dummyPlayerIds.has(playerId)) continue;
            playerTimeouts = recordGameSdkPlayerTimeout(
              playerTimeouts,
              playerId,
              context.now,
            );
          }
        }
`,
"sanitize and exempt dummy timeout state");

runtime = replaceExactly(runtime,
`        const ownerPlayerId = transition.timerOwnerPlayerId ?? null;
        const timer = nextPhase === "result" || transition.timer === "stop"
          ? stoppedGameSdkTimer(timerDurationSeconds(room.settings), room.timer)
          : resetGameSdkTimer(
              gameSdkPlayerTimeLimitSeconds(
                timerDurationSeconds(room.settings),
                playerTimeouts,
                ownerPlayerId,
              ),
`,
`        const ownerPlayerId = transition.timerOwnerPlayerId ?? null;
        const timeoutOwnerPlayerId = ownerPlayerId !== null
          && dummyPlayerIds.has(ownerPlayerId)
          ? null
          : ownerPlayerId;
        const timer = nextPhase === "result" || transition.timer === "stop"
          ? stoppedGameSdkTimer(timerDurationSeconds(room.settings), room.timer)
          : resetGameSdkTimer(
              gameSdkPlayerTimeLimitSeconds(
                timerDurationSeconds(room.settings),
                playerTimeouts,
                timeoutOwnerPlayerId,
              ),
`,
"use isDummy for timer duration exemption");

fs.writeFileSync(runtimePath, runtime);
