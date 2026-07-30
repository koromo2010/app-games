import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runbook = readFileSync("docs/REDIS_CONSOLIDATION_RUNBOOK.md", "utf8");
const registry = JSON.parse(readFileSync("config/redis-consolidation-registry.json", "utf8")) as {
  resources: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
};

function connection(project: string) {
  const item = registry.connections.find((entry) => entry.project === project);
  assert.ok(item, `${project} connection must exist`);
  return item;
}

test("本番Redisと開発Redisを物理分離する方針を固定する", () => {
  assert.match(runbook, /developmentを`wy-app-games`へ接続しない/);
  assert.match(runbook, /`app-games-dev`が現在接続している既存Redisを統合先候補/);
  assert.equal(connection("app-games").targetResource, "wy-app-games");
  assert.equal(connection("app-games-dev").targetResource, "app-games-dev-current-redis");
  assert.equal(connection("app-games-dev").forbiddenTargetResource, "wy-app-games");
  assert.equal(connection("app-games-sdk-dev").forbiddenTargetResource, "wy-app-games");
  assert.equal(connection("app-games-preview-dev").forbiddenTargetResource, "wy-app-games");
});

test("開発Redis内のsurface namespaceを分離する", () => {
  assert.equal(connection("app-games-dev").namespace, "app-dev:");
  assert.equal(connection("app-games-sdk-dev").namespace, "sdk:development:preview-instance:v1:");
  assert.equal(connection("app-games-preview-dev").namespace, "preview-dev:");
  assert.notEqual(connection("app-games-dev").namespace, connection("app-games-preview-dev").namespace);
});

test("production Portalと正式Room Runtimeを混同しない", () => {
  const productionPortal = connection("app-games-sdk");
  assert.match(String(productionPortal.surface), /not formal Room Runtime/);
  assert.equal(productionPortal.forbiddenAutomaticTargetResource, "wy-app-games");
  assert.equal(productionPortal.targetResource, "pending_manual_classification");
});

test("sdk-dev-redisと重複Projectを削除対象にしない", () => {
  const source = registry.resources.find((entry) => entry.name === "sdk-dev-redis");
  assert.ok(source);
  assert.equal(source.deleteStatus, "forbidden");
  assert.equal(source.upgradeStatus, "forbidden");
  assert.equal(connection("app-games-sdk-portal").status, "build_skip_do_not_delete");
});
