import { clearSdkAccountSession } from "@/lib/account-session";

export async function POST(request: Request) {
  await clearSdkAccountSession();
  return Response.redirect(new URL("/", request.url), 303);
}
