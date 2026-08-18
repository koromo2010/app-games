import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_SDK_MODULE_CATALOG,
  GAME_SDK_PACKAGE_MODULE_IDS,
} from "@game-fields/game-sdk/modules";
import { validateGameSdkModuleUsage, GameSdkModuleUsageValidationError } from "@game-fields/game-sdk/module-usage";
import {
  QUARTO_DISABLED_MODULE_IDS,
  QUARTO_MODULE_PROFILE,
  QUARTO_REQUIRED_MODULE_IDS,
} from "./fixtures/sdk-quarto-module-usage.ts";

const binding = {
  environment: "development" as const,
  moduleProfileRevision: "22222222-2222-4222-8222-222222222222",
  moduleContractDigest: "b".repeat(64),
  sdkPackageVersion: "0.2.0",
  sdkContractVersion: 2,
};

test("Quarto fixture declares only package-governed module usage", () => {
  assert.equal(GAME_SDK_MODULE_CATALOG.length, 39);
  assert.equal(QUARTO_REQUIRED_MODULE_IDS.length, 5);
  assert.equal(QUARTO_DISABLED_MODULE_IDS.length, 10);
  assert.equal(Object.keys(QUARTO_MODULE_PROFILE).length, 39);
  assert.deepEqual(
    [...QUARTO_REQUIRED_MODULE_IDS, ...QUARTO_DISABLED_MODULE_IDS].sort(),
    [...GAME_SDK_PACKAGE_MODULE_IDS].sort(),
  );
});

test("Quarto incomplete moduleUsage exposes stable module, path, reason, expected and actual", () => {
  assert.throws(() => validateGameSdkModuleUsage({
    contract: {
      ...binding,
      requiredModuleIds: QUARTO_REQUIRED_MODULE_IDS,
      disabledModuleIds: QUARTO_DISABLED_MODULE_IDS,
      requiredModules: GAME_SDK_MODULE_CATALOG.filter((definition) => QUARTO_REQUIRED_MODULE_IDS.includes(definition.id)),
      disabledModules: GAME_SDK_MODULE_CATALOG.filter((definition) => QUARTO_DISABLED_MODULE_IDS.includes(definition.id)),
    },
    binding,
    moduleUsage: [],
    files: {},
  }), (error: unknown) => {
    assert.ok(error instanceof GameSdkModuleUsageValidationError);
    assert.equal(error.code, "MODULE_USAGE_MATRIX_INCOMPLETE");
    assert.deepEqual(error.problems[0], {
      moduleId: QUARTO_REQUIRED_MODULE_IDS[0],
      path: "moduleUsage",
      reason: "REQUIRED_MODULE_MISSING",
      expected: "exactly one row",
      actual: "missing",
    });
    return true;
  });
});
