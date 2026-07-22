export const GAME_FIELDS_PRESET_ASSET = "game-fields/preset.js";

/**
 * Browser runtime injected into every isolated SDK mock. It intentionally has
 * no access to accounts, cookies or persistence. The production platform
 * replaces this preview adapter with trusted platform modules.
 */
export function gameFieldsPresetRuntimeSource() {
  return String.raw`(() => {
  "use strict";
  if (window.GameFieldsPreset) return;

  const listeners = new Set();
  const adapters = new Set();
  const state = {
    roomCode: "GF01",
    phase: "lobby",
    debugOpen: false,
    debugAccess: true,
    viewerId: "host",
    players: [
      { id: "host", name: "あなた", role: "host", dummy: false },
      { id: "michel", name: "Michel", role: "player", dummy: false },
      { id: "sora", name: "Sora", role: "player", dummy: false }
    ]
  };

  const clone = () => JSON.parse(JSON.stringify(state));
  const notify = (message) => {
    const toast = document.querySelector("#toast,[data-gf-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  };
  const emit = (command, detail = {}) => {
    const snapshot = clone();
    window.dispatchEvent(new CustomEvent("gamefields:statechange", { detail: { command, state: snapshot, ...detail } }));
    listeners.forEach((listener) => listener(snapshot));
    adapters.forEach((adapter) => adapter.onStateChange?.(snapshot, command));
  };
  const renderPlayers = () => {
    document.querySelectorAll("[data-gf-player-count]").forEach((node) => {
      node.textContent = String(state.players.length);
    });
    const list = document.querySelector("[data-gf-player-list], .players ul");
    if (list) {
      list.replaceChildren(...state.players.map((player) => {
        const item = document.createElement("li");
        item.dataset.playerId = player.id;
        item.textContent = player.name + (player.dummy ? "（ダミー）" : "");
        if (player.role === "host") {
          const badge = document.createElement("b");
          badge.textContent = "HOST";
          item.append(" ", badge);
        }
        return item;
      }));
    }
  };
  const renderViewerOptions = () => {
    document.querySelectorAll("[data-gf-viewer], #debug-panel label:nth-of-type(2) select").forEach((select) => {
      if (!(select instanceof HTMLSelectElement)) return;
      const current = state.viewerId;
      select.replaceChildren(...state.players.map((player) => {
        const option = document.createElement("option");
        option.value = player.id;
        option.textContent = player.name;
        return option;
      }), Object.assign(document.createElement("option"), { value: "spectator", textContent: "観戦者" }));
      select.value = current;
    });
  };
  const render = () => {
    renderPlayers();
    renderViewerOptions();
    document.documentElement.dataset.gfPhase = state.phase;
    document.documentElement.dataset.gfViewer = state.viewerId;
    const panel = document.querySelector("[data-gf-debug-panel], #debug-panel");
    if (panel) {
      panel.classList.toggle("is-open", state.debugOpen);
      panel.setAttribute("aria-hidden", String(!state.debugOpen));
    }
    document.querySelectorAll("[data-gf-phase]:not(select)").forEach((node) => {
      node.textContent = state.phase === "lobby" ? "開始前" : state.phase === "playing" ? "プレイ中" : "結果";
    });
  };
  const addDummy = () => {
    if (!state.debugAccess) return notify("デバッグ権限が必要です");
    const number = state.players.filter((player) => player.dummy).length + 1;
    state.players.push({ id: "dummy-" + number, name: "ダミー" + String(number).padStart(2, "0"), role: "player", dummy: true });
    render(); emit("dummy:add"); notify("ダミー参加者を追加しました");
  };
  const removeDummy = () => {
    if (!state.debugAccess) return notify("デバッグ権限が必要です");
    const index = state.players.findLastIndex((player) => player.dummy);
    if (index < 0) return notify("削除できるダミーはいません");
    state.players.splice(index, 1);
    if (!state.players.some((player) => player.id === state.viewerId)) state.viewerId = "host";
    render(); emit("dummy:remove"); notify("ダミー参加者を削除しました");
  };
  const setPhase = (phase) => {
    if (!["lobby", "playing", "result"].includes(phase)) return;
    state.phase = phase;
    render(); emit("phase:set", { phase });
  };
  const abort = () => {
    if (!state.debugAccess) return notify("デバッグ権限が必要です");
    adapters.forEach((adapter) => adapter.abort?.());
    setPhase("lobby"); notify("進行中断：参加者を維持して開始前へ戻りました");
  };
  const command = (name, payload = {}) => {
    if (name === "debug:toggle") { state.debugOpen = !state.debugOpen; render(); emit(name); return; }
    if (name === "dummy:add") return addDummy();
    if (name === "dummy:remove") return removeDummy();
    if (name === "viewer:set") { state.viewerId = payload.viewerId || "host"; render(); emit(name); return; }
    if (name === "phase:set") return setPhase(payload.phase);
    if (name === "game:start") { adapters.forEach((adapter) => adapter.start?.()); setPhase("playing"); return; }
    if (name === "game:abort") return abort();
    if (name === "game:auto-progress") { adapters.forEach((adapter) => adapter.autoProgress?.()); emit(name); return; }
    if (name === "game:rematch") { adapters.forEach((adapter) => adapter.rematch?.()); setPhase("lobby"); return; }
    emit(name, { payload });
  };

  window.GameFieldsPreset = Object.freeze({
    version: 1,
    getState: clone,
    command,
    subscribe(listener) { listeners.add(listener); listener(clone()); return () => listeners.delete(listener); },
    registerGame(adapter) { adapters.add(adapter); adapter.onStateChange?.(clone(), "game:register"); return () => adapters.delete(adapter); }
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button,[data-gf-command]");
    if (!button) return;
    const action = button.dataset.gfCommand || button.dataset.action;
    if (["debug", "dummy", "remove-dummy", "start", "abort", "auto-progress", "rematch"].includes(action)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (action === "debug") command("debug:toggle");
    if (action === "dummy") command("dummy:add");
    if (action === "remove-dummy") command("dummy:remove");
    if (action === "start") command("game:start");
    if (action === "abort") command("game:abort");
    if (action === "auto-progress") command("game:auto-progress");
    if (action === "rematch") command("game:rematch");
  }, true);
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.matches("[data-gf-viewer], #debug-panel label:nth-of-type(2) select")) command("viewer:set", { viewerId: target.value });
    if (target.matches("[data-gf-phase], #debug-panel label:nth-of-type(3) select")) {
      const values = { "ロビー": "lobby", "プレイ中": "playing", "結果": "result" };
      command("phase:set", { phase: values[target.value] || target.value });
    }
  });
  const boot = () => { render(); emit("preset:ready"); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();`;
}

export function injectGameFieldsPreset(html: string) {
  // Game code is expected to reference `window.GameFieldsPreset` when it
  // registers its adapter. That reference does not mean the platform runtime
  // has already been loaded. Only our injected script marker is authoritative.
  if (/<script\b[^>]*\bdata-game-fields-preset(?:\s|=|>)/i.test(html)) return html;
  const script = `<script src="${GAME_FIELDS_PRESET_ASSET}" data-game-fields-preset></script>`;
  return /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, `${script}</head>`) : `${script}${html}`;
}
