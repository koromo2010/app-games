export type PlayerSession = {
  id?: string;
  name: string;
  avatarColor: string;
  avatarImage: string | null;
  hasRecoveryEmail?: boolean;
  createdAt?: number;
  updatedAt: number;
};

const playerSessionKey = "app-games-player-session";
const playerSessionIdKey = "app-games-player-id";
const playerAuthenticatedKey = "app-games-player-authenticated";
const legacyAvatarColorKey = "wordwolf-avatar-color";
const legacyAvatarImageKey = "wordwolf-avatar-image";

export const defaultAvatarImages = [
  "/wordwolf-avatars/avatar-01.svg",
  "/wordwolf-avatars/avatar-02.svg",
  "/wordwolf-avatars/avatar-03.svg",
  "/wordwolf-avatars/avatar-04.svg",
  "/wordwolf-avatars/avatar-05.svg",
  "/wordwolf-avatars/avatar-06.svg",
  "/wordwolf-avatars/avatar-07.svg",
  "/wordwolf-avatars/avatar-08.svg",
  "/wordwolf-avatars/avatar-09.svg",
  "/wordwolf-avatars/avatar-10.svg",
];

export const defaultAvatarImage = defaultAvatarImages[0];
export const fallbackAvatarColor = "#22d3ee";
export const avatarColorOptions = [
  "#22d3ee",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#fb7185",
  "#f59e0b",
  "#84cc16",
  "#14b8a6",
];

export function makeRandomAvatarColor() {
  return `#${Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0")}`;
}

export function pickRandomDefaultAvatarImage() {
  return defaultAvatarImages[Math.floor(Math.random() * defaultAvatarImages.length)] ?? defaultAvatarImage;
}

export function makeRandomPlayerName() {
  return `プレイヤー${Math.floor(Math.random() * 9000) + 1000}`;
}

export function normalizePlayerName(name: string) {
  const trimmedName = name.trim().slice(0, 40);
  return trimmedName && trimmedName !== "名無し" ? trimmedName : makeRandomPlayerName();
}

export function isAvatarColor(value: string | null): value is string {
  return Boolean(value?.match(/^#[0-9a-fA-F]{6}$/));
}

export function isAvatarImage(value: string | null): value is string {
  if (!value || value.length > 200_000) return false;
  return Boolean(
    value?.startsWith("data:image/") ||
      value === "/wordwolf-default-avatar.png" ||
      defaultAvatarImages.includes(value ?? ""),
  );
}

export function readPlayerSession(): PlayerSession | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(playerSessionKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PlayerSession>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const parsedAvatarColor = typeof parsed.avatarColor === "string" ? parsed.avatarColor : null;
    const parsedAvatarImage = typeof parsed.avatarImage === "string" ? parsed.avatarImage : null;
    const avatarColor = isAvatarColor(parsedAvatarColor) ? parsedAvatarColor : fallbackAvatarColor;
    const avatarImage = isAvatarImage(parsedAvatarImage) ? parsedAvatarImage : null;

    if (!name) return null;

    return {
      id: typeof parsed.id === "string" ? parsed.id : localStorage.getItem(playerSessionIdKey) || undefined,
      name,
      avatarColor,
      avatarImage,
      hasRecoveryEmail: parsed.hasRecoveryEmail === true,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : undefined,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function savePlayerSession(session: Omit<PlayerSession, "updatedAt">) {
  if (typeof window === "undefined") return;

  const nextSession: PlayerSession = {
    id: session.id || localStorage.getItem(playerSessionIdKey) || undefined,
    name: session.name.trim(),
    avatarColor: isAvatarColor(session.avatarColor) ? session.avatarColor : fallbackAvatarColor,
    avatarImage: isAvatarImage(session.avatarImage) ? session.avatarImage : null,
    hasRecoveryEmail: session.hasRecoveryEmail === true,
    createdAt: session.createdAt,
    updatedAt: Date.now(),
  };

  if (!nextSession.name) return;

  localStorage.setItem(playerSessionKey, JSON.stringify(nextSession));
  if (nextSession.id) {
    localStorage.setItem(playerSessionIdKey, nextSession.id);
  }
  localStorage.setItem(legacyAvatarColorKey, nextSession.avatarColor);
  if (nextSession.avatarImage) {
    localStorage.setItem(legacyAvatarImageKey, nextSession.avatarImage);
  } else {
    localStorage.removeItem(legacyAvatarImageKey);
  }
}

export function markPlayerAuthenticated() {
  if (typeof window === "undefined") return;
  localStorage.setItem(playerAuthenticatedKey, "1");
}

export function isPlayerAuthenticated() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(playerAuthenticatedKey) === "1" && Boolean(readPlayerSession());
}

export function clearPlayerSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(playerSessionKey);
  localStorage.removeItem(playerSessionIdKey);
  localStorage.removeItem(playerAuthenticatedKey);
  localStorage.removeItem(legacyAvatarColorKey);
  localStorage.removeItem(legacyAvatarImageKey);
}

export async function loadPersistentPlayerSession() {
  if (typeof window === "undefined") return null;

  const response = await fetch("/api/player-session", {
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401) clearPlayerSession();
    return null;
  }

  const data = (await response.json()) as { session?: PlayerSession };
  if (!data.session) return readPlayerSession();

  savePlayerSession(data.session);
  markPlayerAuthenticated();
  return data.session;
}

export async function savePersistentPlayerSession(session: Omit<PlayerSession, "updatedAt">) {
  const localSession: PlayerSession = {
    ...session,
    id: session.id || (typeof window !== "undefined" ? localStorage.getItem(playerSessionIdKey) || undefined : undefined),
    updatedAt: Date.now(),
  };
  savePlayerSession(localSession);

  const response = await fetch("/api/player-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(localSession),
  });

  if (!response.ok) {
    return {
      session: readPlayerSession() ?? localSession,
      persistent: false,
      status: response.status,
    };
  }

  const data = (await response.json()) as { session?: PlayerSession };
  if (!data.session) {
    return {
      session: readPlayerSession() ?? localSession,
      persistent: false,
      status: response.status,
    };
  }

  savePlayerSession(data.session);
  return {
    session: data.session,
    persistent: true,
    status: response.status,
  };
}
