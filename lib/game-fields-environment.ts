export type GameFieldsEnvironment =
  | "production"
  | "development"
  | "candidate-preview"
  | "sdk-portal"
  | "test";

const gameFieldsEnvironments = new Set<GameFieldsEnvironment>([
  "production",
  "development",
  "candidate-preview",
  "sdk-portal",
  "test",
]);

export function resolveGameFieldsEnvironment(
  explicit?: GameFieldsEnvironment,
  env: NodeJS.ProcessEnv = process.env,
): GameFieldsEnvironment {
  if (explicit) return explicit;
  const configured = env.GAME_FIELDS_ENV?.trim().toLowerCase();
  if (configured) {
    if (!gameFieldsEnvironments.has(configured as GameFieldsEnvironment)) {
      throw new Error("GAME_FIELDS_ENV_INVALID");
    }
    return configured as GameFieldsEnvironment;
  }
  if (env.NODE_ENV === "test") return "test";
  return env.VERCEL_GIT_COMMIT_REF === "main"
    ? "production"
    : "development";
}
