let serverOffsetMs = 0;
let hasServerObservation = false;

export function observeServerDate(dateHeader: string | null, requestedAt = Date.now(), receivedAt = Date.now()) {
  if (!dateHeader) return;
  const serverDate = Date.parse(dateHeader);
  if (!Number.isFinite(serverDate)) return;
  const requestMidpoint = requestedAt + Math.max(0, receivedAt - requestedAt) / 2;
  // HTTP Date has one-second precision. Its midpoint avoids a persistent early/late bias.
  serverOffsetMs = serverDate + 500 - requestMidpoint;
  hasServerObservation = true;
}

export function synchronizedNow() {
  return Date.now() + (hasServerObservation ? serverOffsetMs : 0);
}

export function resetServerClockForTests() {
  serverOffsetMs = 0;
  hasServerObservation = false;
}
