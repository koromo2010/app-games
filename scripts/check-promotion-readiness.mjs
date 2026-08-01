import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import {
  inspectPromotionReadiness,
} from "./promotion-readiness.mjs";

const root = resolve(import.meta.dirname, "..");
execFileSync("npm", ["run", "build"], {
  cwd: root,
  stdio: "inherit",
});
const previewManifest = JSON.parse(
  readFileSync(join(root, "mock/preview.json"), "utf8"),
);
const serverExports = await import(
  `${pathToFileURL(join(root, "dist/src/server-module.js")).href}?readiness=${Date.now()}`
);
const serverModule = Object.values(serverExports).find((value) => (
  value
  && typeof value === "object"
  && "manifest" in value
  && typeof value.createRoom === "function"
  && typeof value.applyCommand === "function"
  && typeof value.presentRoom === "function"
));
if (!serverModule) {
  throw new Error("GAME_SDK_PACKAGE_SERVER_MODULE_NOT_FOUND");
}
const issues = inspectPromotionReadiness({
  root,
  previewManifest,
  serverModule,
});
console.log(JSON.stringify({
  promotionReady: issues.length === 0,
  gameId: previewManifest.gameId,
  appSetGameId: serverModule.manifest.id,
  issues,
}, null, 2));
if (issues.length > 0) process.exitCode = 1;
