"use client";

import { gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameSdkShellHeader } from "@/app/components/GameSdkShellHeader";
import { OnlineRoomLifecycleActions } from "@/app/components/OnlineRoomLifecycleActions";
import { RoomConfigSummary } from "@/app/components/RoomConfigSummary";
import type { WordWolfSdkCommand } from "@/games/wordwolf-sdk/domain";
import type { WordWolfSdkAppView } from "@/games/wordwolf-sdk/server-module";
import {
  gameSdkSettingOptionValue,
  type GameSdkSettingDefinition,
  type GameSdkSettingValue,
} from "@game-fields/game-sdk";
import type {
  GameSdkOnlineRoomView,
} from "@game-fields/game-sdk/runtime";
import {
  createGameSdkHttpClientRuntime,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
import {
  roomUpdateIsOlder,
  roomUpdateIsUnchanged,
  sdkRoomViewHasReturningPlayer,
  shouldHoldRoomResultTransition,
  shouldKeepRoomResultAfterDissolve,
} from "@/lib/room-result-return";
import { useGameSdkActiveRoomRestore } from "@/app/hooks/use-game-sdk-active-room-restore";
import { AppLink as Link } from "@/app/components/AppLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WordWolfRoomView = GameSdkOnlineRoomView<
  {
    roundsTotal: number;
    wolfCount: number;
    clueMode: "turn" | "simultaneous";
    timeLimitSeconds: number;
  },
  WordWolfSdkAppView
>;

type RoomSnapshot = {
  code: string;
  revision: number;
  phase: string;
  view: WordWolfRoomView;
};

type Props = {
  gameId: string;
  title: string;
  settingDefinitions: readonly GameSdkSettingDefinition[];
  rules: readonly string[];
};

const panelClass =
  "rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl shadow-black/10";
const primaryClass =
  "rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45";
const secondaryClass =
  "rounded-xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45";

function randomRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]!.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

function runtimeErrorMessage(error: unknown) {
  if (error instanceof GameSdkHttpClientRuntimeError) {
    if (error.status === 401) return "ãƒ­ã‚°ã‚¤ãƒ³ã—ã¦ã‹ã‚‰ã‚‚ã†ä¸€åº¦ãŠè©¦ã—ãã ã•ã„ã€‚";
    if (error.code === "STALE_REVISION") return "éƒ¨å±‹ãŒæ›´æ–°ã•ã‚Œã¾ã—ãŸã€‚æœ€æ–°çŠ¶æ…‹ã‚’èª­ã¿ç›´ã—ã¾ã™ã€‚";
    if (error.code === "PLAYER_ACTIVE_ROOM") return "é€²è¡Œä¸­ã®åˆ¥ã®éƒ¨å±‹ãŒã‚ã‚Šã¾ã™ã€‚";
    if (error.code === "LOBBY_RETURN_PENDING") return "å‚åŠ è€…å…¨å“¡ãŒéƒ¨å±‹ã¸æˆ»ã‚‹ã¾ã§é–‹å§‹ã§ãã¾ã›ã‚“ã€‚";
    return `æ“ä½œã‚’å®Œäº†ã§ãã¾ã›ã‚“ã§ã—ãŸï¼ˆ${error.code}ï¼‰ã€‚`;
  }
  return "æ“ä½œã‚’å®Œäº†ã§ãã¾ã›ã‚“ã§ã—ãŸã€‚";
}

