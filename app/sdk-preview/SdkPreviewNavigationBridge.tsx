"use client";

import { useEffect } from "react";
import {
  SDK_PREVIEW_NAVIGATION_SYNC_MESSAGE,
  sdkPreviewNavigationMessage,
  sdkPreviewNavigationStateFromPath,
  sdkPreviewPathForState,
  type SdkPreviewNavigationState,
} from "@/lib/sdk-preview-navigation-contract";

type SyncMessage = {
  type?: unknown;
  creatorSlug?: unknown;
  gameId?: unknown;
  revision?: unknown;
};

function navigationState(creatorSlug: string): SdkPreviewNavigationState | null {
  const state = sdkPreviewNavigationStateFromPath(
    window.location.pathname,
    window.location.search,
  );
  return state?.creatorSlug === creatorSlug ? state : null;
}

export function SdkPreviewNavigationBridge({
  creatorSlug,
  portalOrigin,
}: {
  creatorSlug: string;
  portalOrigin: string;
}) {
  useEffect(() => {
    const targetOrigin = new URL(portalOrigin).origin;
    if (window.parent === window) return;

    const announce = () => {
      const state = navigationState(creatorSlug);
      if (!state) return;
      window.parent.postMessage(
        sdkPreviewNavigationMessage(state),
        targetOrigin,
      );
    };
    const onMessage = (event: MessageEvent<SyncMessage>) => {
      if (event.source !== window.parent || event.origin !== targetOrigin) return;
      if (event.data?.type !== SDK_PREVIEW_NAVIGATION_SYNC_MESSAGE) return;
      const state = navigationState(creatorSlug);
      const requested = sdkPreviewNavigationStateFromPath(
        typeof event.data.creatorSlug === "string"
          ? `/sdk-preview/${event.data.creatorSlug}${event.data.gameId ? `/games/${event.data.gameId}` : ""}`
          : "",
        typeof event.data.revision === "string"
          ? `?revision=${encodeURIComponent(event.data.revision)}`
          : "",
      );
      if (!requested || requested.creatorSlug !== creatorSlug) return;
      const nextPath = sdkPreviewPathForState(requested);
      if (state && sdkPreviewPathForState(state) === nextPath) {
        announce();
        return;
      }
      window.location.assign(nextPath);
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("popstate", announce);
    announce();
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("popstate", announce);
    };
  }, [creatorSlug, portalOrigin]);

  return null;
}
