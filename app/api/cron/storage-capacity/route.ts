import { NextResponse } from "next/server";
import { checkStorageCapacity } from "@/lib/storage-capacity-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const result = await checkStorageCapacity();
  return NextResponse.json(result);
}
