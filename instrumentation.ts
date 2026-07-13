export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { emitObservabilityEvent } = await import("@/lib/observability");
  emitObservabilityEvent("info", "service.lifecycle", { operation: "register", outcome: "success" });
}
