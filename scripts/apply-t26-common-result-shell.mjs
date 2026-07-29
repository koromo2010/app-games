import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content);
}

function replaceOnce(path, search, replacement, label = String(search).slice(0, 80)) {
  const current = read(path);
  const count = typeof search === "string"
    ? current.split(search).length - 1
    : [...current.matchAll(new RegExp(search.source, search.flags.includes("g") ? search.flags : `${search.flags}g`))].length;
  if (count !== 1) {
    throw new Error(`${path}: expected one match for ${label}, found ${count}`);
  }
  write(path, current.replace(search, replacement));
}

function addImport(path, anchor, statement) {
  replaceOnce(path, anchor, `${anchor}\n${statement}`, `import ${statement}`);
}

addImport(
  "app/daifugo/DaifugoDesktopLayout.tsx",
  'import { GameAdSlot } from "@/app/components/GameAdSlot";',
  'import { CommonGameResultShell } from "@/app/components/CommonGameResultShell";',
);
addImport(
  "app/hodoai-talk/HodoaiDesktopLayout.tsx",
  'import { GameAdSlot } from "@/app/components/GameAdSlot";',
  'import { CommonGameResultShell } from "@/app/components/CommonGameResultShell";',
);
addImport(
  "app/nigoichi/NigoichiDesktopLayout.tsx",
  'import { GameAdSlot } from "@/app/components/GameAdSlot";',
  'import { CommonGameResultShell } from "@/app/components/CommonGameResultShell";',
);
addImport(
  "app/code-intercept/CodeInterceptDesktopLayout.tsx",
  'import { GameAdSlot } from "@/app/components/GameAdSlot";',
  'import { CommonGameResultShell } from "@/app/components/CommonGameResultShell";',
);
addImport(
  "app/northern-branch/NorthernBranchDesktopLayout.tsx",
  'import { GameAdSlot } from "@/app/components/GameAdSlot";',
  'import { CommonGameResultShell } from "@/app/components/CommonGameResultShell";',
);
addImport(
  "app/kotoba-senpuku/KotobaSenpukuDesktopLayout.tsx",
  'import { GameAdSlot } from "@/app/components/GameAdSlot";',
  'import { CommonGameResultShell } from "@/app/components/CommonGameResultShell";',
);

replaceOnce(
  "app/wordwolf/WordWolfRoomSidebar.tsx",
  'surface={room.phase === "lobby" ? "lobby" : room.phase === "result" ? "result" : "playing"}',
  'surface={room.phase === "lobby" ? "lobby" : "playing"}',
  "Word Wolf sidebar result actions",
);
replaceOnce(
  "app/tahoiya/TahoiyaRoomPanel.tsx",
  'surface={room.phase === "lobby" ? "lobby" : room.phase === "result" ? "result" : "playing"}',
  'surface={room.phase === "lobby" ? "lobby" : "playing"}',
  "Tahoiya sidebar result actions",
);

replaceOnce(
  "app/daifugo/DaifugoDesktopLayout.tsx",
  /\{room\.phase === "result" && game && <section className="rounded-2xl border border-amber-300\/30 bg-amber-50 p-6 text-slate-950">[\s\S]*?<\/section>\}\{room\.phase === "result" && game && <GameResultShareButton[\s\S]*?\/>\}/,
  [
    '{room.phase === "result" && game && <CommonGameResultShell',
    '        tone="light"',
    '        className="rounded-2xl border border-amber-300/30 bg-amber-50 p-6 text-slate-950"',
    '        eyebrow="Result"',
    '        title={d.finished}',
    '        utilities={<GameResultShareButton title={d.resultTitle} text={formatDaifugoText(d.resultText, { players: room.players.length, place: game.finishOrder.indexOf(playerId) + 1, turns: game.turnNumber })} url="/daifugo" />}',
    '        actions={<OnlineRoomLifecycleActions surface="result" canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={saving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} />}',
    '      >',
    '        <ol className="grid gap-2 sm:grid-cols-2">{game.finishOrder.map((id, index) => <li key={id} className="rounded-xl bg-white p-3 shadow"><b>#{index + 1} · {rankNames[index] ?? ""}</b>　{room.players.find((player) => player.id === id)?.name}</li>)}</ol>',
    '      </CommonGameResultShell>}',
  ].join("\n"),
  "Daifugo result block",
);

