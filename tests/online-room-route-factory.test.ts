import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedRoomDraft, authenticatedRoomPlayer } from "../lib/online-room-input.ts";

test("共通Room Route入力はactor・参加者・言語を認証セッションから上書きする", () => {
  const session = {
    id: "authenticated-player",
    name: "  Alice  ",
    avatarColor: "#22d3ee",
    avatarImage: null,
    shareNameAllowed: true,
    locale: "ja" as const,
    updatedAt: 1,
  };
  const player = authenticatedRoomPlayer(session);
  assert.equal(player.id, "authenticated-player");
  assert.equal(player.name, "Alice");
  assert.equal(player.shareNameAllowed, true);
  assert.equal(typeof player.joinedAt, "number");

  const draft = authenticatedRoomDraft({
    hostId: "spoofed-host",
    contentLocale: "en",
    players: [{ id: "spoofed-player" }],
    passphrase: "  secret  ",
  }, session) as {
    hostId: string;
    contentLocale: string;
    players: Array<{ id: string }>;
    passphrase: string;
  };
  assert.equal(draft.hostId, "authenticated-player");
  assert.equal(draft.contentLocale, "ja");
  assert.deepEqual(draft.players.map((item) => item.id), ["authenticated-player"]);
  assert.equal(draft.passphrase, "secret");
});
