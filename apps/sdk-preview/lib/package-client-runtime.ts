export const GAME_FIELDS_PACKAGE_CLIENT_ASSET =
  "game-fields/package-room.js";

export function gameFieldsPackageClientRuntimeSource() {
  return String.raw`(() => {
  "use strict";
  if (window.GameFieldsRoom) return;

  const listeners = new Set();
  const adapters = new Set();
  const pending = new Map();
  let requestSequence = 0;
  let snapshot = null;
  let resizeFrameId = null;

  const clone = (value) => value == null
    ? value
    : JSON.parse(JSON.stringify(value));
  const safeTiming = (value) => value
    && typeof value === "object"
    && typeof value.traceRef === "string"
    && /^command_[A-Za-z0-9_-]{8,80}$/.test(value.traceRef)
    && Number.isSafeInteger(value.revision)
      ? { traceRef: value.traceRef, revision: value.revision }
      : null;
  const recordTiming = (stage, timing, startedAt) => {
    if (!timing || typeof performance?.measure !== "function") return;
    const duration = Math.max(0, performance.now() - startedAt);
    try {
      performance.measure(
        "game-sdk:" + stage + ":" + timing.traceRef + ":r" + timing.revision,
        { start: startedAt, duration }
      );
    } catch {}
  };
  const notify = (command) => {
    const current = clone(snapshot);
    listeners.forEach((listener) => listener(current));
    adapters.forEach((adapter) => adapter.onStateChange?.(current, command));
    window.dispatchEvent(new CustomEvent("gamefields:statechange", {
      detail: { command, state: current }
    }));
  };
  const send = (command) => new Promise((resolve, reject) => {
    if (!command || typeof command !== "object" || typeof command.type !== "string") {
      reject(new Error("GAME_SDK_COMMAND_INPUT_REQUIRED"));
      return;
    }
    const requestId = "room-" + Date.now().toString(36) + "-" + (++requestSequence).toString(36);
    const timeoutId = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("GAME_SDK_COMMAND_TIMEOUT"));
    }, 60000);
    pending.set(requestId, {
      resolve,
      reject,
      timeoutId,
      startedAt: performance.now()
    });
    window.parent.postMessage({
      type: "game-fields:room-command",
      requestId,
      command: clone(command)
    }, "*");
  });
  const room = Object.freeze({
    getSnapshot() {
      return clone(snapshot);
    },
    send,
    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new Error("GAME_SDK_ROOM_LISTENER_REQUIRED");
      }
      listeners.add(listener);
      listener(clone(snapshot));
      return () => listeners.delete(listener);
    }
  });
  window.GameFieldsRoom = room;
  window.GameFieldsPreset = Object.freeze({
    version: 2,
    room,
    getState: room.getSnapshot,
    subscribe: room.subscribe,
    registerGame(adapter) {
      adapters.add(adapter);
      adapter.onStateChange?.(clone(snapshot), "game:register");
      return () => adapters.delete(adapter);
    },
    command(name, payload = {}) {
      const mapped = {
        "game:start": { type: "game/start" },
        "game:abort": { type: "room/abort" },
        "game:rematch": { type: "room/rematch" },
        "timer:recover": { type: "room/recover-timeout" }
      }[name];
      if (name === "room:send" && payload && typeof payload.command === "object") {
        return send(payload.command);
      }
      if (mapped) return send(mapped);
      return Promise.reject(new Error("GAME_SDK_LEGACY_COMMAND_UNSUPPORTED"));
    },
    resources: Object.freeze({})
  });

  const measure = () => {
    resizeFrameId = null;
    const body = document.body;
    const height = Math.ceil(Math.max(
      document.documentElement.scrollHeight,
      body ? body.scrollHeight : 0,
      320
    ));
    window.parent.postMessage({
      type: "game-fields:frame-size",
      height: Math.min(12000, height)
    }, "*");
  };
  const scheduleMeasure = () => {
    if (resizeFrameId !== null) return;
    resizeFrameId = window.requestAnimationFrame(measure);
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.type === "game-fields:room-snapshot") {
      const timing = safeTiming(message.timing);
      const notificationStartedAt = performance.now();
      snapshot = clone(message.room);
      notify("room:hydrate");
      recordTiming("iframe-state", timing, notificationStartedAt);
      scheduleMeasure();
      if (timing) {
        window.requestAnimationFrame(() => {
          recordTiming("next-animation-frame", timing, notificationStartedAt);
          window.parent.postMessage({
            type: "game-fields:room-state-presented",
            traceRef: timing.traceRef,
            revision: timing.revision
          }, "*");
        });
      }
      return;
    }
    if (
      (message.type === "game-fields:room-command-result"
        || message.type === "game-fields:room-command-error")
      && typeof message.requestId === "string"
    ) {
      const request = pending.get(message.requestId);
      if (!request) return;
      pending.delete(message.requestId);
      window.clearTimeout(request.timeoutId);
      if (message.type === "game-fields:room-command-result") {
        if (message.room && message.stateDelivered !== true) {
          snapshot = clone(message.room);
          notify("room:command");
        }
        recordTiming(
          "command-resolve",
          safeTiming(message.timing),
          request.startedAt
        );
        request.resolve(clone(message.room));
      } else {
        request.reject(new Error(
          typeof message.error === "string"
            ? message.error
            : "GAME_SDK_COMMAND_REJECTED"
        ));
      }
    }
  });

  const boot = () => {
    window.parent.postMessage({ type: "game-fields:room-ready" }, "*");
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(scheduleMeasure).observe(document.body);
    }
    scheduleMeasure();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();`;
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function removeLegacyPresetScripts(html: string) {
  return html.replace(
    /<script\b(?=[^>]*(?:data-game-fields-preset|src\s*=\s*["'][^"']*game-fields\/preset\.js(?:[?#][^"']*)?["']))[^>]*>\s*<\/script\s*>/gi,
    "",
  );
}

export function injectGameFieldsPackageClient(
  html: string,
  runtimeSrc: string,
) {
  const packageHtml = removeLegacyPresetScripts(html);
  if (/<script\b[^>]*\bdata-game-fields-package-room(?:\s|=|>)/i.test(packageHtml)) {
    return packageHtml;
  }
  const script = `<script data-game-fields-package-room src="${escapeHtmlAttribute(runtimeSrc)}"></script>`;
  return /<head\b[^>]*>/i.test(packageHtml)
    ? packageHtml.replace(/<head\b[^>]*>/i, (head) => `${head}${script}`)
    : `${script}${packageHtml}`;
}
