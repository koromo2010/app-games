export function classifyRedisConsolidationKey(sourceKey) {
  const key = String(sourceKey ?? "");
  if (key.startsWith("app-dev:")) {
    return {
      classification: "platform-development",
      targetKey: key,
      automatic: false,
      disposition: "keep",
    };
  }
  if (key.startsWith("sdk:development:preview-instance:v1:")) {
    return {
      classification: "sdk-portal-development",
      targetKey: key,
      automatic: false,
      disposition: "keep",
    };
  }
  if (key.startsWith("preview-dev:")) {
    return {
      classification: "preview-development",
      targetKey: key,
      automatic: false,
      disposition: "keep",
    };
  }
  if (key.startsWith("sdk:production:preview-instance:v1:")) {
    return {
      classification: "sdk-portal-production",
      targetKey: key,
      automatic: false,
      disposition: "manual",
    };
  }
  if (key.startsWith("sdk:preview-instance:v1:")) {
    return {
      classification: "sdk-portal-development-legacy",
      targetKey: key.replace(/^sdk:preview-instance:v1:/, "sdk:development:preview-instance:v1:"),
      automatic: true,
      disposition: "copy",
    };
  }
  if (key.startsWith("game-sdk-runtime:v2:development:") || key.startsWith("rate-limit:v2:development:")) {
    return {
      classification: "platform-development-unprefixed",
      targetKey: `app-dev:${key}`,
      automatic: true,
      disposition: "copy",
    };
  }
  if (key === "online-room:events:v1") {
    return {
      classification: "realtime-stream-legacy-ambiguous",
      targetKey: "app-dev:online-room:events:v1",
      automatic: false,
      disposition: "manual",
    };
  }
  if (key.startsWith("game-sdk-runtime:v2:production:") || key.startsWith("rate-limit:v2:production:")) {
    return {
      classification: "platform-production",
      targetKey: key,
      automatic: false,
      disposition: "manual",
    };
  }
  return {
    classification: "unknown",
    targetKey: null,
    automatic: false,
    disposition: "manual",
  };
}
