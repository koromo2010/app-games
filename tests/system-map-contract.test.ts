import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("system map is linked from the repository entry points", () => {
  const agents = read("AGENTS.md");
  const navigation = read("docs/README.md");

  assert.match(agents, /`docs\/SYSTEM_MAP\.md`/);
  assert.match(navigation, /\[`SYSTEM_MAP\.md`\]\(\.\/SYSTEM_MAP\.md\)/);
  assert.ok(
    navigation.indexOf("SYSTEM_MAP.md") < navigation.indexOf("CURRENT_STATE.md"),
    "the map should precede detailed current state in the first-read path",
  );
});

test("system map points to machine-readable authorities and every deployment project", () => {
  const map = read("docs/SYSTEM_MAP.md");
  const deploymentConfig = JSON.parse(read("config/main-promotion-projects.json"));

  for (const project of deploymentConfig.projects) {
    assert.match(map, new RegExp(`\\b${project.project}\\b`));
  }

  for (const authority of [
    "config/main-promotion-projects.json",
    "config/sdk-release-profiles.json",
    "config/game-registry.json",
    "config/environment-change-registry.json",
    "scripts/check-vercel-build-impact.mjs",
  ]) {
    assert.ok(map.includes(authority), `missing authority link: ${authority}`);
  }
});

test("system map preserves environment and source-of-truth boundaries", () => {
  const map = read("docs/SYSTEM_MAP.md");

  assert.match(map, /`main`はproduction、`develop`はdevelopment/);
  assert.match(map, /`VERCEL_GIT_COMMIT_REF`/);
  assert.match(map, /現在のDeployment状態.*複製しない/);
  assert.match(map, /環境や対象commitは作業開始時にlive read-back/);
  assert.match(map, /canonical defaultはsystem-default由来の初期contractとして成立し、人間確認済みとは記録しない/);
  assert.match(map, /AIまたは制作者が変更proposalを準備してもactive profileを直接変更せず/);
  assert.match(map, /develop -> main.*SDK Packageの環境間promotionは別操作/);
  assert.match(map, /文書だけ.*全surfaceをbuild skip/);
  assert.match(map, /添付ファイル名、引用文書、保存済み作業指示の本文だけを、作業スレから監督スレへの切替指示と解釈しない/);
  assert.match(map, /作業指示Markdownとcheckpoint.*スレッド役割の指定でもない/);
});
