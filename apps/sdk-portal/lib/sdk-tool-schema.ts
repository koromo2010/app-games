export type JsonObjectSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

export function buildPostHandshakeToolInputSchema(
  inputSchema: JsonObjectSchema,
  environmentBindingSchema: Record<string, unknown>,
  options: {
    ownerBoundWrite?: boolean;
    expectedAccountRefSchema?: Record<string, unknown>;
    expectedAccountContextVersionSchema?: Record<string, unknown>;
  } = {},
) {
  const required = new Set(inputSchema.required ?? []);
  required.add("environmentBinding");
  if (options.ownerBoundWrite) required.add("expectedAccountRef");

  return {
    ...inputSchema,
    additionalProperties: inputSchema.additionalProperties ?? false,
    properties: {
      ...(inputSchema.properties ?? {}),
      environmentBinding: environmentBindingSchema,
      ...(options.ownerBoundWrite
        ? {
          expectedAccountRef: {
            ...(options.expectedAccountRefSchema ?? {
              type: "string",
              minLength: 20,
              description: "list_creator_environments等で確認した現在のMCPアカウントの公開accountRef。raw player ID・token・Cookieではありません。",
            }),
          },
          expectedAccountContextVersion: {
            ...(options.expectedAccountContextVersionSchema ?? {
              type: "integer",
              const: 1,
              description: "accountRefの文脈版。省略可能です。",
            }),
          },
        }
        : {}),
    },
    required: [...required],
  };
}
