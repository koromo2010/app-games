/**
 * Split out of GameSdkIframe.tsx (added in 0edde9c) purely so this constant
 * can be imported directly by tests/sdk-preview-auth.test.ts.
 *
 * GameSdkIframe.tsx contains JSX in its function body, and this repo's test
 * runner (`node --experimental-strip-types --test`) only strips TypeScript
 * type syntax — it does not transform JSX. Importing anything from a
 * JSX-bearing .tsx file (even a single named export) fails to parse there.
 * Keeping the plain constant in its own .ts file lets GameSdkIframe.tsx keep
 * re-exporting it for app code, while the test imports this file directly.
 */
export const GAME_SDK_IFRAME_SANDBOX =
  "allow-scripts allow-forms allow-modals allow-pointer-lock" as const;
