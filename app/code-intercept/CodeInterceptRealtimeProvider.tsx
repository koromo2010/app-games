"use client";

import type { ReactNode } from "react";
import { RealtimeProvider } from "@upstash/realtime/client";

export function CodeInterceptRealtimeProvider({ children }: { children: ReactNode }) {
  return <RealtimeProvider api={{ url: "/api/code-intercept/realtime", withCredentials: true }} maxReconnectAttempts={5}>
    {children}
  </RealtimeProvider>;
}
