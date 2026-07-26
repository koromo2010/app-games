"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  fallbackAvatarColor,
  readPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";
import { DebugToolWindow } from "./DebugToolWindow";
import { GamePlayerMenu } from "./GamePlayerMenu";
import { GameRulesDialog } from "./GameRulesDialog";
import { GameTopBanner } from "./GameTopBanner";
import {
  GameTopMenu,
  gameTopBannerActionClass,
  gameTopMenuItemClass,
} from "./GameTopMenu";
import { AppLink as Link } from "./AppLink";

type Props = {
  eyebrow: string;
  title: string;
  rules: readonly string[];
  backHref: string;
  backLabel: string;
  children?: ReactNode;
};

type ActiveDebugRoom = {
  code: string;
  revision: number;
  phase: string;
};

function activeRoomEndpoint(pathname: string) {
  const preview = pathname.match(/^\/sdk-preview\/([^/]+)\/games\/([^/]+)/);
  if (preview) {
    return `/api/sdk-preview/${encodeURIComponent(preview[1]!)}\/games\/${encodeURIComponent(preview[2]!)}\/rooms?active=1`;
  }
  const approved = pathname.match(/^\/sdk-games\/([^/]+)/);
  if (approved) {
    return `/api/game-sdk/${encodeURIComponent(approved[1]!)}\/rooms?active=1`;
  }
  return null;
}

/**
 * Platform-owned header for reviewed SDK games.
 *
 * The game package supplies title/rules through its immutable manifest, while
 * navigation, AI activity, rules presentation and the player menu stay outside
 * the sandboxed package.
 */
export function GameSdkShellHeader({
  eyebrow,
  title,
  rules,
  backHref,
  backLabel,
  children,
}: Props) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [debugRoom, setDebugRoom] = useState<ActiveDebugRoom | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setSession(readPlayerSession());
    refresh();
    window.addEventListener("game-fields:player-session-saved", refresh);
    return () => {
      window.removeEventListener("game-fields:player-session-saved", refresh);
    };
  }, []);

  useEffect(() => {
    const endpoint = activeRoomEndpoint(window.location.pathname);
    if (!endpoint) {
      setDebugRoom(null);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) {
          if (active) setDebugRoom(null);
          return;
        }
        const payload = await response.json() as {
          room?: {
            code?: unknown;
            revision?: unknown;
            phase?: unknown;
            view?: { common?: { permissions?: { canDebug?: unknown } } };
          } | null;
        };
        const room = payload.room;
        const canDebug = room?.view?.common?.permissions?.canDebug === true;
        if (
          active
          && canDebug
          && typeof room?.code === "string"
          && Number.isSafeInteger(room.revision)
          && typeof room.phase === "string"
        ) {
          setDebugRoom({
            code: room.code,
            revision: Number(room.revision),
            phase: room.phase,
          });
        } else if (active) {
          setDebugRoom(null);
          setDebugOpen(false);
        }
      } catch {
        if (active) setDebugRoom(null);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <>
      <GameTopBanner eyebrow={eyebrow} title={title}>
        {children}
        {debugRoom && (
          <button
            type="button"
            className={gameTopBannerActionClass}
            onClick={() => setDebugOpen(true)}
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
      {debugOpen && debugRoom && (
        <DebugToolWindow
          initialPosition={{ top: 88, left: 24 }}
          onClose={() => setDebugOpen(false)}
          persistentContent={(
            <div className="text-xs font-bold text-cyan-950">
              Room {debugRoom.code} · rev {debugRoom.revision}
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
