"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { DebugModeButton } from "@/app/components/DebugModeButton";
import { DebugToolButton, DebugToolsSection } from "@/app/components/DebugGameTools";
import { GameAdSlot } from "@/app/components/GameAdSlot";
import { GameLoungeVisual } from "@/app/components/GameLoungeVisual";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { OnlineRoomSpectatorLink } from "@/app/components/OnlineRoomSpectatorLink";
import { PageLoadingOverlay } from "@/app/components/PageLoadingOverlay";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GamePhaseTimer } from "@/app/components/GamePhaseTimer";
import { PlayerTimeoutNotice } from "@/app/components/PlayerTimeoutNotice";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import { OnlineRoomLifecycleActions } from "@/app/components/OnlineRoomLifecycleActions";
import { RoomLobbyReturnStatus } from "@/app/components/RoomLobbyReturnStatus";
import { RoomTimeLimitControl } from "@/app/components/RoomTimeLimitControl";
import type { KotobaSenpukuPlayer } from "@/lib/kotoba-senpuku";
import {
  defaultAvatarImage,
  fallbackAvatarColor,
} from "@/lib/player-session";
import type { KotobaSenpukuController } from "./use-kotoba-senpuku-controller";

const kotobaSenpukuKanaBoard: Array<Array<string | null>> = [
  ["わ", "ら", "や", "ま", "は", "な", "た", "さ", "か", "あ"],
  [null, "り", null, "み", "ひ", "に", "ち", "し", "き", "い"],
  [null, "る", "ゆ", "む", "ふ", "ぬ", "つ", "す", "く", "う"],
  [null, "れ", null, "め", "へ", "ね", "て", "せ", "け", "え"],
  ["を", "ろ", "よ", "も", "ほ", "の", "と", "そ", "こ", "お"],
];
function PlayerRow({ player, isHost, isMe, eliminated = false }: { player: KotobaSenpukuPlayer; isHost: boolean; isMe: boolean; eliminated?: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl border p-3 ${isMe ? "border-fuchsia-300 bg-fuchsia-300/10" : "border-white/10 bg-white/[0.04]"}`}>
      <span
        className="h-9 w-9 shrink-0 rounded-full border border-white/30 bg-cover bg-center"
        style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate font-bold">{player.name}{isMe ? "（あなた）" : ""}</span>
      {player.isDummy && <span className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-black text-cyan-100">ダミー</span>}
      {eliminated && <span className="rounded-md border border-rose-300/30 bg-rose-300/10 px-2 py-1 text-xs font-black text-rose-100">脱落</span>}
      {isHost && <span className="rounded-md bg-amber-300 px-2 py-1 text-xs font-black text-slate-950">ホスト</span>}
    </li>
  );
}

function BinaryRuleControl({
  label,
  description,
  value,
  onChange,
  falseLabel = "なし",
  trueLabel = "あり",
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  falseLabel?: string;
  trueLabel?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-200">{label}</legend>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {[
          { label: falseLabel, value: false },
          { label: trueLabel, value: true },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
              value === option.value
                ? "border-fuchsia-300 bg-fuchsia-300 text-fuchsia-950 shadow-sm"
                : "border-white/15 bg-white/[0.05] text-slate-200 hover:bg-white/10"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
    </fieldset>
  );
}


export function KotobaSenpukuDesktopLayout({ controller }: { controller: KotobaSenpukuController }) {
  const { state, setters, viewModel, permissions, actions, result: resultReturnGate } = controller;
  const {
    room, session, ready, isRestoringRoom, error, passphrase, joinCode, choices,
    showChoices, secretWord, challengeGuess, isSaving, rulesOpen,
  } = state;
  const {
    playerId, activePlayer, challengeTargets,
    effectiveTarget, latestResult, winnerIds, winnerNames, ownSecretKana,
    configItems,
  } = viewModel;
  const { isHost, canControlTurn } = permissions;
  const {
    setPassphrase, setJoinCode, setSecretWord, setChallengeTarget,
    setChallengeGuess, setRulesOpen,
  } = setters;
  const {
    runAction, createRoom, listRooms, joinRoom, dissolveRoom, leaveRoom,
    updateConfig, submitSecret, challengeWord, returnToRoom,
  } = actions;

  const rulesDialog = <GameRulesDialog open={rulesOpen} title="ワードソナーのルール" onClose={() => setRulesOpen(false)}>
    <p>ほかの人の「秘密のことば」を文字から探しながら、自分のことばは最後まで隠すゲームです。むずかしい知識は必要ありません。文字を当てて、少しずつ答えに近づきます。</p>
    <h3 className="mt-4 font-black text-white">ゲームの準備</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5">
      <li>全員が、お題に合う秘密のことばを1つ入力します。使えるのは、ひらがなと長音符「ー」です。</li>
      <li>秘密のことばは、ほかの人には見えません。2人で遊ぶときだけ、2文字以上のことばを入力します。</li>
      <li>全員の入力が終わると、設定に合わせてランダムまたは参加順で最初の人を決めます。</li>
    </ol>
    <h3 className="mt-4 font-black text-white">自分の番にすること</h3>
    <ol className="mt-2 list-decimal space-y-2 pl-5">
      <li>基本は「文字スキャン」です。「あ」〜「ん」と「ー」の文字盤から、まだ選ばれていない文字を1つ選びます。</li>
      <li>選んだ文字が誰かの秘密のことばに入っていれば、その人の同じ文字がすべて公開されます。たとえば「か」を選ぶと、「すいか」にある「か」が見えるようになります。</li>
      <li>選んだ文字が誰のことばにもなければ、何も公開されずに次の人の番です。</li>
      <li>部屋の設定で「連続探知」がありなら、1人以上に当たったときは続けてもう1文字選べます。なしなら、当たっても次の人へ交代します。</li>
      <li>「秘密語回答」がありなら、文字を選ぶ代わりに、相手のことば全体を答えることもできます。正解なら相手が脱落します。不正解でも自分の番は終わります。</li>
      <li>「直接回答ログ」で、直接回答した言葉を行動履歴とプレイバックへ表示するか選べます。非表示でも、対象者と正誤は公開されます。</li>
    </ol>
    <h3 className="mt-4 font-black text-white">脱落と勝ち方</h3>
    <p className="mt-2">文字をすべて公開された人、またはことば全体を当てられた人は脱落します。最後まで秘密のことばが残った人の勝ちです。</p>
    <h3 className="mt-4 font-black text-white">得点</h3>
    <div className="mt-2 space-y-2 text-slate-300">
      <p>1ラウンドの勝者は<strong className="text-white">3点</strong>、それ以外の人は0点です。途中で文字を当てた回数や、相手を脱落させた人数では点は増えません。</p>
      <p>同率勝利になった場合は、勝者全員が3点ずつ受け取ります。複数ラウンドで遊ぶ設定では、ラウンドごとの点を足して最終順位を決めます。</p>
      <p className="rounded-lg bg-fuchsia-300/10 p-3"><strong className="text-fuchsia-100">例：</strong>3人のうち、あおいさんが最後まで残った場合は、あおいさんが3点、ほかの2人は0点です。</p>
    </div>
    <h3 className="mt-4 font-black text-white">時間切れ</h3>
    <p className="mt-2">秘密語の入力時間や1回の手番時間は、部屋の設定で決めます。0秒なら時間制限はありません。時間内に行動しなかったときは、自動で次へ進みます。</p>
    <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <summary className="cursor-pointer font-bold text-slate-200">文字の判定と同時脱落について</summary>
      <div className="mt-3 space-y-2 text-slate-300"><p>濁点・半濁点や小さいかなは、元の清音と同じ仲間として判定します。「が」は「か」、「っ」は「つ」を選ぶと公開されます。「ー」だけは独立した文字です。</p><p>公開済みの文字は、秘密のことばに登場する順で詰めて表示します。まだ隠れている文字数や、ことば全体の長さは表示されません。</p><p>最後に複数人が同時脱落した場合は、秘密のことばが最も短い人が勝ちです。同じ長さなら同率勝利です。</p></div>
    </details>
  </GameRulesDialog>;

  if (!ready) return <PageLoadingOverlay />;

  if (!session?.id) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-white"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-6 text-center"><h1 className="text-3xl font-black">ワードソナー</h1><p className="mt-4 leading-7 text-slate-300">このゲームはログインしたプレイヤー同士で遊びます。広場でログインしてください。</p><Link href="/games" className="mt-6 inline-flex rounded-xl bg-fuchsia-400 px-5 py-3 font-black text-fuchsia-950">広場へ</Link></div></main>;
  }

  if (!room) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#701a75_0%,#172033_42%,#020617_82%)] px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-2"><Link href="/games" className="text-sm font-bold text-fuchsia-200">← 広場</Link><div className="flex items-center gap-2"><button type="button" onClick={() => setRulesOpen(true)} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-bold">ルール</button><span className="text-sm font-bold">{session.name}</span></div></div>
          <GameLoungeVisual gameId="kotoba-senpuku" className="mt-5" />
          <section className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl">
            <div className="bg-gradient-to-r from-fuchsia-400 via-cyan-300 to-amber-300 px-6 py-8 text-slate-950"><p className="text-xs font-black uppercase tracking-[0.28em]">Original online word game</p><h1 className="mt-2 text-4xl font-black sm:text-6xl">ワードソナー</h1><p className="mt-3 font-bold">秘密のことばを探り合い、全文公開による脱落を避けて最後の1人を目指す。</p></div>
            {isRestoringRoom && <p className="border-b border-fuchsia-300/20 bg-fuchsia-300/10 px-6 py-3 text-sm font-bold text-fuchsia-100">前回の部屋を確認中です。画面は先に表示しています。</p>}
            <div inert={isRestoringRoom} aria-busy={isRestoringRoom} className={`grid gap-6 p-6 md:grid-cols-2 ${isRestoringRoom ? "opacity-60" : ""}`}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋を作る</h2><p className="mt-2 text-sm leading-6 text-slate-400">あなたがホストになり、設定と進行を管理します。</p><label className="mt-4 block text-sm font-bold">合言葉（任意）<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><button type="button" disabled={isSaving} onClick={createRoom} className="mt-4 w-full rounded-xl bg-amber-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">新しい部屋を作る</button></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋に参加</h2><label className="mt-4 block text-sm font-bold">部屋コード<input value={joinCode} maxLength={4} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 font-mono text-lg uppercase text-white outline-none" /></label><label className="mt-3 block text-sm font-bold">合言葉<input type="password" value={passphrase} maxLength={40} onChange={(event) => setPassphrase(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" /></label><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={isSaving} onClick={() => void joinRoom()} className="rounded-xl bg-fuchsia-400 px-3 py-3 font-black text-fuchsia-950 disabled:opacity-50">コードで参加</button><button type="button" onClick={() => void listRooms()} className="rounded-xl border border-white/20 px-3 py-3 font-black">部屋一覧</button></div></div>
            </div>
            {showChoices && <div className="border-t border-white/10 p-6"><h2 className="font-black">参加できる部屋</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{choices.map((choice) => <button key={choice.code} type="button" onClick={() => { setJoinCode(choice.code); void joinRoom(choice.code); }} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 text-left"><span className="font-mono text-lg font-black text-fuchsia-300">{choice.code}</span><span className="ml-3 font-bold">{choice.hostName}</span><span className="mt-1 block text-xs text-slate-400">{choice.playerCount}人・合言葉{choice.hasPassphrase ? "あり" : "なし"}</span></button>)}</div></div>}
            {error && <p className="mx-6 mb-6 rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          </section>
        </div>
        <GameAdSlot gameId="kotoba-senpuku" surface="game-entry" />
        {rulesDialog}
      </main>
    );
  }

  return (
    <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#701a75_0%,#172033_35%,#020617_75%)] text-white ${gameTopBannerOffsetClass}`}>
      <GameTopBanner eyebrow="Hidden word survival" title={<>ワードソナー <span className="font-mono text-base text-amber-300">#{room.code}</span></>}>
        {room.phase === "lobby" && (isHost
          ? <button type="button" onClick={() => void dissolveRoom()} className={gameTopBannerDangerActionClass}>部屋を解散</button>
          : <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>)}
        <GameTopMenu>
          {room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>広場へ戻る</Link>}
          <OnlineRoomSpectatorLink game="kotoba-senpuku" code={room.code} />
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
          gameTools={<DebugToolsSection title="ゲーム操作" description="現在のフェーズで使える一括操作を表示します。">
            {room.phase === "lobby" && <DebugToolButton disabled={isSaving} onClick={() => void runAction({ type: "debug-add-player", actorId: playerId })}>ダミーを追加</DebugToolButton>}
            {room.phase === "secret" && <DebugToolButton disabled={isSaving} onClick={() => void runAction({ type: "debug-fill-secrets", actorId: playerId, round: room.round })}>未入力の秘密語を自動で埋める</DebugToolButton>}
            {room.phase === "battle" && <DebugToolButton disabled={isSaving} onClick={() => void runAction({ type: "debug-auto-turn", actorId: playerId, round: room.round })}>現在の手番を自動実行</DebugToolButton>}
          </DebugToolsSection>}
        />}
        <GamePlayerMenu id={session.id} name={session.name} avatarColor={session.avatarColor} avatarImage={session.avatarImage} hasRecoveryEmail={session.hasRecoveryEmail} />
      </GameTopBanner>
      <div className="mx-auto max-w-7xl px-4 pt-4"><PlayerTimeoutNotice playerTimeouts={room.playerTimeouts} playerTimeoutNotice={room.playerTimeoutNotice} currentPlayerId={playerId} disabled={isSaving} onRecover={() => runAction({ type: "recover-player", actorId: playerId }).then(() => undefined)} /></div>
      <GameAdSlot
        gameId="kotoba-senpuku"
        surface={room.phase === "lobby" ? "room-lobby" : room.phase === "result" ? "result" : null}
        disabled={room.debugMode}
      />
      {room.phase === "lobby" && <div className="mx-auto max-w-7xl px-4 pt-4"><GameLoungeVisual gameId="kotoba-senpuku" /></div>}
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 md:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[270px_minmax(0,1fr)_280px]">
        <aside className="space-y-4 md:col-span-2 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:col-span-1 xl:block xl:space-y-4"><section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4"><div className="flex items-center justify-between"><h2 className="font-black">参加者</h2><span className="text-sm text-slate-400">{room.players.length}人</span></div><ul className="mt-3 space-y-2">{room.players.map((player) => <PlayerRow key={player.id} player={player} isHost={player.id === room.hostId} isMe={player.id === playerId} eliminated={room.exposedIds.includes(player.id)} />)}</ul><RoomLobbyReturnStatus state={room.lobbyReturn} players={room.players} hostId={room.hostId} isHost={isHost} onRemoveWaitingPlayer={(player) => { if (window.confirm(`${player.name}さんを退出扱いにしますか？`)) void runAction({ type: "remove-waiting-player", actorId: playerId, targetPlayerId: player.id }); }} /></section><RoomConfigSummary items={configItems} /></aside>
        <div className="space-y-4">
          {error && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm font-bold text-rose-100">{error}</p>}
          {room.phase === "lobby" && isHost && (
            <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
              <h2 className="font-black">ルール設定</h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <BinaryRuleControl
                  label="連続探知"
                  description="あり：命中したら続けて行動。なし：探知1回で手番終了。"
                  value={room.continuousScan}
                  onChange={(value) => void updateConfig({ continuousScan: value })}
                />
                <BinaryRuleControl
                  label="秘密語回答"
                  description="あり：相手の秘密語を直接回答する行動を使えます。"
                  value={room.allowWordGuess}
                  onChange={(value) => void updateConfig({ allowWordGuess: value })}
                />
                <BinaryRuleControl
                  label="直接回答ログ"
                  description="表示：回答した言葉も履歴へ表示。非表示：対象者と正誤だけ表示。"
                  value={room.showWordGuessInLog}
                  falseLabel="非表示"
                  trueLabel="表示"
                  onChange={(value) => void updateConfig({ showWordGuessInLog: value })}
                />
                <BinaryRuleControl
                  label="最初の手番"
                  description="ランダム：対戦開始時に抽選。参加順：参加者一覧の先頭から開始。"
                  value={room.randomFirstTurn}
                  falseLabel="参加順"
                  trueLabel="ランダム"
                  onChange={(value) => void updateConfig({ randomFirstTurn: value })}
                />
              </div>
            </section>
          )}
          {room.phase === "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">ゲーム開始前</h2>{isHost ? <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="sm:row-span-2 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 p-4 text-sm leading-6 text-fuchsia-50">秘密語が全部公開されると脱落し、以後の手番はありません。最後まで秘密語が残った1人が勝利です。</div><RoomTimeLimitControl label="秘密語の入力時間" value={room.secretTimeLimitSeconds} onChange={(seconds) => void updateConfig({ secretTimeLimitSeconds: seconds })} /><RoomTimeLimitControl label="1手番の時間" value={room.turnTimeLimitSeconds} onChange={(seconds) => void updateConfig({ turnTimeLimitSeconds: seconds })} /></div> : <p className="mt-4 rounded-xl bg-white/[0.05] p-4 text-slate-300">ホストが設定してゲームを開始するまでお待ちください。</p>}{isHost && <button type="button" disabled={isSaving || room.players.length < 2} onClick={() => void runAction({ type: "start-game", actorId: playerId })} className="mt-6 w-full rounded-xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 disabled:opacity-40">{room.players.length < 2 ? "2人以上で開始できます" : "このメンバーで開始"}</button>}</section>}

          {room.phase !== "lobby" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">今回のお題</p><h2 className="mt-2 break-words text-2xl font-black leading-tight sm:text-4xl">{room.theme?.title}</h2><p className="mt-2 break-words text-sm leading-6 text-slate-400">{room.theme?.guide}</p></div><span className="shrink-0 rounded-xl bg-fuchsia-400 px-4 py-2 font-black text-fuchsia-950">生存 {room.players.length - room.exposedIds.length}人</span></div></section>}

          {room.phase === "secret" && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">秘密語を入力</h2><p className="mt-1 text-sm text-slate-400">提出 {room.submittedIds.length}/{room.players.length}人</p></div>{room.phaseStartedAt && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.secretTimeLimitSeconds} startedAt={room.phaseStartedAt} label="入力時間" />}</div>{room.secrets[playerId] ? <div className="mt-5 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4"><p className="font-black text-emerald-100">あなたの秘密語：{room.secrets[playerId]}</p><p className="mt-1 text-sm text-slate-300">全員の入力を待っています。他の秘密語は見えません。</p></div> : <div className="mt-5"><label className="block text-sm font-bold">ひらがな（{room.players.length === 2 ? "2文字以上・" : ""}文字数上限なし）<input value={secretWord} onChange={(event) => setSecretWord(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submitSecret(); }} className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-lg text-white outline-none focus:border-fuchsia-300" /></label><button type="button" disabled={isSaving} onClick={submitSecret} className="mt-3 w-full rounded-xl bg-fuchsia-400 px-4 py-3 font-black text-fuchsia-950 disabled:opacity-50">秘密語を確定</button></div>}</section>}

          {room.phase === "battle" && <><section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">あなたの秘密語</p><p className="mt-2 break-words text-3xl font-black leading-tight text-amber-100 sm:text-5xl">{room.secrets[playerId]}</p></section><section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-fuchsia-300">第{room.turnNumber}手</p><h2 className="text-2xl font-black">{activePlayer?.name}の手番</h2></div>{room.phaseStartedAt && <GamePhaseTimer key={room.phaseStartedAt} durationSeconds={room.turnTimeLimitSeconds} startedAt={room.phaseStartedAt} label="手番時間" />}</div><p className="mt-3 rounded-xl bg-white/[0.05] p-3 text-sm text-slate-300">秘密語が全部公開された人は脱落します。脱落者の手番は自動的に飛ばされます。</p>{room.debugMode && isHost && activePlayer?.id !== playerId && <p className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-sm font-bold text-cyan-50">デバッグ中：ホストが{activePlayer?.name}の手番を操作できます。</p>}</section>
            <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-xl font-black">文字スキャン</h2><p className="mt-1 text-sm text-slate-400">濁点・半濁点、小さい文字は元の文字と同じグループ。「ー」は独立して反応します。</p><p className="mt-2 text-xs font-bold text-amber-300">アンバー色は自分の秘密語に含まれる文字です。</p><div className="mt-4 grid grid-cols-10 gap-1.5 sm:gap-2">{kotobaSenpukuKanaBoard.flatMap((row, rowIndex) => row.map((kana, columnIndex) => { if (!kana) return <span key={`blank-${rowIndex}-${columnIndex}`} aria-hidden="true" />; const called = room.calledKana.includes(kana); const isOwnKana = ownSecretKana.has(kana); return <button key={kana} type="button" disabled={!canControlTurn || called || isSaving} onClick={() => void runAction({ type: "scan-kana", actorId: playerId, round: room.round, kana })} className={`aspect-square rounded-lg border text-sm font-black transition disabled:cursor-not-allowed sm:text-lg ${called ? "border-white/5 bg-slate-800 text-slate-500 opacity-40" : isOwnKana ? "border-amber-300/60 bg-amber-300/20 text-amber-200 hover:bg-amber-300/30" : "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100 hover:bg-fuchsia-300/20"}`}>{kana}</button>; }))}</div><div className="mt-2 flex gap-2">{["ん", "ー"].map((kana) => { const called = room.calledKana.includes(kana); const isOwnKana = ownSecretKana.has(kana); return <button key={kana} type="button" disabled={!canControlTurn || called || isSaving} onClick={() => void runAction({ type: "scan-kana", actorId: playerId, round: room.round, kana })} className={`h-10 min-w-12 rounded-lg border px-4 text-lg font-black transition disabled:cursor-not-allowed ${called ? "border-white/5 bg-slate-800 text-slate-500 opacity-40" : isOwnKana ? "border-amber-300/60 bg-amber-300/20 text-amber-200 hover:bg-amber-300/30" : "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100 hover:bg-fuchsia-300/20"}`}>{kana}</button>; })}</div></section>
            {room.allowWordGuess && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-xl font-black">秘密語を特定</h2><p className="mt-1 text-sm text-slate-400">正解なら相手は即脱落。不正解でも、回答した時点で手番は終了します。</p><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]"><select value={effectiveTarget} disabled={!canControlTurn} onChange={(event) => setChallengeTarget(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950">{challengeTargets.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select><input value={challengeGuess} disabled={!canControlTurn} onChange={(event) => setChallengeGuess(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") challengeWord(); }} placeholder="ひらがなで推理" className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white outline-none" /><button type="button" disabled={!canControlTurn || !effectiveTarget || !challengeGuess.trim() || isSaving} onClick={challengeWord} className="rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950 disabled:opacity-40">回答する</button></div></section>}
          </>}

          {room.phase === "result" && latestResult && <section className="rounded-2xl border border-white/10 bg-slate-950/80 p-6"><h2 className="text-2xl font-black">{winnerNames || "勝者なし"}の勝利</h2>{winnerIds.length > 1 && <p className="mt-2 text-sm text-amber-200">同時脱落かつ最短文字数が同じため、同率勝利です。</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2">{room.players.map((player) => <div key={player.id} className={`rounded-xl border p-4 ${winnerIds.includes(player.id) ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-white/[0.05]"}`}><div className="flex items-center justify-between gap-3"><p className="font-black">{player.name}</p><span className="text-sm font-black text-amber-300">{winnerIds.includes(player.id) ? "勝利" : "脱落"}</span></div><p className="mt-2 font-mono text-2xl font-black tracking-widest text-fuchsia-200">{latestResult.secrets[player.id]}</p></div>)}</div><OnlineRoomLifecycleActions surface="result" canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} /></section>}
        </div>
        <aside className="space-y-3">{room.phase !== "lobby" && <>{room.phase === "battle" && <section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><p className="font-black">公開された文字</p><div className="mt-3 space-y-2">{room.players.map((player) => <div key={player.id} className={`min-h-24 rounded-lg border p-3 ${room.exposedIds.includes(player.id) ? "border-rose-300/30 bg-rose-300/10" : "border-cyan-300/20 bg-cyan-300/5"}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold text-slate-300">{player.name}</p><span className="text-[10px] font-black">{room.exposedIds.includes(player.id) ? "脱落" : "生存"}</span></div><p className="mt-2 min-h-7 font-mono text-xl font-black tracking-widest">{room.masks[player.id]}</p>{room.secrets[player.id] && <p className="mt-1 text-xs text-amber-200">秘密語：{room.secrets[player.id]}</p>}</div>)}</div></section>}<section className="rounded-xl border border-white/10 bg-slate-950/75 p-4"><p className="font-black">行動履歴</p><ul className="mt-3 space-y-2">{room.log.slice(0, 12).map((entry, index) => <li key={`${entry}-${index}`} className="border-b border-white/5 pb-2 text-xs leading-5 text-slate-300">{entry}</li>)}</ul></section></>}</aside>
      </div>
      {rulesDialog}
    </main>
  );
}
