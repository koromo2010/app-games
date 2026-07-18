import type { Metadata } from "next";
import { SiteAdminPanel } from "./SiteAdminPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "サイト管理", robots: { index: false, follow: false, nocache: true } };

export default function SiteAdminPage() {
  const showPreviewVocabularyMigrations = process.env.VERCEL_ENV === "preview"
    && process.env.APP_ENV === "development";
  return <SiteAdminPanel showPreviewVocabularyMigrations={showPreviewVocabularyMigrations} />;
}
