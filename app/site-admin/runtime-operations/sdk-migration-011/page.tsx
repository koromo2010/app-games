import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRecentSiteAdminMfa } from "@/lib/site-admin-auth";
import { requireSdkMigration011PageAccess } from "@/lib/sdk-migration-011-page-access";
import { SdkMigration011OperatorPanel } from "./SdkMigration011OperatorPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Development migration 011",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SdkMigration011OperatorPage() {
  try {
    await requireSdkMigration011PageAccess({
      runtimeIdentity: () => ({
        semanticEnvironment: process.env.APP_ENV,
        vercelEnvironment: process.env.VERCEL_ENV,
        project: process.env.VERCEL_PROJECT_NAME,
        ref: process.env.VERCEL_GIT_COMMIT_REF,
      }),
      requireRecentMfa: async () => { await requireRecentSiteAdminMfa(); },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DEVELOPMENT_RUNTIME_REQUIRED") notFound();
    redirect("/admin");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Game Fields Site Admin</p>
          <h1 className="mt-2 text-3xl font-black">Development migration 011</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            通常のパスワードログインとAuthenticator確認後に使う、Development専用の運用画面です。
          </p>
        </header>
        <SdkMigration011OperatorPanel />
      </div>
    </main>
  );
}
