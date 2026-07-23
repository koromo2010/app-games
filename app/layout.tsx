import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { SiteFooter } from "@/app/components/SiteFooter";
import { WebVitalsReporter } from "@/app/components/WebVitalsReporter";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { AppLocaleProvider } from "@/app/components/AppLocaleProvider";
import { RouteTransitionProvider } from "@/app/components/RouteTransitionProvider";
import { appLocaleDefinition, normalizeAppLocale } from "@/lib/app-locale";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSiteSettings();
  const requestHeaders = await headers();
  const locale = normalizeAppLocale(requestHeaders.get("x-app-locale"));
  return {
    metadataBase: new URL("https://www.game-fields.com"),
    applicationName: settings.siteName,
    title: { default: settings.searchTitle, template: `%s | ${settings.siteName}` },
    description: settings.searchDescription,
    icons: { icon: "/site-icon", shortcut: "/site-icon", apple: "/site-icon" },
    openGraph: { type: "website", locale: locale === "en" ? "en_US" : "ja_JP", siteName: settings.siteName, title: settings.searchTitle, description: settings.searchDescription },
    twitter: { card: "summary_large_image", title: settings.searchTitle, description: settings.searchDescription },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await loadSiteSettings();
  const requestHeaders = await headers();
  const locale = normalizeAppLocale(requestHeaders.get("x-app-locale"));
  const localeDefinition = appLocaleDefinition(locale);
  return (
    <html lang={localeDefinition.htmlLang} className="h-full antialiased">
      <body className="min-h-full flex flex-col"><AppLocaleProvider initialLocale={locale}><RouteTransitionProvider>{children}<SiteFooter siteName={settings.siteName} /></RouteTransitionProvider></AppLocaleProvider><WebVitalsReporter /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: settings.siteName, alternateName: "ゲームフィールド", url: `https://www.game-fields.com/${locale}`, inLanguage: localeDefinition.htmlLang, description: settings.searchDescription }) }} /></body>
    </html>
  );
}
