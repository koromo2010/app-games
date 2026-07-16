import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleSets = [
  ["hodoai", true],
  ["tahoiya", true],
  ["kotoba-senpuku", true],
  ["code-intercept", true],
  ["nigoichi", true],
  ["northern-branch", false],
  ["wordwolf", false],
] as const;

test("分離したroom moduleがnormalizer・presentation境界を公開する", async () => {
  for (const [game] of moduleSets) {
    const normalizer = await readFile(new URL(`../lib/${game}-room-normalizer.ts`, import.meta.url), "utf8");
    const presentation = await readFile(new URL(`../lib/${game}-room-presentation.ts`, import.meta.url), "utf8");
    assert.match(normalizer, /export function normalize/);
    assert.match(presentation, /export function .*RoomChoice/);
    assert.match(presentation, /export function sanitize/);
  }
});

test("独立domainを持つゲームはstoreからdomain moduleを参照する", async () => {
  for (const [game, hasRoomDomain] of moduleSets) {
    if (!hasRoomDomain) continue;
    const domain = await readFile(new URL(`../lib/${game}-room-domain.ts`, import.meta.url), "utf8");
    const store = await readFile(new URL(`../lib/${game}-room-store.ts`, import.meta.url), "utf8");
    assert.match(domain, /export function/);
    assert.ok(store.includes(`@/lib/${game}-room-domain`) || store.includes(`./${game}-room-domain.ts`));
  }
});
