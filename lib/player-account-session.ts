import type { PlayerSession } from "./player-session.ts";
import {
  playerAccountHasUnverifiedEmail,
  playerAccountHasVerifiedEmail,
} from "./player-email-verification-policy.ts";

export type PlayerAccountSessionSource = {
  playerId: string;
  name: string;
  email: string | null;
  emailVerifiedAt: number | null;
  avatarColor: string;
  avatarImage: string | null;
  shareNameAllowed: boolean;
  locale: NonNullable<PlayerSession["locale"]>;
  createdAt: number;
  updatedAt: number;
};

export type PlayerAccountSessionDependencies = {
  loadSession: (playerId: string) => Promise<PlayerSession | null>;
  saveSession: (
    session: Omit<PlayerSession, "updatedAt"> & { updatedAt?: number },
  ) => Promise<PlayerSession>;
  postgresConfigured: () => boolean;
  updatePostgresProfile: (
    playerId: string,
    profile: {
      name: string;
      avatarColor: string;
      avatarImage: string | null;
      shareNameAllowed: boolean;
      locale: NonNullable<PlayerSession["locale"]>;
      updatedAt: number;
    },
  ) => Promise<unknown>;
};

export async function ensurePlayerAccountSession(
  account: PlayerAccountSessionSource,
  dependencies: PlayerAccountSessionDependencies,
): Promise<PlayerSession> {
  const savedSession = await dependencies.loadSession(account.playerId).catch(() => null);
  if (savedSession) {
    if (dependencies.postgresConfigured()) {
      await dependencies.updatePostgresProfile(account.playerId, {
        name: savedSession.name,
        avatarColor: savedSession.avatarColor,
        avatarImage: savedSession.avatarImage,
        shareNameAllowed: savedSession.shareNameAllowed === true,
        locale: account.locale,
        updatedAt: savedSession.updatedAt,
      }).catch(() => undefined);
    }
    return dependencies.saveSession({
      ...savedSession,
      hasRecoveryEmail: playerAccountHasVerifiedEmail(account),
      hasUnverifiedRecoveryEmail: playerAccountHasUnverifiedEmail(account),
      locale: account.locale,
    });
  }

  // Postgres is the account source of truth, while authenticated route
  // handlers resolve the current profile from Redis. A successful login must
  // therefore recreate the Redis session when only the Postgres account
  // exists, without mirroring password hashes or other account secrets.
  return dependencies.saveSession({
    id: account.playerId,
    name: account.name,
    avatarColor: account.avatarColor,
    avatarImage: account.avatarImage,
    shareNameAllowed: account.shareNameAllowed,
    locale: account.locale,
    hasRecoveryEmail: playerAccountHasVerifiedEmail(account),
    hasUnverifiedRecoveryEmail: playerAccountHasUnverifiedEmail(account),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  });
}
