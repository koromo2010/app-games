import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  negotiateGameSdkHandshake,
  type GameSdkHandshakeDescriptor,
  type GameSdkHandshakeRequest,
} from "@game-fields/game-sdk/handshake";

const descriptor: GameSdkHandshakeDescriptor = {
  protocol: GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  handshakeVersion: GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  surface: "creator-portal",
  environment: "development",
  release: {
    platformVersion: "0.1.0",
    sdkPackageVersion: "0.1.0",
    sdkContractVersion: 1,
    supportedSdkContractVersions: [1],
    roomSchemaVersion: 1,
  },
  capabilities: [
    "oauth2-pkce",
    "creator-environments",
    "starter-download",
    "mock-publish",
  ],
  endpoints: {
    portal: "https://sdk-dev.game-fields.com",
    handshake: "https://sdk-dev.game-fields.com/.well-known/game-fields-sdk",
    mcp: "https://sdk-dev.game-fields.com/api/mcp",
  },
};

const request: GameSdkHandshakeRequest = {
  protocol: GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  handshakeVersion: GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  client: { kind: "ai-agent", name: "Contract test" },
  expected: {
    environment: "development",
    platformVersion: "0.1.0",
    sdkPackageVersion: "0.1.0",
    sdkContractVersion: 1,
  },
  requiredCapabilities: [
    "oauth2-pkce",
    "creator-environments",
    "starter-download",
    "mock-publish",
  ],
};

test("SDK handshake accepts the matching dev release and required capabilities", () => {
  const result = negotiateGameSdkHandshake(request, descriptor);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.problems, []);
  assert.equal(result.environment, "development");
  assert.equal(result.endpoints.portal, "https://sdk-dev.game-fields.com");
});

test("SDK handshake rejects a wrong SDK environment before creator actions", () => {
  const result = negotiateGameSdkHandshake({
    ...request,
    expected: { ...request.expected, environment: "production" },
  }, descriptor);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.problems.map(({ code }) => code), ["ENVIRONMENT_MISMATCH"]);
});

test("SDK handshake rejects release, contract and capability mismatches together", () => {
  const result = negotiateGameSdkHandshake({
    ...request,
    handshakeVersion: 2,
    expected: {
      ...request.expected,
      platformVersion: "0.2.0",
      sdkPackageVersion: "0.2.0",
      sdkContractVersion: 2,
    },
    requiredCapabilities: ["mock-publish", "submission-upload"],
  }, descriptor);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.problems.map(({ code }) => code), [
    "HANDSHAKE_VERSION_UNSUPPORTED",
    "PLATFORM_VERSION_MISMATCH",
    "SDK_PACKAGE_VERSION_MISMATCH",
    "SDK_CONTRACT_UNSUPPORTED",
    "CAPABILITY_UNAVAILABLE",
  ]);
});

test("SDK handshake rejects malformed or foreign protocol requests without throwing", () => {
  assert.deepEqual(
    negotiateGameSdkHandshake(null, descriptor).problems.map(({ code }) => code),
    ["INVALID_REQUEST"],
  );
  assert.deepEqual(
    negotiateGameSdkHandshake({
      ...request,
      protocol: "other-sdk",
    }, descriptor).problems.map(({ code }) => code),
    ["PROTOCOL_MISMATCH"],
  );
});

