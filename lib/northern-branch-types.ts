export type NorthernCardKind = "fund" | "resource" | "livestock" | "product" | "dung";

export type NorthernCardId =
  | "fund-3"
  | "fund-4"
  | "fund-5"
  | "fund-6"
  | "ore"
  | "barley"
  | "wood"
  | "wool"
  | "herb"
  | "pig"
  | "chicken"
  | "ingot"
  | "ale"
  | "timber"
  | "cloth"
  | "remedy"
  | "fuel"
  | "fertilizer"
  | "dung";

export type NorthernCardDefinition = {
  id: NorthernCardId;
  name: string;
  kind: NorthernCardKind;
  value: number;
  recipe?: Partial<Record<NorthernCardId, number>>;
  color: string;
};

export type NorthernBuildingId =
  | "mine"
  | "malt-house"
  | "sawmill"
  | "stable"
  | "recycler"
  | "trading-post"
  | "workshop"
  | "guild-hall";

export type NorthernBuildingDefinition = {
  id: NorthernBuildingId;
  name: string;
  cost: number;
  points: number;
  description: string;
  actionLabel: string;
};

export type NorthernOffer =
  | { id: string; kind: "product"; cardId: NorthernCardId }
  | { id: string; kind: "building"; buildingId: NorthernBuildingId };

export type NorthernPlayer = {
  id: string;
  name: string;
  hand: NorthernCardId[];
  buildings: NorthernBuildingId[];
  usedBuildings: NorthernBuildingId[];
  points: number;
};

export type NorthernGameState = {
  status: "setup" | "playing" | "finished";
  players: NorthernPlayer[];
  activePlayerIndex: number;
  turn: number;
  mainActionUsed: boolean;
  offerDeck: NorthernOffer[];
  offers: NorthernOffer[];
  discard: NorthernOffer[];
  winnerId: string | null;
  log: string[];
};

export type NorthernGameAction =
  | { type: "take-resource"; cardId: NorthernCardId }
  | { type: "produce"; offerId: string }
  | { type: "buy"; offerId: string; paymentIndexes: number[] }
  | { type: "use-building"; buildingId: NorthernBuildingId }
  | { type: "end-turn" };

export type NorthernActionResult =
  | { ok: true; state: NorthernGameState; notice: string }
  | { ok: false; state: NorthernGameState; notice: string };
