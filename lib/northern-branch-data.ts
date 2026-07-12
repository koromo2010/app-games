import type {
  NorthernBuildingDefinition,
  NorthernBuildingId,
  NorthernCardDefinition,
  NorthernCardId,
  NorthernOffer,
} from "@/lib/northern-branch-types";

export const northernCards: Record<NorthernCardId, NorthernCardDefinition> = {
  "fund-3": { id: "fund-3", name: "開業資金 3", kind: "fund", value: 3, color: "bg-amber-100 text-amber-950" },
  "fund-4": { id: "fund-4", name: "開業資金 4", kind: "fund", value: 4, color: "bg-amber-100 text-amber-950" },
  "fund-5": { id: "fund-5", name: "開業資金 5", kind: "fund", value: 5, color: "bg-amber-100 text-amber-950" },
  "fund-6": { id: "fund-6", name: "開業資金 6", kind: "fund", value: 6, color: "bg-amber-100 text-amber-950" },
  ore: { id: "ore", name: "鉱石", kind: "resource", value: 1, color: "bg-slate-200 text-slate-950" },
  barley: { id: "barley", name: "大麦", kind: "resource", value: 1, color: "bg-yellow-100 text-yellow-950" },
  wood: { id: "wood", name: "木材", kind: "resource", value: 1, color: "bg-orange-100 text-orange-950" },
  wool: { id: "wool", name: "羊毛", kind: "resource", value: 1, color: "bg-stone-100 text-stone-950" },
  herb: { id: "herb", name: "薬草", kind: "resource", value: 1, color: "bg-emerald-100 text-emerald-950" },
  pig: { id: "pig", name: "豚", kind: "livestock", value: 2, color: "bg-pink-100 text-pink-950" },
  chicken: { id: "chicken", name: "鶏", kind: "livestock", value: 2, color: "bg-red-100 text-red-950" },
  ingot: { id: "ingot", name: "インゴット", kind: "product", value: 3, recipe: { ore: 2 }, color: "bg-zinc-300 text-zinc-950" },
  ale: { id: "ale", name: "エール", kind: "product", value: 3, recipe: { barley: 2 }, color: "bg-amber-200 text-amber-950" },
  timber: { id: "timber", name: "製材", kind: "product", value: 3, recipe: { wood: 2 }, color: "bg-orange-200 text-orange-950" },
  cloth: { id: "cloth", name: "織物", kind: "product", value: 3, recipe: { wool: 2 }, color: "bg-violet-100 text-violet-950" },
  remedy: { id: "remedy", name: "薬品", kind: "product", value: 3, recipe: { herb: 2 }, color: "bg-teal-100 text-teal-950" },
  fuel: { id: "fuel", name: "燃料", kind: "product", value: 4, recipe: { dung: 1, wood: 1 }, color: "bg-rose-200 text-rose-950" },
  fertilizer: { id: "fertilizer", name: "肥料", kind: "product", value: 4, recipe: { dung: 1, barley: 1 }, color: "bg-lime-200 text-lime-950" },
  dung: { id: "dung", name: "ダング", kind: "dung", value: -1, color: "bg-lime-950 text-lime-50" },
};

export const northernBuildings: Record<NorthernBuildingId, NorthernBuildingDefinition> = {
  mine: { id: "mine", name: "鉱山商会", cost: 4, points: 1, description: "鉱石を1枚得る。", actionLabel: "鉱石を得る" },
  "malt-house": { id: "malt-house", name: "麦芽工房", cost: 4, points: 1, description: "大麦を1枚得る。", actionLabel: "大麦を得る" },
  sawmill: { id: "sawmill", name: "製材所", cost: 4, points: 1, description: "木材を1枚得る。", actionLabel: "木材を得る" },
  stable: { id: "stable", name: "家畜市場", cost: 5, points: 1, description: "豚を1枚得る。終了時にダングが発生する。", actionLabel: "豚を得る" },
  recycler: { id: "recycler", name: "再生工房", cost: 6, points: 2, description: "ダング1枚と木材1枚を燃料へ変える。", actionLabel: "燃料を作る" },
  "trading-post": { id: "trading-post", name: "交易所", cost: 7, points: 2, description: "商品1枚を手放して1勝利点を得る。", actionLabel: "商品を売る" },
  workshop: { id: "workshop", name: "北都工房", cost: 8, points: 2, description: "鉱石1枚と木材1枚をインゴットへ変える。", actionLabel: "加工する" },
  "guild-hall": { id: "guild-hall", name: "商人ギルド", cost: 10, points: 3, description: "商品2枚を手放して2勝利点を得る。", actionLabel: "大商いする" },
};

const productCopies: NorthernCardId[] = [
  "ingot", "ale", "timber", "cloth", "remedy", "fuel", "fertilizer",
  "ingot", "ale", "timber", "cloth", "remedy", "fuel", "fertilizer",
];

export const northernBaseResources: NorthernCardId[] = ["ore", "barley", "wood", "wool", "herb", "pig", "chicken"];

export function createNorthernOfferDeck(): NorthernOffer[] {
  const products: NorthernOffer[] = productCopies.map((cardId, index) => ({
    id: `product-${cardId}-${index}`,
    kind: "product",
    cardId,
  }));
  const buildings: NorthernOffer[] = Object.keys(northernBuildings).map((buildingId) => ({
    id: `building-${buildingId}`,
    kind: "building",
    buildingId: buildingId as NorthernBuildingId,
  }));
  return shuffle([...products, ...buildings]);
}

export function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function northernCardLabel(id: NorthernCardId) {
  return northernCards[id].name;
}