replaceOnce(
  "app/hodoai-talk/HodoaiDesktopLayout.tsx",
  /\{room\.phase === "result" && latestResult && <section className="rounded-2xl border border-white\/10 bg-slate-950\/80 p-6">[\s\S]*?<\/section>\}\s*\{room\.phase === "result" && <GameResultShareButton[\s\S]*?\/>\}/,
  [
    '{room.phase === "result" && latestResult && <CommonGameResultShell',
    '            tone="dark"',
    '            eyebrow="Result"',
    '            title="最後の答え合わせ"',
    '            summary="上が120側、下が0側です。"',
    '            utilities={<GameResultShareButton title="ワードスケール プレイログ" text={hodoaiGameShareText(room)} url="/word-scale" />}',
    '            actions={<OnlineRoomLifecycleActions surface="result" canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} />}',
    '          >',
    '            <div className="space-y-2">{latestResultRows.map((row) => <div key={row.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3"><span className="text-center font-black text-cyan-300">{row.rank}</span><div><div className="flex flex-wrap gap-2">{row.expressions.map((expression, index) => <span key={`${row.id}:${index}`} className="rounded-lg bg-cyan-300/10 px-2 py-1 text-sm font-bold text-cyan-50">{expression}</span>)}</div><p className="mt-1 text-xs text-slate-400">{row.playerName}・カード{row.cardNumber}</p></div><span className="text-2xl font-black text-amber-300">{row.value}</span></div>)}</div>',
    '            <div className="mt-5 rounded-2xl bg-gradient-to-r from-cyan-400 to-amber-300 p-5 text-center text-slate-950"><p className="font-black">最終得点 {latestResult.points}/3点</p><p className="mt-1 text-sm font-bold">並び違い {latestResult.inversions}組</p></div>',
    '            <p className="mt-5 text-center text-lg font-black">{hodoaiFinalMessage(room.totalPoints, 3)}</p>',
    '          </CommonGameResultShell>}',
  ].join("\n"),
  "Word Scale result block",
);

replaceOnce(
  "app/nigoichi/NigoichiDesktopLayout.tsx",
  /\{room\.phase === "result" && room\.missingNumber !== null && <section className="rounded-2xl border border-rose-300\/30 bg-slate-950\/80 p-6">[\s\S]*?<\/section>\}\s*\{room\.phase === "result" && <GameResultShareButton[\s\S]*?\/>\}/,
  [
    '{room.phase === "result" && room.missingNumber !== null && <CommonGameResultShell',
    '            tone="dark"',
    '            eyebrow="Result"',
    '            title={<>余りは {room.missingNumber + 1}番「{room.words[room.missingNumber]}」</>}',
    '            summary={`${room.players.length}人中${correctCount}人が正解しました。`}',
    '            utilities={<GameResultShareButton title="ワードアウト プレイログ" text={nigoichiShareText(room)} url="/word-out" />}',
    '            actions={<OnlineRoomLifecycleActions surface="result" canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} />}',
    '          >',
    '            <div className="grid gap-3 sm:grid-cols-2">{room.players.map((player) => {',
    '              const hand = room.hands[player.id] ?? [];',
    '              const correct = nigoichiGuessIsCorrect(room, player.id);',
    '              const score = room.roundScores[player.id];',
    '              return <article key={player.id} className={`rounded-xl border p-4 ${correct ? "border-emerald-300 bg-emerald-300/10" : "border-white/10 bg-white/[0.05]"}`}>',
    '                <div className="flex items-center justify-between gap-3"><h3 className="font-black">{player.name}</h3><span className={`rounded-md px-2 py-1 text-xs font-black ${correct ? "bg-emerald-300 text-emerald-950" : "bg-slate-700 text-slate-200"}`}>{correct ? "正解" : "不正解"}</span></div>',
    '                <p className="mt-3 text-sm text-slate-300">手札：{hand.map((number) => `${number + 1}.${room.words[number]}`).join(" / ")}</p>',
    '                <p className="mt-3 rounded-lg bg-slate-950/50 p-2 text-sm text-slate-300">連想語：<strong className="text-white">{room.associations[player.id]?.join(" / ")}</strong></p>',
    '                <p className="mt-3 text-sm text-slate-300">予想：{Number.isInteger(room.guesses[player.id]) ? `${room.guesses[player.id] + 1}番` : "未提出"}</p>',
    '                {score && <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm"><dt className="text-slate-400">余りを正解</dt><dd className="text-right font-black text-emerald-200">+{score.correctBonus}</dd><dt className="text-slate-400">自分のカードへの回答</dt><dd className="text-right font-black text-rose-200">−{score.receivedWrongVotes}</dd><dt className="font-bold">ラウンド得点</dt><dd className="text-right font-black">{score.roundScore >= 0 ? "+" : ""}{score.roundScore}</dd><dt className="font-bold text-indigo-200">累計得点</dt><dd className="text-right text-lg font-black text-indigo-200">{score.totalScoreAfterRound}</dd></dl>}',
    '              </article>;',
    '            })}</div>',
    '          </CommonGameResultShell>}',
  ].join("\n"),
  "Word Out result block",
);

