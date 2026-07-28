import type { IframeHTMLAttributes } from "react";

export const GAME_SDK_IFRAME_SANDBOX =
  "allow-scripts allow-forms allow-modals allow-pointer-lock" as const;

export type GameSdkIframeProps = Omit<IframeHTMLAttributes<HTMLIFrameElement>, "sandbox">;

export function GameSdkIframe(props: GameSdkIframeProps) {
  return <iframe {...props} sandbox={GAME_SDK_IFRAME_SANDBOX} />;
}
