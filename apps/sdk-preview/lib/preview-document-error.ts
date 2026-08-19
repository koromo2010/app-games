import type { PreviewAssetReferenceErrorCode } from "./preview-asset-rewriter.ts";

export function previewAssetReferenceFailureResponse(
  code: PreviewAssetReferenceErrorCode,
) {
  return new Response(
    `Preview document contains an unsupported asset reference (${code}).`,
    {
      status: 422,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Game-Fields-Preview-Error-Code": code,
      },
    },
  );
}
