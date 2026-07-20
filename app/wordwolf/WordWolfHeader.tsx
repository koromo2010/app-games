import Link from "next/link";
import type { Room } from "@/lib/wordwolf-game-types";
import { DebugModeButton } from "../components/DebugModeButton";
import { FullScreenPageOverlay } from "../components/FullScreenPageOverlay";
import { GameTopBanner } from "../components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopBannerDangerActionClass, gameTopMenuItemClass } from "../components/GameTopMenu";
import { PaidLlmAccessButton } from "../components/PaidLlmAccessButton";
import { PlayerTimeoutNotice } from "../components/PlayerTimeoutNotice";
import { OnlineRoomSpectatorLink } from "../components/OnlineRoomSpectatorLink";
import { WordWolfPlayerProfile } from "./WordWolfPlayerProfile";

type Props = {
  room: Room | null; isHost: boolean; currentPlayerId: string; playerId?: string; playerName: string; headerName: string;
  avatarImage: string | null; headerAvatarColor: string; headerAvatarImage: string; isAvatarPickerOpen: boolean; isMyPageOpen: boolean;
  onDissolve: () => void; onOpenRules: () => void; onAbort?: () => void; onDebugReplayChange: (enabled: boolean) => void;
  onDebugChange: (enabled: boolean) => void; onAvatarPickerOpenChange: (open: boolean) => void; onPlayerNameChange: (name: string) => void;
  onCommitPlayerName: () => void; onAvatarColorChange: (color: string) => void; onAvatarImageChange: (image: string | null) => void;
  onAvatarUpload: (file?: File) => void; onMyPageOpenChange: (open: boolean) => void; onRecover: () => void;
};

export function WordWolfHeader(props: Props) {
  return <>
    <GameTopBanner eyebrow="Room based social deduction" title="ワードウルフ・ラウンジ">
      {(!props.room || props.room.phase === "lobby") && (props.room && props.isHost ? <button type="button" onClick={props.onDissolve} className={gameTopBannerDangerActionClass}>部屋を解散</button> : <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>)}
      <GameTopMenu>
        {props.room && props.room.phase !== "lobby" && <Link href="/games" data-menu-close="true" className={gameTopMenuItemClass}>広場へ戻る</Link>}
        {props.room && <OnlineRoomSpectatorLink game="wordwolf" code={props.room.code} />}
        <button type="button" data-menu-close="true" onClick={props.onOpenRules} className={gameTopMenuItemClass}>ルール</button>
        <PaidLlmAccessButton variant="menu" />
        {props.room && props.isHost && <DebugModeButton variant="menu" enabled={Boolean(props.room.debugMode)} disabled={props.room.phase !== "lobby"} onAbort={props.room.debugMode && props.room.phase !== "lobby" ? props.onAbort : undefined} replayEnabled={Boolean(props.room.debugReplayEnabled)} onReplayChange={props.onDebugReplayChange} onChange={props.onDebugChange} />}
      </GameTopMenu>
      <WordWolfPlayerProfile playerId={props.playerId} playerName={props.playerName} headerName={props.headerName} avatarImage={props.avatarImage} headerAvatarColor={props.headerAvatarColor} headerAvatarImage={props.headerAvatarImage} isOpen={props.isAvatarPickerOpen} onOpenChange={props.onAvatarPickerOpenChange} onPlayerNameChange={props.onPlayerNameChange} onCommitPlayerName={props.onCommitPlayerName} onAvatarColorChange={props.onAvatarColorChange} onAvatarImageChange={props.onAvatarImageChange} onAvatarUpload={props.onAvatarUpload} onOpenMyPage={() => props.onMyPageOpenChange(true)} />
    </GameTopBanner>
    {props.room && <div className="mx-auto max-w-6xl px-4 pt-4"><PlayerTimeoutNotice playerTimeouts={props.room.playerTimeouts} playerTimeoutNotice={props.room.playerTimeoutNotice} currentPlayerId={props.currentPlayerId} onRecover={props.onRecover} /></div>}
    <FullScreenPageOverlay open={props.isMyPageOpen} href="/users/me" title="マイページ" keepAlive onClose={() => props.onMyPageOpenChange(false)} />
  </>;
}
