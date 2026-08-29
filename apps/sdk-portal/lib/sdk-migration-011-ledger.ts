export type SdkMigrationLedgerRow = {
  version: number;
  name: string;
  checksum: string;
};

export const sdkMigration011Name = "011_development_private_workspace_import.sql";
export const sdkMigration011Checksum = "99d1d516bff011502b1aed50c5a4f26b81e2b2354e2eabb1fa31385d3c7a91ef";

export const sdkMigration011CanonicalLedger = Object.freeze([
  { version: 1, name: "001_sdk_registry.sql", checksum: "5456100f4e2bf5cbba4cdf64bc883699ce0a89971e293c08a353803a1e965117" },
  { version: 2, name: "002_sdk_portal_runtime.sql", checksum: "22a80f2062ff27bcadb0be6e940ee6b32a79d171f74865cd043415acb516ce63" },
  { version: 3, name: "003_immutable_packages_and_lifecycle.sql", checksum: "60c88555bb042c28f5196d7c916ac222fb2ab37ef4294e64b32e5d4ddd2507c5" },
  { version: 4, name: "004_app_release_history.sql", checksum: "51fd28e7b1d2452fe96ba850d1dd7089201031230cdf710733085949099a4571" },
  { version: 5, name: "005_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 6, name: "006_cross_environment_package_artifacts.sql", checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7" },
  { version: 7, name: "007_reconcile_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 8, name: "008_mock_approval_and_authoring_gate.sql", checksum: "e8b31e6debda55d6a70977a5d9c96aa97403983821d52b1ebcd8d1b32b608894" },
  { version: 9, name: "009_module_profile_proposals.sql", checksum: "b7f306bf3d236118d38719722647984119cdb18aec8614cf042fde757f67c723" },
  { version: 10, name: "010_bounded_creator_quarantine_recovery.sql", checksum: "f0ca21664864b5827819873ab4de29b75c9710097bf4a18cf15b069edca71f0c" },
  { version: 11, name: sdkMigration011Name, checksum: sdkMigration011Checksum },
] satisfies readonly SdkMigrationLedgerRow[]);

export const sdkMigration011AcceptedLegacy005 = Object.freeze({
  version: 5,
  name: "005_cross_environment_package_artifacts.sql",
  checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7",
});

export type SdkMigrationLedgerMismatch = {
  version: number;
  expected: string;
  actual: string;
};

export type SdkMigration011LedgerComparison = {
  consistent: boolean;
  acceptedLegacyVersion5: boolean;
  missingVersions: number[];
  unexpectedVersions: number[];
  duplicateVersions: number[];
  nameMismatches: SdkMigrationLedgerMismatch[];
  checksumMismatches: SdkMigrationLedgerMismatch[];
};

export function compareSdkMigration011Ledger(
  rows: SdkMigrationLedgerRow[],
): SdkMigration011LedgerComparison {
  const normalized = rows.map((row) => ({
    version: Number(row.version),
    name: String(row.name),
    checksum: String(row.checksum),
  })).sort((left, right) => left.version - right.version
    || left.name.localeCompare(right.name)
    || left.checksum.localeCompare(right.checksum));
  const expected = sdkMigration011CanonicalLedger.slice(0, 10);
  const counts = new Map<number, number>();
  for (const row of normalized) counts.set(row.version, (counts.get(row.version) ?? 0) + 1);
  const missingVersions = expected
    .filter((row) => !counts.has(row.version))
    .map((row) => row.version);
  const unexpectedVersions = [...new Set(normalized
    .filter((row) => !expected.some((candidate) => candidate.version === row.version))
    .map((row) => row.version))].sort((a, b) => a - b);
  const duplicateVersions = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([version]) => version)
    .sort((a, b) => a - b);
  const nameMismatches: SdkMigrationLedgerMismatch[] = [];
  const checksumMismatches: SdkMigrationLedgerMismatch[] = [];
  let acceptedLegacyVersion5 = false;
  for (const canonical of expected) {
    const actual = normalized.find((row) => row.version === canonical.version);
    if (!actual) continue;
    if (
      actual.version === sdkMigration011AcceptedLegacy005.version
      && actual.name === sdkMigration011AcceptedLegacy005.name
      && actual.checksum === sdkMigration011AcceptedLegacy005.checksum
    ) {
      acceptedLegacyVersion5 = true;
      continue;
    }
    if (actual.name !== canonical.name) {
      nameMismatches.push({ version: canonical.version, expected: canonical.name, actual: actual.name });
    }
    if (actual.checksum !== canonical.checksum) {
      checksumMismatches.push({ version: canonical.version, expected: canonical.checksum, actual: actual.checksum });
    }
  }
  const consistent = missingVersions.length === 0
    && unexpectedVersions.length === 0
    && duplicateVersions.length === 0
    && nameMismatches.length === 0
    && checksumMismatches.length === 0
    && normalized.length === 10;
  return {
    consistent,
    acceptedLegacyVersion5,
    missingVersions,
    unexpectedVersions,
    duplicateVersions,
    nameMismatches,
    checksumMismatches,
  };
}
