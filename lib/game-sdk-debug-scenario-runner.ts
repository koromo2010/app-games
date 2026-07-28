export type DebugScenarioTarget =
  | { kind: "step" }
  | { kind: "steps"; count: number }
  | { kind: "phase" }
  | { kind: "result" };

export type DebugScenarioStopReason =
  | "target-reached"
  | "result"
  | "cancelled"
  | "deadline"
  | "step-limit"
  | "unchanged-revision"
  | "room-changed";

export type DebugScenarioRoom = {
  code: string;
  revision: number;
  phase: string;
  view?: {
    app?: unknown;
  };
};

export type DebugScenarioStep = {
  step: number;
  previousRevision: number;
  nextRevision: number;
  outerPhase: string;
  appPhase: string | null;
  durationMs: number;
};

export type DebugScenarioResult<TRoom extends DebugScenarioRoom> = {
  room: TRoom;
  reason: DebugScenarioStopReason;
  steps: DebugScenarioStep[];
  durationMs: number;
};

export type DebugScenarioRunnerOptions<TRoom extends DebugScenarioRoom> = {
  initialRoom: TRoom;
  target: DebugScenarioTarget;
  sendStep(room: TRoom): Promise<TRoom>;
  maximumSteps?: number;
  deadlineMs?: number;
  now?: () => number;
  signal?: AbortSignal;
  onStep?(step: DebugScenarioStep, room: TRoom): void;
};

function appPhase(room: DebugScenarioRoom) {
  const app = room.view?.app;
  if (!app || typeof app !== "object" || !("phase" in app)) return null;
  const phase = (app as { phase?: unknown }).phase;
  return typeof phase === "string" && phase.trim() ? phase : null;
}

function targetReached(
  target: DebugScenarioTarget,
  initial: DebugScenarioRoom,
  current: DebugScenarioRoom,
  completedSteps: number,
) {
  if (current.phase === "result") return true;
  if (target.kind === "step") return completedSteps >= 1;
  if (target.kind === "steps") return completedSteps >= target.count;
  if (target.kind === "result") return current.phase === "result";
  const initialAppPhase = appPhase(initial);
  return (
    current.phase !== initial.phase
    || (initialAppPhase !== null && appPhase(current) !== initialAppPhase)
    || (initialAppPhase === null && completedSteps >= 1)
  );
}

export async function runDebugScenario<TRoom extends DebugScenarioRoom>({
  initialRoom,
  target,
  sendStep,
  maximumSteps = target.kind === "result" ? 160 : target.kind === "phase" ? 64 : 1,
  deadlineMs = 30_000,
  now = Date.now,
  signal,
  onStep,
}: DebugScenarioRunnerOptions<TRoom>): Promise<DebugScenarioResult<TRoom>> {
  const startedAt = now();
  const steps: DebugScenarioStep[] = [];
  let room = initialRoom;

  if (target.kind === "steps" && (!Number.isSafeInteger(target.count) || target.count < 1)) {
    throw new Error("DEBUG_SCENARIO_INVALID_STEP_COUNT");
  }
  if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1) {
    throw new Error("DEBUG_SCENARIO_INVALID_STEP_LIMIT");
  }

  for (let index = 0; index < maximumSteps; index += 1) {
    if (signal?.aborted) {
      return { room, reason: "cancelled", steps, durationMs: Math.max(0, now() - startedAt) };
    }
    if (now() - startedAt >= deadlineMs) {
      return { room, reason: "deadline", steps, durationMs: Math.max(0, now() - startedAt) };
    }

    const previous = room;
    const stepStartedAt = now();
    const next = await sendStep(previous);
    const durationMs = Math.max(0, now() - stepStartedAt);

    if (next.code !== initialRoom.code) {
      return { room: next, reason: "room-changed", steps, durationMs: Math.max(0, now() - startedAt) };
    }
    if (next.revision <= previous.revision) {
      return { room: next, reason: "unchanged-revision", steps, durationMs: Math.max(0, now() - startedAt) };
    }

    room = next;
    const entry: DebugScenarioStep = {
      step: index + 1,
      previousRevision: previous.revision,
      nextRevision: next.revision,
      outerPhase: next.phase,
      appPhase: appPhase(next),
      durationMs,
    };
    steps.push(entry);
    onStep?.(entry, next);

    if (targetReached(target, initialRoom, next, steps.length)) {
      return {
        room,
        reason: next.phase === "result" ? "result" : "target-reached",
        steps,
        durationMs: Math.max(0, now() - startedAt),
      };
    }
  }

  return { room, reason: "step-limit", steps, durationMs: Math.max(0, now() - startedAt) };
}
