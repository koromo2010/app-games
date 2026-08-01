import {
  newQuickJSWASMModule,
  RELEASE_SYNC,
  type QuickJSHandle,
} from "quickjs-emscripten";
import {
  GAME_SDK_PORTABLE_SERVER_GLOBAL,
  GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
  type GameSdkPortableCommandBatchRequest,
  type GameSdkPortableCommandBatchResponse,
  type GameSdkPortableServerRequest,
  type GameSdkPortableServerResponse,
} from "@game-fields/game-sdk/portable-server";
import type { GameSdkRuntimeTiming } from "@game-fields/game-sdk/runtime";

const MAX_BUNDLE_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const VM_MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
const VM_STACK_LIMIT_BYTES = 1024 * 1024;
const VM_EXECUTION_LIMIT_MS = 750;
const MAX_PENDING_JOB_PASSES = 1_000;

export class GameSdkPortableRunnerError extends Error {
  readonly code:
    | "BUNDLE_TOO_LARGE"
    | "REQUEST_TOO_LARGE"
    | "RESPONSE_TOO_LARGE"
    | "INVALID_BUNDLE"
    | "INVALID_RESPONSE"
    | "EXECUTION_LIMIT";

  constructor(
    code:
      | "BUNDLE_TOO_LARGE"
      | "REQUEST_TOO_LARGE"
      | "RESPONSE_TOO_LARGE"
      | "INVALID_BUNDLE"
      | "INVALID_RESPONSE"
      | "EXECUTION_LIMIT",
  ) {
    super(code);
    this.name = "GameSdkPortableRunnerError";
    this.code = code;
  }
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function parseResponse(value: string): GameSdkPortableServerResponse {
  if (utf8Bytes(value) > MAX_RESPONSE_BYTES) {
    throw new GameSdkPortableRunnerError("RESPONSE_TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new GameSdkPortableRunnerError("INVALID_RESPONSE");
  }
  if (!parsed || typeof parsed !== "object" || typeof (parsed as { ok?: unknown }).ok !== "boolean") {
    throw new GameSdkPortableRunnerError("INVALID_RESPONSE");
  }
  return parsed as GameSdkPortableServerResponse;
}

/**
 * Executes one package invocation in a fresh QuickJS WebAssembly module.
 *
 * The guest gets standard ECMAScript globals only. No host functions, network,
 * filesystem, process, environment variables, cookies or platform adapters are
 * installed into the context.
 */
async function runPortableSession<T>(input: {
  bundle: string;
  timing?: GameSdkRuntimeTiming;
  execute(
    invoke: (request: GameSdkPortableServerRequest) => Promise<GameSdkPortableServerResponse>,
  ): Promise<T>;
}) {
  if (utf8Bytes(input.bundle) > MAX_BUNDLE_BYTES) {
    throw new GameSdkPortableRunnerError("BUNDLE_TOO_LARGE");
  }
  const quickJsStartedAt = performance.now();
  const QuickJS = await newQuickJSWASMModule(RELEASE_SYNC);
  const runtime = QuickJS.newRuntime();
  const deadline = Date.now() + VM_EXECUTION_LIMIT_MS;
  runtime.setMemoryLimit(VM_MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(VM_STACK_LIMIT_BYTES);
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext();
  input.timing?.record(
    "quickjs-init",
    Math.max(0, performance.now() - quickJsStartedAt),
  );
  try {
    const evaluationStartedAt = performance.now();
    context.unwrapResult(
      context.evalCode(input.bundle, "server.bundle.js"),
    ).dispose();
    input.timing?.record(
      "bundle-eval",
      Math.max(0, performance.now() - evaluationStartedAt),
    );

    const invoke = async (request: GameSdkPortableServerRequest) => {
      const requestJson = JSON.stringify(request);
      if (utf8Bytes(requestJson) > MAX_REQUEST_BYTES) {
        throw new GameSdkPortableRunnerError("REQUEST_TOO_LARGE");
      }
      const expression = `globalThis[${JSON.stringify(GAME_SDK_PORTABLE_SERVER_GLOBAL)}].invoke(${JSON.stringify(requestJson)})`;
      let promiseHandle: QuickJSHandle | null = context.unwrapResult(
        context.evalCode(expression, "invoke.js"),
      );
      try {
        for (let pass = 0; pass < MAX_PENDING_JOB_PASSES; pass += 1) {
          const state = context.getPromiseState(promiseHandle);
          if (state.type === "fulfilled") {
            try {
              return parseResponse(context.getString(state.value));
            } finally {
              state.value.dispose();
            }
          }
          if (state.type === "rejected") {
            state.error.dispose();
            throw new GameSdkPortableRunnerError("INVALID_BUNDLE");
          }
          if (Date.now() > deadline) {
            throw new GameSdkPortableRunnerError("EXECUTION_LIMIT");
          }
          const jobs = runtime.executePendingJobs(100);
          try {
            if (jobs.error) {
              jobs.error.dispose();
              throw new GameSdkPortableRunnerError("INVALID_BUNDLE");
            }
            if (jobs.value === 0 && !runtime.hasPendingJob()) {
              throw new GameSdkPortableRunnerError("INVALID_BUNDLE");
            }
          } finally {
            jobs.dispose();
          }
        }
        throw new GameSdkPortableRunnerError("EXECUTION_LIMIT");
      } finally {
        promiseHandle?.dispose();
        promiseHandle = null;
      }
    };

    return await input.execute(invoke);
  } catch (error) {
    if (error instanceof GameSdkPortableRunnerError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/interrupted|out of memory|stack overflow/i.test(message)) {
      throw new GameSdkPortableRunnerError("EXECUTION_LIMIT");
    }
    throw new GameSdkPortableRunnerError("INVALID_BUNDLE");
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

export async function runGameSdkPortableServer(input: {
  bundle: string;
  request: GameSdkPortableServerRequest;
  timing?: GameSdkRuntimeTiming;
}): Promise<GameSdkPortableServerResponse> {
  return runPortableSession({
    ...input,
    execute: (invoke) => invoke(input.request),
  });
}

export async function runGameSdkPortableCommandBatch(input: {
  bundle: string;
  request: GameSdkPortableCommandBatchRequest;
  timing?: GameSdkRuntimeTiming;
}): Promise<GameSdkPortableCommandBatchResponse> {
  return runPortableSession({
    ...input,
    async execute(invoke) {
      const applyStartedAt = performance.now();
      const applied = await invoke(input.request.apply);
      input.timing?.record(
        "apply-command",
        Math.max(0, performance.now() - applyStartedAt),
      );
      if (!applied.ok) return { ...applied, phase: "apply" };

      const presentRequest: GameSdkPortableServerRequest = {
        version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
        invocation: {
          operation: "presentRoom",
          input: {
            room: applied.value,
            context: input.request.presentationContext,
          },
        },
      };
      const presentStartedAt = performance.now();
      const presented = await invoke(presentRequest);
      input.timing?.record(
        "present-room",
        Math.max(0, performance.now() - presentStartedAt),
      );
      if (!presented.ok) return { ...presented, phase: "present" };
      return {
        ok: true,
        value: {
          room: applied.value,
          view: presented.value,
        },
      };
    },
  });
}
