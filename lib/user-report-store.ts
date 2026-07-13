import { randomUUID } from "node:crypto";
import { redisCommand } from "@/lib/redis-store";

export type UserReportType = "bug" | "request";

export async function saveUserReport(input: { type: UserReportType; summary: string; details: string; page: string; playerId: string }) {
  const now = Date.now();
  const report = { id: `report_${randomUUID()}`, ...input, createdAt: now };
  await redisCommand<number>([
    "EVAL",
    "redis.call('SET',KEYS[1],ARGV[1]); redis.call('LPUSH',KEYS[2],ARGV[2]); redis.call('LTRIM',KEYS[2],0,999); return 1",
    "2",
    `user-report:v1:${report.id}`,
    "user-reports:v1",
    JSON.stringify(report),
    report.id,
  ]);
  return { id: report.id, createdAt: report.createdAt };
}
