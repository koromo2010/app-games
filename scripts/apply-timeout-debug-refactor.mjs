import fs from "node:fs";

function replaceExactly(source, before, after, label) {
  const occurrences = source.split(before).length - 1;
  if (occurrences === 0 && source.includes(after)) return source;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${occurrences}`);
  }
  return source.replace(before, after);
}

const runtimePath = "packages/game-sdk/src/runtime.ts";
let runtime = fs.readFileSync(runtimePath, "utf8");

runtime = replaceExactly(
  runtime,
  `          playerTimeouts: {\n            ...timeoutDefaults,\n            statuses: Object.fromEntries(\n              lifecycle.room.players.map((player) => [\n                player.id,\n                currentPlayerTimeouts.statuses[player.id]\n                  ?? timeoutDefaults.statuses[player.id]!,\n              ]),\n            ),\n          },`,
  `          playerTimeouts: command.type === "room/rematch"\n            ? timeoutDefaults\n            : {\n                ...timeoutDefaults,\n                statuses: Object.fromEntries(\n                  lifecycle.room.players.map((player) => [\n                    player.id,\n                    currentPlayerTimeouts.statuses[player.id]\n                      ?? timeoutDefaults.statuses[player.id]!,\n                  ]),\n                ),\n              },`,
  "reset rematch timeout state",
);

runtime = replaceExactly(
  runtime,
  `      const playerTimeouts = recordGameSdkPlayerActivity(\n        currentPlayerTimeouts,\n        context.actor.playerId,\n      );`,
  `      const startsNewGame = room.phase === "lobby" && nextPhase !== "lobby";\n      const playerTimeouts = startsNewGame\n        ? createGameSdkPlayerTimeoutState(\n            room.players.map((player) => player.id),\n          )\n        : recordGameSdkPlayerActivity(\n            currentPlayerTimeouts,\n            context.actor.playerId,\n          );`,
  "reset timeout state when a new game starts",
);

fs.writeFileSync(runtimePath, runtime);

const indexPath = "packages/game-sdk/src/index.ts";
let index = fs.readFileSync(indexPath, "utf8");
index = replaceExactly(
  index,
  `    const parsedOptions = candidate.options === undefined`,
  `    let parsedOptions = candidate.options === undefined`,
  "make parsed time-limit options extensible",
);
index = replaceExactly(
  index,
  `    if (type === "select" && !parsedOptions) {\n      throw new Error(\`Game SDK select setting \${key} requires options.\`);\n    }\n    if (parsedOptions) {`,
  `    if (type === "select" && !parsedOptions) {\n      throw new Error(\`Game SDK select setting \${key} requires options.\`);\n    }\n    if (\n      platformRole === "time-limit"\n      && type === "select"\n      && parsedOptions\n      && !parsedOptions.some((option) => Object.is(gameSdkSettingOptionValue(option), 0))\n    ) {\n      if (parsedOptions.length >= 64) {\n        throw new Error("Game SDK time-limit select requires room for the no-limit option.");\n      }\n      parsedOptions = [{\n        value: 0,\n        label: { ja: "制限なし", en: "No limit" },\n      }, ...parsedOptions];\n    }\n    if (parsedOptions) {`,
  "inject no-limit time option",
);
fs.writeFileSync(indexPath, index);
