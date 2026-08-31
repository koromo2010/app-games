"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Image from "next/image";
import { AppLink as Link } from "@/app/components/AppLink";
import { useAppLocale } from "@/app/components/AppLocaleProvider";
import type { AppLocale } from "@/lib/app-locale";
import { filterGamesBySearch } from "@/lib/game-catalog-search";
import { isGameLocaleAvailable, isGameUiLocaleAvailable } from "@/lib/game-language";
import type { GameOperation } from "@/lib/game-operations";
import { gameOperationFor } from "@/lib/game-operations";
import type { LocalizedGameCatalogEntry } from "./game-catalog";
import { gamePlayHref } from "@/lib/game-routes";
import {
  parseFavoriteGameIds,
  readFavoriteGameIds,
  saveFavoriteGameIds,
  sortGamesByFavorite,
  subscribeFavoriteGameIds,
} from "./lobby-game-favorites";

type ActiveRoom = { code: string; phase: string; players: { id: string; name: string }[]; updatedAt: number };
type Props = { games: LocalizedGameCatalogEntry[]; operations: GameOperation[]; activeRooms: Record<string, ActiveRoom>; isLoggedIn: boolean; locale: AppLocale; onRememberWordWolf: () => void };
type ViewMode = "cards" | "list";

const viewModeStorageKey = "game-fields:lobby-game-view-mode";
const viewModeChangeEvent = "game-fields:lobby-game-view-mode-change";
let fallbackViewMode: ViewMode = "cards";

function readViewMode(): ViewMode {
  try {
    const saved = window.localStorage.getItem(viewModeStorageKey);
    fallbackViewMode = saved === "list" ? "list" : "cards";
  } catch {
    // Keep the last in-memory choice when storage is unavailable.
  }
  return fallbackViewMode;
}

function subscribeViewMode(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === viewModeStorageKey) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(viewModeChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(viewModeChangeEvent, onStoreChange);
  };
}

export function LobbyGameGrid({ games, operations, activeRooms, isLoggedIn, locale, onRememberWordWolf }: Props) {
  const { t } = useAppLocale();
  const [searchQuery, setSearchQuery] = useState("");
  const viewMode = useSyncExternalStore(
    subscribeViewMode,
    readViewMode,
    () => "cards",
  );
  const favoriteGameIdsSnapshot = useSyncExternalStore(
    subscribeFavoriteGameIds,
    readFavoriteGameIds,
    () => "[]",
  );
  const favoriteGameIds = useMemo(
    () => new Set(parseFavoriteGameIds(favoriteGameIdsSnapshot)),
    [favoriteGameIdsSnapshot],
  );
  const filteredGames = useMemo(
    () => sortGamesByFavorite(filterGamesBySearch(games, searchQuery), favoriteGameIds),
    [favoriteGameIds, games, searchQuery],
  );

  const selectViewMode = (next: ViewMode) => {
    fallbackViewMode = next;
    try {
      window.localStorage.setItem(viewModeStorageKey, next);
    } catch {
      // Storage may be unavailable in privacy-restricted browsers.
    }
    window.dispatchEvent(new Event(viewModeChangeEvent));
  };

  const toggleFavorite = (gameId: string) => {
    const next = new Set(favoriteGameIds);
    if (next.has(gameId)) next.delete(gameId);
    else next.add(gameId);
    saveFavoriteGameIds(next);
  };

  return <div className={`${isLoggedIn ? "order-1" : "order-2"} min-w-0 lg:order-2 lg:col-start-2 lg:row-start-1`}>
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.08] px-4 py-3 text-white">
      <p className="text-xs font-semibold uppercase text-cyan-200">Games</p>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-xl font-black">{t("games.choose")}</h2>
        <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center sm:justify-end">
          <div className="grid shrink-0 grid-cols-2 rounded-lg border border-white/15 bg-black/20 p-1" role="group" aria-label={t("games.viewMode")}>
            <button type="button" aria-pressed={viewMode === "cards"} onClick={() => selectViewMode("cards")} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${viewMode === "cards" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
              <span aria-hidden="true">▦ </span>{t("games.cardView")}
            </button>
            <button type="button" aria-pressed={viewMode === "list"} onClick={() => selectViewMode("list")} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${viewMode === "list" ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
              <span aria-hidden="true">☰ </span>{t("games.listView")}
            </button>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">{t("games.search")}</span>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">⌕</span>
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t("games.searchPlaceholder")} className="w-full rounded-lg border border-white/15 bg-white px-9 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/25" />
            {searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label={t("games.clearSearch")} className="absolute inset-y-0 right-2 px-2 text-lg font-bold text-slate-400 hover:text-slate-700">×</button>}
          </label>
        </div>
      </div>
      {searchQuery.trim() && <p className="mt-2 text-xs text-slate-300">{t("games.searchResults", { count: filteredGames.length })}</p>}
    </div>
    {filteredGames.length > 0 ? viewMode === "cards"
      ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(210px,230px))] sm:justify-start">{filteredGames.map((game) => <LobbyGameCard key={game.id} game={game} operation={gameOperationFor(operations, game.id)} activeRoom={activeRooms[game.id]} locale={locale} favorite={favoriteGameIds.has(game.id)} onToggleFavorite={() => toggleFavorite(game.id)} onRememberWordWolf={onRememberWordWolf} />)}</div>
      : <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.06]">{filteredGames.map((game) => <LobbyGameListRow key={game.id} game={game} operation={gameOperationFor(operations, game.id)} activeRoom={activeRooms[game.id]} locale={locale} favorite={favoriteGameIds.has(game.id)} onToggleFavorite={() => toggleFavorite(game.id)} onRememberWordWolf={onRememberWordWolf} />)}</div>
      : <div className="rounded-lg border border-dashed border-white/20 bg-white/[0.06] px-5 py-8 text-center text-white"><p className="font-bold">{t("games.noResults")}</p><p className="mt-1 text-sm text-slate-400">{t("games.noResultsHelp")}</p><button type="button" onClick={() => setSearchQuery("")} className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10">{t("games.clearSearch")}</button></div>}
  </div>;
}

