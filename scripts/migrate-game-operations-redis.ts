import {
  migrateGameOperationsRedis,
} from "../lib/game-operations-legacy-migration.ts";
import {
  registeredGameOperationIds,
} from "../lib/game-operations-format.ts";
import { getRedisConfig, redisCommand } from "../lib/redis-store.ts";
import type { AppEnvironment } from "../lib/storage-environment-guard.ts";

type Options = {
  environment: AppEnvironment | null;
  namespace: string;
  targetKey: string;
  apply: boolean;
};

function parseArguments(values: readonly string[]): Options {
  const options: Options = {
    environment: null,
    namespace: "",
    targetKey: "",
    apply: false,
  };
  for (const value of values) {
    if (value === "--apply") options.apply = true;
    else if (value.startsWith("--environment=")) {
      const environment = value.slice("--environment=".length);
      if (environment !== "production" && environment !== "development" && environment !== "test") {
        throw new Error("GAME_OPERATIONS_MIGRATION_ENVIRONMENT_INVALID");
      }
      options.environment = environment;
    } else if (value.startsWith("--namespace=")) options.namespace = value.slice("--namespace=".length);
    else if (value.startsWith("--target-key=")) options.targetKey = value.slice("--target-key=".length);
    else throw new Error("GAME_OPERATIONS_MIGRATION_ARGUMENT_INVALID");
  }
  if (!options.environment || !options.namespace || !options.targetKey) {
    throw new Error("GAME_OPERATIONS_MIGRATION_SCOPE_REQUIRED");
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!getRedisConfig()) throw new Error("REDIS_STORE_NOT_CONFIGURED");
  const result = await migrateGameOperationsRedis({
    environment: options.environment!,
    namespace: options.namespace,
    targetKey: options.targetKey,
    apply: options.apply,
    knownV1GameIds: registeredGameOperationIds(),
    command: (command) => redisCommand(command as unknown[]),
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : "GAME_OPERATIONS_MIGRATION_FAILED";
  console.error(code);
  process.exitCode = 1;
});
