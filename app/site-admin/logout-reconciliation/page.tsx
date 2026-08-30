import type { Metadata } from "next";
import { SiteAdminPanel } from "@/app/admin/SiteAdminPanel";
import { getSiteAdminSession } from "@/lib/site-admin-auth";
import { isCanonicalDevelopmentPlatformRuntime } from "@/lib/sdk-migration-011-proxy";
import { expectedAppEnvironment } from "@/lib/storage-environment-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "ログアウト確認", robots: { index: false, follow: false, nocache: true } };

export default async function SiteAdminLogoutReconciliationPage() {
  let result: "LOGOUT_COMPLETE" | "SESSION_STILL_AUTHENTICATED" | "LOGOUT_RECONCILIATION_FAILED";
  try {
    const session = await getSiteAdminSession();
    result = session ? "SESSION_STILL_AUTHENTICATED" : "LOGOUT_COMPLETE";
  } catch {
    result = "LOGOUT_RECONCILIATION_FAILED";
  }

  if (result === "LOGOUT_RECONCILIATION_FAILED") {
    return <main
      data-site-admin-logout-result="LOGOUT_RECONCILIATION_FAILED"
      className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"
    >
      <section className="w-full max-w-lg rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6">
        <h1 className="text-xl font-black">ログアウト状態を確認できませんでした</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-amber-100">成功とは扱っていません。自動再試行は行いません。</p>
      </section>
    </main>;
  }

  const appEnvironment = expectedAppEnvironment();
  const releaseManagementMode = appEnvironment === "production"
    && process.env.VERCEL_GIT_COMMIT_REF === "main"
    ? "live"
    : appEnvironment === "development"
      && process.env.VERCEL_GIT_COMMIT_REF === "develop"
      ? "preview"
      : null;
  return <div data-site-admin-logout-result={result}>
    <SiteAdminPanel
      showPreviewVocabularyMigrations={appEnvironment === "development" && process.env.APP_ENV === "development"}
      releaseManagementMode={releaseManagementMode}
      showOriginalDataPreservation={appEnvironment === "production"
        && process.env.APP_ENV === "production"
        && process.env.VERCEL_ENV === "production"
        && process.env.VERCEL_GIT_COMMIT_REF === "main"}
      showDevelopmentMigration011Operator={isCanonicalDevelopmentPlatformRuntime({
        semanticEnvironment: process.env.APP_ENV,
        vercelEnvironment: process.env.VERCEL_ENV,
        project: process.env.VERCEL_PROJECT_NAME,
        ref: process.env.VERCEL_GIT_COMMIT_REF,
      })}
      initialLogoutResult={result}
      showInlineLocaleSwitcher={false}
    />
  </div>;
}