replaceOnce(
  "app/code-intercept/CodeInterceptDesktopLayout.tsx",
  /\{room\.phase === "game-result" && <section className="rounded-2xl border border-amber-300\/30 bg-slate-950\/85 p-6 text-center">[\s\S]*?<\/section>\}/,
  [
    '{room.phase === "game-result" && <CommonGameResultShell',
    '          tone="dark"',
    '          className="rounded-2xl border border-amber-300/30 bg-slate-950/85 p-6 text-white"',
    '          eyebrow="Game over"',
    '          title={room.winner === "draw" ? "同時決着・引き分け" : `${teamLabel(room.winner!)}の勝利`}',
    '          summary={`全${room.roundNumber}ラウンドで決着しました。`}',
    '          utilities={<GameResultShareButton title="コードインターセプト プレイログ" text={codeInterceptShareText(room)} url="/games/code-intercept" />}',
    '          actions={<OnlineRoomLifecycleActions surface="result" canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} />}',
    '        />}',
  ].join("\n"),
  "Code Intercept game result block",
);

replaceOnce(
  "app/northern-branch/NorthernBranchDesktopLayout.tsx",
  /\{winner && <section className="rounded-2xl border border-amber-300 bg-amber-300\/15 p-6 text-center">[\s\S]*?<\/section>\}/,
  [
    '{winner && <CommonGameResultShell',
    '              tone="dark"',
    '              className="rounded-2xl border border-amber-300 bg-amber-300/15 p-6 text-white"',
    '              eyebrow="Game finished"',
    '              title={`${winner.name}の勝利！`}',
    '              actions={<OnlineRoomLifecycleActions surface="result" canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} />}',
    '            />}',
  ].join("\n"),
  "Northern Branch result block",
);

replaceOnce(
  "app/kotoba-senpuku/KotobaSenpukuDesktopLayout.tsx",
  /\{room\.phase === "result" && latestResult && <section className="rounded-2xl border border-white\/10 bg-slate-950\/80 p-6">[\s\S]*?<\/section>\}/,
  [
    '{room.phase === "result" && latestResult && <CommonGameResultShell',
    '            tone="dark"',
    '            eyebrow="Result"',
    '            title={`${winnerNames || "勝者なし"}の勝利`}',
    '            summary={winnerIds.length > 1 ? "同時脱落かつ最短文字数が同じため、同率勝利です。" : undefined}',
    '            actions={<OnlineRoomLifecycleActions surface="result" canReturnToRoom={isHost || resultReturnGate.canReturnToRoom} disabled={isSaving} isHost={isHost} isRoomDissolved={resultReturnGate.isRoomDissolved} onReturnToRoom={isHost ? () => runAction({ type: "reset-game", actorId: playerId }) : returnToRoom} onDissolve={isHost ? dissolveRoom : undefined} />}',
    '          >',
    '            <div className="grid gap-3 sm:grid-cols-2">{room.players.map((player) => <div key={player.id} className={`rounded-xl border p-4 ${winnerIds.includes(player.id) ? "border-amber-300/40 bg-amber-300/10" : "border-white/10 bg-white/[0.05]"}`}><div className="flex items-center justify-between gap-3"><p className="font-black">{player.name}</p><span className="text-sm font-black text-amber-300">{winnerIds.includes(player.id) ? "勝利" : "脱落"}</span></div><p className="mt-2 font-mono text-2xl font-black tracking-widest text-fuchsia-200">{latestResult.secrets[player.id]}</p></div>)}</div>',
    '          </CommonGameResultShell>}',
  ].join("\n"),
  "Word Sonar result block",
);

