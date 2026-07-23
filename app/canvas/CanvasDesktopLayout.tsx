"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { DrawingCanvas } from "@/app/components/DrawingCanvas";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GameLoungeVisual } from "@/app/components/GameLoungeVisual";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { fallbackAvatarColor } from "@/lib/player-session";
import type { CanvasLayerMode } from "@/lib/canvas-room";
import type { CanvasController } from "./use-canvas-controller";


export function CanvasDesktopLayout({ controller }: { controller: CanvasController }) {
  const { state, setters, refs, viewModel, permissions, actions } = controller;
  const {
    strokes, redoStrokes, color, width, opacity, zoom, boardFullscreen,
    fullscreenToolsOpen, tool, rulesOpen, shortcutsOpen, session, syncNotice,
    keyboardCursor, keyboardCursorVisible, room, roomCode, roomPassphrase,
    roomBusy, layerMode, localLayers, activeLayerId, hiddenLayerIds,
  } = state;
  const {
    setStrokes, setRedoStrokes, setColor, setWidth, setOpacity, setZoom,
    setFullscreenToolsOpen, setTool, setRulesOpen, setShortcutsOpen,
    setKeyboardCursor, setKeyboardCursorVisible, setRoomCode,
    setRoomPassphrase, setLayerMode, setLocalLayers, setActiveLayerId,
    setHiddenLayerIds,
  } = setters;
  const { boardViewportRef, boardShellRef } = refs;
  const {
    colors, minimumZoom, maximumZoom, zoomStep, layers, visibleStrokes,
    features,
  } = viewModel;
  const { canUndo, canClear } = permissions;
  const {
    changeZoom, openBoardFullscreen, closeBoardFullscreen, roomRequest,
    activateLobbySync, submitStroke, submitStrokeProgress, updateStrokes,
    undo, redo, leaveCanvasRoom, clearCanvas,
  } = actions;

  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_42%,#fef3c7_100%)] text-slate-900 ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="PRIVATE UI PROTOTYPE" title="キャンバス">
      <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>
      <GameTopMenu>
        <button type="button" data-menu-close="true" className={gameTopMenuItemClass} onClick={() => setRulesOpen(true)}>ルール・使い方 <span>›</span></button>
        <button type="button" data-menu-close="true" className={gameTopMenuItemClass} onClick={() => { updateStrokes([]); setRedoStrokes([]); }}>新しいキャンバス <span>↻</span></button>
      </GameTopMenu>
      <GamePlayerMenu id={session?.id} name={session?.name || "ゲスト"} avatarColor={session?.avatarColor || fallbackAvatarColor} avatarImage={session?.avatarImage} />
    </GameTopBanner>

    {!room && <div className="mx-auto max-w-[1500px] px-3 pt-5 sm:px-6"><GameLoungeVisual gameId="canvas" /></div>}

    <section className="mx-auto grid max-w-[1500px] gap-4 px-3 py-5 sm:px-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-start">
      <aside className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-200 bg-white/90 p-3 shadow-lg xl:sticky xl:top-20 xl:flex-col xl:items-stretch">
        <strong className="mr-2 text-sm xl:mb-1 xl:text-base">キャンバスロビー</strong>
        {!room ? <>
          <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().slice(0, 4))} placeholder="ルームコード" aria-label="ルームコード" className="w-32 rounded-lg border px-3 py-2 text-sm uppercase xl:w-full" />
          <input value={roomPassphrase} onChange={(event) => setRoomPassphrase(event.target.value)} placeholder="合言葉（任意）" aria-label="合言葉" className="w-36 rounded-lg border px-3 py-2 text-sm xl:w-full" />
          <button disabled={roomBusy || !session?.id || roomCode.length !== 4} onClick={() => void roomRequest("PATCH", { code: roomCode, action: { type: "join", passphrase: roomPassphrase } })} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">参加</button>
          <select value={layerMode} onChange={(event) => setLayerMode(event.target.value as CanvasLayerMode)} aria-label="レイヤーモード" className="rounded-lg border px-2 py-2 text-sm xl:w-full"><option value="shared">自由レイヤー</option><option value="per-player">プレイヤー別レイヤー</option></select>
          <button disabled={roomBusy || !session?.id} onClick={() => void roomRequest("POST", { passphrase: roomPassphrase, layerMode })} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm font-bold text-cyan-800 disabled:opacity-40">部屋を作る</button>
          {!session?.id && <span className="text-xs text-amber-700">ログインすると利用できます</span>}
        </> : <>
          <span className="rounded bg-slate-900 px-3 py-1 font-mono font-black tracking-widest text-white">{room.code}</span>
          <span className="text-sm font-bold">{room.players.length}人：{room.players.map((player) => player.name).join("、")}</span>
          <button disabled={roomBusy} onClick={() => void leaveCanvasRoom()} className="ml-auto rounded-lg border px-3 py-2 text-sm font-bold xl:ml-0">{room.ownerId === session?.id ? "部屋を閉じる" : "退出"}</button>
        </>}
      </aside>
      <div className="min-w-0 space-y-4">
      {features.layers && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-fuchsia-200 bg-white/90 p-3 shadow-lg" aria-label="レイヤー">
        <strong className="mr-1 text-sm">レイヤー</strong>
        {layers.map((layer) => {
          const fixed = room?.layerMode === "per-player";
          const canSelect = !fixed || layer.ownerId === session?.id;
          const hidden = hiddenLayerIds.has(layer.id);
          return <div key={layer.id} className={`flex items-center rounded-lg border ${activeLayerId === layer.id ? "border-fuchsia-500 bg-fuchsia-50" : "border-slate-200"}`}>
            <button type="button" aria-pressed={!hidden} aria-label={`${layer.name}を${hidden ? "表示" : "非表示"}`} onClick={() => setHiddenLayerIds((current) => { const next = new Set(current); if (next.has(layer.id)) next.delete(layer.id); else next.add(layer.id); return next; })} className="px-2 py-1.5 text-xs">{hidden ? "○" : "●"}</button>
            <button type="button" disabled={!canSelect} aria-pressed={activeLayerId === layer.id} onClick={() => setActiveLayerId(layer.id)} className="px-2 py-1.5 text-sm font-bold disabled:opacity-40">{layer.name}</button>
            {room?.layerMode !== "per-player" && (room?.ownerId === session?.id || !room) && layers.length > 1 && <button type="button" aria-label={`${layer.name}を削除`} onClick={() => { if (room) void roomRequest("PATCH", { code: room.code, action: { type: "remove-layer", layerId: layer.id } }); else { setLocalLayers((current) => current.filter((item) => item.id !== layer.id)); setStrokes((current) => current.filter((stroke) => stroke.layerId !== layer.id)); if (activeLayerId === layer.id) setActiveLayerId(layers[0].id); } }} className="px-2 text-xs text-rose-600">×</button>}
          </div>;
        })}
        {(room?.layerMode !== "per-player" && (room || !session?.id)) && <button type="button" onClick={() => { if (room) void roomRequest("PATCH", { code: room.code, action: { type: "add-layer" } }); else { const layer = { id: crypto.randomUUID(), name: `レイヤー${localLayers.length + 1}`, createdAt: Date.now() }; setLocalLayers((current) => [...current, layer]); setActiveLayerId(layer.id); } }} className="rounded-lg border border-fuchsia-300 px-3 py-1.5 text-sm font-bold text-fuchsia-800">＋追加</button>}
        {room && <span className="ml-auto text-xs text-slate-500">{room.layerMode === "per-player" ? "各プレイヤー専用" : "自由に切替"}</span>}
      </div>}
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-300/40 backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1" aria-label="描画ツール">
            <button type="button" aria-pressed={tool === "pen"} onClick={() => setTool("pen")} className={`rounded-lg px-4 py-2 text-sm font-black ${tool === "pen" ? "bg-slate-900 text-white" : "text-slate-600"}`}>ペン <kbd className="ml-1 opacity-60">A</kbd></button>
            <button type="button" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} className={`rounded-lg px-4 py-2 text-sm font-black ${tool === "eraser" ? "bg-slate-900 text-white" : "text-slate-600"}`}>消しゴム <kbd className="ml-1 opacity-60">S</kbd></button>
            {features.eyedropper && <button type="button" aria-pressed={tool === "eyedropper"} onClick={() => setTool("eyedropper")} className={`rounded-lg px-3 py-2 text-sm font-black ${tool === "eyedropper" ? "bg-slate-900 text-white" : "text-slate-600"}`}>スポイト</button>}
            {features.fill && <button type="button" aria-pressed={tool === "fill"} onClick={() => setTool("fill")} className={`rounded-lg px-3 py-2 text-sm font-black ${tool === "fill" ? "bg-slate-900 text-white" : "text-slate-600"}`}>塗りつぶし</button>}
            {!room && <button type="button" aria-pressed={tool === "pan"} onClick={() => setTool("pan")} className={`rounded-lg px-3 py-2 text-sm font-black ${tool === "pan" ? "bg-slate-900 text-white" : "text-slate-600"}`}>✋ 移動</button>}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="ペンの色">
            {colors.map((option) => <button key={option} type="button" aria-label={`色 ${option}`} aria-pressed={color === option} onClick={() => { setColor(option); setTool("pen"); }} className={`h-8 w-8 rounded-full border-2 ${color === option && tool === "pen" ? "border-slate-900 ring-2 ring-cyan-300" : "border-white"}`} style={{ backgroundColor: option }} />)}
            <label className="relative grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-white bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)] shadow-sm" title="好きな色を選ぶ">
              <span className="h-3 w-3 rounded-full border border-white bg-white" aria-hidden="true" />
              <input type="color" value={color} aria-label="カラーパレットから好きな色を選ぶ" onChange={(event) => { setColor(event.target.value); setTool("pen"); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">太さ <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">C</kbd><input type="range" min="1" max="40" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-28 accent-slate-900" /><kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">V</kbd><span className="w-8 text-right tabular-nums">{width}</span></label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">透明度 <input type="range" min="10" max="100" step="5" value={Math.round(opacity * 100)} onChange={(event) => setOpacity(Number(event.target.value) / 100)} className="w-24 accent-cyan-600" /><span className="w-10 text-right tabular-nums">{Math.round(opacity * 100)}%</span></label>
          {features.zoom && <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50" aria-label="表示倍率">
            <button type="button" disabled={zoom <= minimumZoom} onClick={() => changeZoom(-zoomStep)} aria-label="縮小" className="px-2.5 py-2 text-sm font-black disabled:opacity-30">−</button>
            <button type="button" onClick={() => setZoom(1)} title="100%に戻す" className="min-w-14 border-x border-slate-200 px-2 py-2 text-xs font-black tabular-nums">{Math.round(zoom * 100)}%</button>
            <button type="button" disabled={zoom >= maximumZoom} onClick={() => changeZoom(zoomStep)} aria-label="拡大" className="px-2.5 py-2 text-sm font-black disabled:opacity-30">＋</button>
          </div>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setShortcutsOpen(true)} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800">⌨ ショートカット</button>
            <button type="button" disabled={!canUndo} onClick={undo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">自分の一手戻す <kbd className="opacity-50">Z</kbd></button>
            <button type="button" disabled={room !== null || redoStrokes.length === 0} onClick={redo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">やり直す <kbd className="opacity-50">Y</kbd></button>
            <button type="button" disabled={!canClear} onClick={clearCanvas} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-40">{room ? "全消去" : "自分の線を全消去"}</button>
          </div>
        </div>
      </div>

      {!room && <div className="flex items-center justify-between gap-2 px-1"><div><h2 className="font-black text-slate-800">みんなの落書きボード</h2><p className="text-xs font-semibold text-slate-500">通常の4倍の広さ・スクロール対応・描画は3日後に自動で消えます{!session?.id && "（ログインすると全員に共有）"}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600">↔ ↕ スクロール</span>{features.fullscreen && <button type="button" onClick={() => void openBoardFullscreen()} className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-black text-cyan-800 shadow-sm">⛶ 全画面表示</button>}</div></div>}
      <div ref={boardShellRef} className={boardFullscreen ? "fixed inset-0 z-[100] bg-slate-950" : "relative"}>
        {boardFullscreen && <><div className="absolute right-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/85 p-2 text-white shadow-xl backdrop-blur">
          <button type="button" aria-expanded={fullscreenToolsOpen} onClick={() => setFullscreenToolsOpen((open) => !open)} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-black text-slate-950">🎨 ツール</button>
          <button type="button" disabled={zoom <= minimumZoom} onClick={() => changeZoom(-zoomStep)} className="rounded px-2 py-1 font-black disabled:opacity-30">−</button>
          <button type="button" onClick={() => setZoom(1)} className="min-w-14 text-xs font-black tabular-nums">{Math.round(zoom * 100)}%</button>
          <button type="button" disabled={zoom >= maximumZoom} onClick={() => changeZoom(zoomStep)} className="rounded px-2 py-1 font-black disabled:opacity-30">＋</button>
          <button type="button" onClick={() => void closeBoardFullscreen()} className="ml-1 rounded-lg bg-white px-3 py-1.5 text-xs font-black text-slate-900">閉じる</button>
        </div>
        {fullscreenToolsOpen && <div className="absolute right-3 top-16 z-30 w-[min(420px,calc(100vw-1.5rem))] rounded-2xl border border-white/20 bg-white/95 p-3 text-slate-900 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => setTool("pen")} className={`rounded-lg px-3 py-2 text-xs font-black ${tool === "pen" ? "bg-slate-900 text-white" : "text-slate-600"}`}>ペン A</button>
            <button type="button" onClick={() => setTool("eraser")} className={`rounded-lg px-3 py-2 text-xs font-black ${tool === "eraser" ? "bg-slate-900 text-white" : "text-slate-600"}`}>消しゴム S</button>
            {features.eyedropper && <button type="button" onClick={() => setTool("eyedropper")} className={`rounded-lg px-3 py-2 text-xs font-black ${tool === "eyedropper" ? "bg-slate-900 text-white" : "text-slate-600"}`}>スポイト</button>}
            {features.fill && <button type="button" onClick={() => setTool("fill")} className={`rounded-lg px-3 py-2 text-xs font-black ${tool === "fill" ? "bg-slate-900 text-white" : "text-slate-600"}`}>塗りつぶし</button>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">{colors.map((option) => <button key={option} type="button" aria-label={`色 ${option}`} onClick={() => { setColor(option); setTool("pen"); }} className={`h-8 w-8 rounded-full border-2 ${color === option && tool === "pen" ? "border-slate-900 ring-2 ring-cyan-300" : "border-white"}`} style={{ backgroundColor: option }} />)}<label className="relative grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-white bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]"><input type="color" value={color} aria-label="好きな色" onChange={(event) => { setColor(event.target.value); setTool("pen"); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label></div>
          <label className="mt-3 flex items-center gap-2 text-xs font-bold">太さ <input type="range" min="1" max="40" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="min-w-0 flex-1 accent-slate-900" /><span className="w-7 text-right tabular-nums">{width}</span></label>
          <label className="mt-2 flex items-center gap-2 text-xs font-bold">透明度 <input type="range" min="10" max="100" step="5" value={Math.round(opacity * 100)} onChange={(event) => setOpacity(Number(event.target.value) / 100)} className="min-w-0 flex-1 accent-cyan-600" /><span className="w-10 text-right tabular-nums">{Math.round(opacity * 100)}%</span></label>
        </div>}</>}
      <div ref={boardViewportRef} className={`${boardFullscreen ? "h-full max-h-none rounded-none border-0" : "max-h-[72vh] rounded-2xl border-4 border-white"} overflow-auto bg-white shadow-2xl shadow-slate-400/40`}>
        <div className={room ? "aspect-[4/3] min-h-[320px] w-full" : "h-[1200px] w-[1600px]"} style={{ zoom }}><DrawingCanvas strokes={visibleStrokes} layerIds={layers.filter((layer) => !hiddenLayerIds.has(layer.id)).map((layer) => layer.id)} activeLayerId={activeLayerId} color={color} width={width} opacity={opacity} tool={tool} keyboardCursor={keyboardCursorVisible ? keyboardCursor : undefined} onPointerInteraction={() => { setKeyboardCursorVisible(false); if (!room) activateLobbySync(); }} onPointerPosition={setKeyboardCursor} onColorPick={(picked) => { setColor(picked); setTool("pen"); }} onStrokeProgress={submitStrokeProgress} onPan={(deltaX, deltaY) => boardViewportRef.current?.scrollBy(deltaX, deltaY)} onStrokeComplete={submitStroke} /></div>
      </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-semibold text-slate-500"><span>{syncNotice}</span><span>A ペン・S 消しゴム・C 細く・V 太く・Z 戻す・Y やり直す</span><span>＋/− 拡大縮小・0 等倍・Ctrl＋ホイール</span><span>矢印 移動・Space＋矢印 描画・Shift 高速</span><span>{strokes.length}ストローク</span></div>
      </div>
    </section>

    <GameRulesDialog open={rulesOpen} title="キャンバスの使い方" onClose={() => setRulesOpen(false)}>
      <p>マウス、指、ペン、キーボードで自由に絵を描けるキャンバスです。今は描き心地や操作方法を試すためのテスト版です。</p>
      <h3 className="mt-4 font-black text-white">基本の描き方</h3>
      <ol className="mt-2 list-decimal space-y-2 pl-5">
        <li>「ペン」を選び、キャンバスの上をドラッグすると線を描けます。</li>
        <li>色、線の太さ、透明度はいつでも変更できます。透明度を下げると、下の線が透ける半透明の色になります。</li>
        <li>「消しゴム」で線を消せます。「自分の一手戻す」は選択中のレイヤーで自分が最後に描いた線だけを取り消します。「やり直す」で戻した線を元に戻せます。</li>
        <li>落書きボードの「自分の線を全消去」は自分が描いた線だけを消します。共同ルームの「全消去」はホストがキャンバス全体を白紙にします。どちらも実行前に確認画面が表示されます。</li>
      </ol>
      <h3 className="mt-4 font-black text-white">キーボードで描く</h3>
      <p className="mt-2">水色の丸がキーボードカーソルです。矢印キーで移動し、Spaceを押しながら矢印キーを押すと線を描けます。Shiftも一緒に押すと速く動きます。くわしいキーは「キーボードショートカット」で確認できます。</p>
      <h3 className="mt-4 font-black text-white">保存と同期</h3>
      <p className="mt-2">通常の描画はこの端末へ自動保存されます。「みんなで描く」ではルームコードを共有して別端末から同じ絵を編集できます。作成時に、全員が自由に切り替えるレイヤーか、参加者ごとの専用レイヤーを選べます。</p>
      <h3 className="mt-4 font-black text-white">レイヤー</h3>
      <p className="mt-2">●で表示・非表示を切り替え、名前のボタンで描画先を選びます。レイヤーごとに描画面を分けているため、消しゴムは選択中のレイヤーだけに作用します。</p>
      <h3 className="mt-4 font-black text-white">得点・終了・時間制限</h3>
      <p className="mt-2 rounded-lg bg-sky-300/10 p-3">現在はゲームではなく描画機能のテスト版なので、得点、勝ち負け、終了条件、時間制限はありません。描いた結果が戦績に記録されることもありません。</p>
    </GameRulesDialog>
    <GameRulesDialog open={shortcutsOpen} title="キーボードショートカット" onClose={() => setShortcutsOpen(false)}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3">
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">A</kbd></dt><dd>ペンへ切り替え</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">S</kbd></dt><dd>消しゴムへ切り替え</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">C</kbd></dt><dd>線を1段階細くする</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">V</kbd></dt><dd>線を1段階太くする</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Z</kbd></dt><dd>一手戻す</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Y</kbd></dt><dd>戻した操作をやり直す</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">＋ / −</kbd></dt><dd>キャンバスを10%ずつ拡大・縮小</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">0</kbd></dt><dd>表示倍率を100%に戻す</dd>
        <dt><span className="flex items-center gap-1"><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Ctrl / ⌘</kbd><span>＋ホイール</span></span></dt><dd>マウス位置で拡大・縮小。通常のホイールはスクロール</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></dt><dd>水色のキーボードカーソルを移動。上下と左右の同時押しで斜め移動</dd>
        <dt><span className="flex items-center gap-1"><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Space</kbd><span>＋</span><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></span></dt><dd>カーソルを動かしながら描画</dd>
        <dt><span className="flex items-center gap-1"><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Shift</kbd><span>＋</span><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></span></dt><dd>カーソルを速く移動</dd>
      </dl>
      <p className="mt-5 text-xs text-slate-400">入力欄を操作している間はショートカットが反応しません。</p>
    </GameRulesDialog>
  </main>;
}
