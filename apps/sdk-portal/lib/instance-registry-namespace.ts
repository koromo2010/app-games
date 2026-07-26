export type SdkInstanceRegistryNamespace = "development" | "production";

type RegistryEnvironment = {
  NODE_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
};

export function resolveSdkInstanceRegistryNamespace(
  env: RegistryEnvironment = process.env,
): SdkInstanceRegistryNamespace {
  if (env.VERCEL_GIT_COMMIT_REF === "main") return "production";
  if (env.VERCEL_GIT_COMMIT_REF === "develop") return "development";
  if (!env.VERCEL_GIT_COMMIT_REF && env.NODE_ENV !== "production") {
    return "development";
  }
  throw new Error("SDK_REDIS_NAMESPACE_UNRESOLVED");
}

export function sdkInstanceRegistryKey(
  slug: string,
  env: RegistryEnvironment = process.env,
) {
  return `sdk:${resolveSdkInstanceRegistryNamespace(env)}:preview-instance:v1:${slug}`;
}

export function sdkInstanceRegistryReadKeys(
  slug: string,
  env: RegistryEnvironment = process.env,
) {
  const namespace = resolveSdkInstanceRegistryNamespace(env);
  const key = `sdk:${namespace}:preview-instance:v1:${slug}`;
  return namespace === "development"
    ? [key, `sdk:preview-instance:v1:${slug}`]
    : [key];
}
