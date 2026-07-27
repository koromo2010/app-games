import {
  authenticateCreatorOwner,
  normalizeInstanceSlug,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import { verifyAccountLinkCode } from "@/lib/account-session";

export const dynamic = "force-dynamic";

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  try {
    const { instanceId: rawInstanceId } = await context.params;
    const instanceId = normalizeInstanceSlug(rawInstanceId);
    if (validateInstanceSlug(instanceId)) return json({ owner: false }, 404);

    const authorization = request.headers.get("authorization") ?? "";
    const proof = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    const account = proof
      ? verifyAccountLinkCode(proof, new URL(request.url).origin)
      : null;
    if (!account) return json({ owner: false }, 401);

    const creator = await authenticateCreatorOwner(
      instanceId,
      account.playerId,
    );
    return json({ owner: Boolean(creator) });
  } catch (error) {
    if (
      error instanceof Error
      && error.message === "SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED"
    ) {
      return json({ owner: false }, 503);
    }
    return json({ owner: false }, 500);
  }
}
