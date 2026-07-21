import { PreviewInstance } from "./preview-instance";

export default async function PreviewInstancePage({ params }: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  return <PreviewInstance instanceId={instanceId} />;
}
