import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/app/components/SiteFooter";
import { WebVitalsReporter } from "@/app/components/WebVitalsReporter";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { AppLocaleProvider } from "@/app/components/AppLocaleProvider";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSiteSettings();
  return {
    metadataBase: new URL("https://www.game-fields.com"),
    applicationName: settings.siteName,
    title: { default: settings.searchTitle, template: `%s | ${settings.siteName}` },
    description: settings.searchDescription,
    icons: { icon: "/site-icon", shortcut: "/site-icon", apple: "/site-icon" },
    openGraph: { type: "website", locale: "ja_JP", siteName: settings.siteName, title: settings.searchTitle, description: settings.searchDescription },
    twitter: { card: "summary_large_image", title: settings.searchTitle, description: settings.searchDescription },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await loadSiteSettings();
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><AppLocaleProvider>{children}<SiteFooter siteName={settings.siteName} /></AppLocaleProvider><WebVitalsReporter /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: settings.siteName, alternateName: "ゲームフィールド", url: "https://www.game-fields.com/", description: settings.searchDescription }) }} /></body>
    </html>
  );
}
