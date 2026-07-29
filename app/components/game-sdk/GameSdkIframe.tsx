import { forwardRef, type IframeHTMLAttributes } from "react";
import { GAME_SDK_IFRAME_SANDBOX } from "./game-sdk-iframe-sandbox.ts";

// Re-exported for existing/app-code consumers of GameSdkIframe.tsx — the
// canonical definition now lives in game-sdk-iframe-sandbox.ts (see that
// file for why).
export { GAME_SDK_IFRAME_SANDBOX };

export type GameSdkIframeProps = Omit<IframeHTMLAttributes<HTMLIFrameElement>, "sandbox">;

export const GameSdkIframe = forwardRef<HTMLIFrameElement, GameSdkIframeProps>(
  function GameSdkIframe(props, ref) {
    return <iframe ref={ref} {...props} sandbox={GAME_SDK_IFRAME_SANDBOX} />;
  },
);
