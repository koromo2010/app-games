type ServerClockListener = () => void;

export type ServerClockSampleState = "fresh" | "missing" | "invalid" | "stale";

export type ServerClockSnapshot = {
  environmentKey: string;
  sessionKey: string;
  sampleState: ServerClockSampleState;
  serverNow: number | null;
  sampleAgeMs: number | null;
  observationVersion: number;
};

export const defaultServerClockFreshnessMs = 60_000;

let serverOffsetMs = 0;
let hasServerObservation = false;
let observedServerAtReceipt = 0;
let observedMonotonicAtReceipt: number | null = null;
let observedWallAtReceipt = 0;
let rejectedSample: "missing" | "invalid" | null = null;
let observationVersion = 0;
const listeners = new Set<ServerClockListener>();

const serverClockSessionKey = (() => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `clock-${Math.random().toString(36).slice(2)}`;
})();

function environmentKey() {
  if (typeof location === "undefined") return "server-runtime";
  return `${location.protocol}//${location.host}`;
}

function monotonicNow() {
  return typeof performance === "undefined" ? null : performance.now();
}

function projectedServerNow(wallNow: number, monotonicAt: number | null) {
  if (!hasServerObservation) return wallNow;
  if (
    observedMonotonicAtReceipt !== null
    && monotonicAt !== null
    && monotonicAt >= observedMonotonicAtReceipt
  ) {
    return observedServerAtReceipt + (monotonicAt - observedMonotonicAtReceipt);
  }
  return wallNow + serverOffsetMs;
}

export function observeServerDate(
  dateHeader: string | null,
  requestedAt = Date.now(),
  receivedAt = Date.now(),
  monotonicAt = monotonicNow(),
) {
  if (!dateHeader) {
    rejectedSample = "missing";
    return false;
  }
  const serverDate = Date.parse(dateHeader);
  if (!Number.isFinite(serverDate)) {
    rejectedSample = "invalid";
    return false;
  }
  if (
    hasServerObservation
    && observedMonotonicAtReceipt !== null
    && monotonicAt !== null
    && monotonicAt < observedMonotonicAtReceipt
  ) return false;

  const roundTripMs = Math.max(0, receivedAt - requestedAt);
  // HTTP Date has one-second precision. At receipt, the best bounded estimate
  // is the middle of that second plus half of the observed round trip.
  const serverAtReceipt = serverDate + 500 + roundTripMs / 2;
  const hadServerObservation = hasServerObservation;
  const currentProjection = projectedServerNow(receivedAt, monotonicAt);
  // A delayed/out-of-order HTTP response must not move authoritative time
  // backwards. Two seconds covers Date-header precision and normal jitter.
  if (hasServerObservation && serverAtReceipt + 2_000 < currentProjection) {
    return false;
  }

  observedServerAtReceipt = hadServerObservation
    ? Math.max(serverAtReceipt, currentProjection)
    : serverAtReceipt;
  observedMonotonicAtReceipt = monotonicAt;
  observedWallAtReceipt = receivedAt;
  serverOffsetMs = observedServerAtReceipt - receivedAt;
  hasServerObservation = true;
  rejectedSample = null;
  observationVersion += 1;
  for (const listener of listeners) listener();
  return true;
}

export function synchronizedNow(
  wallNow = Date.now(),
  monotonicAt = monotonicNow(),
) {
  return projectedServerNow(wallNow, monotonicAt);
}

export function getServerClockSnapshot(options: {
  freshnessMs?: number;
  wallNow?: number;
  monotonicAt?: number | null;
} = {}): ServerClockSnapshot {
  const freshnessMs = Math.max(0, options.freshnessMs ?? defaultServerClockFreshnessMs);
  const wallNow = options.wallNow ?? Date.now();
  const monotonicAt = options.monotonicAt === undefined ? monotonicNow() : options.monotonicAt;
  const base = {
    environmentKey: environmentKey(),
    sessionKey: serverClockSessionKey,
    observationVersion,
  };
  if (!hasServerObservation) {
    return {
      ...base,
      sampleState: rejectedSample ?? "missing",
      serverNow: null,
      sampleAgeMs: null,
    };
  }
  const sampleAgeMs = observedMonotonicAtReceipt !== null && monotonicAt !== null
    ? monotonicAt >= observedMonotonicAtReceipt
      ? monotonicAt - observedMonotonicAtReceipt
      : Number.POSITIVE_INFINITY
    : Math.max(0, wallNow - observedWallAtReceipt);
  return {
    ...base,
    sampleState: sampleAgeMs <= freshnessMs ? "fresh" : "stale",
    serverNow: projectedServerNow(wallNow, monotonicAt),
    sampleAgeMs,
  };
}

export function subscribeServerClock(listener: ServerClockListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetServerClockForTests() {
  serverOffsetMs = 0;
  hasServerObservation = false;
  observedServerAtReceipt = 0;
  observedMonotonicAtReceipt = null;
  observedWallAtReceipt = 0;
  rejectedSample = null;
  observationVersion = 0;
  listeners.clear();
}
