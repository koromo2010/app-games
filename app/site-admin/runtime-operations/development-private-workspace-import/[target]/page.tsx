import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppLink as Link } from "@/app/components/AppLink";
import {
  developmentPrivateWorkspaceImportTargetSpecs,
  isDevelopmentPrivateWorkspaceImportTarget,
} from "@/apps/sdk-portal/lib/development-private-workspace-import-public-contract";
import {
  requireDevelopmentPrivateWorkspaceImportPageAccess,
  type DevelopmentPrivateWorkspaceImportPageAccess,
} from "@/lib/development-private-workspace-import-page-access";
import { requireFullSiteAdminSession } from "@/lib/site-admin-auth";
import { isRecentSiteAdminMfa } from "@/lib/site-admin-auth-core";
import { DevelopmentPrivateWorkspaceImportPanel } from "./DevelopmentPrivateWorkspaceImportPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Development private workspace import",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DevelopmentPrivateWorkspaceImportTargetPage({
  params,
}: {
  params: Promise<{ target: string }>;
}) {
  const { target } = await params;
  if (!isDevelopmentPrivateWorkspaceImportTarget(target)) notFound();
  let access: DevelopmentPrivateWorkspaceImportPageAccess;
  try {
    access = await requireDevelopmentPrivateWorkspaceImportPageAccess({
      runtimeIdentity: () => ({
        semanticEnvironment: process.env.APP_ENV,
        vercelEnvironment: process.env.VERCEL_ENV,
        project: process.env.VERCEL_PROJECT_NAME,
        ref: process.env.VERCEL_GIT_COMMIT_REF,
      }),
      requireFullSession: async () => {
        const session = await requireFullSiteAdminSession();
        return { recentMfa: isRecentSiteAdminMfa(session) };
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "DEVELOPMENT_RUNTIME_REQUIRED") notFound();
    if (error instanceof Error && (
      error.message === "SITE_ADMIN_AUTH_REQUIRED"
      || error.message === "SITE_ADMIN_FULL_AUTH_REQUIRED"
    )) redirect("/admin");
    throw error;
  }
  const spec = developmentPrivateWorkspaceImportTargetSpecs[target];
  const sourceCommit = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Game Fields Site Admin</p>
          <h1 className="mt-2 text-3xl font-black">Private workspace import: {target}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">固定target {target} / {spec.gameCount} games。別target、別bundle、receipt差替え、二重executeはfail-closedです。</p>
          <p data-development-private-import-source={sourceCommit} className="mt-2 break-all font-mono text-xs text-slate-500">source {sourceCommit}</p>
        </header>
        <DevelopmentPrivateWorkspaceImportPanel target={target} initialAccess={access} />
        <Link href="/site-admin/runtime-operations/development-private-workspace-import" className="inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/10">target一覧へ戻る</Link>
      </div>
    </main>
  );
}
