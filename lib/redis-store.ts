type RedisResponse<T> = {
  result: T;
  error?: string;
};

export function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  return {
    url: url.replace(/\/$/, ""),
    token,
  };
}

export async function redisCommand<T>(command: unknown[]) {
  const config = getRedisConfig();
  if (!config) {
    throw new Error("REDIS_STORE_NOT_CONFIGURED");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`REDIS_STORE_REQUEST_FAILED_${response.status}`);
  }

  const data = (await response.json()) as RedisResponse<T>;
  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
}
