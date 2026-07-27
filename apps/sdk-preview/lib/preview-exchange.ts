import {
  previewExchangeContentSecurityPolicy,
} from "./preview-security";

const MAX_EXCHANGE_REQUEST_BYTES = 4 * 1024;

const exchangePage = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Game Fields</title>
</head>
<body>
  <p id="status">ゲームを準備しています…</p>
  <script>
    (() => {
      const status = document.getElementById("status");
      const fragment = new URLSearchParams(location.hash.slice(1));
      const token = fragment.get("token") || "";
      history.replaceState(null, "", location.pathname);
      if (!token) {
        status.textContent = "このゲームリンクは無効です。";
        return;
      }
      try {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = location.href;
        form.enctype = "application/x-www-form-urlencoded";
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "token";
        input.value = token;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      } catch {
        status.textContent = "ゲームを開けませんでした。ページを戻って、もう一度お試しください。";
      }
    })();
  </script>
</body>
</html>`;

export function previewExchangePageResponse(requestUrl: string) {
  const exchangeOrigin = new URL(requestUrl).origin;
  return new Response(exchangePage, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": previewExchangeContentSecurityPolicy(exchangeOrigin),
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function readPreviewExchangeToken(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    !Number.isFinite(declaredLength)
    || declaredLength < 0
    || declaredLength > MAX_EXCHANGE_REQUEST_BYTES
  ) {
    return null;
  }
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_EXCHANGE_REQUEST_BYTES) {
      return null;
    }
    const contentType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded") return null;
    const payload = new URLSearchParams(body);
    const tokens = payload.getAll("token");
    return tokens.length === 1 && tokens[0] ? tokens[0] : null;
  } catch {
    return null;
  }
}
