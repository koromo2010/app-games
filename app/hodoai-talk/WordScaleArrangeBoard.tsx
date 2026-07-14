"use client";

import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { moveHodoaiCard, sameHodoaiOrder, shiftHodoaiCard, usesCompactHodoaiCards } from "@/lib/hodoai-arrange";
import { defaultAvatarImage, fallbackAvatarColor } from "@/lib/player-session";
import type { HodoaiCard, HodoaiClueRound, HodoaiPlayer } from "@/lib/hodoai-talk";

type WordScaleArrangeBoardProps = {
  order: string[];
  cards: HodoaiCard[];
  players: HodoaiPlayer[];
  clueRounds: HodoaiClueRound[];
  values: Record<string, number>;
  revealValues: boolean;
  canArrange: boolean;
  disabled: boolean;
  onReorder: (order: string[]) => Promise<boolean>;
};

export function WordScaleArrangeBoard({
  order,
  cards,
  players,
  clueRounds,
  values,
  revealValues,
  canArrange,
  disabled,
  onReorder,
}: WordScaleArrangeBoardProps) {
  const [draftOrder, setDraftOrder] = useState(order);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(order[0] ?? null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const draftOrderRef = useRef(order);
  const draggingCardIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (draggingCardIdRef.current) return;
    draftOrderRef.current = order;
    setDraftOrder(order);
    setSelectedCardId((current) => current && order.includes(current) ? current : order[0] ?? null);
  }, [order]);

  const beginDrag = (cardId: string) => {
    if (!canArrange || disabled) return;
    draggingCardIdRef.current = cardId;
    setDraggingCardId(cardId);
    setSelectedCardId(cardId);
  };

  const moveDraft = (cardId: string, targetId: string) => {
    const next = moveHodoaiCard(draftOrderRef.current, cardId, targetId);
    if (next === draftOrderRef.current) return;
    draftOrderRef.current = next;
    setDraftOrder(next);
  };

  const saveOrder = async (next: string[], successMessage: string) => {
    const saved = await onReorder(next);
    if (saved) {
      setAnnouncement(successMessage);
      return;
    }
    draftOrderRef.current = order;
    setDraftOrder(order);
    setAnnouncement("並び順を保存できなかったため、最新の順番へ戻しました。");
  };

  const finishDrag = () => {
    if (!draggingCardIdRef.current) return;
    draggingCardIdRef.current = null;
    setDraggingCardId(null);
    if (!sameHodoaiOrder(order, draftOrderRef.current)) {
      void saveOrder(draftOrderRef.current, "カードの並び順を保存しました。");
    }
  };

  const cancelDrag = () => {
    draggingCardIdRef.current = null;
    draftOrderRef.current = order;
    setDraftOrder(order);
    setDraggingCardId(null);
  };

  const handleDragStart = (event: DragEvent<HTMLLIElement>, cardId: string) => {
    beginDrag(cardId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, cardId: string) => {
    if (event.pointerType === "mouse") return;
    beginDrag(cardId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const cardId = draggingCardIdRef.current;
    if (!cardId || event.pointerType === "mouse") return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-arrange-card-id]");
    const targetId = target?.dataset.arrangeCardId;
    if (targetId) moveDraft(cardId, targetId);
  };

  const shiftCard = (cardId: string, direction: -1 | 1) => {
    const next = shiftHodoaiCard(draftOrderRef.current, cardId, direction);
    if (next === draftOrderRef.current) return;
    draftOrderRef.current = next;
    setDraftOrder(next);
    setSelectedCardId(cardId);
    const position = next.indexOf(cardId) + 1;
    void saveOrder(next, `カードを${position}番目へ移動しました。`);
  };

  const compact = usesCompactHodoaiCards(draftOrder.length);
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const playerById = new Map(players.map((player) => [player.id, player]));
  const previewCardId = hoveredCardId ?? selectedCardId ?? draftOrder[0] ?? null;
  const previewCard = previewCardId ? cardById.get(previewCardId) : null;
  const previewPlayer = previewCard ? playerById.get(previewCard.ownerId) : null;

  return (
    <div className="mt-5">
      <p className="text-sm font-bold text-slate-300">
        {canArrange ? "カードを上下にドラッグして、小さいと思う順に並べてください。" : "並べ替え役の操作が全員の画面へ反映されます。"}
      </p>
      {compact && <p className="mt-1 text-xs text-cyan-200/80">カードへマウスを重ねるか、フォーカス・タップすると詳細を確認できます。</p>}

      <div className={`mt-4 grid min-w-0 gap-4 ${compact ? "lg:grid-cols-[minmax(0,1fr)_18rem]" : ""}`}>
        <div className="relative min-w-0 pl-12">
          <span className="absolute left-0 top-0 font-mono text-xs font-black text-sky-200">0</span>
          <span className="absolute bottom-0 left-0 font-mono text-xs font-black text-fuchsia-200">120</span>
          <div className="absolute bottom-5 left-6 top-5 w-2 rounded-full bg-gradient-to-b from-sky-400 via-amber-300 to-fuchsia-400 shadow-[0_0_22px_rgba(34,211,238,0.25)]" aria-hidden="true" />

          <ol className="space-y-2" aria-label="0から120へ小さい順の候補カード">
            {draftOrder.map((id, index) => {
              const card = cardById.get(id);
              const player = card ? playerById.get(card.ownerId) : null;
              if (!card || !player) return null;
              const isDragging = draggingCardId === id;
              const isPreviewed = previewCardId === id;
              return (
                <li
                  key={id}
                  data-arrange-card-id={id}
                  draggable={canArrange && !disabled}
                  onMouseEnter={() => compact && setHoveredCardId(id)}
                  onMouseLeave={() => compact && setHoveredCardId(null)}
                  onFocusCapture={() => compact && setSelectedCardId(id)}
                  onDragStart={(event) => handleDragStart(event, id)}
                  onDragEnter={() => {
                    if (draggingCardIdRef.current) moveDraft(draggingCardIdRef.current, id);
                  }}
                  onDragOver={(event) => {
                    if (!canArrange) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    finishDrag();
                  }}
                  onDragEnd={finishDrag}
                  className={`relative min-w-0 overflow-hidden rounded-xl border bg-slate-900 shadow-lg transition ${
                    isDragging ? "scale-[1.01] border-amber-300 opacity-80 shadow-amber-300/20" : isPreviewed && compact ? "border-cyan-300 shadow-cyan-300/10" : "border-white/15"
                  }`}
                >
                  <div className={`grid min-w-0 items-center gap-2 ${compact ? "grid-cols-[2rem_minmax(0,1fr)_auto] p-2" : "grid-cols-[2rem_minmax(0,1fr)_auto] p-3"}`}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300 font-black text-slate-950">{index + 1}</span>

                    <button
                      type="button"
                      onClick={() => compact && setSelectedCardId(id)}
                      className="min-w-0 text-left outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-cyan-300"
                      aria-label={`${player.name}のカード${card.cardNumber}の詳細を表示`}
                    >
                      {compact ? (
                        <>
                          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                            {clueRounds.map((clueRound) => <span key={clueRound.round} className="max-w-36 truncate rounded-md bg-cyan-300/10 px-2 py-1 text-sm font-black text-cyan-50">{clueRound.clues[id]}</span>)}
                          </div>
                          <p className="mt-1 truncate text-[11px] font-bold text-slate-400">{player.name}・カード{card.cardNumber}{revealValues && typeof values[id] === "number" ? `・${values[id]}` : ""}</p>
                        </>
                      ) : (
                        <div className="space-y-2">
                          {clueRounds.map((clueRound) => (
                            <div key={clueRound.round} className="rounded-lg border border-cyan-200/10 bg-cyan-200/[0.06] p-2.5">
                              <p className="text-[10px] font-bold leading-4 text-cyan-200/70">{clueRound.round}回目｜{clueRound.theme.title}</p>
                              <p className="mt-1 break-words text-base font-black leading-6 text-white">{clueRound.clues[id]}</p>
                            </div>
                          ))}
                          <div className="flex items-center gap-2">
                            <span className="h-7 w-7 shrink-0 rounded-full border border-white/25 bg-cover bg-center" style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }} aria-hidden="true" />
                            <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-300">{player.name}・カード{card.cardNumber}</p>
                            {revealValues && typeof values[id] === "number" && <span className="font-mono text-lg font-black text-amber-300">{values[id]}</span>}
                          </div>
                        </div>
                      )}
                    </button>

                    {canArrange && (
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={disabled || index === 0} onClick={() => shiftCard(id, -1)} className="rounded-lg border border-white/10 px-2 py-1.5 text-sm font-black text-slate-200 disabled:opacity-25" aria-label={`${player.name}のカード${card.cardNumber}を上へ`}>↑</button>
                        <button
                          type="button"
                          disabled={disabled}
                          onPointerDown={(event) => handlePointerDown(event, id)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={(event) => {
                            if (event.pointerType !== "mouse") finishDrag();
                          }}
                          onPointerCancel={cancelDrag}
                          className="touch-none cursor-grab rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-sm font-black text-slate-200 active:cursor-grabbing disabled:opacity-40"
                          aria-label={`${player.name}のカード${card.cardNumber}をドラッグして移動`}
                        >⠿</button>
                        <button type="button" disabled={disabled || index === draftOrder.length - 1} onClick={() => shiftCard(id, 1)} className="rounded-lg border border-white/10 px-2 py-1.5 text-sm font-black text-slate-200 disabled:opacity-25" aria-label={`${player.name}のカード${card.cardNumber}を下へ`}>↓</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {compact && previewCard && previewPlayer && (
          <aside className="sticky top-24 z-10 order-first max-h-[45vh] self-start overflow-y-auto rounded-2xl border border-cyan-300/25 bg-slate-900 p-4 shadow-xl lg:order-last lg:max-h-[calc(100vh-8rem)]" aria-label="選択中のカード詳細">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-cyan-300">Card detail</p>
                <p className="mt-1 font-black text-white">{previewPlayer.name}・カード{previewCard.cardNumber}</p>
              </div>
              {revealValues && typeof values[previewCard.id] === "number" && <span className="font-mono text-2xl font-black text-amber-300">{values[previewCard.id]}</span>}
            </div>
            <div className="mt-4 space-y-3">
              {clueRounds.map((clueRound) => (
                <div key={clueRound.round} className="rounded-xl border border-cyan-200/10 bg-cyan-200/[0.06] p-3">
                  <p className="text-[10px] font-bold leading-4 text-cyan-200/70">{clueRound.round}回目｜{clueRound.theme.title}</p>
                  <p className="mt-1 break-words text-lg font-black leading-7 text-white">{clueRound.clues[previewCard.id]}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">マウスオーバー中のカードを表示します。タップまたはフォーカスしたカードは選択状態として残ります。</p>
          </aside>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
