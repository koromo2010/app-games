export type SharedEnvironmentVariable =
  | "OPENAI_API_KEY"
  | "GEMINI_API_KEY"
  | "GROQ_API_KEY"
  | "RESEND_API_KEY"
  | "VOCABULARY_DATABASE_URL"
  | "VOCABULARY_ADMIN_DATABASE_URL";

const sharedEnvironmentNames: Record<SharedEnvironmentVariable, `SHARED_${SharedEnvironmentVariable}`> = {
  OPENAI_API_KEY: "SHARED_OPENAI_API_KEY",
  GEMINI_API_KEY: "SHARED_GEMINI_API_KEY",
  GROQ_API_KEY: "SHARED_GROQ_API_KEY",
  RESEND_API_KEY: "SHARED_RESEND_API_KEY",
  VOCABULARY_DATABASE_URL: "SHARED_VOCABULARY_DATABASE_URL",
  VOCABULARY_ADMIN_DATABASE_URL: "SHARED_VOCABULARY_ADMIN_DATABASE_URL",
};

/**
 * Shared Vercel variables take precedence during migration. The legacy project
 * variable remains readable until both deployments have been verified.
 */
export function sharedEnvironmentVariable(
  name: SharedEnvironmentVariable,
  env: Record<string, string | undefined> = process.env,
) {
  return (env[sharedEnvironmentNames[name]] ?? env[name])?.trim();
}
