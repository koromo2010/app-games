import {
  assertGamePackageAssets,
  auditGamePackageAssets,
  GamePackageAssetValidationError,
  type GamePackageAssetAudit,
  type GamePackageAssetFinding,
} from "@game-fields/sdk-package-assets";
import type { PreparedUploadFile } from "./mock-git-store.ts";

export {
  GamePackageAssetValidationError,
  type GamePackageAssetAudit,
  type GamePackageAssetFinding,
};

export function auditPreparedGamePackageAssets(
  files: readonly PreparedUploadFile[],
) {
  return auditGamePackageAssets(files);
}

export function assertPreparedGamePackageAssets(
  files: readonly PreparedUploadFile[],
) {
  return assertGamePackageAssets(files);
}
