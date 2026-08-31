import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppLink as Link } from "@/app/components/AppLink";
import { developmentPrivateWorkspaceImportTargetSpecs } from "@/apps/sdk-portal/lib/development-private-workspace-import-public-contract";
import { requireFullSiteAdminSession } from "@/lib/site-admin-auth";
import { isCanonicalDevelopmentPlatformRuntime } from "@/lib/sdk-migration-011-proxy";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Development private workspace import",
  robots: { index: false, follow: false, nocache: true },
};

export default async function DevelopmentPrivateWorkspaceImportIndexPage() {
  if (!isCanonicalDevelopmentPlatformRuntime({
    semanticEnvironment: process.env.APP_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
    project: process.env.VERCEL_PROJECT_NAME,
    ref: process.env.VERCEL_GIT_COMMIT_REF,
  })) notFound();
  try {
    await requireFullSiteAdminSession();
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
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Game Fields Site Admin</p>
          <h1 className="mt-2 text-3xl font-black">Development private workspace import</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">復元済みbundleをtargetごとに独立したprivate・quarantined・unbound workspaceへ取り込む通常UIです。</p>
          <p data-development-private-import-source={sourceCommit} className="mt-2 break-all font-mono text-xs text-slate-500">source {sourceCommit}</p>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          {Object.values(developmentPrivateWorkspaceImportTargetSpecs).map((spec) => (
            <Link
              key={spec.target}
              href={`/site-admin/runtime-operations/development-private-workspace-import/${spec.target}`}
              className="rounded-2xl border border-white/10 bg-slate-900 p-5 transition hover:border-cyan-300/40 hover:bg-slate-800"
            >
              <h2 className="text-lg font-black text-cyan-100">{spec.target}</h2>
              <p className="mt-2 text-sm text-slate-300">{spec.bundleBytes} bytes / {spec.gameCount} games</p>
              <p className="mt-3 break-all font-mono text-[11px] leading-5 text-slate-500">{spec.bundleSha256}</p>
            </Link>
          ))}
        </section>
        <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50">File選択とclient-side確認だけではHostedへ送信しません。各targetのplan操作からbundle transferが始まります。</p>
        <Link href="/admin" className="inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/10">Site Adminへ戻る</Link>
      </div>
    </main>
  );
}
