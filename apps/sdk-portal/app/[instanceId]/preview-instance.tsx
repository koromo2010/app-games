"use client";

import { useEffect, useState } from "react";

type Phase = "square" | "entry" | "lobby" | "playing" | "result";
type Player = { id: string; name: string; dummy?: boolean };
type PreviewState = { phase: Phase; roomCode: string; debug: boolean; viewerId: string; players: Player[] };

const initialState: PreviewState = {
  phase: "square",
  roomCode: "",
  debug: true,
  viewerId: "host",
  players: [{ id: "host", name: "あなた" }],
};

export function PreviewInstance({ instanceId }: { instanceId: string }) {
  const storageKey = `game-fields-sdk-preview:v1:${instanceId}`;
  const [state, setState] = useState(initialState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setState(JSON.parse(saved) as PreviewState);
    } finally { setLoaded(true); }
  }, [storageKey]);
  useEffect(() => { if (loaded) localStorage.setItem(storageKey, JSON.stringify(state)); }, [loaded, state, storageKey]);

  const move = (phase: Phase) => setState((current) => ({ ...current, phase }));
  const createRoom = () => setState((current) => ({ ...current, phase: "lobby", roomCode: Math.random().toString(36).slice(2, 6).toUpperCase() }));
  const addDummy = () => setState((current) => {
    const number = current.players.filter((player) => player.dummy).length + 1;
    return { ...current, players: [...current.players, { id: `dummy-${number}`, name: `ダミー${number}`, dummy: true }] };
  });
  const viewer = state.players.find((player) => player.id === state.viewerId) ?? state.players[0];

  return <main className="preview-shell">
    <header className="preview-topbar">
      <button type="button" onClick={() => move("square")} className="brand preview-brand"><span className="brand-mark">GF</span><span>Game Fields <strong>SDK</strong></span></button>
      <span className="instance-label">CREATOR / {instanceId}</span>
      <button type="button" className="preview-badge" onClick={() => setState((current) => ({ ...current, debug: !current.debug }))}>DEBUG {state.debug ? "ON" : "OFF"}</button>
    </header>

    {state.phase === "square" && <section className="preview-stage">
      <p className="eyebrow">YOUR GAME FIELDS</p><h1 className="preview-title">ゲーム広場</h1>
      <p className="preview-lead">この制作者環境に追加されたゲームを、本番と同じように選んで検証します。</p>
      <div className="preview-game-grid"><button className="game-preview-card" type="button" onClick={() => move("entry")}><span className="card-number">PREVIEW</span><strong>制作中のゲーム</strong><span>2–6人・オンライン</span></button></div>
    </section>}

    {state.phase === "entry" && <section className="preview-stage preview-panel">
      <p className="eyebrow">GAME ENTRY</p><h1 className="preview-title">制作中のゲーム</h1><p>ゲームカードから入った、本番相当の入室前画面です。</p>
      <div className="hero-actions"><button className="primary-action" type="button" onClick={createRoom}>部屋を作る</button><button className="secondary-action" type="button" onClick={() => move("square")}>広場へ戻る</button></div>
    </section>}

    {(state.phase === "lobby" || state.phase === "playing" || state.phase === "result") && <section className="preview-room">
      <aside className="preview-sidebar"><p className="eyebrow">ROOM {state.roomCode}</p><h2>参加者</h2><ul>{state.players.map((player) => <li key={player.id}><span>{player.name}</span>{player.id === state.viewerId && <small>表示中</small>}</li>)}</ul><h3>ルーム設定</h3><dl><div><dt>人数</dt><dd>{state.players.length}/6</dd></div><div><dt>デバッグ</dt><dd>{state.debug ? "有効" : "無効"}</dd></div></dl></aside>
      <div className="preview-game-area"><p className="eyebrow">{state.phase.toUpperCase()}</p><h1 className="preview-title">ゲーム固有領域</h1><p>共通UIはSDKが提供し、AIはこの中央部分だけを実装します。</p><div className="game-placeholder">{state.phase === "lobby" ? "開始待ち" : state.phase === "playing" ? `${viewer?.name ?? "プレイヤー"}視点でプレイ中` : "ゲーム結果"}</div><div className="hero-actions">{state.phase === "lobby" && <button className="primary-action" type="button" onClick={() => move("playing")}>ゲーム開始</button>}{state.phase === "playing" && <button className="primary-action" type="button" onClick={() => move("result")}>結果へ</button>}{state.phase === "result" && <button className="primary-action" type="button" onClick={() => move("lobby")}>同じ部屋へ戻る</button>}</div></div>
      {state.debug && <aside className="debug-panel"><p className="eyebrow">DEBUG PANEL</p><h2>検証操作</h2><button type="button" onClick={addDummy}>ダミー追加</button><label>表示視点<select value={state.viewerId} onChange={(event) => setState((current) => ({ ...current, viewerId: event.target.value }))}>{state.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label>フェーズ<select value={state.phase} onChange={(event) => move(event.target.value as Phase)}><option value="lobby">ロビー</option><option value="playing">プレイ中</option><option value="result">結果</option></select></label><button type="button" onClick={() => move("lobby")}>進行を中断</button><button type="button" onClick={() => { localStorage.removeItem(storageKey); setState(initialState); }}>状態を初期化</button></aside>}
    </section>}
  </main>;
}
