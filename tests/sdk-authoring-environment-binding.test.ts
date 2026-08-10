import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthoringEnvironmentBinding,
  verifyAuthoringEnvironmentBinding,
} from "../apps/sdk-portal/lib/authoring-environment-binding.ts";

const auth = {
  playerId: "player-test-1",
  clientId: "gf_oauth-client-1",
};

test("authoring binding is scoped to OAuth identity, client and semantic environment", () => {
  const previousSecret = process.env.SDK_ACCOUNT_LINK_SECRET;
  const previousChannel = process.env.SDK_PORTAL_CHANNEL;
  process.env.SDK_ACCOUNT_LINK_SECRET = "test-only-authoring-binding-secret-32-bytes";
  process.env.SDK_PORTAL_CHANNEL = "development";
  try {
    const issued = createAuthoringEnvironmentBinding({
      auth,
      clientName: "Claude Code",
      origin: "https://sdk-dev.game-fields.com",
      now: 1_800_000_000_000,
    });
    const verified = verifyAuthoringEnvironmentBinding({
      environmentBinding: issued.environmentBinding,
      auth,
      origin: "https://sdk-dev.game-fields.com",
      now: 1_800_000_001_000,
    });
    assert.equal(verified.payload.clientName, "Claude Code");
    assert.equal(verified.identity.targetEnvironment, "development");

    assert.throws(() => verifyAuthoringEnvironmentBinding({
      environmentBinding: issued.environmentBinding,
      auth: { ...auth, clientId: "gf_other-client" },
      origin: "https://sdk-dev.game-fields.com",
      now: 1_800_000_001_000,
    }), /AUTHORING_ENVIRONMENT_BINDING_MISMATCH/);

    process.env.SDK_PORTAL_CHANNEL = "production";
    assert.throws(() => verifyAuthoringEnvironmentBinding({
      environmentBinding: issued.environmentBinding,
      auth,
      origin: "https://sdk.game-fields.com",
      now: 1_800_000_001_000,
    }), /AUTHORING_ENVIRONMENT_BINDING_MISMATCH/);
  } finally {
    if (previousSecret === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previousSecret;
    if (previousChannel === undefined) delete process.env.SDK_PORTAL_CHANNEL;
    else process.env.SDK_PORTAL_CHANNEL = previousChannel;
  }
});

test("authoring binding fails closed when missing, tampered or expired", () => {
  const previousSecret = process.env.SDK_ACCOUNT_LINK_SECRET;
  const previousChannel = process.env.SDK_PORTAL_CHANNEL;
  process.env.SDK_ACCOUNT_LINK_SECRET = "test-only-authoring-binding-secret-32-bytes";
  process.env.SDK_PORTAL_CHANNEL = "development";
  try {
    assert.throws(() => verifyAuthoringEnvironmentBinding({
      environmentBinding: undefined,
      auth,
      origin: "https://sdk-dev.game-fields.com",
    }), /SDK_HANDSHAKE_REQUIRED/);
    const issued = createAuthoringEnvironmentBinding({
      auth,
      clientName: "ChatGPT Work",
      origin: "https://sdk-dev.game-fields.com",
      now: 1_800_000_000_000,
    });
    assert.throws(() => verifyAuthoringEnvironmentBinding({
      environmentBinding: `${issued.environmentBinding}x`,
      auth,
      origin: "https://sdk-dev.game-fields.com",
      now: 1_800_000_001_000,
    }), /AUTHORING_ENVIRONMENT_BINDING_MISMATCH/);
    assert.throws(() => verifyAuthoringEnvironmentBinding({
      environmentBinding: issued.environmentBinding,
      auth,
      origin: "https://sdk-dev.game-fields.com",
      now: 1_800_086_400_001,
    }), /AUTHORING_ENVIRONMENT_BINDING_MISMATCH/);
  } finally {
    if (previousSecret === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previousSecret;
    if (previousChannel === undefined) delete process.env.SDK_PORTAL_CHANNEL;
    else process.env.SDK_PORTAL_CHANNEL = previousChannel;
  }
});
