import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isKeyboardInteractiveTarget,
  nextFocusIndex,
  shouldHandleGameKeyboardEvent,
} from "../app/components/keyboard-focus-contract.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function target(tagName: string, attributes: Record<string, string> = {}, tabIndex?: number) {
  return {
    tagName,
    tabIndex,
    getAttribute(name: string) { return attributes[name] ?? null; },
    hasAttribute(name: string) { return name in attributes; },
    isContentEditable: attributes.contenteditable === "true",
  };
}

function keyboardEvent(path: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    isComposing: false,
    metaKey: false,
    target: path[0] ?? null,
    composedPath: () => path,
    ...overrides,
  } as unknown as KeyboardEvent;
}

test("native controls, contenteditable, media, ARIA widgets, and focusable custom controls own their keys", () => {
  for (const candidate of [
    target("BUTTON"),
    target("A", { href: "/games" }),
    target("INPUT"),
    target("TEXTAREA"),
    target("SELECT"),
    target("OPTION"),
    target("SUMMARY"),
    target("DIV", { contenteditable: "true" }),
    target("VIDEO", { controls: "" }),
    target("DIV", { role: "slider" }),
    target("DIV", {}, 0),
  ]) assert.equal(isKeyboardInteractiveTarget(candidate), true);
  assert.equal(isKeyboardInteractiveTarget(target("DIV")), false);
});

test("game shortcuts require explicit surface focus and respect native/default/composition/modal ownership", () => {
  const owner = target("DIV", { "data-game-keyboard-owner": "true" }, 0) as ReturnType<typeof target> & { contains(candidate: unknown): boolean };
  const canvas = target("CANVAS");
  owner.contains = (candidate) => candidate === canvas;
  const plainEvent = keyboardEvent([canvas, owner]);

  assert.equal(shouldHandleGameKeyboardEvent(plainEvent, owner, { activeElement: owner, modalOpen: false }), true);
  assert.equal(shouldHandleGameKeyboardEvent(plainEvent, owner, { activeElement: target("BODY"), modalOpen: false }), false);
  assert.equal(shouldHandleGameKeyboardEvent(plainEvent, owner, { activeElement: owner, modalOpen: true }), false);
  assert.equal(shouldHandleGameKeyboardEvent(keyboardEvent([target("BUTTON"), owner]), owner, { activeElement: owner, modalOpen: false }), false);
  assert.equal(shouldHandleGameKeyboardEvent(keyboardEvent([canvas, owner], { defaultPrevented: true }), owner, { activeElement: owner, modalOpen: false }), false);
  assert.equal(shouldHandleGameKeyboardEvent(keyboardEvent([canvas, owner], { isComposing: true }), owner, { activeElement: owner, modalOpen: false }), false);
  for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
    assert.equal(shouldHandleGameKeyboardEvent(keyboardEvent([canvas, owner], { [modifier]: true }), owner, { activeElement: owner, modalOpen: false }), false);
  }
});

test("focus cycle handles forward, backward, outside, one-item, and zero-focusable cases", () => {
  assert.equal(nextFocusIndex(3, 2, false), 0);
  assert.equal(nextFocusIndex(3, 0, true), 2);
  assert.equal(nextFocusIndex(3, -1, false), 0);
  assert.equal(nextFocusIndex(3, -1, true), 2);
  assert.equal(nextFocusIndex(1, 0, false), 0);
  assert.equal(nextFocusIndex(0, -1, false), -1);
});

test("platform modal and menu surfaces share one topmost keyboard/focus lifecycle", () => {
  const lifecycle = read("app/components/keyboard-focus-contract.ts");
  assert.match(lifecycle, /openLayers\.at\(-1\) !== layerId/);
  assert.match(lifecycle, /event\.defaultPrevented \|\| event\.isComposing/);
  assert.match(lifecycle, /event\.key === "Escape"/);
  assert.match(lifecycle, /event\.key !== "Tab"/);
  assert.match(lifecycle, /candidates\.length === 0/);
  assert.match(lifecycle, /restoreFocusSafely\(origin, fallback\)/);
  assert.match(lifecycle, /previousOpenRef\.current = open/);

  for (const path of [
    "app/components/GameRulesDialog.tsx",
    "app/components/FullScreenPageOverlay.tsx",
    "app/components/UserReportButton.tsx",
    "app/components/PaidLlmAccessButton.tsx",
    "app/components/GameTopMenu.tsx",
    "app/components/GamePlayerMenu.tsx",
    "app/components/GameReplayPanel.tsx",
  ]) assert.match(read(path), /useKeyboardLayer\(/, path);
});

test("Canvas shortcuts are scoped to the explicitly focused game surface", () => {
  const layout = read("app/canvas/CanvasDesktopLayout.tsx");
  const controller = read("app/canvas/use-canvas-controller.ts");
  assert.match(layout, /data-game-keyboard-owner="true"/);
  assert.match(layout, /tabIndex=\{0\}/);
  assert.match(layout, /focus-visible:ring-4/);
  assert.match(layout, /boardViewportRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(controller, /shouldHandleGameKeyboardEvent\(event, boardViewportRef\.current\)/);
  assert.match(controller, /event\.defaultPrevented && !event\.isComposing/);
  assert.match(controller, /owner\?\.addEventListener\("focusout", onFocusOut\)/);
  assert.doesNotMatch(controller, /closest\("input, textarea, select/);
});
