import {
  loginPlayerAccount,
  registerPlayerAccount,
  type PlayerAccountAuthInput,
} from "@/lib/player-account-store";

type PlayerAccountRequest = PlayerAccountAuthInput & {
  mode?: "login" | "register";
};

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

function statusForError(error: unknown) {
  if (!(error instanceof Error)) return { code: "UNKNOWN", status: 500 };

  switch (error.message) {
    case "PLAYER_ACCOUNT_NAME_REQUIRED":
      return { code: "NAME_REQUIRED", status: 400 };
    case "PLAYER_ACCOUNT_PASSWORD_INVALID":
      return { code: "PASSWORD_INVALID", status: 400 };
    case "PLAYER_ACCOUNT_ALREADY_EXISTS":
      return { code: "ALREADY_EXISTS", status: 409 };
    case "PLAYER_ACCOUNT_INVALID_CREDENTIALS":
      return { code: "INVALID_CREDENTIALS", status: 401 };
    default:
      return { code: "UNKNOWN", status: 500 };
  }
}

export async function POST(request: Request) {
  let body: PlayerAccountRequest;

  try {
    body = (await request.json()) as PlayerAccountRequest;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    const session = body.mode === "register"
      ? await registerPlayerAccount(body)
      : await loginPlayerAccount(body);

    return Response.json({ session });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "STORE_NOT_CONFIGURED" }, { status: 503 });
    }

    const mapped = statusForError(error);
    return Response.json({ error: mapped.code }, { status: mapped.status });
  }
}
