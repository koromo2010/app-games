"use client";

import { useEffect, useRef } from "react";
import { createRealtime } from "@upstash/realtime/client";
import type { CodeInterceptRoom } from "@/lib/code-intercept";
import {
  codeInterceptRealtimeChannel,
  type CodeInterceptRealtimeSchema,
} from "@/lib/code-intercept-realtime-schema";

const { useRealtime } = createRealtime<CodeInterceptRealtimeSchema>();

type CodeInterceptRealtimeOptions = {
  enabled: boolean;
  room: CodeInterceptRoom | null;
  fetchRoom: (code: string) => Promise<CodeInterceptRoom | null>;
  onRoom: (room: CodeInterceptRoom) => void;
  onMissing: () => void;
};

export function useCodeInterceptRealtimeRoom({ enabled, room, fetchRoom, onRoom, onMissing }: CodeInterceptRealtimeOptions) {
  const latest = useRef({ room, fetchRoom, onRoom, onMissing });
  const refreshInFlight = useRef(false);
  const refreshPending = useRef(false);

  useEffect(() => {
    latest.current = { room, fetchRoom, onRoom, onMissing };
  }, [fetchRoom, onMissing, onRoom, room]);

  const { status } = useRealtime({
    enabled: enabled && Boolean(room?.code),
    channels: [room?.code ? codeInterceptRealtimeChannel(room.code) : undefined],
    events: ["room.updated", "room.dissolved"],
    onData: (event) => {
      const current = latest.current.room;
      if (!current || event.data.code !== current.code) return;
      if (event.event === "room.dissolved") {
        latest.current.onMissing();
        return;
      }
      if (event.data.revision <= current.revision) return;
      if (refreshInFlight.current) {
        refreshPending.current = true;
        return;
      }

      const refresh = async () => {
        refreshInFlight.current = true;
        do {
          refreshPending.current = false;
          const activeRoom = latest.current.room;
          if (!activeRoom) break;
          try {
            const saved = await latest.current.fetchRoom(activeRoom.code);
            if (saved) latest.current.onRoom(saved);
            else latest.current.onMissing();
          } catch {
            // The low-frequency polling fallback remains active and retries.
          }
        } while (refreshPending.current);
        refreshInFlight.current = false;
      };
      void refresh();
    },
  });

  return status;
}
