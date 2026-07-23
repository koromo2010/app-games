import {
  createGameSdkOnlineRoomModule,
} from "@game-fields/game-sdk/runtime";
import { myFirstGameAppSet } from "./app-set.js";

/**
 * SDK basic set + this game's AppSet.
 *
 * Do not reimplement room creation, membership, settings, revision, common
 * permissions or viewer-safe common presentation in this file.
 */
export const myFirstGameServerModule = createGameSdkOnlineRoomModule(
  myFirstGameAppSet,
);
