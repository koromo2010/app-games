import { loadSiteSettings } from "@/lib/site-settings-store";

export const dynamic = "force-dynamic";

const defaultIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#06b6d4"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="#020617"/><path d="M25 34h46a14 14 0 0 1 13 18l-7 23a9 9 0 0 1-15 4L54 70H42l-8 9a9 9 0 0 1-15-4l-7-23a14 14 0 0 1 13-18Z" fill="url(#g)"/><path d="M30 47v16M22 55h16M63 51h1M72 60h1" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>`;

export async function GET() {
  const settings = await loadSiteSettings();
  if (settings.iconUrl) return Response.redirect(settings.iconUrl, 307);
  return new Response(defaultIcon, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
