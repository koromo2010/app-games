const safeBaseUrl = "https://sdk-portal.invalid";

export function normalizeAccountLinkReturnPath(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/";

  try {
    const parsed = new URL(candidate, safeBaseUrl);
    if (parsed.origin !== safeBaseUrl || !parsed.pathname.startsWith("/")) {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/";
  }
}
