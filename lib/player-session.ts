export type PlayerSession = {
  name: string;
  avatarColor: string;
  avatarImage: string | null;
  updatedAt: number;
};

const playerSessionKey = "app-games-player-session";
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

export function isAvatarColor(value: string | null): value is string {
  return Boolean(value?.match(/^#[0-9a-fA-F]{6}$/));
}

export function isAvatarImage(value: string | null): value is string {
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
      name,
      avatarColor,
      avatarImage,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function savePlayerSession(session: Omit<PlayerSession, "updatedAt">) {
  if (typeof window === "undefined") return;

  const nextSession: PlayerSession = {
    name: session.name.trim(),
    avatarColor: isAvatarColor(session.avatarColor) ? session.avatarColor : fallbackAvatarColor,
    avatarImage: isAvatarImage(session.avatarImage) ? session.avatarImage : null,
    updatedAt: Date.now(),
  };

  if (!nextSession.name) return;

  localStorage.setItem(playerSessionKey, JSON.stringify(nextSession));
  localStorage.setItem(legacyAvatarColorKey, nextSession.avatarColor);
  if (nextSession.avatarImage) {
    localStorage.setItem(legacyAvatarImageKey, nextSession.avatarImage);
  } else {
    localStorage.removeItem(legacyAvatarImageKey);
  }
}

export function clearPlayerSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(playerSessionKey);
  localStorage.removeItem(legacyAvatarColorKey);
  localStorage.removeItem(legacyAvatarImageKey);
}
