import { revokeOAuthToken } from "@/lib/oauth-store";

export async function POST(request: Request) {
  const form = await request.formData();
  const value = String(form.get("token") ?? "");
  if (value) await revokeOAuthToken(value);
  return new Response(null, { status: 200 });
}
