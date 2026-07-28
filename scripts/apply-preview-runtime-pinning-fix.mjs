import fs from "node:fs";

const path = "app/api/sdk-preview/[creatorSlug]/games/[gameId]/rooms/route.ts";
let source = fs.readFileSync(path, "utf8");

const importAnchor = 'import { createRequestTelemetry } from "@/lib/observability";\n';
const importReplacement = `${importAnchor}import platformRelease from "../../../../../../../config/platform-release.json";\n`;
if (!source.includes('platformRelease from "../../../../../../../config/platform-release.json"')) {
  if (!source.includes(importAnchor)) throw new Error("runtime pinning import anchor not found");
  source = source.replace(importAnchor, importReplacement);
}

const before = `        if (!pinned) return null;
        return {
          module: pinned.module,
          runtimeContract: pinned.runtimeContract,
          moduleProfile: normalizeGameSdkModuleProfile(
            pinned.definition.modulePolicy,
          ),
          resources: pinned.resources,
        };
`;
const after = `        if (!pinned) return null;
        if (
          pinned.definition.revision !== contract.packageRevision
          || pinned.definition.packageRootSha256 !== contract.packageRootSha256
          || !platformRelease.supportedSdkContractVersions.includes(
            contract.sdkContractVersion,
          )
        ) return null;
        return {
          module: pinned.module,
          // The room owns its runtime contract for its full lifetime. The pinned
          // package identity is verified above; reusing current platform release
          // values here would invalidate every active room after an SDK upgrade.
          runtimeContract: contract,
          moduleProfile: normalizeGameSdkModuleProfile(
            pinned.definition.modulePolicy,
          ),
          resources: pinned.resources,
        };
`;
if (!source.includes(after)) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`runtime resolver block expected once, found ${count}`);
  source = source.replace(before, after);
}

fs.writeFileSync(path, source);
