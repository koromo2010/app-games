import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  approvedGameSdkIds,
  approvedGameSdkRegistration,
} from "../lib/game-sdk-server-registry.ts";
import { gameSdkShellNavigationPlacement } from "../lib/game-sdk-shell-navigation.ts";

const development = {
  VERCEL_GIT_COMMIT_REF: "develop",
} as NodeJS.ProcessEnv;

test("SDK Shell navigation keeps lounge return direct and Room return in the menu", () => {
  assert.deepEqual(gameSdkShellNavigationPlacement("lounge"), {
    showDirectBack: true,
    showMenuBack: false,
  });
  for (const surface of ["lobby", "playing", "result"] as const) {
    assert.deepEqual(gameSdkShellNavigationPlacement(surface), {
      showDirectBack: false,
      showMenuBack: true,
    });
  }
});

test("every registered legacy approved SDK game uses the shared lounge header contract", () => {
  const legacyGameIds = approvedGameSdkIds(development).filter((gameId) => (
    approvedGameSdkRegistration(gameId, development)?.clientKind === "wordwolf"
  ));
  assert.deepEqual(legacyGameIds, ["wordwolf-sdk"]);

  const page = readFileSync("app/sdk-games/[gameId]/page.tsx", "utf8");
  const shell = readFileSync(
    "app/sdk-games/[gameId]/ApprovedSdkGameShell.tsx",
    "utf8",
  );
  const header = readFileSync("app/components/GameSdkShellHeader.tsx", "utf8");

  assert.match(
    page,
    /registration\.clientKind !== "wordwolf"[\s\S]*?<ApprovedSdkGameShell/,
  );
  assert.match(
    shell,
    /if \(!room\)[\s\S]*?<GameSdkShellHeader[\s\S]*?rules=\{rules\}[\s\S]*?backHref="\/games"[\s\S]*?backLabel="広場へ戻る"[\s\S]*?surface="lounge"/,
  );
  assert.match(
    shell,
    /<GameSdkShellHeader[\s\S]*?surface=\{[\s\S]*?room\.phase === "lobby"[\s\S]*?common\?\.isHost[\s\S]*?観戦・共有[\s\S]*?<\/GameSdkShellHeader>/,
  );
  assert.doesNotMatch(shell, /<GameTopBanner/);
  assert.doesNotMatch(shell, /<Link href="\/games"/);

  assert.match(header, /GameRulesDialog/);
  assert.match(header, /GamePlayerMenu/);
  assert.match(
    header,
    /navigation\.showDirectBack[\s\S]*?data-sdk-lounge-back/,
  );
  assert.match(
    header,
    /navigation\.showMenuBack[\s\S]*?<GameTopMenu>/,
  );
});
