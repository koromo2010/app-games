"use client";

export type AiActivitySnapshot = {
  activeCount: number;
  label: string;
};

type AiActivityListener = () => void;

const idleSnapshot: AiActivitySnapshot = {
  activeCount: 0,
  label: "",
};

const activeOperations = new Map<symbol, string>();
const listeners = new Set<AiActivityListener>();
let snapshot = idleSnapshot;

function publishSnapshot() {
  const labels = [...activeOperations.values()];
  snapshot = labels.length === 0
    ? idleSnapshot
    : {
        activeCount: labels.length,
        label: labels.at(-1) ?? "AI処理",
      };
  listeners.forEach((listener) => listener());
}

export function getAiActivitySnapshot() {
  return snapshot;
}

export function getServerAiActivitySnapshot() {
  return idleSnapshot;
}

export function subscribeAiActivity(listener: AiActivityListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginAiActivity(label = "AI処理") {
  const operationId = Symbol(label);
  activeOperations.set(operationId, label);
  publishSnapshot();
  let finished = false;

  return () => {
    if (finished) return;
    finished = true;
    activeOperations.delete(operationId);
    publishSnapshot();
  };
}

export async function withAiActivity<T>(
  label: string,
  operation: () => Promise<T>,
) {
  const finish = beginAiActivity(label);
  try {
    return await operation();
  } finally {
    finish();
  }
}

export function aiActivityFetch(
  label: string,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  return withAiActivity(label, () => fetch(input, init));
}
