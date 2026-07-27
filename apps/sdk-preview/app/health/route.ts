export function GET() {
  return Response.json(
    {
      ok: true,
      service: "game-fields-sdk-preview",
      channel: process.env.VERCEL_GIT_COMMIT_REF === "main"
        ? "main"
        : "development",
      grantVersion: 4,
      grantVerification: "ed25519",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
