import {
  resolveSdkInstanceRegistryNamespace,
  type SdkInstanceRegistryNamespace,
} from "./instance-registry-namespace.ts";

type RegistryEnvironment = {
  NODE_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  SDK_REDIS_REST_URL?: string;
  SDK_REDIS_REST_TOKEN?: string;
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

type RegistryDependencies = {
  env?: RegistryEnvironment;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

function registryConfiguration(
  env: RegistryEnvironment = process.env,
): {
  url: string;
  token: string;
  namespace: SdkInstanceRegistryNamespace;
} {
  const credentials = [
    [env.SDK_REDIS_REST_URL, env.SDK_REDIS_REST_TOKEN],
    [env.KV_REST_API_URL, env.KV_REST_API_TOKEN],
    [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN],
  ].find(([url, token]) => url && token);
  if (!credentials) {
    throw new Error("SDK_INSTANCE_REGISTRY_NOT_CONFIGURED");
  }
  const [url, token] = credentials;
  return {
    url: url!.replace(/\/$/, ""),
    token: token!,
    namespace: resolveSdkInstanceRegistryNamespace(env),
  };
}

async function executeRegistryCommand(
  parts: readonly string[],
  dependencies: RegistryDependencies = {},
) {
  const configuration = registryConfiguration(dependencies.env);
  const fetchImplementation = dependencies.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImplementation(configuration.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parts),
      cache: "no-store",
      signal: dependencies.signal,
    });
  } catch {
    throw new Error("SDK_INSTANCE_REGISTRY_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new Error("SDK_INSTANCE_REGISTRY_UNAVAILABLE");
  }
  let payload: { result?: unknown };
  try {
    const candidate = await response.json();
    if (!candidate || typeof candidate !== "object" || !("result" in candidate)) {
      throw new Error("invalid registry response");
    }
    payload = candidate as { result?: unknown };
  } catch {
    throw new Error("SDK_INSTANCE_REGISTRY_UNAVAILABLE");
  }
  return { payload, namespace: configuration.namespace };
}

export async function sdkInstanceRegistryCommand(
  parts: readonly string[],
  dependencies: RegistryDependencies = {},
) {
  const { payload } = await executeRegistryCommand(parts, dependencies);
  return payload;
}

export async function probeSdkInstanceRegistry(
  dependencies: RegistryDependencies = {},
) {
  const { payload, namespace } = await executeRegistryCommand(
    ["PING"],
    {
      ...dependencies,
      signal: dependencies.signal ?? AbortSignal.timeout(3_000),
    },
  );
  if (payload.result !== "PONG") {
    throw new Error("SDK_INSTANCE_REGISTRY_UNAVAILABLE");
  }
  return { status: "ok" as const, namespace };
}
