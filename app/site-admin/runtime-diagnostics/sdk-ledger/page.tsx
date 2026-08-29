import type { Metadata } from "next";
import { loadSdkMigration011DiagnosticPage } from "@/lib/sdk-migration-011-diagnostic-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Development SDK ledger diagnostic",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SdkLedgerDiagnosticPage() {
  const model = await loadSdkMigration011DiagnosticPage();
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <section className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
          Game Fields Site Admin
        </p>
        <h1 className="mt-2 text-2xl font-black">Development SDK ledger diagnostic</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          This server-rendered result is fixed to the Development migration 011 ledger diagnostic.
        </p>
        <pre
          aria-label="Development SDK ledger diagnostic result"
          className="mt-6 max-h-[70vh] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-xs leading-5 text-slate-100"
        >
          {model.serializedPayload}
        </pre>
      </section>
    </main>
  );
}
