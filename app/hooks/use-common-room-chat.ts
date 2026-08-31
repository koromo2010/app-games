"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OnlineRoomRealtimeGame } from "@/lib/online-room-realtime-protocol";
import type { RoomChatMessage } from "@/lib/room-chat-contract";

type Target = { game: OnlineRoomRealtimeGame; code: string; roomInstanceId: string };
type TargetLocator = Pick<Target, "game" | "code">;

function compareSequence(left: string, right: string) {
  const [leftMs, leftOrder] = left.split("-").map(BigInt);
  const [rightMs, rightOrder] = right.split("-").map(BigInt);
  return leftMs === rightMs ? Number(leftOrder - rightOrder) : leftMs < rightMs ? -1 : 1;
}

function mergeMessages(current: RoomChatMessage[], incoming: RoomChatMessage[]) {
  const byId = new Map(current.map((message) => [message.messageId, message]));
  for (const message of incoming) byId.set(message.messageId, message);
  return [...byId.values()].sort((left, right) => compareSequence(left.sequence, right.sequence));
}

export function useCommonRoomChat(locator: TargetLocator | null) {
  const locatorGame = locator?.game;
  const locatorCode = locator?.code;
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [status, setStatus] = useState<"connecting" | "ready" | "degraded">("connecting");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const targetRef = useRef<Target | null>(null);
  const generationRef = useRef(0);

  const backfill = useCallback(async (activeTarget: Target, generation: number, signal?: AbortSignal) => {
    const query = new URLSearchParams({ game: activeTarget.game, code: activeTarget.code, roomInstanceId: activeTarget.roomInstanceId });
    if (cursorRef.current) query.set("after", cursorRef.current);
    const response = await fetch(`/api/online-room-chat?${query}`, { cache: "no-store", credentials: "same-origin", signal });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "ROOM_CHAT_READ_FAILED");
    const body = await response.json() as { messages: RoomChatMessage[]; nextCursor: string | null };
    if (generationRef.current !== generation) return;
    setMessages((current) => mergeMessages(current, body.messages));
    cursorRef.current = body.nextCursor;
    setStatus("ready");
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const controller = new AbortController();
    let socket: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let activeTarget: Target | null = null;
    cursorRef.current = null; targetRef.current = null;
    if (!locatorGame || !locatorCode) return () => controller.abort();

    const start = async () => {
      try {
        const capabilityResponse = await fetch("/api/online-room-events", {
          method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game: locatorGame, code: locatorCode, role: "participant", family: "chat-hint" }),
        });
        const capabilityBody = capabilityResponse.ok ? await capabilityResponse.json() as { capability?: string; roomInstanceId?: string } : null;
        const capability = capabilityBody?.capability;
        const roomInstanceId = capabilityBody?.roomInstanceId;
        if (!capability || !roomInstanceId || controller.signal.aborted) throw new Error("ROOM_CHAT_REALTIME_UNAVAILABLE");
        const target: Target = { game: locatorGame, code: locatorCode, roomInstanceId };
        activeTarget = target;
        targetRef.current = target;
        await backfill(target, generation, controller.signal);
        socket = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/online-room-events`);
        socket.addEventListener("open", () => socket?.send(JSON.stringify({ type: "subscribe", capability, families: ["chat-hint"] })));
        socket.addEventListener("message", (event) => {
          try {
            const hint = JSON.parse(String(event.data)) as { type?: string; roomInstanceId?: string };
            if (hint.type === "room-chat-updated" && hint.roomInstanceId === target.roomInstanceId) void backfill(target, generation, controller.signal);
          } catch { /* strict body-free hints only */ }
        });
        socket.addEventListener("close", () => { if (!controller.signal.aborted) setStatus("degraded"); });
      } catch {
        if (!controller.signal.aborted) setStatus("degraded");
      }
      poll = setInterval(() => { if (document.visibilityState === "visible" && activeTarget) void backfill(activeTarget, generation, controller.signal).catch(() => setStatus("degraded")); }, 30_000);
    };
    void start();
    return () => { controller.abort(); socket?.close(); if (poll) clearInterval(poll); };
  }, [backfill, locatorGame, locatorCode]);

  const send = useCallback(async (body: string) => {
    const target = targetRef.current;
    if (!target || pending) return false;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/online-room-chat", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, requestId: crypto.randomUUID(), body }),
      });
      const payload = await response.json().catch(() => null) as { message?: RoomChatMessage; error?: string } | null;
      if (!response.ok || !payload?.message) throw new Error(payload?.error ?? "ROOM_CHAT_SEND_FAILED");
      setMessages((current) => mergeMessages(current, [payload.message!]));
      cursorRef.current = payload.message.orderCursor;
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ROOM_CHAT_SEND_FAILED");
      return false;
    } finally { setPending(false); }
  }, [pending]);

  return { messages, status, error, pending, send };
}