function LobbyGameCard({ game, operation, activeRoom, locale, favorite, onToggleFavorite, onRememberWordWolf }: { game: LocalizedGameCatalogEntry; operation: GameOperation; activeRoom?: ActiveRoom; locale: AppLocale; favorite: boolean; onToggleFavorite: () => void; onRememberWordWolf: () => void }) {
  const { t } = useAppLocale();
  const localeAvailable = isGameLocaleAvailable(game.id, locale);
  const uiLocaleAvailable = isGameUiLocaleAvailable(game.id, locale);
  const unavailable = !localeAvailable || !uiLocaleAvailable;
  const maintenance = operation.maintenance;
  const active = Boolean(activeRoom);
  const privateGame = operation.publication === "private";
  const isMeasuredLobbyLcpImage = game.id === "wordwolf";
  const card = <article className={`group h-full rounded-lg border p-3 shadow-[0_14px_38px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(15,23,42,0.28)] ${active ? "border-cyan-300 bg-gradient-to-br from-cyan-950 via-slate-900 to-fuchsia-950 ring-2 ring-cyan-300/60" : "border-white/10 bg-white/[0.96]"}`}>
    <div className={`relative h-28 overflow-hidden rounded-md bg-gradient-to-br ${game.accent} ${active ? "ring-2 ring-white/50" : ""}`}><Image src={game.visual} alt="" fill sizes="(min-width: 1024px) 220px, (min-width: 640px) 45vw, 90vw" unoptimized loading={isMeasuredLobbyLcpImage ? "eager" : "lazy"} fetchPriority={isMeasuredLobbyLcpImage ? "high" : "auto"} className="object-cover transition duration-500 group-hover:scale-105" /><span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-white/10" /></div>
    <div className="mt-3"><h2 className={`text-lg font-black leading-tight ${active ? "text-white" : "text-slate-950"}`}>{game.title}</h2><div className="mt-2 flex flex-wrap gap-1.5">{active && <Badge active>{t("games.playing")}</Badge>}{maintenance && !active && <Badge active={false} state>{t("games.maintenance")}</Badge>}{privateGame && <Badge active={active} state>{t("games.private")}</Badge>}{!localeAvailable && <Badge active={false} state>{t("games.japaneseOnly")}</Badge>}{localeAvailable && !uiLocaleAvailable && <Badge active={false} state>{t("games.englishUiPending")}</Badge>}{game.tags.map((tag) => <Badge key={tag} active={active} tag={tag}>{tag}</Badge>)}</div></div>
    {activeRoom && <p className="mt-2 text-xs font-bold text-cyan-100">{t("games.roomJoined", { code: activeRoom.code })}</p>}
    <p className={`mt-2 min-h-10 text-xs leading-5 ${active ? "text-slate-200" : "text-slate-600"}`}>{game.summary}</p>
    {!localeAvailable && <p className="mt-2 rounded-md bg-violet-100 px-2 py-1.5 text-xs font-bold leading-5 text-violet-900">{t("games.languageUnavailable")}</p>}
    {localeAvailable && !uiLocaleAvailable && <p className="mt-2 rounded-md bg-cyan-100 px-2 py-1.5 text-xs font-bold leading-5 text-cyan-950">{t("games.uiUnavailable")}</p>}
    {maintenance && <p className="mt-2 rounded-md bg-amber-100 px-2 py-1.5 text-xs font-bold leading-5 text-amber-900">{operation.message || t("games.maintenanceDefault")}</p>}
    <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs ${active ? "border-white/15 text-slate-200" : "border-slate-200 text-slate-600"}`}><p><span className={active ? "text-cyan-200" : "text-slate-400"}>{t("games.players")}</span> <strong>{game.players}</strong></p><p title={game.timeSampleCount ? t("games.actualEstimateTitle", { count: game.timeSampleCount }) : t("games.initialEstimateTitle")}><span className={active ? "text-cyan-200" : "text-slate-400"}>{game.timeSampleCount ? t("games.actualEstimate") : t("games.estimate")}</span> <strong>{game.time}</strong></p></div>
    <div className="mt-3">{maintenance || unavailable ? <span className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">{t("games.unavailable")}</span> : game.href ? <span className={`inline-flex rounded-md px-3 py-1.5 text-xs font-bold shadow-sm ${active ? "bg-amber-300 text-amber-950" : "bg-cyan-600 text-white"}`}>{active ? t("games.return") : locale === "en" ? "View game" : "ゲームを見る"}</span> : <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-400">{t("games.comingSoon")}</span>}</div>
  </article>;
  const entryHref = activeRoom ? gamePlayHref(game.id, activeRoom.code) : game.href;
  const entry = !entryHref || maintenance || unavailable
    ? <div className="block h-full opacity-80">{card}</div>
    : <Link href={entryHref} onClick={game.id === "wordwolf" && active ? onRememberWordWolf : undefined} className="block h-full">{card}</Link>;
  return <div className="relative h-full">
    {entry}
    <FavoriteButton gameTitle={game.title} favorite={favorite} onToggle={onToggleFavorite} variant="card" />
  </div>;
}

function LobbyGameListRow({ game, operation, activeRoom, locale, favorite, onToggleFavorite, onRememberWordWolf }: { game: LocalizedGameCatalogEntry; operation: GameOperation; activeRoom?: ActiveRoom; locale: AppLocale; favorite: boolean; onToggleFavorite: () => void; onRememberWordWolf: () => void }) {
  const { t } = useAppLocale();
  const localeAvailable = isGameLocaleAvailable(game.id, locale);
  const uiLocaleAvailable = isGameUiLocaleAvailable(game.id, locale);
  const unavailable = !localeAvailable || !uiLocaleAvailable;
  const maintenance = operation.maintenance;
  const active = Boolean(activeRoom);
  const privateGame = operation.publication === "private";
  const actionLabel = active
    ? t("games.return")
    : maintenance || unavailable
      ? t("games.unavailable")
      : game.href
        ? locale === "en" ? "View game" : "ゲームを見る"
        : t("games.comingSoon");
  const row = (
    <article className={`flex min-h-16 items-center gap-3 px-3 py-3 pr-14 text-white transition sm:px-4 sm:pr-14 ${active ? "bg-cyan-300/10 ring-1 ring-inset ring-cyan-300/40" : "hover:bg-white/[0.06]"} ${maintenance || unavailable ? "opacity-75" : ""}`}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.9)]" : maintenance || unavailable ? "bg-amber-300" : game.href ? "bg-emerald-300" : "bg-slate-500"}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="mr-1 truncate text-base font-black">{game.title}</h2>
          {active && <Badge active>{t("games.playing")}</Badge>}
          {maintenance && !active && <Badge active={false} state>{t("games.maintenance")}</Badge>}
          {privateGame && <Badge active={active} state>{t("games.private")}</Badge>}
          {!localeAvailable && <Badge active={false} state>{t("games.japaneseOnly")}</Badge>}
          {localeAvailable && !uiLocaleAvailable && <Badge active={false} state>{t("games.englishUiPending")}</Badge>}
          {game.tags.map((tag) => <Badge key={tag} active={active} tag={tag}>{tag}</Badge>)}
        </div>
        {activeRoom && <p className="mt-1 text-xs font-bold text-cyan-200">{t("games.roomJoined", { code: activeRoom.code })}</p>}
      </div>
      <span className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black sm:min-w-24 sm:text-center ${active ? "bg-amber-300 text-amber-950" : maintenance || unavailable || !game.href ? "border border-white/15 bg-white/5 text-slate-400" : "bg-cyan-600 text-white"}`}>
        {actionLabel}
      </span>
    </article>
  );
  return <div className="relative border-b border-white/10 last:border-b-0">
    <GameEntryAction game={game} activeRoom={activeRoom} disabled={maintenance || unavailable} onRememberWordWolf={onRememberWordWolf}>{row}</GameEntryAction>
    <FavoriteButton gameTitle={game.title} favorite={favorite} onToggle={onToggleFavorite} variant="list" />
  </div>;
}