export function ApprovedSdkGameShell({
  gameId,
  title,
  settingDefinitions,
  rules,
}: Props) {
  const runtime = useMemo(() => createGameSdkHttpClientRuntime<
    {
      settings?: Partial<WordWolfRoomView["common"]["settings"]>;
      app: { topic?: { villageWord: string; wolfWord: string } };
    },
    WordWolfSdkCommand,
    WordWolfRoomView
  >({
    gameId,
    endpoint: `/api/game-sdk/${gameId}/rooms`,
  }), [gameId]);
  const watchRef = useRef<{ close(): void } | null>(null);
  const expiryRef = useRef<number | null>(null);
  const pendingActionRef = useRef(false);
  const pendingLobbyRoomRef = useRef<RoomSnapshot | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [rooms, setRooms] = useState<Array<{
    code: string;
    playerCount: number;
    maximumPlayers: number;
  }>>([]);
  const [joinCode, setJoinCode] = useState("");
  const [clue, setClue] = useState("");
  const [guess, setGuess] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [clockNow, setClockNow] = useState<number | null>(null);
  const [canReturnToRoom, setCanReturnToRoom] = useState(false);
  const [isRoomDissolved, setIsRoomDissolved] = useState(false);
  const [playerDefaults, setPlayerDefaults] = useState<
    Record<string, GameSdkSettingValue>
  >({});

  useEffect(() => {
    let active = true;
    void fetch(`/api/game-sdk/${gameId}/defaults`, {
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) return;
      const body = await response.json() as {
        settings?: Record<string, GameSdkSettingValue>;
      };
      if (active) setPlayerDefaults(body.settings ?? {});
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [gameId]);

  const refreshRooms = useCallback(async () => {
    try {
      const page = await runtime.listRooms();
      setRooms(page.rooms);
    } catch (error) {
      setMessage(runtimeErrorMessage(error));
    }
  }, [runtime]);

  const commitRoom = useCallback((next: RoomSnapshot | null) => {
    roomRef.current = next;
    setRoom(next);
  }, []);

  const acceptIncomingRoom = useCallback((next: RoomSnapshot | null) => {
    const current = roomRef.current;
    if (!next) {
      if (shouldKeepRoomResultAfterDissolve(current, "result")) {
        pendingLobbyRoomRef.current = null;
        setCanReturnToRoom(false);
        setIsRoomDissolved(true);
        return;
      }
      commitRoom(null);
      return;
    }
    if (
      roomUpdateIsOlder(current, next)
      || roomUpdateIsUnchanged(current, next)
    ) return;
    if (shouldHoldRoomResultTransition(current, next, "result")) {
      if (!sdkRoomViewHasReturningPlayer(next)) {
        pendingLobbyRoomRef.current = null;
        setCanReturnToRoom(false);
        setIsRoomDissolved(true);
        return;
      }
      pendingLobbyRoomRef.current = next;
      setCanReturnToRoom(true);
      return;
    }
    pendingLobbyRoomRef.current = null;
    setCanReturnToRoom(false);
    setIsRoomDissolved(false);
    commitRoom(next);
  }, [commitRoom]);

  const attachRoom = useCallback((next: RoomSnapshot | null) => {
    commitRoom(next);
    pendingLobbyRoomRef.current = null;
    setCanReturnToRoom(false);
    setIsRoomDissolved(false);
    watchRef.current?.close();
    watchRef.current = null;
    if (!next) return;
    watchRef.current = runtime.watchRoom(next.code, {
      onRoom: acceptIncomingRoom,
      onError: (error) => setMessage(runtimeErrorMessage(error)),
    });
  }, [acceptIncomingRoom, commitRoom, runtime]);

  const loadActiveRoom = useCallback(
    () => runtime.readActiveRoom(),
    [runtime],
  );
  const handleRestoreError = useCallback((error: unknown) => {
    setMessage(runtimeErrorMessage(error));
  }, []);
  const isRestoringRoom = useGameSdkActiveRoomRestore({
    loadActiveRoom,
    onRoom: attachRoom,
    onEmpty: refreshRooms,
    onError: handleRestoreError,
  });

  useEffect(() => {
    return () => {
      watchRef.current?.close();
      if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    };
  }, []);

  const run = useCallback(async (operation: () => Promise<RoomSnapshot>) => {
    if (pendingActionRef.current) return false;
    pendingActionRef.current = true;
    setPending(true);
    setMessage("");
    try {
      attachRoom(await operation());
      return true;
    } catch (error) {
      if (
        error instanceof GameSdkHttpClientRuntimeError
        && error.code === "PLAYER_ACTIVE_ROOM"
      ) {
        try {
          const activeRoom = await runtime.readActiveRoom();
          if (activeRoom) {
            attachRoom(activeRoom);
            setMessage("é€²è¡Œä¸­ã®éƒ¨å±‹ã¸æˆ»ã‚Šã¾ã—ãŸã€‚");
            return true;
          }
        } catch {
          // Fall through to the original lifecycle error.
        }
      }
      setMessage(runtimeErrorMessage(error));
      if (
        error instanceof GameSdkHttpClientRuntimeError
        && error.code === "STALE_REVISION"
        && roomRef.current
      ) {
        attachRoom(await runtime.readRoom(roomRef.current.code));
      }
      return false;
    } finally {
      pendingActionRef.current = false;
      setPending(false);
    }
  }, [attachRoom, runtime]);

  const send = useCallback(async (command: WordWolfSdkCommand) => {
    if (!room) throw new Error("ROOM_REQUIRED");
    const result = await runtime.sendCommand(room.code, {
      expectedRevision: room.revision,
      command,
    });
    return result.room;
  }, [room, runtime]);

  useEffect(() => {
    const deadlineAt = room?.view.common.timer?.deadlineAt;
    if (!deadlineAt || room?.phase === "result") return;
    const updateClock = () => {
      setClockNow(Date.now());
    };
    const initial = window.setTimeout(updateClock, 0);
    const interval = window.setInterval(updateClock, 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [room?.phase, room?.view.common.timer?.deadlineAt]);

  useEffect(() => {
    if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    expiryRef.current = null;
    const timer = room?.view.common.timer;
    if (!room || !timer?.deadlineAt || room.phase === "result") return;
    const delay = Math.max(0, timer.deadlineAt + 1_500 - Date.now());
    expiryRef.current = window.setTimeout(() => {
      void runtime.sendCommand(room.code, {
        expectedRevision: room.revision,
        command: {
          type: "room/expire-timer",
          turnSequence: timer.turnSequence,
        },
      }).then((result) => {
        acceptIncomingRoom(result.room);
      }).catch((error) => {
        if (
          error instanceof GameSdkHttpClientRuntimeError
          && (
            error.code === "STALE_REVISION"
            || error.code === "TIMER_EVENT_STALE"
            || error.code === "TIMER_NOT_EXPIRED"
          )
        ) return;
        setMessage(runtimeErrorMessage(error));
      });
    }, delay);
    return () => {
      if (expiryRef.current !== null) window.clearTimeout(expiryRef.current);
    };
  }, [acceptIncomingRoom, room, runtime]);

  const returnToRoom = useCallback(async () => {
    const pendingLobbyRoom = pendingLobbyRoomRef.current;
    if (!pendingLobbyRoom || isRoomDissolved) return;
    try {
      const latestRoom = await runtime.readRoom(pendingLobbyRoom.code);
      if (
        !latestRoom
        || latestRoom.phase !== "lobby"
        || !sdkRoomViewHasReturningPlayer(latestRoom)
      ) {
        pendingLobbyRoomRef.current = null;
        setCanReturnToRoom(false);
        setIsRoomDissolved(true);
        setMessage("éƒ¨å±‹ãŒè§£æ•£ã•ã‚ŒãµÓ­öÒÚ$z{-®éÜj×¢¢ó¢Ş‡
H(€ÁÉ•Á…É•}ÍÕÁÁ½ÉÑ}É•Á½ÉÑƒ»–ş¦‚#–—–*o£_›
×óCóŸ
š’s¢¢óg
/(´ƒ–B3’âï–7fëïÚk–‚Ç»–>¿¢÷šŸ3
/–‚Ó–B#½•Ñ}ÍÕÁÁ½ÉÑ}Ñ¡É•…‘ƒ/
$(€ÁÉ•Á…É•}ÍÕÁÁ½ÉÑ}É•Á±åƒã¦ËÿšZÃ¢š?–‚Ç–F+
Kšš¶‹g
/(´ƒš^‹–¶c#ã–në–ºkW
3}½İ¹±½…‘5—£–2ë–"—g
/
Ù•ÈÄßãšnÓšZÃg
/((ŒŒŒƒ–ºšZ÷ÖCšzp((´½İ¹±½…‘5—¹ÍÕÁÁ½ÉÓš&/¦‚ã–£’îÛŸ–B#¦Z‹¦–g¢s»¢¦ÏÒÃ–>[–ú_š^‹–¶c
ç³'ã»¢şS’ş‡
K¢ş÷–*ƒ_(´5C¹ÁÉ•Á…É•}ÍÕÁÁ½ÉÑ}É•Á½ÉÑƒá¡•­•‘I•Á½ÉÑ%‘Íƒ
K¢ş÷–*ƒ_>û–r£»šr³’êëš&šr%É•Á½ÉĞ%(€ƒ–£’îÛ£’â¢Ó_«šZÃ¢š?’â/šnã7
Kš.K–B›g
/
#¯_(´M,!•±Ã>û¢†3’îWšc–òW7Úg;š^‹~—’ê/¢Æ‡
K–B3c––GÒãšnÓšZÃ_(´ƒš^‹¯’ös
'
3¦7¢’É•Á½ÉÓ¿¢«–.WÖÇ–B#ok–
ç³'ã–ş¢š––ºç
K¢ş÷¢¢c_–ú3¯¦7¢’–Ó
H(€ƒÖ’êg
/šZç¦w£_((ŒŒŒƒš’s¢¢ğ((´ÍÕÁÁ½ÉÓ––GÒ
ç Û’îÛ¹Á´ÉÕ¸Ù•É¥™åƒ– ØÌß
ç#¯š"C–*_(´ƒšr³’öMÁÉ½‘ÕÑ¥½¸‰Õ¥±“¡M,A½ÉÑ…°ÁÉ½‘ÕÑ¥½¸‰Õ¥±“¯š"C–*_(´ƒ’ş»š¶½µµ¥Ğ€İ…˜àÀØÅƒ
I™½É—«_‘•Ù•±½Áƒã–>7šbƒ_(´M,A½ÉÑ…°‘•Ø•Á±½åµ•¹Ğ‘Á±|İÍ¥èİLİ¡‘-])¥éAaáMåÅa©U•™áƒ1Ieƒ£«((ŒŒŒƒ¦Z‹¦
Ï ((´€İ…˜àÀØÅ€ƒŠPAÉ•Ù•¹Ğ‘ÕÁ±¥…Ñ”$ÍÕÁÁ½ÉĞÉ•Á½ÉÑÍ€((ŒŒŒƒšr«–¾û–şsï’şwVd((´Ù•ÈÄß
K’öÿšZÃ¢š='#Ÿš^‹–¶cš†#’îÛ1ÁÉ•Á…É•}ÍÕÁÁ½ÉÑ}É•Á±åƒã¦Ë
–ºš¦Šë¢ª7(´ƒRï–?ŸŠë¢ª7_¦7¢’É•Á½ÉÓ£–É•Á½ÉÓ»––ºçšVÓB((ŒŒ€ÈÀÈØ´ÀÜ´ÈÜƒŠPƒ–ê–‚Ó»
Ëóƒ+šÂ_¯–—
(((ŒŒŒƒ–"§R£¢/
'»¢ššrl((´ƒ
¯ó'¢†£’ëŸ¿–>Ï’â+Â‡šbO’â¢šŸŸ¿¢†3»–>Ï–Ó¯šb
Kö»7
Ëóƒ
K+šÂ_¯–—
+fï¦2ËŸ7
/
#¯g
/(´ƒ–ê–‚Ó¿+šÂ_¯–—
+
Ëóƒ
KW
§¯#Ÿ’â+¯’â›ç
/((ŒŒŒƒ–"“šZ´((´ƒš^‹–¶c»
¯ó'¾ò?Â‡šbO’â¢šŸ¢†£’ë¢¢·–ºk£–B3c?šr«·
Ã
“ÏŸ
’öÿ#
/®¿šr¯¢¢·–ºk£_˜(€±½…±MÑ½É…•ƒã’şw–¶cg
/	µ¥É…Ñ¥½»
šr³V«JÃ–Š–’'šVÃ¿¢ş÷–*ƒ_«(´ƒšb¿
Ëóƒ¦ßï«Ï
¿»–’[ã.³®/_s
ÿÏ£_›ö»7šb»šN7’ösŸ
Ëóƒã¦ßï_«(´ƒ+šÂ_¯–—
+ú“£¦k–âãú“»–¦£Ÿ¿š’sÒ‹–ú3
fï¦2ËÂÿRÇšv—»nã–¾û¦‚
KÚ·š2g
/((ŒŒŒƒ–ºšZ÷ÖCšzp((´ƒ
¯ó'–>Ï’â+£Â‡šbO’â¢šŸ–>Ï®¿ãfï¦2Ë*Ûš/3–"/
/šbs
ÿÏ
K¢ş÷–*ƒ_(´ƒ+šÂ_¯–—
+
Kš’sÒ‹ÖCšzs
K–B¯
’â¢šŸ»–#¦‚·ã–º'–ºk
÷ó#_–"—
ÿ[Ÿ»–’'šnÓ
–B3šrg
/(´ƒš^—šr³¢ª{¾ò?¢.Ç¢ª{»šN7’ös§g¯¡…É¥„µÁÉ•ÍÍ•‘ƒ
K¢ş÷–*ƒ_((ŒŒŒƒš’s¢¢ğ((´ƒ+šÂ_¯–—
)%»š¶¢š?–2[–+
3’şw–¶c–“»‡¢š[–º'–ºk
÷ó#»¢«–.W
ç#
K¢ş÷–*ƒ_(´¹Á´ÉÕ¸±¥¹Ñƒ– ØĞÃ
ç#ÜàÉ½ÕÑ—¹¹Á´ÉÕ¸‰Õ¥±‘ƒ¯š"C–*_((ŒŒŒƒšr«–¾û–şsï’şwVd((´ƒ
‹
¯
›Ï#¦ZOï®¿šr¯¦ZO–B3šr¿’î+–n{»¾–nË–’[–ş¢š¯«–‚Ó–B#¿
‹
¯
›Ï#¢¢·–ºiA'£_˜(€ƒ–"—¦S–Â;–—g
/((ŒŒ€ÈÀÈØ´ÀÜ´ÈÜƒŠPM/
Ëóƒ§
›Ï
ã/
'–ê–‚Óã»nÓš:—–Â;Şh((ŒŒŒƒ–"§R£¢/
'»¢ššrl((´ƒ
Ëóƒ§
›Ï
ã¯
/£7–ê–‚ÓàÇ
¿«
¿Ÿš"ï
3
/
#¯g
/(´ƒš"ï
+–#»–FóÃ¿3·Oó7Ÿ¿«?3–ê–‚Ó7£g
/((ŒŒŒƒ–"“šZ´((´ƒ3·Oó7¿’ösš"Cšâ#ıI½½·»
Ëóƒ¦Z/–/–&7*Ûš/3–ê–‚Ó7¿
Ëóƒ¦ãš*{Rï¦v‹£_›–2ë–"—g
/(´ƒšbš‚óšâ#ıM/
Ëóƒ»§
›Ï
ãŸ¿‡/—ó–Ÿ¿«?#_Có»nÓš:—šN7’ös£_›¢†£’ëg
/((ŒŒŒƒ–ºšZ÷ÖCšzp((´ƒš^‹–¶c¹€½…µ•ÍƒnÓš:—«Ï
¿
K3
Ëóƒ’â¢šŸã7/
'3–ê–‚Óãš"ï
/7ãÖÇ’â_(´ƒ–¦£¦ßï
K–Ç¦iÁÁ1¥¹­ƒãš>#>û–r£»¢†£’ë¢¢¢ª{
KÚ·š2g
/((ŒŒŒƒš’s¢¢ğ((´ƒ§
›Ï
ã»#_Có¯3–ê–‚Óãš"ï
/73nÓš:—–¶c–r£_š^Ÿ¢†£¢¢c3šº/
'«O£
H(€Í½ÕÉ—––GÒ
ç#ã¢ş÷–*ƒ_(´¹Á´ÉÕ¸±¥¹Ñƒ– ØĞÃ
ç#ÜàÉ½ÕÑ—¹¹Á´ÉÕ¸‰Õ¥±‘ƒ¯š"C–*_((ŒŒ€ÈÀÈØ´ÀÜ´ÈÜƒŠPM/§
›Ï
ãcó»–Ç¦k––GÒ–2X((ŒŒŒƒ–"§R£¢/
'»¢ššrl((´ƒšbš‚óšâ#ıM/
ËóƒŸ3–ê–‚Óãš"ï
/73¢†£’ëW
3«/(´ƒ–¾û¢Æ‡Rï¦v‹ƒGãs
ÿÏ
K¢ÚÏg–¾û–›fšÎWŸ¿«?‹
ã—ó¯–2[
K–«–#g
/((ŒŒŒƒ–"“šZ´((´ƒ–&7–n{¿š^ÁÁÉ½Ù•‘M‘­…µ•M¡•±±ƒƒGãnÓš:—«Ï
¿
K¢ş÷–*ƒ_–º¦jo¹¥™É…µ”Á…­…—3’öÿ(€…µ•M‘­É…µ”ƒŠH…µ•M‘­M¡•±±!•…‘•ÉƒÖ3¢Ş¿ã––GÒ3–Æ+›«/(´M,M¡•±³S£»«Ï
¿nÓšnã7
K–îš¶‹_–Ç¦i…µ•M‘­M¡•±±!•…‘•Éƒã¢†£’ë¦v‹
Kšâ‡g(´ÍÕÉ™…”ô‰±½Õ¹”‰ƒŸ¿–Ç¦kcó¢«¢ê¯3nÓš:—š"ï
+–Â;Şk
K¢†£’ë_I½½·–Ÿ¼(€ƒš"ï
+–Â;Şk
K–Ç¦k‡/—óãö»?((ŒŒŒƒ–ºšZ÷ÖCšzp((´AÉ•Ù¥•ßš:‡R£šâ#ı¥™É…µ”Á…­…—š^İ½É‘İ½±˜±¥•¹Ó
K–B3`(€…µ•M‘­M¡•±±!•…‘•Éƒ––GÒãÖÇ–B#_(´ƒš^M¡•±³/
'–/–"•…µ•Q½Á	…¹¹•Éƒ£3–ê–‚Óãš"ï
/7»nÓšnã7
K–&+¦f“_(´ƒš:‡R£šâ#ÿ
Ëóƒ»¢†£’ë–B7
K3–ê–‚Óãš"ï
/7¯ÖÇ’â_–"Û’ös¢AÉ•Ù¥•ßŸ¿–B3c–Ç¦k––GÒ/
$(€ƒ3–"Û’ös¢kó
ãã7
K¢†£’ëg
/((ŒŒŒƒš’s¢¢ğ((´ƒ–Ç¦kcó3§
›Ï
ã¦v‹»nÓš:—–Â;Şk
Kš&šr'_š^M¡•±³¯–/–"—có3š"ï
'«O£
H(€Í½ÕÉ—––GÒ
ç#ã¢ş÷–*ƒ_(´ƒš^ŸÖ3¢Ş¿
K’öÿfï¦2Ëšâ#ÿ
Ëóƒ1İ½É‘İ½±˜µÍ‘­ƒŸ
/O£
Kfï¦2ËÂÿ/
'Šë¢ª7_(€ƒ§
›Ï
ã¾ò=I½½·»+O¦7ö»¢šÏš"›¯ó¯_³
““ó‡/—ó’şwš2
K–n{–âÃ
ç#ã¢ş÷–*ƒ_(´İ½É‘İ½±˜µÍ‘­ƒ¹I½½·’ösš"C–>–*ƒ_³
“ÖCšzs–7š"›–£–N‡–ú§–âÃ»š^‹–¶c
ç#
K–7–º¢†3_(´¹Á´ÉÕ¸±¥¹Ñƒ– ØĞË
ç#ÜàÉ½ÕÑ—¹¹Á´ÉÕ¸‰Õ¥±‘ƒ¯š"C–*_((ŒŒŒƒšr«–¾û–şsï’şwVd((´‘•Û¦7–
g–ú3»–ºRï¦v‹Šë¢ª7