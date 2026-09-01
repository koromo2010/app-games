import {
  developmentRoomFixtureEnvironmentAvailable,
  normalizeDevelopmentRoomFixtureOperationId,
  parseDevelopmentRoomFixtureRequest,
} from "./development-room-fixture-contract.ts";

type FixtureOperator = {
  materialize(input: {
    creatorSlug: string;
    playerId: string;
    operationId: string;
    request: Request;
  }): Promise<unknown>;
  status(input: {
    creatorSlug: string;
    playerId: string;
    operationId: string;
  }): Promise<unknown | null>;
  cleanup(input: {
    creatorSlug: string;
    playerId: string;
    operationId: string;
  }): Promise<unknown>;
};

export type DevelopmentRoomFixtureRouteDependencies = {
  environmentAvailable: () => boolean;
  authenticate: (creatorSlug: string) => Promise<string | null>;
  ownsCreator: (creatorSlug: string, playerId: string) => Promise<boolean>;
  createOperator: (playerId: string) => FixtureOperator;
};

type RouteMethod = "GET" | "POST" | "DELETE";

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function statusForError(code: string) {
  if (code === "PLAYER_AUTH_REQUIRED") return 401;
  if (code === "DEVELOPMENT_ROOM_FIXTURE_FORBIDDEN") return 403;
  if (code === "DEVELOPMENT_ROOM_FIXTURE_NOT_FOUND") return 404;
  if (
    code === "DEVELOPMENT_ROOM_FIXTURE_OPERATION_IN_PROGRESS"
    || code === "DEVELOPMENT_ROOM_FIXTURE_CLEANUP_STATE_INVALID"
  ) return 409;
  if (
    code === "DEVELOPMENT_ROOM_FIXTURE_REQUEST_INVALID"
    || code === "DEVELOPMENT_ROOM_FIXTURE_OPERATION_ID_INVALID"
  ) return 400;
  if (
    code === "PLAYER_SESSION_SECRET_NOT_CONFIGURED"
    || code === "SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED"
  ) return 503;
  return 500;
}

export async function handleDevelopmentRoomFixtureRoute(input: {
  request: Request;
  creatorSlug: string;
  method: RouteMethod;
  dependencies: DevelopmentRoomFixtureRouteDependencies;
}) {
  // This is deliberately the first observable gate. Production must not expose
  // authentication, ownership, Redis, or scenario behavior for this endpoint.
  if (!input.dependencies.environmentAvailable()) {
    return json({ error: "NOT_FOUND" }, 404);
  }
  const creatorSlug = input.creatorSlug.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(creatorSlug)) {
    return json({ error: "DEVELOPMENT_ROOM_FIXTURE_REQUEST_INVALID" }, 400);
  }
  try {
    const playerId = await input.dependencies.authenticate(creatorSlug);
    if (!playerId) throw new Error("PLAYER_AUTH_REQUIRED");
    if (!await input.dependencies.ownsCreator(creatorSlug, playerId)) {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_FORBIDDEN");
    }
    const operationId = input.method === "GET"
      ? normalizeDevelopmentRoomFixtureOperationId(
        new URL(input.request.url).searchParams.get("operationId"),
      )
      : parseDevelopmentRoomFixtureRequest(
        await input.request.json().catch(() => null),
      ).operationId;
    const operator = input.dependencies.createOperator(playerId);
    if (input.method === "POST") {
      return json({ receipt: await operator.materialize({
        creatorSlug,
        playerId,
        operationId,
        request: input.request,
      }) });
    }
    if (input.method === "DELETE") {
      return json({ receipt: await operator.cleanup({
        creatorSlug,
        playerId,
        operationId,
      }) });
    }
    const receipt = await operator.status({ creatorSlug, playerId, operationId });
    return receipt ? json({ receipt }) : json({ error: "DEVELOPMENT_ROOM_FIXTURE_NOT_FOUND" }, 404);
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z0-9_]{2,99}$/.test(error.message)
      ? error.message
      : "DEVELOPMENT_ROOM_FIXTURE_FAILED";
    return json({ error: code }, statusForError(code));
  }
}

export const defaultDevelopmentRoomFixtureRouteGate =
  developmentRoomFixtureEnvironmentAvailable;
