import {
  auditUserReportStorage,
  inspectUserReportStorage,
  safeUserReportStorageAudit,
  safeUserReportStorageInspection,
} from "../lib/user-report-storage-audit.ts";
import { createUserReportRepairDryRun } from "../lib/user-report-repair-plan.ts";
import { expectedAppEnvironment } from "../lib/storage-environment-guard.ts";

type AuditEnvironment = "production" | "development";

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requestedEnvironment(): AuditEnvironment {
  const value = argumentValue("--environment");
  if (value === "production" || value === "development") return value;
  throw new Error("USER_REPORT_AUDIT_ENVIRONMENT_REQUIRED");
}

function assertReadOnlyAuditEnvironment(environment: AuditEnvironment) {
  if (
    process.env.APP_ENV !== environment
    || process.env.REDIS_ENV !== environment
    || expectedAppEnvironment() !== environment
  ) {
    throw new Error("USER_REPORT_AUDIT_ENVIRONMENT_MISMATCH");
  }
}

function assertArguments() {
  const allowed = new Set(["--environment", "--report-id"]);
  for (let index = 2; index < process.argv.length; index += 2) {
    const name = process.argv[index];
    if (!allowed.has(name) || process.argv[index + 1] === undefined) {
      throw new Error("USER_REPORT_AUDIT_ARGUMENT_INVALID");
    }
  }
}

async function main() {
  assertArguments();
  const environment = requestedEnvironment();
  assertReadOnlyAuditEnvironment(environment);
  const reportId = argumentValue("--report-id")?.trim();
  if (reportId) {
    const inspection = await inspectUserReportStorage(reportId);
    console.log(JSON.stringify({
      schemaVersion: 1,
      mode: "read-only",
      environment,
      writesPerformed: 0,
      lookup: safeUserReportStorageInspection(inspection),
    }, null, 2));
    return;
  }
  const audit = await auditUserReportStorage({ includeTtl: true });
  console.log(JSON.stringify({
    schemaVersion: 1,
    mode: "read-only",
    environment,
    writesPerformed: 0,
    audit: safeUserReportStorageAudit(audit),
    repairDryRun: createUserReportRepairDryRun(environment, audit),
  }, null, 2));
}

main().catch((error) => {
  const code = error instanceof Error
    ? error.message
    : "USER_REPORT_AUDIT_FAILED";
  console.error(JSON.stringify({
    schemaVersion: 1,
    mode: "read-only",
    writesPerformed: 0,
    error: code,
  }));
  process.exitCode = 1;
});
