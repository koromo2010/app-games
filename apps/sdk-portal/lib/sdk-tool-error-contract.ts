export type SdkToolErrorDetails = {
  code: string;
  message: string;
  layer: "authorization" | "validation" | "store" | "handler";
  correlationId?: string;
  operation?: string;
  revision?: string;
  partialState?: "git_saved_db_not_updated";
};

const SAFE_ERROR_PROJECTIONS = new Map<string, [string, SdkToolErrorDetails["layer"], string]>([
  ["SDK_HANDSHAKE_REQUIRED", ["SDK_HANDSHAKE_REQUIRED", "authorization", "environment-binding"]],
  ["SDK_ENVIRONMENT_BINDING_REQUIRED", ["SDK_HANDSHAKE_REQUIRED", "authorization", "environment-binding"]],
  ["AUTHORING_ENVIRONMENT_BINDING_MISMATCH", ["AUTHORING_ENVIRONMENT_BINDING_MISMATCH", "authorization", "environment-binding"]],
  ["SDK_AUTHORING_CLIENT_BINDING_MISMATCH", ["SDK_AUTHORING_CLIENT_BINDING_MISMATCH", "authorization", "client-binding"]],
  ["SDK_MOCK_SCOPE_REQUIRED", ["SDK_MOCK_SCOPE_REQUIRED", "authorization", "mock-scope"]],
  ["SDK_OWNER_REQUIRED", ["SDK_OWNER_REQUIRED", "authorization", "requirements-owner"]],
  ["SDK_ACCOUNT_CONTEXT_REQUIRED", ["SDK_ACCOUNT_CONTEXT_REQUIRED", "authorization", "account-context"]],
  ["SDK_ACCOUNT_CONTEXT_MISMATCH", ["SDK_ACCOUNT_CONTEXT_MISMATCH", "authorization", "account-context"]],
  ["SDK_AUTHORING_CLIENT_UNSUPPORTED", ["SDK_AUTHORING_CLIENT_UNSUPPORTED", "validation", "client-binding"]],
  ["GAME_SDK_GAME_ID_INVALID", ["GAME_SDK_GAME_ID_INVALID", "validation", "requirements-input"]],
  ["GAME_SDK_PROPOSAL_INPUT_INVALID", ["GAME_SDK_PROPOSAL_INPUT_INVALID", "validation", "proposal-input"]],
  ["GAME_SDK_DRAFT_NOT_FOUND", ["GAME_SDK_DRAFT_NOT_FOUND", "validation", "requirements-contract"]],
  ["MODULE_PROFILE_NOT_CONFIRMED", ["MODULE_PROFILE_NOT_CONFIRMED", "validation", "requirements-contract"]],
  ["MODULE_PROFILE_STALE", ["MODULE_PROFILE_STALE", "validation", "requirements-contract"]],
  ["GAME_SDK_PROPOSAL_NOT_FOUND", ["GAME_SDK_PROPOSAL_NOT_FOUND", "validation", "proposal-contract"]],
  ["GAME_SDK_PROPOSAL_NOOP", ["GAME_SDK_PROPOSAL_NOOP", "validation", "proposal-contract"]],
  ["GAME_SDK_PROPOSAL_DEPENDENCY_CONFLICT", ["GAME_SDK_PROPOSAL_DEPENDENCY_CONFLICT", "validation", "proposal-contract"]],
  ["SDK_INSTANCE_REGISTRY_NOT_CONFIGURED", ["SDK_INSTANCE_REGISTRY_NOT_CONFIGURED", "store", "creator-environment"]],
  ["SDK_INSTANCE_REGISTRY_UNAVAILABLE", ["SDK_INSTANCE_REGISTRY_UNAVAILABLE", "store", "creator-environment"]],
]);

export function projectSdkToolErrorDetails(error: unknown): SdkToolErrorDetails {
  const source = `${error instanceof Error ? error.message : ""}\n${typeof error === "string" ? error : ""}`;
  const matched = [...SAFE_ERROR_PROJECTIONS].find(([code]) => source.includes(code));
  const [code, layer, operation] = matched?.[1] ?? ["SDK_OPERATION_FAILED", "handler", "handler"];
  return {
    code,
    message: matched ? `${code}: SDK操作を続行できません。` : "SDK操作に失敗しました。",
    layer,
    operation,
  };
}

export function buildSdkToolErrorResult(error: SdkToolErrorDetails) {
  return {
    content: [{ type: "text", text: error.message }],
    structuredContent: { error },
    isError: true,
  } as const;
}
