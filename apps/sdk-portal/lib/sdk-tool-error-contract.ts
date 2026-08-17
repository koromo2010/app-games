export type SdkToolErrorDetails = {
  code: string;
  message: string;
  layer: "authorization" | "validation" | "store" | "handler";
  correlationId?: string;
  operation?: string;
};

export function buildSdkToolErrorResult(error: SdkToolErrorDetails) {
  return {
    content: [{ type: "text", text: error.message }],
    structuredContent: { error },
    isError: true,
  } as const;
}
