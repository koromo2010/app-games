type ServerClockListener = () => void;

let serverOffsetMs = 0;
let hasServerObservation = false;
let observedServerAtReceipt = 0;
let observedMonotonicAtReceipt: number | null = null;
const listeners = new Set<ServerClockListener>();

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
  if (!dateHeader) return false;
  const serverDate = Date.parse(dateHeader);
  if (!Number.isFinite(serverDate)) return false;
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
  serverOffsetMs = observedServerAtReceipt - receivedAt;
  hasServerObservation = true;
  for (const listener of listeners) listener();
  return true;
}

export function synchronizedNow(
  wallNow = Date.now(),
  monotonicAt = monotonicNow(),
) {
  return projectedServerNow(wallNow, monotonicAt);
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
  listeners.clear();
}
