export type TahoiyaPhase = "lobby" | "writing" | "voting" | "result";

export type TahoiyaPlayer = {
  id: string;
  name: string;
  joinedAt: number;
  avatarColor?: string;
  avatarImage?: string;
};

export type TahoiyaTopic = {
  word: string;
  reading?: string;
  realDefinition: string;
  note: string;
  source: "llm" | "fallback";
};

export type TahoiyaDefinitionOption = {
  id: string;
  text: string;
  authorId: string | null;
  isReal: boolean;
};

export type TahoiyaRoom = {
  code: string;
  hostId: string;
  ownerId?: string;
  passphrase: string;
  phase: TahoiyaPhase;
  debugMode?: boolean;
  players: TahoiyaPlayer[];
  parentId: string;
  round: number;
  word: string;
  reading?: string;
  realDefinition: string;
  topicNote: string;
  topicSource: TahoiyaTopic["source"] | "pending";
  fakeDefinitions: Record<string, string>;
  options: TahoiyaDefinitionOption[];
  votes: Record<string, string>;
  scores: Record<string, number>;
  resultText: string;
  createdAt: number;
  updatedAt: number;
};

export type TahoiyaRoomChoice = {
  code: string;
  hostName: string;
  playerCount: number;
  phase: TahoiyaPhase;
  hasPassphrase: boolean;
  updatedAt: number;
};
