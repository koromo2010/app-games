"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  fallbackAvatarColor,
  readPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";
import { DebugParticipantControls } from "./DebugParticipantControls";
import { DebugToolWindow } from "./DebugToolWindow";
import { GamePlayerMenu } from "./GamePlayerMenu";
import { GameRulesDialog } from "./GameRulesDialog";
import { GameTopBanner } from "./GameTopBanner";
import {
  DebugToolButton,
  DebugToolsSection,
} from "./DebugGameTools";
import {
  GameTopMenu,
  gameTopBannerActionClass,
  gameTopMenuItemClass,
} from "./GameTopMenu";
import { AppLink as Link } from "./AppLink";

export type GameSdkDebugRoom = {
  appPhase: string | null;
  canAutoProgress: boolean;
  canUseSpectatorView: boolean;
  code: string;
  disabled: boolean;
  selectedViewer: "self" | "spectator" | number;
  isSubmitting: boolean;
  maximumPlayers: number;
  onAddDummy: () => void | Promise<void>;
  onAutoProgress: (
    target: "step" | "phase" | "result",
  ) => void | Promise<void>;
  onRemoveDummy: (seat: number) => void | Promise<void>;
  onSelectViewer: (
    viewer: "self" | "spectator" | number,
  ) => void | Promise<void>;
  onSetConnected: (
    seat: number,
    connected: boolean,
  ) => void | Promise<void>;
  onSimulateInputError: () => void | Promise<void>;
  onSimulateTimeout: () => void | Promise<void>;
  players: Array<{
    connected: boolean;
    displayName: string;
    isHost: boolean;
    isSelf: boolean;
    isDummy: boolean;
    seat: number;
  }>;
  revision: number;
  phase: string;
  statusMessage: string;
};

type Props = {
  eyebrow: string;
  title: string;
  rules: readonly string[];
  backHref: string;
  backLabel: string;
  debugRoom?: GameSdkDebugRoom | null;
  children?: ReactNode;
};

/**
 * Platform-owned header for reviewed SDK games.
 *
 * The game package supplies title/rules through its immutable manifest, while
 * navigation, AI activity, rules presentation and the player menu stay outside
 * the sandboxed package. Room permissions are resolved by GameSdkFrame and
 * passed in directly; this component never fetches or recalculates them.
 */
