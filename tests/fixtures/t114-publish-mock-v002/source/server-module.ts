import { createGameSdkOnlineRoomModule } from "@game-fields/game-sdk/runtime";
import { jankenAppSet } from "./app-set.js";

export const jankenServerModule = createGameSdkOnlineRoomModule(jankenAppSet);
