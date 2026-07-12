import {
  completePlayerPasswordReset,
  requestPlayerPasswordReset,
} from "@/lib/player-password-reset";

type ResetRequest = {
  action?: "request" | "complete";
  email?: unknown;
  token?: unknown;
  password?: unknown;
};

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function POST(request: Request) {
  let body: ResetRequest;
  try {
    body = (await request.json()) as ResetRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    if (body.action === "complete") {
      await completePlayerPasswordReset(
        typeof body.token === "string" ? body.token : "",
        typeof body.password === "string" ? body.password : "",
      );
      return Response.json({ ok: true });
    }

    const origin = new URL(request.url).origin;
    await requestPlayerPasswordReset(typeof body.email === "string" ? body.email : "", origin);
    return Response.json({ ok: true });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "STORE_NOT_CONFIGURED" }, { status: 503 });
    }
    if (error instanceof Error && error.message === "PLAYER_ACCOUNT_PASSWORD_INVALID") {
      return Response.json({ error: "PASSWORD_INVALID" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "PLAYER_ACCOUNT_RESET_INVALID") {
      return Response.json({ error: "RESET_INVALID" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "EMAIL_SERVICE_NOT_CONFIGURED") {
      return Response.json({ error: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
    }
    return Response.json({ error: "UNKNOWN" }, { status: 500 });
  }
}
