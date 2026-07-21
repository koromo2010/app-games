import { PreviewInstance } from "./preview-instance";
import { listCreatorGames, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";

export default async function PreviewInstancePage({ params }: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  const slug = normalizeInstanceSlug(instanceId);
  const games = validateInstanceSlug(slug)
    ? []
    : await listCreatorGames(slug).catch(() => []);
  return <PreviewInstance instanceId={slug || instanceId} games={games} />;
}
