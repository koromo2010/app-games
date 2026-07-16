import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/users/me", "/reset-password"] }, sitemap: "https://www.game-fields.com/sitemap.xml" }; }
