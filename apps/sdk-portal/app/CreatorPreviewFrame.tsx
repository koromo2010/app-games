"use client";

import { useEffect, useRef } from "react";
import {
  parsePortalPath,
  parsePreviewNavigationMessage,
  portalPathForPreviewState,
  SDK_PREVIEW_NAVIGATION_SYNC_MESSAGE,
} from "../lib/preview-navigation-contract";

export function CreatorPreviewFrame({
  creatorSlug,
  previewUrl,
  previewOrigin,
}: {
  creatorSlug: string;
  previewUrl: string;
  previewOrigin: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const targetOrigin = new URL(previewOrigin).origin;
    const sendCurrentPath = () => {
      const state = parsePortalPath(
        window.location.pathname,
        window.location.search,
        creatorSlug,
      );
      if (!state) return;
      frameRef.current?.contentWindow?.postMessage({
        type: SDK_PREVIEW_NAVIGATION_SYNC_MESSAGE,
        ...state,
      }, targetOrigin);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== frameRef.current?.contentWindow
        || event.origin !== targetOrigin
      ) return;
      const state = parsePreviewNavigationMessage(event.data, creatorSlug);
      if (!state) return;
      const nextPortalPath = portalPathForPreviewState(state);
      const currentPath = `${window.location.pathname}${window.location.search}`;
      if (currentPath !== nextPortalPath) {
        window.history.pushState({ sdkPreview: state }, "", nextPortalPath);
      }
      frameRef.current?.contentWindow?.postMessage({
        type: SDK_PREVIEW_NAVIGATION_SYNC_MESSAGE,
        ...state,
      }, targetOrigin);
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("popstate", sendCurrentPath);
    sendCurrentPath();
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("popstate", sendCurrentPath);
    };
  }, [creatorSlug, previewOrigin]);

  return (
    <iframe
      ref={frameRef}
      className="platform-preview-frame"
      src={previewUrl}
      title={`${creatorSlug}のGame Fields開発環境`}
      allow="fullscreen"
      onLoad={() => {
        const state = parsePortalPath(
          window.location.pathname,
          window.location.search,
          creatorSlug,
        );
        if (!state) return;
        frameRef.current?.contentWindow?.postMessage({
          type: SDK_PREVIEW_NAVIGATION_SYNC_MESSAGE,
          ...state,
        }, new URL(previewOrigin).origin);
      }}
    />
  );
}
