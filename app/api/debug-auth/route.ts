export async function POST(request: Request) {
  const configuredPassword = process.env.DEBUG_MODE_PASSWORD?.trim();

  if (!configuredPassword) {
    return Response.json(
      { error: "DEBUG_MODE_PASSWORD is not configured." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (password !== configuredPassword) {
    return Response.json({ error: "Invalid password." }, { status: 401 });
  }

  return Response.json({ ok: true });
}
