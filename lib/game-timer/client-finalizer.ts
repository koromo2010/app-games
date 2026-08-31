import type { AuthoritativeTimerErrorDirective } from "./retry.ts";

export type AuthoritativeTimeoutFinalizationPlan = {
  attemptKey: string;
  generationKey: string;
  serverDeadlineAt: number;
  claimantDelayMs: number;
};

export type AuthoritativeTimeoutReconciliation = "active" | "terminal";

type AttemptState = {
  phase: "idle" | "in-flight" | "ambiguous" | "terminal";
  nextEligibleAt: number;
};

type Scheduler = {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
};

type Options = {
  now: () => number;
  scheduler: Scheduler;
  attempt: (attemptKey: string) => Promise<void>;
  reconcile: (
    attemptKey: string,
  ) => Promise<AuthoritativeTimeoutReconciliation>;
  classifyError: (error: unknown) => AuthoritativeTimerErrorDirective;
  onFailure?: (error: unknown) => void;
};

const minimumRetryDelayMs = 25;
const ambiguousReconcileDelayMs = 1_000;

/**
 * Owns one server-deadline generation at a time. Early rejection and
 * ambiguous transport never terminalize its attempt key; success or a stale
 * generation does. Lifecycle/server-clock refreshes call refresh().
 */
export class AuthoritativeTimeoutFinalizer {
  readonly #options: Options;
  readonly #states = new Map<string, AttemptState>();
  #plan: AuthoritativeTimeoutFinalizationPlan | null = null;
  #timer: unknown = null;
  #generationToken = 0;
  #disposed = false;

  constructor(options: Options) {
    this.#options = options;
  }

  update(plan: AuthoritativeTimeoutFinalizationPlan | null) {
    if (this.#disposed) return;
    const generationChanged = this.#plan?.generationKey !== plan?.generationKey;
    if (generationChanged) {
      this.#generationToken += 1;
      this.#clearTimer();
    }
    this.#plan = plan;
    if (!plan) return;
    const state = this.#state(plan.generationKey);
    state.nextEligibleAt = Math.max(
      state.nextEligibleAt,
      plan.serverDeadlineAt + plan.claimantDelayMs,
    );
    if (state.phase === "idle") this.#armAttempt();
    else if (state.phase === "ambiguous") this.#armReconciliation();
  }

  refresh() {
    if (this.#disposed || !this.#plan) return;
    const state = this.#state(this.#plan.generationKey);
    if (state.phase === "in-flight" || state.phase === "terminal") return;
    this.#clearTimer();
    if (state.phase === "ambiguous") this.#armReconciliation();
    else this.#armAttempt();
  }

  dispose() {
    this.#disposed = true;
    this.#generationToken += 1;
    this.#clearTimer();
    this.#plan = null;
  }

  #state(generationKey: string) {
    const current = this.#states.get(generationKey);
    if (current) return current;
    const state: AttemptState = { phase: "idle", nextEligibleAt: 0 };
    this.#states.set(generationKey, state);
    if (this.#states.size > 64) {
      const oldest = this.#states.keys().next().value;
      if (oldest && oldest !== generationKey) this.#states.delete(oldest);
    }
    return state;
  }

  #clearTimer() {
    if (this.#timer === null) return;
    this.#options.scheduler.clear(this.#timer);
    this.#timer = null;
  }

  #armAttempt() {
    const plan = this.#plan;
    if (!plan) return;
    const state = this.#state(plan.generationKey);
    if (state.phase !== "idle" || this.#timer !== null) return;
    const token = this.#generationToken;
    const delayMs = Math.max(0, state.nextEligibleAt - this.#options.now());
    this.#timer = this.#options.scheduler.set(() => {
      this.#timer = null;
      void this.#attempt(plan, token);
    }, delayMs);
  }

  async #attempt(
    plan: AuthoritativeTimeoutFinalizationPlan,
    token: number,
  ) {
    if (!this.#isCurrent(plan, token)) return;
    const state = this.#state(plan.generationKey);
    if (state.phase !== "idle") return;
    state.phase = "in-flight";
    try {
      await this.#options.attempt(plan.attemptKey);
      if (this.#isCurrent(plan, token)) state.phase = "terminal";
    } catch (error) {
      if (!this.#isCurrent(plan, token)) return;
      const directive = this.#options.classifyError(error);
      if (directive.kind === "early") {
        state.phase = "idle";
        state.nextEligibleAt = Math.max(
          directive.serverDeadlineAt,
          this.#options.now() + directive.retryAfterMs,
          this.#options.now() + minimumRetryDelayMs,
        ) + plan.claimantDelayMs;
        this.#armAttempt();
        return;
      }
      if (directive.kind === "ambiguous") {
        state.phase = "ambiguous";
        state.nextEligibleAt = Math.max(
          state.nextEligibleAt,
          this.#options.now() + ambiguousReconcileDelayMs,
        );
        this.#armReconciliation();
        return;
      }
      state.phase = "terminal";
      if (directive.kind === "failed") this.#options.onFailure?.(error);
    }
  }

  #armReconciliation() {
    const plan = this.#plan;
    if (!plan) return;
    const state = this.#state(plan.generationKey);
    if (state.phase !== "ambiguous" || this.#timer !== null) return;
    const token = this.#generationToken;
    const delayMs = Math.max(0, state.nextEligibleAt - this.#options.now());
    this.#timer = this.#options.scheduler.set(() => {
      this.#timer = null;
      void this.#reconcile(plan, token);
    }, delayMs);
  }

  async #reconcile(
    plan: AuthoritativeTimeoutFinalizationPlan,
    token: number,
  ) {
    if (!this.#isCurrent(plan, token)) return;
    const state = this.#state(plan.generationKey);
    try {
      const result = await this.#options.reconcile(plan.attemptKey);
      if (!this.#isCurrent(plan, token)) return;
      if (result === "terminal") {
        state.phase = "terminal";
        return;
      }
      state.phase = "idle";
      state.nextEligibleAt = Math.max(
        state.nextEligibleAt,
        this.#options.now() + minimumRetryDelayMs,
      );
      this.#armAttempt();
    } catch {
      if (!this.#isCurrent(plan, token)) return;
      state.phase = "ambiguous";
      state.nextEligibleAt = this.#options.now() + ambiguousReconcileDelayMs;
      this.#armReconciliation();
    }
  }

  #isCurrent(
    plan: AuthoritativeTimeoutFinalizationPlan,
    token: number,
  ) {
    return !this.#disposed
      && token === this.#generationToken
      && this.#plan?.generationKey === plan.generationKey;
  }
}