function FavoriteButton({ gameTitle, favorite, onToggle, variant }: { gameTitle: string; favorite: boolean; onToggle: () => void; variant: "card" | "list" }) {
  const { t } = useAppLocale();
  return <button
    type="button"
    aria-pressed={favorite}
    aria-label={t(favorite ? "games.removeFavorite" : "games.addFavorite", { title: gameTitle })}
    title={t(favorite ? "games.removeFavorite" : "games.addFavorite", { title: gameTitle })}
    onClick={onToggle}
    className={`z-10 grid h-9 w-9 place-items-center rounded-full border text-xl leading-none shadow-md transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${variant === "card" ? "absolute right-5 top-5" : "absolute right-3 top-1/2 -translate-y-1/2"} ${favorite ? "border-amber-300 bg-amber-300 text-amber-950" : "border-white/40 bg-slate-950/70 text-white hover:bg-slate-900"}`}
  >
    <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
  </button>;
}

function GameEntryAction({ game, activeRoom, disabled, onRememberWordWolf, children }: { game: LocalizedGameCatalogEntry; activeRoom?: ActiveRoom; disabled: boolean; onRememberWordWolf: () => void; children: ReactNode }) {
  const href = activeRoom ? gamePlayHref(game.id, activeRoom.code) : game.href;
  if (!href || disabled) return <div>{children}</div>;
  return <Link href={href} onClick={game.id === "wordwolf" && activeRoom ? onRememberWordWolf : undefined} className="block">{children}</Link>;
}

function Badge({ active, state = false, tag, children }: { active: boolean; state?: boolean; tag?: string; children: React.ReactNode }) {
  const tone = state
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : tag === "協力" || tag === "Co-op"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tag === "チーム戦" || tag === "Teams"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : tag === "対戦" || tag === "Competitive"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-violet-200 bg-violet-50 text-violet-700";
  return <span className={`inline-flex max-w-full rounded-md border px-2 py-1 text-[11px] font-black leading-tight ${active ? "border-white/20 bg-white/10 text-white" : tone}`}>{children}</span>;
}
