"use client";

import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const interactiveRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

type KeyboardTarget = {
  tagName?: string;
  disabled?: boolean;
  hidden?: boolean;
  inert?: boolean;
  isConnected?: boolean;
  isContentEditable?: boolean;
  tabIndex?: number;
  getAttribute?(name: string): string | null;
  hasAttribute?(name: string): boolean;
};

type KeyboardOwner = KeyboardTarget & {
  contains?(candidate: unknown): boolean;
};

type GameKeyboardContext = {
  activeElement?: unknown;
  modalOpen?: boolean;
};

const openLayers: symbol[] = [];

function keyboardTarget(candidate: unknown): KeyboardTarget | null {
  return candidate && typeof candidate === "object" ? candidate as KeyboardTarget : null;
}

function attribute(target: KeyboardTarget, name: string) {
  return target.getAttribute?.(name) ?? null;
}

export function isKeyboardInteractiveTarget(candidate: unknown) {
  const target = keyboardTarget(candidate);
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase() ?? "";
  if (["button", "input", "textarea", "select", "option", "summary"].includes(tagName)) return true;
  if (tagName === "a" && Boolean(attribute(target, "href"))) return true;
  if (["audio", "video"].includes(tagName) && target.hasAttribute?.("controls")) return true;
  if (target.isContentEditable || attribute(target, "contenteditable") === "true") return true;
  if (interactiveRoles.has(attribute(target, "role")?.toLowerCase() ?? "")) return true;
  return typeof target.tabIndex === "number" && target.tabIndex >= 0;
}

function eventPath(event: Pick<KeyboardEvent, "target" | "composedPath">) {
  const path = event.composedPath?.() ?? [];
  return path.length > 0 ? path : event.target ? [event.target] : [];
}

export function shouldHandleGameKeyboardEvent(
  event: Pick<KeyboardEvent, "altKey" | "composedPath" | "ctrlKey" | "defaultPrevented" | "isComposing" | "metaKey" | "target">,
  owner: KeyboardOwner | null,
  context: GameKeyboardContext = {},
) {
  if (!owner || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false;
  const activeElement = "activeElement" in context
    ? context.activeElement
    : typeof document === "undefined" ? null : document.activeElement;
  if (activeElement !== owner && !owner.contains?.(activeElement)) return false;
  const modalOpen = "modalOpen" in context
    ? context.modalOpen
    : typeof document !== "undefined" && Boolean(document.querySelector("[aria-modal='true']:not([aria-hidden='true'])"));
  if (modalOpen) return false;
  return !eventPath(event).some((candidate) => candidate !== owner && isKeyboardInteractiveTarget(candidate));
}

export function nextFocusIndex(length: number, currentIndex: number, backwards: boolean) {
  if (length <= 0) return -1;
  if (currentIndex < 0) return backwards ? length - 1 : 0;
  return (currentIndex + (backwards ? -1 : 1) + length) % length;
}

function isVisibleEnabled(element: HTMLElement) {
  if (!element.isConnected || element.hidden || element.inert || element.getAttribute("aria-hidden") === "true") return false;
  if ((element as HTMLButtonElement).disabled) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => isVisibleEnabled(element) && element.tabIndex >= 0);
}

function focusSafely(candidate: HTMLElement | null | undefined) {
  if (!candidate || !isVisibleEnabled(candidate)) return false;
  if (candidate === document.body || candidate === document.documentElement) return false;
  candidate.focus({ preventScroll: true });
  return document.activeElement === candidate;
}

function focusFallback(candidate: HTMLElement | null | undefined) {
  if (!candidate || !candidate.isConnected) return false;
  const temporaryTabIndex = !candidate.hasAttribute("tabindex");
  if (temporaryTabIndex) candidate.setAttribute("tabindex", "-1");
  const focused = focusSafely(candidate);
  if (temporaryTabIndex) candidate.addEventListener("blur", () => candidate.removeAttribute("tabindex"), { once: true });
  return focused;
}

export function restoreFocusSafely(origin: HTMLElement | null, fallback?: HTMLElement | null) {
  if (focusSafely(origin)) return "origin" as const;
  if (focusFallback(fallback)) return "fallback" as const;
  const pageFallback = typeof document === "undefined"
    ? null
    : document.querySelector<HTMLElement>("[data-focus-restore-fallback], main h1, main [tabindex='-1']");
  return focusFallback(pageFallback) ? "page-fallback" as const : "not-restored" as const;
}

type KeyboardLayerOptions = {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFallbackRef?: RefObject<HTMLElement | null>;
  modal?: boolean;
  dismissible?: boolean;
};

export function useKeyboardLayer({
  open,
  containerRef,
  onDismiss,
  initialFocusRef,
  restoreFallbackRef,
  modal = true,
  dismissible = true,
}: KeyboardLayerOptions) {
  const layerIdRef = useRef(Symbol("keyboard-layer"));
  const originRef = useRef<HTMLElement | null>(null);
  const previousOpenRef = useRef(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (open && !previousOpenRef.current) {
      originRef.current = null;
    } else if (!open && previousOpenRef.current) {
      const origin = originRef.current;
      const fallback = restoreFallbackRef?.current ?? null;
      window.requestAnimationFrame(() => restoreFocusSafely(origin, fallback));
      originRef.current = null;
    }
    previousOpenRef.current = open;
  }, [open, restoreFallbackRef]);

  useEffect(() => {
    if (!open) return;
    const layerId = layerIdRef.current;
    openLayers.push(layerId);
    const focusFrame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      if (!originRef.current && document.activeElement instanceof HTMLElement) {
        originRef.current = document.activeElement;
      }
      const initial = initialFocusRef?.current ?? focusableElements(container)[0];
      if (!focusSafely(initial)) focusFallback(container);
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (openLayers.at(-1) !== layerId || event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        event.stopPropagation();
        onDismissRef.current();
        return;
      }
      if (!modal || event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const candidates = focusableElements(container);
      if (candidates.length === 0) {
        event.preventDefault();
        focusFallback(container);
        return;
      }
      const currentIndex = candidates.indexOf(document.activeElement as HTMLElement);
      const nextIndex = nextFocusIndex(candidates.length, currentIndex, event.shiftKey);
      const leavingBounds = currentIndex < 0
        || (!event.shiftKey && currentIndex === candidates.length - 1)
        || (event.shiftKey && currentIndex === 0);
      if (leavingBounds) {
        event.preventDefault();
        candidates[nextIndex]?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      const index = openLayers.lastIndexOf(layerId);
      if (index >= 0) openLayers.splice(index, 1);
    };
  }, [containerRef, dismissible, initialFocusRef, modal, open]);
}
