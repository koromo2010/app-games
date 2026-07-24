import {
  newQuickJSWASMModule,
  RELEASE_SYNC,
  type QuickJSHandle,
} from "quickjs-emscripten";
import {
  GAME_SDK_PORTABLE_SERVER_GLOBAL,
  type GameSdkPortableServerRequest,
  type GameSdkPortableServerResponse,
} from "@game-fields/game-sdk/portable-server";

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
export async function runGameSdkPortableServer(input: {
  bundle: string;
  request: GameSdkPortableServerRequest;
}): Promise<GameSdkPortableServerResponse> {
  if (utf8Bytes(input.bundle) > MAX_BUNDLE_BYTES) {
    throw new GameSdkPortableRunnerError("BUNDLE_TOO_LARGE");
  }
  const requestJson = JSON.stringify(input.request);
  if (utf8Bytes(requestJson) > MAX_REQUEST_BYTES) {
    throw new GameSdkPortableRunnerError("REQUEST_TOO_LARGE");
  }

  const QuickJS = await newQuickJSWASMModule(RELEASE_SYNC);
  const runtime = QuickJS.newRuntime();
  const deadline = Date.now() + VM_EXECUTION_LIMIT_MS;
  runtime.setMemoryLimit(VM_MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(VM_STACK_LIMIT_BYTES);
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext();
  let promiseHandle: QuickJSHandle | null = null;
  try {
    context.unwrapResult(
      context.evalCode(input.bundle, "server.bundle.js"),
    ).dispose();
    const expression = `globalThis[${JSON.stringify(GAME_SDK_PORTABLE_SERVER_GLOBAL)}].invoke(${JSON.stringify(requestJson)})`;
    promiseHandle = context.unwrapResult(
      context.evalCode(expression, "invoke.js"),
    );

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
  } catch (error) {
    if (error instanceof GameSdkPortableRunnerError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/interrupted|out of memory|stack overflow/i.test(message)) {
      throw new GameSdkPortableRunnerError("EXECUTION_LIMIT");
    }
    throw new GameSdkPortableRunnerError("INVALID_BUNDLE");
  } finally {
    promiseHandle?.dispose();
    context.dispose();
    runtime.dispose();
  }
}
