export type GameResultOrder = "ascending" | "descending";

export type OrderedGameResult<Row> = {
  order: GameResultOrder;
  rows: Row[];
};

/** Projects one canonical stored order for result UI, external sharing, and replay storage. */
export function projectOrderedGameResult<Row>(input: {
  storedOrder: string[];
  displayOrder: GameResultOrder;
  rowForId: (id: string, index: number) => Row | null;
}): OrderedGameResult<Row> {
  const ids = input.displayOrder === "descending" ? [...input.storedOrder].reverse() : [...input.storedOrder];
  return {
    order: input.displayOrder,
    rows: ids.flatMap((id, index) => {
      const row = input.rowForId(id, index);
      return row === null ? [] : [row];
    }),
  };
}
