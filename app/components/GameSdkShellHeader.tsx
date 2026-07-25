"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  fallbackAvatarColor,
  readPlayerSession,
  type PlayerSession,
} from "@/lib/player-session";
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

  useEffect(() => {
    const refresh = () => setSession(readPlayerSession());
    refresh();
    window.addEventListener("game-fields:player-session-saved", refresh);
    return () => {
      window.removeEventListener("game-fields:player-session-saved", refresh);
    };
  }, []);

  return (
    <>
      <GameTopBanner eyebrow={eyebrow} title={title}>
        {children}
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
