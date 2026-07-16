import { list } from "@vercel/blob";
import { resolveAvatarBlobToken } from "@/lib/avatar-image-server";
import { sendOperationsAlertEmail } from "@/lib/email";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
import { getRedisConfig, redisCommand } from "@/lib/redis-store";

export type StorageService = "Neon Postgres" | "Upstash Redis" | "Vercel Blob";
export type StorageUsageResult = { service: StorageService; usedBytes: number; capacityBytes: number | null; percent: number | null };
export type StorageCapacityResult = StorageUsageResult & { capacityBytes: number; percent: number };

const storageServices = ["Neon Postgres", "Upstash Redis", "Vercel Blob"] as const satisfies readonly StorageService[];
const adminStorageCacheMs = 5 * 60 * 1_000;
let adminStorageCache: { expiresAt: number; snapshot: StorageUsageSnapshot } | null = null;

function capacity(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function percent(usedBytes: number, capacityBytes: number) {
  return Math.round((usedBytes / capacityBytes) * 1000) / 10;
}

function usage(service: StorageService, usedBytes: number, capacityBytes: number): StorageUsageResult {
  return { service, usedBytes, capacityBytes: capacityBytes || null, percent: capacityBytes ? percent(usedBytes, capacityBytes) : null };
}

async function postgresUsage() {
  if (!isPostgresConfigured()) return null;
  const capacityBytes = capacity("POSTGRES_CAPACITY_BYTES");
  const rows = await getPostgresClient()`select pg_database_size(current_database())::bigint::text as used_bytes` as { used_bytes: string }[];
  const usedBytes = Number(rows[0]?.used_bytes ?? 0);
  return usage("Neon Postgres", usedBytes, capacityBytes);
}

async function redisUsage() {
  if (!getRedisConfig()) return null;
  const capacityBytes = capacity("REDIS_CAPACITY_BYTES");
  const info = await redisCommand<string>(["INFO", "memory"]);
  const usedBytes = Number(info.match(/(?:^|\r?\n)used_memory:(\d+)/)?.[1] ?? 0);
  return usage("Upstash Redis", usedBytes, capacityBytes);
}

async function blobUsage() {
  const capacityBytes = capacity("BLOB_CAPACITY_BYTES");
  const token = resolveAvatarBlobToken(process.env).token;
  if (!token) return null;
  let cursor: string | undefined;
  let usedBytes = 0;
  do {
    const page = await list({ token, cursor, limit: 1000 });
    usedBytes += page.blobs.reduce((sum, blob) => sum + blob.size, 0);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return usage("Vercel Blob", usedBytes, capacityBytes);
}

export type StorageUsageSnapshot = {
  checkedAt: number;
  threshold: number;
  results: StorageUsageResult[];
  unavailable: StorageService[];
};

export async function collectStorageUsage(): Promise<StorageUsageSnapshot> {
  const settled = await Promise.allSettled([postgresUsage(), redisUsage(), blobUsage()]);
  const results = settled.flatMap((item) => item.status === "fulfilled" && item.value ? [item.value] : []) as StorageUsageResult[];
  const threshold = Math.max(1, Math.min(100, Number(process.env.STORAGE_ALERT_THRESHOLD_PERCENT) || 80));
  const available = new Set(results.map((item) => item.service));
  return { checkedAt: Date.now(), threshold, results, unavailable: storageServices.filter((service) => !available.has(service)) };
}

export async function loadAdminStorageUsage() {
  if (adminStorageCache && adminStorageCache.expiresAt > Date.now()) return adminStorageCache.snapshot;
  const snapshot = await collectStorageUsage();
  adminStorageCache = { snapshot, expiresAt: Date.now() + adminStorageCacheMs };
  return snapshot;
}

export async function checkStorageCapacity() {
  const usageSnapshot = await collectStorageUsage();
  const results = usageSnapshot.results.filter((item): item is StorageCapacityResult => item.capacityBytes !== null && item.percent !== null);
  const errors = usageSnapshot.unavailable.map((service) => `${service}: CHECK_UNAVAILABLE`);
  const threshold = usageSnapshot.threshold;
  const alerts = results.filter((item) => item.percent >= threshold);
  if (alerts.length > 0) {
    const alertKey = `operations:storage-alert:${new Date().toISOString().slice(0, 10)}`;
    let shouldSend = true;
    if (getRedisConfig()) {
      try {
        shouldSend = await redisCommand<"OK" | null>(["SET", alertKey, "1", "NX", "EX", "86400"]) === "OK";
      } catch {
        shouldSend = true;
      }
    }
    if (shouldSend) await sendOperationsAlertEmail({
      subject: "【Game Fields】ストレージ容量アラート",
      lines: [
        `設定した警告値 ${threshold}% を超えたストレージがあります。`,
        ...alerts.map((item) => `${item.service}: ${item.percent}%（${item.usedBytes.toLocaleString()} / ${item.capacityBytes.toLocaleString()} bytes）`),
      ],
    });
  }
  return { threshold, results, errors, alerted: alerts.map((item) => item.service) };
}
