"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  beginGameSdkDebugControlSwitch,
  beginGameSdkDebugViewerRequest,
  completeGameSdkDebugControlSwitch,
  completeGameSdkDebugViewerRequest,
  decideGameSdkDebugViewerResponse,
  gameSdkDebugControlCanDispatch,
  gameSdkDebugSelectedActorSeat,
  gameSdkDebugTargetViewer,
  gameSdkDebugViewerRequestIsCurrent,
  resetGameSdkDebugControl,
  wrapGameSdkDebugCommand,
  type GameSdkDebugControlState,
  type GameSdkDebugControlTarget,
  type GameSdkDebugViewer,
  type GameSdkDebugViewerRequest,
  type GameSdkDebugSwitchSource,
} from "@/lib/game-sdk-debug-control-target";

type RoomIdentity = {
  code: string;
  revision: number;
};

type DebugViewerRequestKind = "initial" | "error-retry" | "revision-refetch";
type DebugViewerCompletionReason =
  | "ready"
  | "target_changed"
  | "room_changed"
  | "retry_limit"
  | "refetch_limit"
  | "timeout";

export type GameSdkDebugViewerTelemetry = {
  event: "request" | "request-success" | "request-failure" | "switch-complete";
  operationId: string;
  generation: number;
  requestSequence: number;
  requestKind: DebugViewerRequestKind;
  errorRetryCount: number;
  revisionRefetchCount: number;
  totalRequestCount: number;
  requestedRevision: number;
  latestRevision?: number;
  requestDurationMs?: number;
  retryDelayMs?: number;
  totalSwitchDurationMs: number;
  completionReason?: DebugViewerCompletionReason;
  errorCode?: string;
};

type Options<TRoom extends RoomIdentity> = {
  getRoom(): TRoom | null;
  readRoomAsDebugViewer(
    code: string,
    viewer: Exclude<GameSdkDebugViewer, "self">,
  ): Promise<TRoom | null>;
  postRoomSnapshot(room: TRoom | null): void;
  onViewerError(): void;
  onViewerTelemetry?(event: GameSdkDebugViewerTelemetry): void;
};

const DEBUG_VIEWER_RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000] as const;
const DEBUG_VIEWER_MAX_ERROR_RETRIES = DEBUG_VIEWER_RETRY_DELAYS_MS.length;
const DEBUG_VIEWER_MAX_REVISION_REFETCHES = 3;
const DEBUG_VIEWER_OPERATION_DEADLINE_MS = 10_000;

type DebugViewerOperation = {
  id: string;
  generation: number;
  startedAt: number;
  errorRetryCount: number;
  revisionRefetchCount: number;
  totalRequestCount: number;
};

