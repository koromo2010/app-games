import { NextResponse } from "next/server";
import { deleteExpiredUnverifiedPlayerAccounts } from "@/lib/player-account-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return NextResponse.json(await deleteExpiredUnverifiedPlayerAccounts());
}
