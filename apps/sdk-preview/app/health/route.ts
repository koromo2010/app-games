export function GET() {
  return Response.json(
    { ok: true, service: "game-fields-sdk-preview" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
