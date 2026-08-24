const headers = { "Cache-Control": "private, no-store" };

export async function POST() {
  return Response.json({ error: "CREATOR_RECOVERY_ROUTE_RETIRED" }, { status: 410, headers });
}