export function GameSdkShellHeader({
  eyebrow,
  title,
  rules,
  backHref,
  backLabel,
  debugRoom = null,
  children,
}: Props) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [debugOpenRoomCode, setDebugOpenRoomCode] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setSession(readPlayerSession());
    refresh();
    window.addEventListener("game-fields:player-session-saved", refresh);
    return () => {
      window.removeEventListener("game-fields:player-session-saved", refresh);
    };
  }, []);

  const debugViewerControls = debugRoom ? (
    <section className="mt-2 border-t border-cyan-200 pt-2">
      <p className="text-[10px] font-black uppercase tracking-[.12em] text-cyan-800">
        閲覧視点
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <button
          type="button"
          aria-pressed={debugRoom.selectedViewer === "self"}
          onClick={() => void debugRoom.onSelectViewer("self")}
          className="rounded border border-cyan-300 bg-white px-2 py-1 text-[10px] font-bold text-cyan-950 aria-pressed:bg-cyan-200"
        >
          本人
        </button>
        {debugRoom.players.map((player) => (
          <button
            key={player.seat}
            type="button"
            aria-pressed={debugRoom.selectedViewer === player.seat}
            onClick={() => void debugRoom.onSelectViewer(player.seat)}
            className="rounded border border-cyan-300 bg-white px-2 py-1 text-[10px] font-bold text-cyan-950 aria-pressed:bg-cyan-200"
          >
            SEAT {player.seat + 1}
          </button>
        ))}
        {debugRoom.canUseSpectatorView && (
          <button
            type="button"
            aria-pressed={debugRoom.selectedViewer === "spectator"}
            onClick={() => void debugRoom.onSelectViewer("spectator")}
            className="rounded border border-cyan-300 bg-white px-2 py-1 text-[10px] font-bold text-cyan-950 aria-pressed:bg-cyan-200"
          >
            観戦者
          </button>
        )}
      </div>
    </section>
  ) : null;

  return (
    <>
      <GameTopBanner eyebrow={eyebrow} title={title}>
        {children}
        {debugRoom && (
          <button
            type="button"
            className={gameTopBannerActionClass}
            onClick={() => setDebugOpenRoomCode(debugRoom.code)}
          >
            DEBUG · ON
          </button>
        )}
        {rules.length > 0 && (
          <button
            type="button"
            className={gameTopBannerActionClass}
            onClick={() => setRulesOpen(true)}
          >
            ルール
          </button>
        )}
        <GameTopMenu>
          <Link
            href={backHref}
            data-menu-close="true"
            className={gameTopMenuItemClass}
          >
            {backLabel}
          </Link>
        </GameTopMenu>
        <GamePlayerMenu
          id={session?.id}
          name={session?.name || "プレイヤー"}
          avatarColor={session?.avatarColor || fallbackAvatarColor}
          avatarImage={session?.avatarImage}
          hasRecoveryEmail={session?.hasRecoveryEmail}
        />
      </GameTopBanner>
      {debugRoom && debugOpenRoomCode === debugRoom.code && (
        <DebugToolWindow
          initialPosition={{ top: 88, left: 24 }}
          onClose={() => setDebugOpenRoomCode(null)}
          persistentContent={(
            <div className="text-xs font-bold text-cyan-950">
              <div>Room {debugRoom.code} · rev {debugRoom.revision}</div>
              {debugViewerControls}
            </div>
          )}
        >
          <div className="space-y-3 p-3 text-sm text-slate-800">
            <div>
              <p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">
                Formal Preview Debug
              </p>
              <h2 className="mt-1 text-lg font-black">DEBUG：ON</h2>
            </div>
            <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-3">
              <dt className="text-slate-500">Room</dt>
              <dd className="font-mono font-black">{debugRoom.code}</dd>
              <dt className="text-slate-500">Revision</dt>
              <dd className="font-mono font-black">{debugRoom.revision}</dd>
              <dt className="text-slate-500">Phase</dt>
              <dd className="font-black">{debugRoom.phase}</dd>
            </dl>
            <p className="text-xs leading-5 text-slate-600">
              署名済みセッション、PackageのsupportsDebug、Room Viewのpermissions.canDebugがすべて有効です。
            </p>
            <DebugParticipantControls
              participants={debugRoom.players.flatMap((player) => (
                player.isDummy
                  ? [{
                      id: String(player.seat),
                      name: player.displayName,
                    }]
                  : []
              ))}
              disabled={debugRoom.disabled}
              addDisabled={debugRoom.players.length >= debugRoom.maximumPlayers}
              isSubmitting={debugRoom.isSubmitting}
              onAdd={debugRoom.onAddDummy}
              onRemove={(seat) => debugRoom.onRemoveDummy(Number(seat))}
              run={async (action) => {
                await action();
              }}
            />
            <DebugToolsSection
              title="状態と自動進行"
              description="保存状態を直接書き換えず、Packageの時間切れ処理を使って正規の遷移だけを進めます。"
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded-md bg-white p-2 text-[11px]">
                <dt className="text-slate-500">Room</dt>
                <dd className="font-mono font-bold">{debugRoom.phase}</dd>
                <dt className="text-slate-500">App</dt>
                <dd className="font-mono font-bold">{debugRoom.appPhase ?? "未公開"}</dd>
              </dl>
              <DebugToolButton
                disabled={!debugRoom.canAutoProgress || debugRoom.isSubmitting}
                onClick={() => void debugRoom.onAutoProgress("step")}
              >
                1手だけ自動進行
              </DebugToolButton>
              <DebugToolButton
                disabled={!debugRoom.canAutoProgress || debugRoom.isSubmitting}
                onClick={() => void debugRoom.onAutoProgress("phase")}
              >
                次の主要状態まで進める
              </DebugToolButton>
              <DebugToolButton
                disabled={!debugRoom.canAutoProgress || debugRoom.isSubmitting}
                onClick={() => void debugRoom.onAutoProgress("result")}
              >
                結果まで自動進行
              </DebugToolButton>
            </DebugToolsSection>
            <DebugToolsSection
              title="異常状態"
              description="時間切れ、切断表示、入力拒否を共通Room Command経由で再現します。"
            >
              <DebugToolButton
                disabled={!debugRoom.canAutoProgress || debugRoom.isSubmitting}
                onClick={() => void debugRoom.onSimulateTimeout()}
              >
                現在手番の時間切れを再現
              </DebugToolButton>
              <DebugToolButton
                disabled={debugRoom.isSubmitting}
                onClick={() => void debugRoom.onSimulateInputError()}
              >
                不正入力の拒否を確認
              </DebugToolButton>
              <ul className="space-y-1.5">
                {debugRoom.players.map((player) => (
                  <li
                    key={player.seat}
                    className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-[11px]"
                  >
                    <span className="min-w-0 truncate">
                      SEAT {player.seat + 1} · {player.displayName}
                    </span>
                    <button
                      type="button"
                      disabled={debugRoom.isSubmitting}
                      onClick={() => void debugRoom.onSetConnected(
                        player.seat,
                        !player.connected,
                      )}
                      className={`shrink-0 rounded border px-2 py-1 font-bold disabled:opacity-40 ${
                        player.connected
                          ? "border-amber-300 text-amber-800"
                          : "border-emerald-300 text-emerald-800"
                      }`}
                    >
                      {player.connected ? "切断を再現" : "接続へ戻す"}
                    </button>
                  </li>
                ))}
              </ul>
            </DebugToolsSection>
            {debugRoom.statusMessage && (
              <p className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                {debugRoom.statusMessage}
              </p>
            )}
          </div>
        </DebugToolWindow>
      )}
      <GameRulesDialog
        open={rulesOpen}
        title={`${title}のルール`}
        onClose={() => setRulesOpen(false)}
      >
        <ol className="list-decimal space-y-3 pl-5">
          {rules.map((rule, index) => (
            <li key={`${index}:${rule}`}>{rule}</li>
          ))}
        </ol>
      </GameRulesDialog>
    </>
  );
}
