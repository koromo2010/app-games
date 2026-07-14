export const hodoaiCompactCardThreshold = 9;

export function usesCompactHodoaiCards(cardCount: number) {
  return cardCount >= hodoaiCompactCardThreshold;
}

export function canStartHodoaiPointerDrag(pointerType: string, button: number) {
  return pointerType !== "mouse" || button === 0;
}

export function hodoaiVerticalDisplayOrder(order: string[]) {
  return [...order].reverse();
}

export function moveHodoaiCard(order: string[], cardId: string, targetId: string) {
  const fromIndex = order.indexOf(cardId);
  const targetIndex = order.indexOf(targetId);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return order;
  const next = [...order];
  next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, cardId);
  return next;
}

export function shiftHodoaiCard(order: string[], cardId: string, direction: -1 | 1) {
  const fromIndex = order.indexOf(cardId);
  const targetIndex = fromIndex + direction;
  if (fromIndex < 0 || targetIndex < 0 || targetIndex >= order.length) return order;
  const next = [...order];
  [next[fromIndex], next[targetIndex]] = [next[targetIndex], next[fromIndex]];
  return next;
}

export function shiftHodoaiCardOnVerticalScale(order: string[], cardId: string, visualDirection: -1 | 1) {
  return shiftHodoaiCard(order, cardId, visualDirection === -1 ? 1 : -1);
}

export function sameHodoaiOrder(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
