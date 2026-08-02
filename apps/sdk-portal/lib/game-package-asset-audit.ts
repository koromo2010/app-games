import {
  assertGamePackageAssets,
  auditGamePackage,
  auditGamePackageAssets,
  auditGamePackageServerSource,
  GamePackageAssetValidationError,
  type GamePackageAssetAudit,
  type GamePackageAssetFinding,
  type GamePackageAudit,
  type GamePackageServerFinding,
} from "@game-fields/sdk-package-assets";
import type { PreparedUploadFile } from "./mock-git-store.ts";

export {
  GamePackageAssetValidationError,
  type GamePackageAssetAudit,
  type GamePackageAudit,
  type GamePackageAssetFinding,
  type GamePackageServerFinding,
  auditGamePackageAssets,
  auditGamePackageServerSource,
};

export function auditPreparedGamePackageAssets(
  files: readonly PreparedUploadFile[],
) {
  return auditGamePackage(files);
}

export function assertPreparedGamePackageAssets(
  files: readonly PreparedUploadFile[],
) {
  return assertGamePackageAssets(files);
}
