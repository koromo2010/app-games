import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runbook = readFileSync("docs/REDIS_CONSOLIDATION_RUNBOOK.md", "utf8");
const registry = JSON.parse(readFileSync("config/redis-consolidation-registry.json", "utf8")) as {
  resources: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  namespaceMigration: Record<string, unknown>;
  constraints: Record<string, unknown>;
};
const inventory = JSON.parse(readFileSync("config/redis-namespace-inventory-summary-20260730.json", "utf8")) as {
  keyCount: number;
  reviewedDisposition: Record<string, number>;
  collection: Record<string, unknown>;
  copyPlan: Record<string, unknown>;
  groups: Array<Record<string, unknown>>;
};

function connection(project: string) {
  const item = registry.connections.find((entry) => entry.project === project);
  assert.ok(item, `${project} connection must exist`);
  return item;
}

function resource(name: string) {
  const item = registry.resources.find((entry) => entry.name === name);
  assert.ok(item, `${name} resource must exist`);
  return item;
}

test("本番Redisと開発Redisを物理分離する方針を固定する", () => {
  assert.match(runbook, /developmentを`wy-app-games`へ接続しない/);
  assert.match(runbook, /`app-games-dev`が現在接続しているRedisと同一/);
  assert.equal(connection("app-games").targetResource, "wy-app-games");
  assert.equal(connection("app-games-dev").targetResource, "sdk-dev-redis");
  assert.equal(connection("app-games-dev").forbiddenTargetResource, "wy-app-games");
  assert.equal(connection("app-games-sdk-dev").forbiddenTargetResource, "wy-app-games");
  assert.equal(connection("app-games-preview-dev").forbiddenTargetResource, "wy-app-games");
});

test("sdk-dev-redisを開発共通DBとして同一DB内namespace分離する", () => {
  const development = resource("sdk-dev-redis");
  assert.equal(development.role, "shared-development-database");
  assert.equal(development.sameAsAppGamesDevCurrentRedis, true);
  assert.equal(development.separateExistingDevRedisExists, false);
  assert.equal(registry.namespaceMigration.databaseToDatabaseMigration, false);
  assert.equal(registry.namespaceMigration.sourceResource, "sdk-dev-redis");
  assert.equal(registry.namespaceMigration.targetResource, "sdk-dev-redis");
  assert.equal(registry.namespaceMigration.preflightAllCopyTargetsBeforeWrite, true);
  assert.equal(registry.namespaceMigration.rollbackOnlyKeysCreatedByCurrentRun, true);
  assert.equal(connection("app-games-dev").namespace, "app-dev:");
  assert.equal(connection("app-games-sdk-dev").namespace, "sdk:development:preview-instance:v1:");
  assert.equal(connection("app-games-preview-dev").namespace, "preview-dev:");
  assert.notEqual(connection("app-games-dev").namespace, connection("app-games-preview-dev").namespace);
});

test("開発Redisは了承済みPay As You Goで接続・Secretsを変更していない", () => {
  const development = resource("sdk-dev-redis");
  assert.equal(development.currentPlan, "Pay As You Go");
  const planChange = development.planChange as Record<string, unknown>;
  assert.equal(planChange.status, "executed_by_user");
  assert.equal(planChange.dataMigration, false);
  assert.equal(planChange.connectionTargetChanged, false);
  assert.equal(planChange.secretsChanged, false);
  assert.equal(registry.constraints.changeDevelopmentPlanAgainWithoutApproval, false);
  assert.equal(registry.constraints.changeSecrets, false);
  assert.equal(registry.constraints.changeRedisConnectionTarget, false);
});

test("両Redisの変更前Backup完了を記録する", () => {
  const productionBackup = resource("wy-app-games").backup as Record<string, unknown>;
  const developmentBackup = resource("sdk-dev-redis").backup as Record<string, unknown>;
  assert.equal(productionBackup.status, "completed");
  assert.equal(productionBackup.providerState, "Completed");
  assert.equal(productionBackup.name, "pre-namespace-20260730-1256-jst");
  assert.equal(developmentBackup.status, "completed");
  assert.equal(developmentBackup.providerState, "Completed");
  assert.equal(developmentBackup.name, "pre-namespace-20260730-1300-jst");
  assert.equal(productionBackup.secretValuesRecorded, false);
  assert.equal(developmentBackup.secretValuesRecorded, false);
  assert.match(runbook, /1009\.74KB/);
  assert.match(runbook, /741\.45KB/);
});

test("metadata-only inventoryはcopy 0件として非破壊処理を固定する", () => {
  assert.equal(inventory.keyCount, 206);
  assert.deepEqual(inventory.reviewedDisposition, {
    keep: 174,
    copy: 0,
    expireSource: 29,
    retainSource: 3,
  });
  assert.equal(inventory.collection.redisValuesRead, false);
  assert.equal(inventory.collection.secretValuesRecorded, false);
  assert.equal(inventory.collection.rawInventoryCommitted, false);
  assert.equal(inventory.copyPlan.entries, 0);
  assert.equal(inventory.copyPlan.executionRequired, false);
  assert.equal(inventory.copyPlan.sourceKeysDeleted, false);
  assert.equal(inventory.copyPlan.targetKeysOverwritten, false);
  assert.equal(inventory.groups.some((entry) => entry.classification === "preview-development-legacy-metrics" && entry.count === 29), true);
});

test("production Portalと正式Room Runtimeを混同しない", () => {
  const productionPortal = connection("app-games-sdk");
  assert.match(String(productionPortal.surface), /not formal Room Runtime/);
  assert.equal(productionPortal.forbiddenAutomaticTargetResource, "wy-app-games");
  assert.equal(productionPortal.targetResource, "pending_manual_classification");
});

test("sdk-dev-redisと重複Projectを削除対象にしない", () => {
  const development = resource("sdk-dev-redis");
  assert.equal(development.deleteStatus, "forbidden");
  assert.equal(connection("app-games-sdk-portal").status, "build_skip_do_not_delete");
});
