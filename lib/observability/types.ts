export type ObservabilityLevel = "debug" | "info" | "warn" | "error";

export type ObservabilityOutcome =
  | "started"
  | "success"
  | "rejected"
  | "conflict"
  | "ignored"
  | "failed";

/**
 * Deliberately closed field list. Game payloads, free text, secrets, words,
 * email addresses, cookies and avatar data have no place in this schema.
 */
export type ObservabilityFields = {
  game?: string;
  operation?: string;
  action?: string;
  roomRef?: string;
  actorRef?: string;
  eventRef?: string;
  commandRef?: string;
  effectRef?: string;
  phase?: string;
  channel?: string;
  packageRevision?: string;
  packageRoot?: string;
  runtimeVersion?: string;
  provider?: string;
  model?: string;
  billingSource?: string;
  tokenVersion?: string;
  sourceKind?: string;
  assetPath?: string;
  revision?: number;
  commandRevision?: number;
  roomSchemaVersion?: number;
  playerCount?: number;
  round?: number;
  gameNumber?: number;
  statusCode?: number;
  durationMs?: number;
  retryAfterMs?: number;
  attempt?: number;
  affectedCount?: number;
  sourceCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  costMicros?: number;
  applied?: boolean;
  debugMode?: boolean;
  outcome?: ObservabilityOutcome;
  errorCode?: string;
  databaseCode?: string;
};

export type ObservabilityEvent = {
  schemaVersion: 1;
  occurredAt: string;
  level: ObservabilityLevel;
  event: string;
  service: string;
  environment: string;
  deployment?: string;
  region?: string;
  route?: string;
  method?: string;
  requestId?: string;
  traceId?: string;
  fields: ObservabilityFields;
};

export interface ObservabilitySink {
  emit(event: ObservabilityEvent): void | Promise<void>;
}
