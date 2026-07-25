export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  console.info(JSON.stringify({
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level: "info",
    event: "service.lifecycle",
    service: "game-fields-sdk-preview",
    environment: "candidate-preview",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
    fields: {
      operation: "register",
      outcome: "success",
    },
  }));
}
