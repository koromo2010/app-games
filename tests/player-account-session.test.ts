import assert from "node:assert/strict";
import test from "node:test";
import {
  ensurePlayerAccountSession,
  type PlayerAccountSessionSource,
} from "../lib/player-account-session.ts";
import type { PlayerSession } from "../lib/player-session.ts";

const account: PlayerAccountSessionSource & {
  passwordHash: string;
  passwordSalt: string;
} = {
  playerId: "postgres-player",
  name: "Postgres Player",
  passwordHash: "must-not-enter-session",
  passwordSalt: "must-not-enter-session",
  email: "player@example.com",
  avatarColor: "#22d3ee",
  avatarImage: null,
  shareNameAllowed: true,
  locale: "ja",
  createdAt: 100,
  updatedAt: 200,
};

test("Postgresだけに存在する既存アカウントのログインでRedisセッションを再作成する", async () => {
  let storedInput: Omit<PlayerSession, "updatedAt"> & { updatedAt?: number } | null = null;
  const session = await ensurePlayerAccountSession(account, {
    loadSession: async () => null,
    saveSession: async (input) => {
      storedInput = input;
      return { ...input, updatedAt: input.updatedAt ?? 300 };
    },
    postgresConfigured: () => true,
    updatePostgresProfile: async () => {
      throw new Error("Missing Redis sessions must not overwrite the Postgres profile.");
    },
  });

  assert.equal(session.id, account.playerId);
  assert.equal(session.name, account.name);
  assert.equal(session.hasRecoveryEmail, true);
  assert.equal(session.locale, account.locale);
  assert.equal(storedInput?.id, account.playerId);
  assert.equal("passwordHash" in (storedInput ?? {}), false);
  assert.equal("passwordSalt" in (storedInput ?? {}), false);
  assert.equal("email" in (storedInput ?? {}), false);
});