replaceOnce(
  "app/components/game-sdk/GameSdkFrameView.tsx",
  /            \{room\.phase === "result" && standardResult && moduleRequired\("result"\) && \([\s\S]*?            \)\}\n            \{message/,
  "            {message",
  "SDK inline standard result",
);
replaceOnce(
  "app/components/game-sdk/GameSdkFrameView.tsx",
  /            <OnlineRoomLifecycleActions\n              surface=\{room\.phase === "result" \? "result" : room\.phase === "lobby" \? "lobby" : "playing"\}[\s\S]*?              returnHref=\{backHref\}\n            \/>/,
  [
    '            {room.phase === "lobby" && (',
    '              <OnlineRoomLifecycleActions',
    '                surface="lobby"',
    '                isHost={common?.isHost === true}',
    '                disabled={pending}',
    '                onDissolve={onDissolve}',
    '                onLeave={onLeave}',
    '              />',
    '            )}',
  ].join("\n"),
  "SDK lobby lifecycle block",
);
replaceOnce(
  "app/components/game-sdk/GameSdkFrameView.tsx",
  '            feedbackEndpoint={feedbackEndpoint}\n          />',
  [
    '            feedbackEndpoint={feedbackEndpoint}',
    '            standardResult={standardResult}',
    '            resultPlayLog={resultPlayLog}',
    '            pending={pending}',
    '            isHost={common?.isHost === true}',
    '            canReturnToRoom={canReturnToRoom}',
    '            isRoomDissolved={isRoomDissolved}',
    '            onReturnToRoom={onReturnToRoom}',
    '            onDissolve={onDissolve}',
    '          />',
  ].join("\n"),
  "SDK result panel props",
);

replaceOnce(
  "tests/game-sdk-shell-contract.test.ts",
  [
    '  assert.match(view, /<OnlineRoomLifecycleActions/);',
    '  assert.match(',
    '    view,',
    '    /surface=\\{room\\.phase === "result" \\? "result" : room\\.phase === "lobby" \\? "lobby" : "playing"\\}/,',
    '  );',
  ].join("\n"),
  [
    '  assert.match(view, /room\\.phase === "lobby"[\\s\\S]*?<OnlineRoomLifecycleActions/);',
    '  assert.match(resultPanel, /<CommonGameResultShell/);',
    '  assert.match(resultPanel, /<OnlineRoomLifecycleActions/);',
    '  assert.match(resultPanel, /surface="result"/);',
  ].join("\n"),
  "SDK lifecycle contract assertions",
);

write("tests/common-game-result-shell.test.ts", `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const nativeResultSources = [
  "app/wordwolf/WordWolfResultPanel.tsx",
  "app/tahoiya/TahoiyaResultPanel.tsx",
  "app/daifugo/DaifugoDesktopLayout.tsx",
  "app/hodoai-talk/HodoaiDesktopLayout.tsx",
  "app/nigoichi/NigoichiDesktopLayout.tsx",
  "app/code-intercept/CodeInterceptDesktopLayout.tsx",
  "app/northern-branch/NorthernBranchDesktopLayout.tsx",
  "app/kotoba-senpuku/KotobaSenpukuDesktopLayout.tsx",
];

const resultShell = source("app/components/CommonGameResultShell.tsx");
const sdkResultPanel = source("app/components/game-sdk/GameSdkResultPanel.tsx");
const sdkFrameView = source("app/components/game-sdk/GameSdkFrameView.tsx");
const sdkPreviewPage = source("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");

test("the common result shell stays a thin layout and action boundary", () => {
  assert.match(resultShell, /data-common-game-result-shell/);
  assert.match(resultShell, /data-result-content/);
  assert.match(resultShell, /data-result-utilities/);
  assert.match(resultShell, /data-result-actions/);
  assert.doesNotMatch(resultShell, /rankings|scores|votes|winnerSeats|finishOrder/);
});

test("every native online result screen uses the common shell", () => {
  for (const path of nativeResultSources) {
    assert.match(source(path), /CommonGameResultShell/, path);
  }
});

test("Word Wolf and Tahoiya render result actions only inside their result panels", () => {
  assert.doesNotMatch(source("app/wordwolf/WordWolfRoomSidebar.tsx"), /room\\.phase === "result" \\? "result"/);
  assert.doesNotMatch(source("app/tahoiya/TahoiyaRoomPanel.tsx"), /room\\.phase === "result" \\? "result"/);
  assert.match(source("app/wordwolf/WordWolfResultPanel.tsx"), /actions=\\{<OnlineRoomLifecycleActions surface="result"/);
  assert.match(source("app/tahoiya/TahoiyaResultPanel.tsx"), /actions=\\{<OnlineRoomLifecycleActions surface="result"/);
});

test("formal package Rooms use one SDK result shell and one result action set", () => {
  assert.match(sdkPreviewPage, /game\\.runtimeKind === "package"[\\s\\S]*?<GameSdkFrame/);
  assert.match(sdkResultPanel, /<CommonGameResultShell/);
  assert.equal((sdkResultPanel.match(/<OnlineRoomLifecycleActions/g) ?? []).length, 1);
  assert.doesNotMatch(sdkFrameView, /room\\.phase === "result" && standardResult/);
  assert.match(sdkFrameView, /room\\.phase === "lobby" && \\([\\s\\S]*?<OnlineRoomLifecycleActions/);
});

test("server-projected result fields are passed through without shell recalculation", () => {
  assert.match(sdkResultPanel, /standardResult\\.rankings\\.map/);
  assert.match(sdkResultPanel, /ranking\\.rank/);
  assert.match(sdkResultPanel, /ranking\\.score/);
  assert.doesNotMatch(sdkResultPanel, /sort\\(|reduce\\(|tally|calculate|recalculate/);
});
`);
