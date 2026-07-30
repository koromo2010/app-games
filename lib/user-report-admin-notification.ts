import { sendSupportAdminNotificationEmail } from "@/lib/email";
import { observabilityErrorCode } from "@/lib/observability";
import {
  updateUserReportNotificationStatus,
} from "@/lib/user-report-store";
import type { UserReport } from "@/lib/user-report-core";

const reportTypeLabels = {
  bug: "バグ報告",
  request: "改善要望",
} as const;

function latestRequesterBody(report: UserReport) {
  return report.messages.findLast((message) => message.author === "requester")
    ?.body
    ?? report.details
    ?? report.summary;
}

export async function deliverUserReportAdminNotification(
  report: UserReport,
  input: {
    idempotencyKey: string;
    body?: string;
  },
) {
  let deliveryStatus: "sent" | "failed" = "sent";
  let errorCode: string | null = null;
  try {
    await sendSupportAdminNotificationEmail({
      reference: {
        kind: "report",
        id: report.id,
      },
      title: input.body
        ? "報告者からの追記"
        : `新しい${reportTypeLabels[report.type]}`,
      lines: [
        `種別: ${reportTypeLabels[report.type]}`,
        `概要: ${report.summary}`,
        `対象ページ: ${report.page || "未入力"}`,
        "",
        input.body ?? latestRequesterBody(report),
      ],
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    deliveryStatus = "failed";
    errorCode = observabilityErrorCode(error);
  }
  const updated = await updateUserReportNotificationStatus(
    report.id,
    deliveryStatus,
    errorCode,
  );
  return {
    report: updated,
    deliveryStatus,
    errorCode,
  };
}
