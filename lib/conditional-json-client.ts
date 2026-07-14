type ConditionalJsonResult<T> = {
  data: T | null;
  notModified: boolean;
  ok: boolean;
  status: number;
};

type CacheEntry = {
  data: unknown;
  etag: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const maximumEntries = 100;
const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ConditionalJsonResult<unknown>>>();

function remember(url: string, entry: CacheEntry) {
  responseCache.delete(url);
  responseCache.set(url, entry);
  while (responseCache.size > maximumEntries) {
    const oldest = responseCache.keys().next().value;
    if (typeof oldest !== "string") break;
    responseCache.delete(oldest);
  }
}

async function requestConditionalJson<T>(url: string, fetcher: Fetcher): Promise<ConditionalJsonResult<T>> {
  const cached = responseCache.get(url);
  const headers = new Headers();
  if (cached?.etag) headers.set("If-None-Match", cached.etag);
  const response = await fetcher(url, { cache: "no-store", headers });

  if (response.status === 304 && cached) {
    return { data: cached.data as T, notModified: true, ok: true, status: 304 };
  }

  const data = await response.json().catch(() => null) as T | null;
  const etag = response.headers.get("etag");
  if (response.ok && data !== null && etag) remember(url, { data, etag });
  if (response.status === 404) responseCache.delete(url);
  return { data, notModified: false, ok: response.ok, status: response.status };
}

/** Reuses unchanged JSON and coalesces overlapping polls for the same URL. */
export function fetchConditionalJson<T>(url: string, fetcher: Fetcher = fetch) {
  const pending = inFlight.get(url);
  if (pending) return pending as Promise<ConditionalJsonResult<T>>;

  const request = requestConditionalJson<T>(url, fetcher);
  inFlight.set(url, request as Promise<ConditionalJsonResult<unknown>>);
  return request.finally(() => {
    if (inFlight.get(url) === request) inFlight.delete(url);
  });
}

export function clearConditionalJsonClientCache() {
  responseCache.clear();
  inFlight.clear();
}
