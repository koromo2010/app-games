"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { DevelopmentRoomFixturePublicReceipt } from "@/lib/development-room-fixture-contract";

type WriteState = "idle" | "sending" | "sent" | "unknown";

function storageKey(creatorSlug: string) {
  return `game-fields:t185-room-fixture:${creatorSlug}`;
}

function receiptFrom(value: unknown) {
  const candidate = value && typeof value === "object"
    ? (value as { receipt?: unknown }).receipt
    : null;
  return candidate && typeof candidate === "object"
    ? candidate as DevelopmentRoomFixturePublicReceipt
    : null;
}

export function DevelopmentRoomFixtureOperatorPanel({
  creatorSlug,
}: {
  creatorSlug: string;
}) {
  const storedOperationId = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => window.sessionStorage.getItem(storageKey(creatorSlug)) ?? "",
    () => "",
  );
  const [createdOperationId, setCreatedOperationId] = useState("");
  const operationId = createdOperationId || storedOperationId;
  const [receipt, setReceipt] = useState<DevelopmentRoomFixturePublicReceipt | null>(null);
  const [materializeState, setMaterializeState] = useState<WriteState>("idle");
  const [cleanupState, setCleanupState] = useState<WriteState>("idle");
  const [message, setMessage] = useState("未実行");
  const endpoint = useMemo(
    () => `/api/sdk-preview/${encodeURIComponent(creatorSlug)}/room-fixtures`,
    [creatorSlug],
  );

  const readResponse = useCallback(async (response: Response) => {
    const payload = await response.json().catch(() => null) as {
      receipt?: unknown;
      error?: unknown;
    } | null;
    const nextReceipt = receiptFrom(payload);
    if (nextReceipt) setReceipt(nextReceipt);
    if (!response.ok) {
      throw new Error(typeof payload?.error === "string" ? payload.error : "REQUEST_FAILED");
    }
    return nextReceipt;
  }, []);

  const materialize = useCallback(async () => {
    if (operationId || materializeState !== "idle") return;
    const nextOperationId = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey(creatorSlug), nextOperationId);
    setCreatedOperationId(nextOperationId);
    setMaterializeState("sending");
    setMessage("materialize中…");
    try {
      const next = await readResponse(await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ operationId: nextOperationId }),
      }));
      setMaterializeState("sent");
      setMessage(next?.state === "ready" ? "READY" : `state: ${next?.state ?? "unknown"}`);
    } catch (error) {
      setMaterializeState("unknown");
      setMessage(`結果不明または失敗: ${error instanceof Error ? error.message : "UNKNOWN"}。再送せずStatusで照合してください。`);
    }
  }, [creatorSlug, endpoint, materializeState, operationId, readResponse]);

  const status = useCallback(async () => {
    if (!operationId) return;
    setMessage("status照合中…");
    try {
      const next = await readResponse(await fetch(
        `${endpoint}?operationId=${encodeURIComponent(operationId)}`,
        { credentials: "same-origin", cache: "no-store" },
      ));
      setMaterializeState("sent");
      setMessage(`status: ${next?.state ?? "unknown"}`);
    } catch (error) {
      setMessage(`status失敗: ${error instanceof Error ? error.message : "UNKNOWN"}`);
    }
  }, [endpoint, operationId, readResponse]);

  const cleanup = useCallback(async () => {
    if (!operationId || cleanupState !== "idle") return;
    setCleanupState("sending");
    setMessage("exact cleanup中…");
    try {
      const next = await readResponse(await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ operationId }),
      }));
      setCleanupState("sent");
      setMessage(next?.state === "cleaned" ? "CLEANED" : `state: ${next?.state ?? "unknown"}`);
    } catch (error) {
      setCleanupState("unknown");
      setMessage(`cleanup結果不明または失敗: ${error instanceof Error ? error.message : "UNKNOWN"}。再送せずStatusで照合してください。`);
    }
  }, [cleanupState, endpoint, operationId, readResponse]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <section className="mx-auto max-w-4xl rounded-2xl border border-cyan-300/30 bg-slate-900 p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">
          Development only · T-185
        </p>
        <h1 className="mt-3 text-2xl font-black">Bulk Room fixture operator</h1>
        <p className="mt-2 text-sm text-slate-300">
          server固定scenarioを一意operationで生成し、receiptに固定された対象だけをcleanupします。
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void materialize()}
            disabled={Boolean(operationId) || materializeState !== "idle"}
            className="rounded-xl bg-cyan-300 px-4 py-2 font-black text-slate-950 disabled:opacity-40"
          >
            Materialize once
          </button>
          <button
            type="button"
            onClick={() => void status()}
            disabled={!operationId}
            className="rounded-xl border border-white/20 px-4 py-2 font-bold disabled:opacity-40"
          >
            Read status
          </button>
          <button
            type="button"
            onClick={() => void cleanup()}
            disabled={!operationId || cleanupState !== "idle" || receipt?.state === "cleaned"}
            className="rounded-xl bg-rose-300 px-4 py-2 font-black text-slate-950 disabled:opacity-40"
          >
            Exact cleanup once
          </button>
        </div>

        <dl className="mt-6 grid gap-3 rounded-xl bg-black/25 p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-400">operation</dt><dd className="break-all font-mono">{operationId || "—"}</dd></div>
          <div><dt className="text-slate-400">result</dt><dd>{message === "未実行" && storedOperationId ? "既存operationを検出しました。再送せずStatusで照合してください。" : message}</dd></div>
          <div><dt className="text-slate-400">state</dt><dd data-testid="fixture-state">{receipt?.state ?? "—"}</dd></div>
          <div><dt className="text-slate-400">remaining</dt><dd data-testid="fixture-remaining">{receipt?.counts.remainingTargets ?? "—"}</dd></div>
          <div><dt className="text-slate-400">built-in targets</dt><dd>{receipt?.counts.builtInTargets ?? "—"}</dd></div>
          <div><dt className="text-slate-400">SDK targets</dt><dd>{receipt?.counts.sdkTargets ?? "—"}</dd></div>
          <div><dt className="text-slate-400">first pages filtered</dt><dd>{receipt?.verification ? String(receipt.verification.builtInFirstStoragePageFiltered && receipt.verification.sdkFirstStoragePageFiltered) : "—"}</dd></div>
          <div><dt className="text-slate-400">baseline restored</dt><dd data-testid="fixture-baseline">{receipt?.verification?.baselineUnchanged === undefined ? "—" : String(receipt.verification.baselineUnchanged)}</dd></div>
        </dl>

        <nav className="mt-6 grid gap-2 text-sm text-cyan-200 sm:grid-cols-2">
          <a href="/ja/hodoai-talk" className="underline">Built-in ja</a>
          <a href="/en/hodoai-talk" className="underline">Built-in en</a>
          <a href={`/ja/sdk-preview/${creatorSlug}/games/link-lines`} className="underline">SDK ja</a>
          <a href={`/en/sdk-preview/${creatorSlug}/games/link-lines`} className="underline">SDK en</a>
        </nav>
      </section>
    </main>
  );
}
