import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  gameSdkPackageRevisionHref,
  gameSdkPackageRevisionIssue,
} from "../lib/game-sdk-package-revision.ts";

const oldRevision = "42292ad52a3bafcd751d6ba1767534d794c0c602";
const requestedRevision = "02efe902e4ed49ea525abb862da74c123651efcb";

test("同一packageRevisionのactive Roomは通常復帰できる", () => {
  assert.equal(gameSdkPackageRevisionIssue(requestedRevision, {
    code: "SAME",
    packageRevision: requestedRevision,
  }), null);
});

test("URL指定revisionとactive Room固定revisionの不一致を検出する", () => {
  assert.deepEqual(gameSdkPackageRevisionIssue(requestedRevision, {
    code: "30QT",
    packageRevision: oldRevision,
  }), {
    kind: "mismatch",
    requestedRevision,
    roomCode: "30QT",
    roomRevision: oldRevision,
  });
});

test("Room固定revisionが不明ならfail closedにする", () => {
  assert.deepEqual(gameSdkPackageRevisionIssue(requestedRevision, {
    code: "30QT",
  }), {
    kind: "unknown",
    requestedRevision,
    roomCode: "30QT",
    roomRevision: null,
  });
  assert.deepEqual(gameSdkPackageRevisionIssue("latest", {
    code: "30QT",
    packageRevision: oldRevision,
  }), {
    kind: "unknown",
    requestedRevision: "latest",
    roomCode: "30QT",
    roomRevision: null,
  });
});

test("旧Room選択は同じ正式Room URLをRoom固定revisionへ切り替える", () => {
  assert.equal(
    gameSdkPackageRevisionHref(
      `https://dev.game-fields.com/sdk-preview/test10-1/games/link-lines?revision=${requestedRevision}&debug=1`,
      oldRevision,
    ),
    `https://dev.game-fields.com/sdk-preview/test10-1/games/link-lines?revision=${oldRevision}&debug=1`,
  );
  assert.throws(
    () => gameSdkPackageRevisionHref(
      "https://dev.game-fields.com/sdk-preview/test10-1/games/link-lines",
      "latest",
    ),
    /GAME_SDK_PACKAGE_REVISION_INVALID/,
  );
});

test("正式Room shellはrevision確認前にRoomやclientを接続しない", () => {
  const controller = readFileSync(
    "app/components/game-sdk/use-game-sdk-frame-controller.ts",
    "utf8",
  );
  const lifecycle = readFileSync(
    "app/components/game-sdk/use-game-sdk-room-lifecycle.ts",
    "utf8",
  );
  const view = readFileSync(
    "app/components/game-sdk/GameSdkFrameView.tsx",
    "utf8",
  );
  const iframeBridge = readFileSync(
    "app/components/game-sdk/GameSdkIframeBridge.tsx",
    "utf8",
  );
  const previewPage = readFileSync(
    "app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx",
    "utf8",
  );

  assert.match(
    controller,
    /gameSdkPackageRevisionIssue\(packageRevision, next\)/,
  );
  assert.match(
    lifecycle,
    /if \(next && !acceptPackageRevision\(next\)\) return false;/,
  );
  assert.match(
    view,
    /if \(!room && packageRevisionIssue && !previewOnly\)[\s\S]*?<GameSdkPackageRevisionPanel[\s\S]*?if \(!room\)/,
  );
  assert.match(
    controller,
    /window\.location\.assign\(gameSdkPackageRevisionHref\([\s\S]*?packageRevisionIssue\.roomRevision/,
  );
  assert.match(
    controller,
    /replaceActiveRoom:\s*\{[\s\S]*?code: packageRevisionIssue\.roomCode,[\s\S]*?packageRevision: packageRevisionIssue\.roomRevision/,
  );
  assert.match(iframeBridge, /GAME_SDK_PACKAGE_CLIENT_LOAD_FAILED/);
  assert.match(iframeBridge, /旧Mockや別revisionへのフォールバックは行っていません/);
  assert.match(previewPage, /CandidatePreviewUnavailable/);
  assert.match(previewPage, /旧モックには切り替えていません/);
});
