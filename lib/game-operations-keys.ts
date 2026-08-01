import type { AppEnvironment } from "./storage-environment-guard.ts";

export const gameOperationsNamespace = "site-game-operations";
export const unscopedGameOperationsKey = `${gameOperationsNamespace}:v2`;
export const legacyGameOperationsKey = `${gameOperationsNamespace}:v1`;

export function gameOperationsKey(environment: AppEnvironment) {
  return `${gameOperationsNamespace}:v3:${environment}`;
}
