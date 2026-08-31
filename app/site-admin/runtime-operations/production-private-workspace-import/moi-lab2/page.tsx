import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppLink as Link } from "@/app/components/AppLink";
import { productionPrivateWorkspaceImportTargetSpec } from "@/apps/sdk-portal/lib/production-private-workspace-import-public-contract";
import {
  productionPrivateWorkspaceImportPageMode,
  requireProductionPrivateWorkspaceImportPageAccess,
} from "@/lib/production-private-workspace-import-page-access";
import { requireFullSiteAdminSession } from "@/lib/site-admin-auth";
import { isRecentSiteAdminMfa } from "@/lib/site-admin-auth-core";
import { ProductionPrivateWorkspaceImportPanel } from "./ProductionPrivateWorkspaceImportPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Production private workspace import preparation",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ProductionPrivateWorkspaceImportPage() {
  const mode = productionPrivateWorkspaceImportPageMode({
    semanticEnvironment: process.env.APP_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
    project: process.env.VERCEL_PROJECT_NAME,
    ref: process.env.VERCEL_GIT_COMMIT_REF,
  });
  if (!mode) notFound();
  let access;
  try {
    access = await requireProductionPrivateWorkspaceImportPageAccess(mode, async () => {
      const session = await requireFullSiteAdminSession();
      return { recentMfa: isRecentSiteAdminMfa(session) };
    });
  } catch (error) {
    if (error instanceof Error && (
      error.message === "SITE_ADMIN_AUTH_REQUIRED"
      || error.message === "SITE_ADMIN_FULL_AUTH_REQUIRED"
    )) redirect("/admin");
    throw error;
  }
  const sourceCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-300">Game Fields Site Admin</p>
          <h1 className="mt-2 text-3xl font-black">Production private import: moi-lab2</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {mode === "preparation"
              ? "Development上のupload-free準備画面です。bundleはブラウザ内だけで検証され、ProductionにもDevelopmentにも送信されません。"
              : "Production専用のsingle-use import画面です。承認済みidentity以外は送信しないでください。"}
          </p>
          <p className="mt-2 text-sm text-slate-400">expected {productionPrivateWorkspaceImportTargetSpec.bundleBytes} bytes / 2 games</p>
          <p data-production-private-import-source={sourceCommit} className="mt-2 break-all font-mono text-xs text-slate-500">source {sourceCommit}</p>
        </header>
        <ProductionPrivateWorkspaceImportPanel mode={mode} initialAccess={access} />
        <Link href="/admin" className="inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/10">Site Adminへ戻る</Link>
      </div>
    </main>
  );
}
