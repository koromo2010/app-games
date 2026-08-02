import type { GamePackageAudit } from "./game-package-asset-audit.ts";
import { assertPreparedGamePackageAssets } from "./game-package-asset-audit.ts";
import type { PreparedUploadFile } from "./mock-git-store.ts";

export type ValidatedGamePackage = {
  files: readonly PreparedUploadFile[];
  assetAudit: GamePackageAudit;
};

const issuedValidations = new WeakSet<object>();

export function validateGamePackageForPersistence(
  files: readonly PreparedUploadFile[],
): ValidatedGamePackage {
  const validated = Object.freeze({
    files,
    assetAudit: assertPreparedGamePackageAssets(files),
  });
  issuedValidations.add(validated);
  return validated;
}

export async function saveValidatedGamePackage<Result, Prepared = undefined>(input: {
  files: readonly PreparedUploadFile[];
  validatedPackage?: ValidatedGamePackage;
  afterValidation?: (validated: ValidatedGamePackage) => Prepared | Promise<Prepared>;
  persist: (validated: ValidatedGamePackage, prepared: Prepared) => Result | Promise<Result>;
}) {
  if (
    input.validatedPackage
    && (
      !issuedValidations.has(input.validatedPackage)
      || input.validatedPackage.files !== input.files
    )
  ) {
    throw new Error("GAME_SDK_PACKAGE_ASSET_VALIDATION_RECEIPT_INVALID");
  }
  const validated = input.validatedPackage
    ?? validateGamePackageForPersistence(input.files);
  const prepared = input.afterValidation
    ? await input.afterValidation(validated)
    : undefined as Prepared;
  return input.persist(validated, prepared);
}
