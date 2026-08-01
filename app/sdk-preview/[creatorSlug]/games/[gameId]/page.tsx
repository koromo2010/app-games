import { notFound } from "next/navigation";
import { SdkPreviewGameShell } from "./SdkPreviewGameShell";
import { GameSdkFrame } from "@/app/components/GameSdkFrame";
import {
  normalizeGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import {
  loadSdkPreviewRuntimeDefinition,
} from "@/lib/sdk-preview-runtime-source";
import { SdkPreviewSessionGate } from "@/app/sdk-preview/SdkPreviewSessionGate";
import { sdkPreviewPackageRuntimeId } from "@/lib/sdk-preview-package-runtime";

export const dynamic = "force-dynamic";
const REVISION_PATTERN = /^[a-f0-9]{40}$/;

function CandidatePreviewUnavailable({ portalHref }: { portalHref: string }) {
  return <main className="mx-auto max-w-3xl px-4 py-12">
    <section className="rounded-2xl border border-red-300 bg-red-50 p-6 text-slate-950 shadow-sm">
      <p className="text-sm font-black uppercase tracking-wide text-red-700">Candidate Preview unavailable</p>
      <h1 className="mt-2 text-2xl font-black">検査済みPackageをPreviewできません</h1>
      <p className="mt-3 leading-7">
        指定されたPackage revisionを取得できませんでした。旧モックには切り替えていません。
        SDK Portalへ戻ってrevisionを確認し、同じPackageで再試行してください。
      </p>
      <p className="mt-3 font-mono text-sm text-red-800">SDK_PREVIEW_CANDIDATE_PACKAGE_NOT_AVAILABLE</p>
      <a className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-3 font-bold text-white" href={portalHref}>
        SDK Portalへ戻る
      </a>
    </section>
  </main>;
}

export default async function SdkGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ creatorSlug: string; gameId: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  const { creatorSlug, gameId } = await params;
  const query = await searchParams;
  const revision = query.revision?.trim() ?? "";
  if (revision && !REVISION_PATTERN.test(revision)) notFound();

  const portalBaseUrl = process.env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main"
      ? "https://sdk.game-fields.com"
      : "https://sdk-dev.game-fields.com");
  const portalHref = `${portalBaseUrl}/${creatorSlug}/games/${gameId}${
    revision ? `?revision=${encodeURIComponent(revision)}` : ""
  }`;
  const game = await loadSdkPreviewRuntimeDefinition(
    creatorSlug,
    gameId,
    fetch,
    process.env,
    revision || undefined,
  ).catch(() => null);

  if (!game) {
    if (revision) {
      return <SdkPreviewSessionGate creatorSlug={creatorSlug} portalHref={portalHref}>
        <CandidatePreviewUnavailable portalHref={portalHref} />
      </SdkPreviewSessionGate>;
    }
    notFound();
  }

  if (revision && (
    game.runtimeKind !== "package"
    || game.revision !== revision
    || !game.manifest
  )) {
    return <SdkPreviewSessionGate creatorSlug={creatorSlug} portalHref={portalHref}>
      <CandidatePreviewUnavailable portalHref={portalHref} />
    </SdkPreviewSessionGate>;
  }

  return (
    <SdkPreviewSessionGate
      creatorSlug={creatorSlug}
      portalHref={portalHref}
    >
      {game.runtimeKind === "package" && game.revision && game.manifest ? (
        <GameSdkFrame
          backHref={`/sdk-preview/${creatorSlug}`}
          creatorSlug={creatorSlug}
          endpoint={`/api/sdk-preview/${encodeURIComponent(
            creatorSlug,
          )}/games/${encodeURIComponent(
            gameId,
          )}/rooms?revision=${encodeURIComponent(game.revision)}`}
          gameId={gameId}
          packageRevision={game.revision}
          runtimeId={sdkPreviewPackageRuntimeId(
            creatorSlug,
            gameId,
          )}
          runtimeUrl={`/api/sdk-preview/${encodeURIComponent(
            creatorSlug,
          )}/games/${encodeURIComponent(
            gameId,
          )}/client-runtime?revision=${encodeURIComponent(game.revision)}`}
          title={game.title}
          settingDefinitions={game.settings}
          rules={(game.manifest.rules ?? []).map((rule) => rule.ja)}
          moduleProfile={normalizeGameSdkModuleProfile(game.modulePolicy)}
          supportsReplay={game.manifest.supportsReplay}
          supportsSpectators={game.manifest.supportsSpectators}
          usesLlm={game.manifest.usesLlm}
        />
      ) : (
        <SdkPreviewGameShell
          backHref={`/sdk-preview/${creatorSlug}`}
          creatorSlug={creatorSlug}
          gameId={gameId}
          runtimeUrl={game.runtimeUrl}
          title={game.title}
          moduleProfile={normalizeGameSdkModuleProfile(game.modulePolicy)}
          settingDefinitions={game.settings}
        />
      )}
    </SdkPreviewSessionGate>
  );
}
