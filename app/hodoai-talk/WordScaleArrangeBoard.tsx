"use client";

import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { moveHodoaiCard, sameHodoaiOrder, shiftHodoaiCard } from "@/lib/hodoai-arrange";
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
  const [announcement, setAnnouncement] = useState("");
  const draftOrderRef = useRef(order);
  const draggingCardIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (draggingCardIdRef.current) return;
    draftOrderRef.current = order;
    setDraftOrder(order);
  }, [order]);

  const beginDrag = (cardId: string) => {
    if (!canArrange || disabled) return;
    draggingCardIdRef.current = cardId;
    setDraggingCardId(cardId);
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
    const position = next.indexOf(cardId) + 1;
    void saveOrder(next, `カードを${position}番目へ移動しました。`);
  };

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const playerById = new Map(players.map((player) => [player.id, player]));

  return (
    <div className="mt-5">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 pb-3 pt-4">
        <div className="h-2 rounded-full bg-gradient-to-r from-sky-400 via-amber-300 to-fuchsia-400 shadow-[0_0_24px_rgba(34,211,238,0.24)]" />
        <div className="mt-2 flex justify-between text-xs font-black text-slate-300">
          <span>0｜小さい</span>
          <span>大きい｜120</span>
        </div>
      </div>

      <p className="mt-3 text-sm font-bold text-slate-300">
        {canArrange ? "カードをドラッグして、小さいと思う順に横へ並べてください。" : "並べ替え役の操作が全員の画面へ反映されます。"}
      </p>

      <div className="mt-3 overflow-x-auto pb-3 [scrollbar-color:rgba(103,232,249,0.55)_rgba(255,255,255,0.06)]">
        <ol className="flex min-w-max items-stretch gap-3" aria-label="小さい順の候補カード">
          {draftOrder.map((id, index) => {
            const card = cardById.get(id);
            const player = card ? playerById.get(card.ownerId) : null;
            if (!card || !player) return null;
            const isDragging = draggingCardId === id;
            return (
              <li
                key={id}
                data-arrange-card-id={id}
                draggable={canArrange && !disabled}
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
                className={`relative flex w-56 shrink-0 flex-col overflow-hidden rounded-2xl border bg-slate-900 shadow-xl transition ${
                  isDragging ? "scale-[1.03] border-amber-300 opacity-80 shadow-amber-300/20" : "border-white/15"
                }`}
              >
                <div className="flex items-center justify-between bg-gradient-to-r from-cyan-300/20 to-fuchsia-300/15 px-3 py-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-300 font-black text-slate-950">{index + 1}</span>
                  {canArrange && (
                    <button
                      type="button"
                      disabled={disabled}
                      onPointerDown={(event) => handlePointerDown(event, id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={(event) => {
                        if (event.pointerType !== "mouse") finishDrag();
                      }}
                      onPointerCancel={cancelDrag}
                      className="touch-none cursor-grab rounded-lg border border-white/15 bg-white/10 px-3 py-1 text-xs font-black text-slate-200 active:cursor-grabbing disabled:opacity-40"
                      aria-label={`${player.name}のカード${card.cardNumber}をドラッグして移動`}
                    >
                      ⠿ ドラッグ
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-3 p-3">
                  {clueRounds.map((clueRound) => (
                    <div key={clueRound.round} className="rounded-xl border border-cyan-200/10 bg-cyan-200/[0.06] p-2.5">
                      <p className="text-[10px] font-bold leading-4 text-cyan-200/70">{clueRound.round}回目｜{clueRound.theme.title}</p>
                      <p className="mt-1 break-words text-base font-black leading-6 text-white">{clueRound.clues[id]}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
                  <span
                    className="h-7 w-7 shrink-0 rounded-full border border-white/25 bg-cover bg-center"
                    style={{ backgroundColor: player.avatarColor || fallbackAvatarColor, backgroundImage: `url(${player.avatarImage || defaultAvatarImage})` }}
                    aria-hidden="true"
                  />
                  <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-300">{player.name}・カード{card.cardNumber}</p>
                  {revealValues && typeof values[id] === "number" && <span className="font-mono text-lg font-black text-amber-300">{values[id]}</span>}
                </div>

                {canArrange && (
                  <div className="grid grid-cols-2 border-t border-white/10">
                    <button type="button" disabled={disabled || index === 0} onClick={() => shiftCard(id, -1)} className="border-r border-white/10 px-3 py-2 text-sm font-black text-slate-200 disabled:opacity-25" aria-label={`${player.name}のカード${card.cardNumber}を左へ`}>← 左へ</button>
                    <button type="button" disabled={disabled || index === draftOrder.length - 1} onClick={() => shiftCard(id, 1)} className="px-3 py-2 text-sm font-black text-slate-200 disabled:opacity-25" aria-label={`${player.name}のカード${card.cardNumber}を右へ`}>右へ →</button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
