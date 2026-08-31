import type { Metadata } from "next";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";
import { productionPrivateWorkspaceImportPageMode } from "@/lib/production-private-workspace-import-page-access";
import { SiteAdminPanel } from "./SiteAdminPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "サイト管理", robots: { index: false, follow: false, nocache: true } };

export default function SiteAdminPage() {
  const appEnvironment = expectedAppEnvironment();
  const showPreviewVocabularyMigrations = appEnvironment === "development"
    && process.env.APP_ENV === "development";
  const releaseManagementMode = appEnvironment === "production"
    && process.env.VERCEL_GIT_COMMIT_REF === "main"
    ? "live"
    : appEnvironment === "development"
      && process.env.VERCEL_GIT_COMMIT_REF === "develop"
      ? "preview"
      : null;
  const showOriginalDataPreservation = appEnvironment === "production"
    && process.env.APP_ENV === "production"
    && process.env.VERCEL_ENV === "production"
    && process.env.VERCEL_GIT_COMMIT_REF === "main";
  const showProductionPrivateWorkspaceImport = productionPrivateWorkspaceImportPageMode({
    semanticEnvironment: process.env.APP_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
    project: process.env.VERCEL_PROJECT_NAME,
    ref: process.env.VERCEL_GIT_COMMIT_REF,
  }) !== null;
  return <SiteAdminPanel
    showPreviewVocabularyMigrations={showPreviewVocabularyMigrations}
    releaseManagementMode={releaseManagementMode}
    showOriginalDataPreservation={showOriginalDataPreservation}
    showProductionPrivateWorkspaceImport={showProductionPrivateWorkspaceImport}
  />;
}