function createOperationId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `debug-viewer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function errorCode(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)) {
    return error.message;
  }
  return "DEBUG_VIEWER_READ_FAILED";
}

export function useGameSdkDebugControlTarget<TRoom extends RoomIdentity>(
  options: Options<TRoom>,
) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const stateRef = useRef<GameSdkDebugControlState>(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  );
  const inFlightRef = useRef<GameSdkDebugViewerRequest | null>(null);
  const requestSequenceRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operationRef = useRef<DebugViewerOperation | null>(null);
  const [state, setState] = useState<GameSdkDebugControlState>(
    INITIAL_GAME_SDK_DEBUG_CONTROL_STATE,
  );

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const clearOperation = useCallback(() => {
    clearRetryTimer();
    operationRef.current = null;
  }, [clearRetryTimer]);

  const commit = useCallback((next: GameSdkDebugControlState) => {
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const emitTelemetry = useCallback((
    event: GameSdkDebugViewerTelemetry["event"],
    requestKind: DebugViewerRequestKind,
    requestedRevision: number,
    requestSequence: number,
    fields: Partial<GameSdkDebugViewerTelemetry> = {},
  ) => {
    const operation = operationRef.current;
    if (!operation) return;
    optionsRef.current.onViewerTelemetry?.({
      event,
      operationId: operation.id,
      generation: operation.generation,
      requestSequence,
      requestKind,
      errorRetryCount: operation.errorRetryCount,
      revisionRefetchCount: operation.revisionRefetchCount,
      totalRequestCount: operation.totalRequestCount,
      requestedRevision,
      totalSwitchDurationMs: Math.max(0, Date.now() - operation.startedAt),
      ...fields,
    });
  }, []);

  const reset = useCallback(() => {
    clearOperation();
    const next = commit(resetGameSdkDebugControl(stateRef.current));
    inFlightRef.current = null;
    optionsRef.current.postRoomSnapshot(optionsRef.current.getRoom());
    return next;
  }, [clearOperation, commit]);

  const postRoom = useCallback((
    room: TRoom | null,
    delivery: { viewerResolved?: boolean } = {},
  ) => {
    const current = stateRef.current;
    const viewer = gameSdkDebugTargetViewer(current.target);
    if (!room || viewer === "self" || delivery.viewerResolved) {
      optionsRef.current.postRoomSnapshot(room);
      return;
    }

    const generation = current.generation;
    if (!operationRef.current || operationRef.current.generation !== generation) {
      operationRef.current = {
        id: createOperationId(),
        generation,
        startedAt: Date.now(),
        errorRetryCount: 0,
        revisionRefetchCount: 0,
        totalRequestCount: 0,
      };
    }

    const failSwitch = (
      reason: Exclude<DebugViewerCompletionReason, "ready">,
      requestedRoom: TRoom,
      requestKind: DebugViewerRequestKind,
      requestSequence: number,
    ) => {
      const latestRoom = optionsRef.current.getRoom();
      emitTelemetry("switch-complete", requestKind, requestedRoom.revision, requestSequence, {
        latestRevision: latestRoom?.revision,
        completionReason: reason,
      });
      clearOperation();
      inFlightRef.current = null;
      commit(resetGameSdkDebugControl(stateRef.current));
      optionsRef.current.postRoomSnapshot(latestRoom);
      optionsRef.current.onViewerError();
    };

    const requestViewerRoom = (
      requestedRoom: TRoom,
      requestKind: DebugViewerRequestKind,
    ) => {
      const operation = operationRef.current;
      if (!operation || operation.generation !== generation) return;
      if (Date.now() - operation.startedAt >= DEBUG_VIEWER_OPERATION_DEADLINE_MS) {
        failSwitch("timeout", requestedRoom, requestKind, requestSequenceRef.current);
        return;
      }

      requestSequenceRef.current += 1;
      const acquisition = beginGameSdkDebugViewerRequest(
        inFlightRef.current,
        generation,
        requestSequenceRef.current,
      );
      if (!acquisition.started) return;

      const request = acquisition.request;
      const requestStartedAt = Date.now();
      operation.totalRequestCount += 1;
      inFlightRef.current = request;
      emitTelemetry("request", requestKind, requestedRoom.revision, request.sequence);

      const remainingMs = Math.max(
        1,
        DEBUG_VIEWER_OPERATION_DEADLINE_MS - (Date.now() - operation.startedAt),
      );
      let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
      const deadline = new Promise<never>((_, reject) => {
        deadlineTimer = setTimeout(() => reject(new Error("DEBUG_VIEWER_OPERATION_TIMEOUT")), remainingMs);
      });

      void Promise.race([
        optionsRef.current.readRoomAsDebugViewer(requestedRoom.code, viewer),
        deadline,
      ]).then((debugRoom) => {
        if (deadlineTimer !== null) clearTimeout(deadlineTimer);
        if (!gameSdkDebugViewerRequestIsCurrent(inFlightRef.current, request)) return;
        inFlightRef.current = completeGameSdkDebugViewerRequest(
          inFlightRef.current,
          request,
        );

        const latest = stateRef.current;
        const latestRoom = optionsRef.current.getRoom();
        const decision = decideGameSdkDebugViewerResponse({
          state: latest,
          generation,
          viewer,
          requestedRoom,
          latestRoom,
        });
        emitTelemetry("request-success", requestKind, requestedRoom.revision, request.sequence, {
          latestRevision: latestRoom?.revision,
          requestDurationMs: Math.max(0, Date.now() - requestStartedAt),
        });
        if (!decision.apply) {
          const completionReason = latest.generation !== generation
            ? "target_changed"
            : latestRoom?.code !== requestedRoom.code
              ? "room_changed"
              : "target_changed";
          emitTelemetry("switch-complete", requestKind, requestedRoom.revision, request.sequence, {
            latestRevision: latestRoom?.revision,
            completionReason,
          });
          clearOperation();
          return;
        }

        if (decision.refetch && latestRoom) {
          optionsRef.current.postRoomSnapshot(debugRoom);
          if (operation.revisionRefetchCount >= DEBUG_VIEWER_MAX_REVISION_REFETCHES) {
            failSwitch("refetch_limit", requestedRoom, requestKind, request.sequence);
            return;
          }
          operation.revisionRefetchCount += 1;
          requestViewerRoom(latestRoom, "revision-refetch");
          return;
        }

        clearRetryTimer();
        commit(completeGameSdkDebugControlSwitch(latest, generation));
        optionsRef.current.postRoomSnapshot(debugRoom);
        emitTelemetry("switch-complete", requestKind, requestedRoom.revision, request.sequence, {
          latestRevision: latestRoom?.revision,
          completionReason: "ready",
        });
        clearOperation();
      }).catch((error) => {
        if (deadlineTimer !== null) clearTimeout(deadlineTimer);
        if (!gameSdkDebugViewerRequestIsCurrent(inFlightRef.current, request)) return;
        inFlightRef.current = completeGameSdkDebugViewerRequest(
          inFlightRef.current,
          request,
        );

        const latest = stateRef.current;
        const latestRoom = optionsRef.current.getRoom();
        emitTelemetry("request-failure", requestKind, requestedRoom.revision, request.sequence, {
          latestRevision: latestRoom?.revision,
          requestDurationMs: Math.max(0, Date.now() - requestStartedAt),
          errorCode: errorCode(error),
        });
        if (
          latest.generation !== generation
          || gameSdkDebugTargetViewer(latest.target) !== viewer
          || !latestRoom
          || latestRoom.code !== requestedRoom.code
        ) {
          emitTelemetry("switch-complete", requestKind, requestedRoom.revision, request.sequence, {
            latestRevision: latestRoom?.revision,
            completionReason: latest.generation !== generation ? "target_changed" : "room_changed",
          });
          clearOperation();
          return;
        }
        if (errorCode(error) === "DEBUG_VIEWER_OPERATION_TIMEOUT") {
          failSwitch("timeout", requestedRoom, requestKind, request.sequence);
          return;
        }
        if (operation.errorRetryCount >= DEBUG_VIEWER_MAX_ERROR_RETRIES) {
          failSwitch("retry_limit", requestedRoom, requestKind, request.sequence);
          return;
        }

        const retryDelay = DEBUG_VIEWER_RETRY_DELAYS_MS[operation.errorRetryCount]!;
        operation.errorRetryCount += 1;
        emitTelemetry("request-failure", "error-retry", requestedRoom.revision, request.sequence, {
          latestRevision: latestRoom.revision,
          retryDelayMs: retryDelay,
          errorCode: errorCode(error),
        });
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          const retryRoom = optionsRef.current.getRoom();
          const retryState = stateRef.current;
          if (
            retryState.generation === generation
            && gameSdkDebugTargetViewer(retryState.target) === viewer
            && retryRoom?.code === requestedRoom.code
          ) {
            requestViewerRoom(retryRoom, "error-retry");
          }
        }, retryDelay);
      });
    };

    requestViewerRoom(room, "initial");
  }, [clearOperation, clearRetryTimer, commit, emitTelemetry]);

  const selectTarget = useCallback((
    target: GameSdkDebugControlTarget,
    source: GameSdkDebugSwitchSource = "manual",
  ) => {
    clearOperation();
    const room = optionsRef.current.getRoom();
    const next = commit(beginGameSdkDebugControlSwitch(stateRef.current, target, source));
    if (target.mode === "self") {
      inFlightRef.current = null;
      optionsRef.current.postRoomSnapshot(room);
      return next;
    }
    operationRef.current = {
      id: createOperationId(),
      generation: next.generation,
      startedAt: Date.now(),
      errorRetryCount: 0,
      revisionRefetchCount: 0,
      totalRequestCount: 0,
    };
    if (room) postRoom(room);
    return next;
  }, [clearOperation, commit, postRoom]);

  const wrapCommand = useCallback(<TCommand extends { type: string }>(
    command: TCommand,
  ) => wrapGameSdkDebugCommand(stateRef.current, command), []);

  return {
    actorSeat: gameSdkDebugSelectedActorSeat(state),
    canSend: gameSdkDebugControlCanDispatch(state),
    isSwitching: state.status === "switching",
    postRoom,
    reset,
    selectTarget,
    source: state.source,
    state,
    viewer: gameSdkDebugTargetViewer(state.target),
    wrapCommand,
  };
}
