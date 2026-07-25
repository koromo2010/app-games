import assert from "node:assert/strict";
import test from "node:test";
import {
  GitHubReleaseError,
  loadDevMainReleaseStatus,
  promoteDevelopToMain,
} from "../lib/github-release.ts";

const mainSha = "a".repeat(40);
const developSha = "b".repeat(40);

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function releaseFetch(calls: Array<{ url: string; init?: RequestInit }>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/compare/main...develop")) {
      return jsonResponse({
        status: "ahead",
        ahead_by: 3,
        behind_by: 0,
        total_commits: 3,
        html_url: "https://github.com/koromo2010/app-games/compare/main...develop",
      });
    }
    if (url.endsWith("/git/ref/heads/main")) {
      return jsonResponse({ object: { sha: mainSha } });
    }
    if (url.endsWith("/git/ref/heads/develop")) {
      return jsonResponse({ object: { sha: developSha } });
    }
    if (url.endsWith("/git/refs/heads/main") && init?.method === "PATCH") {
      return jsonResponse({ object: { sha: developSha } });
    }
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

test("dev release status only allows a fast-forward develop to main", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const status = await loadDevMainReleaseStatus(
    {},
    releaseFetch(calls),
  );
  assert.equal(status.mainSha, mainSha);
  assert.equal(status.developSha, developSha);
  assert.equal(status.canPromote, true);
  assert.equal(status.writeConfigured, false);
  assert.equal(calls.length, 3);
});

test("dev release updates main without force after rechecking both SHAs", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await promoteDevelopToMain(
    {
      expectedMainSha: mainSha,
      expectedDevelopSha: developSha,
    },
    { GAME_FIELDS_GITHUB_RELEASE_TOKEN: "test-token" },
    releaseFetch(calls),
  );
  const update = calls.find((call) => call.init?.method === "PATCH");
  assert.ok(update);
  assert.deepEqual(JSON.parse(String(update.init?.body)), {
    sha: developSha,
    force: false,
  });
  assert.equal(result.mainSha, developSha);
});

test("dev release refuses a stale reviewed SHA", async () => {
  await assert.rejects(
    () => promoteDevelopToMain(
      {
        expectedMainSha: "c".repeat(40),
        expectedDevelopSha: developSha,
      },
      { GAME_FIELDS_GITHUB_RELEASE_TOKEN: "test-token" },
      releaseFetch([]),
    ),
    (error) =>
      error instanceof GitHubReleaseError
      && error.code === "GITHUB_RELEASE_SOURCE_CHANGED"
      && error.status === 409,
  );
});
