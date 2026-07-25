import type { Metadata } from "next";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";
import { SiteAdminPanel } from "./SiteAdminPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "サイト管理", robots: { index: false, follow: false, nocache: true } };

export default function SiteAdminPage() {
  const showPreviewVocabularyMigrations = expectedAppEnvironment() === "development"
    && process.env.APP_ENV === "development";
  const showReleaseManagement = expectedAppEnvironment() === "production"
    && process.env.VERCEL_GIT_COMMIT_REF === "main";
  return <SiteAdminPanel
    showPreviewVocabularyMigrations={showPreviewVocabularyMigrations}
    showReleaseManagement={showReleaseManagement}
  />;
}
