"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { DebugToolButton, DebugToolsSection } from "@/app/components/DebugGameTools";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameLoungeVisual } from "@/app/components/GameLoungeVisual";
import { GamePhaseTimer } from "@/app/components/GamePhaseTimer";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { OnlineRoomSpectatorLink } from "@/app/components/OnlineRoomSpectatorLink";
import { PageLoadingOverlay } from "@/app/components/PageLoadingOverlay";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { OnlineRoomLifecycleActions } from "@/app/components/OnlineRoomLifecycleActions";
import { RoomLobbyReturnStatus } from "@/app/components/RoomLobbyReturnStatus";
import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import { northernBaseResources, northernBuildings, northernCards } from "@/lib/northern-branch-data";
import { northernRules } from "@/lib/northern-branch-game";
import type { NorthernRoomPlayer } from "@/lib/northern-branch-types";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
} from "@/lib/player-session";
import type { NorthernBranchController } from "./use-northern-branch-controller";

function PlayerRow({ player, isHost, isMe }: { player: NorthernRoomPlayer; isHost: boolean; isMe: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border p-3 ${isMe ? "border-lime-300 bg-lime-300/10" : "border-white/10 bg-white/[0.04]"}`}>
      <span
        className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-cover bg-center"
        style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate font-bold">{player.name}{isMe ? "（あなた）" : ""}</span>
      {player.isDummy && <span className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-black text-cyan-100">ダミー</span>}
      {isHost && <span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">ホスト</span>}
    </li>
  );
}


export function NorthernBranchDesktopLayout({ controller }: { controller: NorthernBranchController }) {
  const { state, setters, viewModel, permissions, actions, result: resultReturnGate } = controller;
  const {
    room, session, ready, isRestoringRoom, error, passphrase, joinCode,
    choices, showChoices, isSaving, rulesOpen,
  } = state;
  const {
    playerId, game, activePlayer, paymentIndexes, handPlayer,
    selectedValue, winner, configItems, marketCards,
  } = viewModel;
  const { isHost, canControlTurn } = permissions;
  const { setPassphrase, setJoinCode, setPaymentSelection, setRulesOpen } = setters;
  const {
    runAction, perform, createRoom, listRooms, joinRoom, dissolveRoom,
    leaveRoom, returnToRoom,
  } = actions;

  const rulesDialog = <GameRulesDialog open={rulesOpen} title="ノーザンブランチのルール" onClose={() => setRulesOpen(false)}>
    <p>資源を集めて商品を作り、建物を増やして自分の商会を育てるゲームです。「勝利点」をいちばん早く10点集めた人が勝ちます。</p>
    <h3 className="mt-4 font-black text-white">ゲームの見方</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      <li><span className="font-bold text-white">手札：</span>支払いに使うカードです。中身は持ち主だけに見え、最大7枚まで持てます。</li>
      <li><span className="font-bold text-white">市場：</span>今作れる商品、買える商品、建てられる建物が5枚並びます。1枚取ると新しい1枚が補充されます。</li>
      <li><span className="font-bold text-white">価値と勝利点：</span>カードの「価値」は買い物の支払いに使う数字です。「勝利点」は勝敗を決める別の数字です。</li>
    </ul>
    <h3 className="mt-4 font-black text-white">自分の番にすること</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5">
      <li>まず、メインの行動を1つ行います。「資源を1枚もらう」「材料を使って市場の商品を作る」「カードを支払って商品を買う」「カードを支払って建物を建てる」のどれかです。</li>
      <li>持っている建物の能力は、メインの行動とは別に使えます。建物1軒につき、自分の番に1回までです。</li>
      <li>行動が終わったら「手番終了」を押します。豚か鶏を持っていて手札に空きがあると、ダングが1枚増えてから次の人へ交代します。</li>
    </ol>
    <h3 className="mt-4 font-black text-white">商品を作る・買う</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      <li>商品カードには必要な材料が書かれています。材料が全部そろっていれば、その材料を手札から出して商品を作れます。</li>
      <li>商品や建物を買うときは、手札から支払いに使うカードを選びます。選んだカードの価値の合計が値段以上なら買えます。</li>
      <li>多く払いすぎてもお釣りはありません。たとえば値段4に対して価値5を支払うと、1余っても戻りません。</li>
      <li>ダングの価値は−1です。ほかのカードと一緒に支払うと、支払いの合計が1下がります。</li>
    </ul>
    <h3 className="mt-4 font-black text-white">得点と勝ち方</h3>
    <ul className="mt-2 list-disc space-y-2 pl-5">
      <li>建物を建てると、その建物に書かれた1〜3勝利点をすぐにもらいます。同じ建物は2軒建てられません。</li>
      <li>「交易所」の能力で商品を1枚売ると1勝利点、「商人ギルド」で商品を2枚売ると2勝利点をもらいます。</li>
      <li>支払いに使うカードの価値や、手札にある商品の価値は、そのままでは勝利点になりません。</li>
      <li>行動の途中でも10勝利点に到達した瞬間にゲームが終わり、その人の勝ちです。ほかの人が同じ回数だけ手番を行うのを待ちません。</li>
    </ul>
    <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100"><span className="font-bold">例：</span>2点の建物を建てて合計9点になり、その建物を使ってさらに1点を得たら、合計10点になった時点で勝利です。</div>
    <h3 className="mt-4 font-black text-white">公開される情報</h3>
    <p className="mt-2">市場、全員の建物、勝利点、現在の手番、行動履歴は全員に見えます。手札は枚数だけが公開され、中身は本人にしか見えません。</p>
    <h3 className="mt-4 font-black text-white">時間制限</h3>
    <p className="mt-2">部屋で1手番の制限時間を設定できます。0秒なら時間制限はありません。時間切れになると、その手番では資源やダングを得ずに次の人へ交代します。</p>
    <p className="mt-3 text-amber-200">現在は試作版のため、カードの種類や数値は今後変わることがあります。</p>
  </GameRulesDialog>;

  if (!ready) return <PageLoadingOverlay />;

  if (!session?.id) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">ノーザンブランチ</h1><p className="mt-4 leading-7 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。広場でログインしてください。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-lime-400 px-5 py-3 font-black text-lime-950">広場へ</Link></div></main>;
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#365314_0%,#172033_42%,#020617_82%)] px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-2"><Link href="/games" className="text-sm font-bold text-lime-200">← 広場</Link><div className="flex items-center gap-2"><button type="button" onClick={() => setRulesOpen(true)} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold">ルール</button><span className="text-sm font-bold">{session.name}</span></div></div>
          <GameLoungeVisual gameId="northern-branch" className="mt-5" />
          <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <div className="bg-gradient-to-r from-lime-400 via-amber-300 to-orange-400 px-6 py-8 text-slate-950"><p className="text-xs font-black uppercase tracking-[0.28em]">Online room game</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">ノーザンブランチ</h1><p className="mt-3 font-bold">資源を商品へ育て、建物を増やし、最初に10点を目指す手番制ゲーム。</p></div>
            {isRestoringRoom && <p className="border-b border-lime-300/20 bg-lime-300/10 px-6 py-3 text-sm font-bold text-lime-100">前回の部屋を確認中です。画面は先に表示しています。</p>}
            <div inert={isRestoringRoom} aria-busy={isRestoringRoom} className={`grid gap-6 p-6 md:grid-cols-2 ${isRestoringRoom ? "opacity-60" : ""}`}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋を作る</h2><p className="mt-2 text-sm leading-6 text-slate-400">あなたがホストになり、参加者を集めて開始します。</p><label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><button type="button" disabled={isSaving} onClick={createRoom} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase text-white outline-none" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-lime-400 px-3 py-3 font-black text-lime-950 disabled:opacity-50">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
            </div>
            {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => { setJoinCode(choice.code); void joinRoom(choice.code); }} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-lime-300">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}/4人・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div></div>}
            {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          </section>
        </div>
        <GameAdSlot gameId="northern-branch" surface="game-entry" />
        {rulesDialog}
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#365314_0%,#172033_35%,#020617_75%)] text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Trading company strategy" title={<>ノーザンブランチ <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
        {room.phase === "lobby" && (isHost
          ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button>
          : <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>)}
        <GameTopMenu>
          {room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>広場へ戻る</Link>}
          <OnlineRoomSpectatorLink game="northern-branch" code={room.code} />
          <button type="button" data-menu-close="true" onClick={() => setRulesOpen(true)} className={gameTopMenuItemClass}>ルール</button>
          {room.phase === "lobby" && !isHost && <button type="button" data-menu-close="true" onClick={() => void leaveRoom()} className={gameTopMenuItemClass}>退出</button>}
        </GameTopMenu>
        {isHost && <DebugModeButton
          variant="banner"
          enabled={room.debugMode}
          disabled={isSaving || room.phase !== "lobby"}
          onAbort={room.debugMode && room.phase !== "lobby" ? () => runAction({ type: "abort-game", actorId: playerId }).then(() => undefined) : undefined}
          replayEnabled={room.debugReplayEnabled}
          replayDisabled={isSaving}
          onReplayChange={(enabled) => runAction({ type: "set-debug-replay", actorId: playerId, enabled }).then(() => undefined)}
          onChange={(enabled) => runAction({ type: "set-debug", actorId: playerId, enabled }).then(() => undefined)}
          gameTools={room.phase === "lobby"
            ? <DebugToolsSection title="ダミー参加者" description="ホスト1人で手番を切り替えながら確認できます。">
                <DebugToolButton disabled={isSaving || room.players.length >= 4} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })}>ダミーを追加</DebugToolButton>
              </DebugToolsSection>
            : undefined}
        />}
        <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
      </GameTopBanner>
      <GameAdSlot
        gameId="northern-branch"
        surface={room.phase === "lobby" ? "room-lobby" : room.phase === "finished" ? "result" : null}
        disabled={room.debugMode}
      />
      {room.phase === "lobby" && <div className="mx-auto max-w-7xl px-4 pt-4"><GameLoungeVisual gameId="northern-branch" /></div>}
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <aside className="space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者</h2><span className="text-sm text-slate-400">{room.players.length}/4人</span></div><ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerRow key={player.id} player={player} isHost={player.id === room.hostId} isMe={player.id === playerId} />)}</ul><RoomLobbyReturnStatus state={room.lobbyReturn} players={room.players} hostId={room.hostId} isHost={isHost} onRemoveWaitingPlayer={(player) => { if (window.confirm(`${player.name}さんを退出扱いにしますか？`)) void runAction({ type: "remove-waiting-player", actorId: playerId, targetPlayerId: player.id }); }} /></section><RoomConfigSummary items={configItems} /></aside>
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          {room.notice && <p className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm font-bold text-cyan-50">{room.notice}</p>}
          {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">ゲーム開始前</h2><p className="mt-3 rounded-xl bg-white/[0.05] p-4 text-sm leading-6 text-slate-300">2〜4人で遊びます。開始後は各自の手札が本人の端末だけに表示され、手番のプレイヤーだけが行動できます。</p>{isHost && <div className="mt-5 rounded-xl bg-white p-4 text-slate-950"><RoomTimeLimitControl label="1手番の時間" value={room.turnTimeLimitSeconds} onChange={(seconds) => void runAction({ type: "set-config", actorId: playerId, turnTimeLimitSeconds: seconds })} /></div>}{isHost ? <button type="button" disabled={isSaving || room.players.length < 2} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{room.players.length < 2 ? "2人以上で開始できます" : "このメンバーで開始"}</button> : <p className="mt-5 text-center font-bold text-slate-300">ホストがゲームを開始するまでお待ちください。</p>}</section>}

          {game && <>
            <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-lime-300">第{game.turn}巡目</p><h2 className="mt-1 text-2xl font-black">{activePlayer?.name}の手番</h2></div><div className="flex flex-wrap items-center gap-2">{room.turnStartedAt && <GamePhaseTimer key={room.turnStartedAt} durationSeconds={room.turnTimeLimitSeconds} startedAt={room.turnStartedAt} label="手番時間" />}<span className={`rounded-xl px-4 py-2 text-sm font-black ${canControlTurn ? "bg-lime-400 text-lime-950" : "bg-white/10 text-slate-300"}`}>{canControlTurn ? "操作できます" : "手番を待っています"}</span></div></div>{room.debugMode && isHost && activePlayer?.id !== playerId && <p className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm font-bold text-cyan-50">デバッグ中：ホストが{activePlayer?.name}の手番を操作しています。</p>}</section>
            {winner && <section className="rounded-2xl border border-amber-300 bg-amber-300/15 p-6 text-center"><p className="text-sm font-bold text-amber-200">GAME FINISHED</p><p className="mt-2 text-3xl font-black">{winner.name}の勝利！</p><OnlineRoomLifecycleActions surface="result" canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} /></section>}
            <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><div><p className="text-xs font-bold uppercase text-cyan-300">Market</p><h2 className="text-xl font-black">市場の商品と建物</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{marketCards.map((offer) => { const item = offer.kind === "product" ? northernCards[offer.cardId] : northernBuildings[offer.buildingId]; const cost = offer.kind === "product" ? northernCards[offer.cardId].value : northernBuildings[offer.buildingId].cost; const recipe = offer.kind === "product" ? Object.entries(northernCards[offer.cardId].recipe ?? {}).map(([id, count]) => `${northernCards[id as keyof typeof northernCards].name}×${count}`).join("・") : ""; return <article key={offer.id} className="rounded-xl border border-white/10 bg-slate-900 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-400">{offer.kind === "product" ? "商品" : "建物"}</p><h3 className="font-black">{item.name}</h3></div><span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-amber-950">価値 {cost}</span></div>{offer.kind === "product" ? <p className="mt-2 min-h-10 text-xs text-slate-300">生産：{recipe}</p> : <p className="mt-2 min-h-10 text-xs text-slate-300">{northernBuildings[offer.buildingId].description} / {northernBuildings[offer.buildingId].points}点</p>}<div className="mt-3 flex gap-2">{offer.kind === "product" && <button type="button" disabled={!canControlTurn || game.mainActionUsed || room.phase === "finished" || isSaving} onClick={() => perform({ type: "produce", offerId: offer.id })} className="flex-1 rounded-lg bg-cyan-600 px-2 py-2 text-xs font-bold disabled:opacity-30">生産</button>}<button type="button" disabled={!canControlTurn || game.mainActionUsed || room.phase === "finished" || isSaving} onClick={() => perform({ type: "buy", offerId: offer.id, paymentIndexes })} className="flex-1 rounded-lg bg-amber-500 px-2 py-2 text-xs font-bold text-amber-950 disabled:opacity-30">売買</button></div></article>; })}</div></section>
            <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-lime-300">Main action</p><h2 className="text-xl font-black">資源を1枚得る</h2></div><span className={`rounded-lg px-3 py-2 text-xs font-bold ${game.mainActionUsed ? "bg-slate-700 text-slate-300" : "bg-lime-300 text-lime-950"}`}>{game.mainActionUsed ? "使用済み" : "選択可能"}</span></div><div className="mt-4 flex flex-wrap gap-2">{northernBaseResources.map((cardId) => <button key={cardId} type="button" disabled={!canControlTurn || game.mainActionUsed || room.phase === "finished" || isSaving} onClick={() => perform({ type: "take-resource", cardId })} className={`rounded-lg px-3 py-2 text-sm font-black disabled:opacity-30 ${northernCards[cardId].color}`}>{northernCards[cardId].name}</button>)}</div></section>
            <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-amber-300">Private hand</p><h2 className="text-xl font-black">{handPlayer?.name}の手札</h2></div><p className="text-sm font-bold text-amber-200">選択価値 {selectedValue}</p></div><p className="mt-2 text-xs text-slate-400">売買に使うカードを選びます。他のプレイヤーには内容が送信されません。</p><div className="mt-3 flex flex-wrap gap-2">{handPlayer?.hand.map((cardId, index) => { const card = northernCards[cardId]; const selected = paymentIndexes.includes(index); return <button key={`${cardId}-${index}`} type="button" disabled={!canControlTurn || isSaving} aria-pressed={selected} onClick={() => setPaymentSelection((current) => { const indexes = current.playerId === handPlayer.id ? current.indexes : []; return { playerId: handPlayer.id, indexes: selected ? indexes.filter((item) => item !== index) : [...indexes, index] }; })} className={`min-w-24 rounded-xl border p-3 text-left transition disabled:opacity-50 ${selected ? "border-cyan-300 ring-2 ring-cyan-300/40" : "border-white/10"} ${card.color}`}><span className="block text-xs font-bold opacity-70">{card.kind}</span><span className="block font-black">{card.name}</span><span className="block text-xs font-bold">価値 {card.value}</span></button>; })}</div>{!canControlTurn && <p className="mt-4 rounded-lg bg-white/[0.05] p-3 text-sm text-slate-300">自分の手札はいつでも確認できます。手番が来るとカードを選んで行動できます。</p>}</section>
            <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><div><p className="text-xs font-bold uppercase text-violet-300">Building actions</p><h2 className="text-xl font-black">{handPlayer?.name}の建物</h2></div>{handPlayer?.buildings.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{handPlayer.buildings.map((buildingId) => { const building = northernBuildings[buildingId]; const used = handPlayer.usedBuildings.includes(buildingId); return <article key={buildingId} className="rounded-xl border border-white/10 bg-slate-900 p-3"><div className="flex items-start justify-between gap-2"><h3 className="font-black">{building.name}</h3><span className="text-sm font-black text-amber-300">{building.points}点</span></div><p className="mt-2 min-h-10 text-xs text-slate-300">{building.description}</p><button type="button" disabled={!canControlTurn || used || room.phase === "finished" || isSaving} onClick={() => perform({ type: "use-building", buildingId })} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold disabled:bg-slate-700 disabled:text-slate-400">{used ? "使用済み" : building.actionLabel}</button></article>; })}</div> : <p className="mt-3 rounded-lg bg-black/20 p-4 text-sm text-slate-400">まだ建物がありません。市場から購入できます。</p>}</section>
            <button type="button" disabled={!canControlTurn || !game.mainActionUsed || room.phase === "finished" || isSaving} onClick={() => perform({ type: "end-turn" })} className="w-full rounded-xl bg-lime-400 px-4 py-4 text-lg font-black text-lime-950 transition hover:bg-lime-300 disabled:bg-slate-700 disabled:text-slate-400">手番を終了して次の人へ</button>
          </>}
        </div>
        <aside className="space-y-3">{game && <><section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><p className="text-xs font-bold uppercase text-amber-300">Scores</p><div className="mt-3 space-y-2">{game.players.map((player, index) => <div key={player.id} className={`rounded-lg border p-3 ${index === game.activePlayerIndex ? "border-lime-300 bg-lime-300/10" : "border-white/10 bg-black/10"}`}><div className="flex items-center justify-between gap-2"><p className="truncate font-bold">{player.name}</p><p className="font-black text-amber-300">{player.points}点</p></div><p className="mt-1 text-xs text-slate-400">手札 {player.handCount ?? player.hand.length}/{northernRules.handLimit}・建物 {player.buildings.length}</p></div>)}</div></section><section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><p className="font-black">行動履歴</p><ul className="mt-3 space-y-2">{game.log.slice(0, 12).map((entry, index) => <li key={`${entry}-${index}`} className="border-b border-white/5 pb-2 text-xs leading-5 text-slate-300">{entry}</li>)}</ul></section></>}</aside>
      </div>
      {rulesDialog}
    </main>
  );
}
