"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const portalNavigationMessageType = "game-fields:sdk-official-example:navigate";

type Props = {
  appBaseUrl: string;
  src: string;
  title: string;
};

export function OfficialExampleFrame({ appBaseUrl, src, title }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const router = useRouter();

  useEffect(() => {
    const trustedOrigin = new URL(appBaseUrl).origin;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== trustedOrigin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== portalNavigationMessageType || event.data?.href !== "/sdk-examples") return;
      router.push("/sdk-examples");
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [appBaseUrl, router]);

  return <iframe ref={frameRef} className="platform-preview-frame" src={src} title={title} allow="fullscreen" />;
}

