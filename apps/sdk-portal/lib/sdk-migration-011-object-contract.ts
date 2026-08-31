import type { NeonQueryFunction } from "@neondatabase/serverless";

type ConstraintKind = "p" | "u" | "f" | "c";

type ExpectedConstraint = {
  table: string;
  name: string;
  kind: ConstraintKind;
  columns: readonly string[];
  referencedTable: string;
  referencedColumns: readonly string[];
  updateAction: string;
  deleteAction: string;
  matchType: string;
  deferrable: boolean;
  initiallyDeferred: boolean;
  validated: boolean;
  noInherit: boolean;
  definitionTokens: readonly string[];
};

const tables = {
  operations: "sdk_development_private_workspace_import_operations",
  workspaces: "sdk_development_private_workspaces",
  games: "sdk_development_private_workspace_games",
  files: "sdk_development_private_workspace_files",
} as const;

const canonicalConstraintFlags = {
  deferrable: false,
  initiallyDeferred: false,
  validated: true,
  noInherit: false,
} as const;

function postgresGeneratedName(
  name1: string,
  name2: string | null,
  label: string,
) {
  let name1Length = name1.length;
  let name2Length = name2?.length ?? 0;
  const overhead = label.length + 1 + (name2 ? 1 : 0);
  const available = 63 - overhead;
  while (name1Length + name2Length > available) {
    if (name1Length > name2Length) name1Length -= 1;
    else name2Length -= 1;
  }
  return [
    name1.slice(0, name1Length),
    ...(name2 ? [name2.slice(0, name2Length)] : []),
    label,
  ].join("_");
}

function primary(table: string, columns: readonly string[]): ExpectedConstraint {
  return {
    table,
    name: postgresGeneratedName(table, null, "pkey"),
    kind: "p",
    columns,
    referencedTable: "",
    referencedColumns: [],
    updateAction: "",
    deleteAction: "",
    matchType: "",
    ...canonicalConstraintFlags,
    definitionTokens: [],
  };
}

function unique(table: string, column: string): ExpectedConstraint {
  return {
    table,
    name: postgresGeneratedName(table, column, "key"),
    kind: "u",
    columns: [column],
    referencedTable: "",
    referencedColumns: [],
    updateAction: "",
    deleteAction: "",
    matchType: "",
    ...canonicalConstraintFlags,
    definitionTokens: [],
  };
}

function foreignKey(
  table: string,
  columns: readonly string[],
  referencedTable: string,
  referencedColumns: readonly string[],
): ExpectedConstraint {
  return {
    table,
    name: postgresGeneratedName(table, columns[0] ?? null, "fkey"),
    kind: "f",
    columns,
    referencedTable,
    referencedColumns,
    updateAction: "a",
    deleteAction: "r",
    matchType: "s",
    ...canonicalConstraintFlags,
    definitionTokens: [],
  };
}

function check(
  table: string,
  nameColumn: string,
  columns: readonly string[],
  definitionTokens: readonly string[],
  collision = 0,
): ExpectedConstraint {
  return {
    table,
    name: postgresGeneratedName(table, nameColumn, collision === 0 ? "check" : `check${collision}`),
    kind: "c",
    columns: [...columns].sort(),
    referencedTable: "",
    referencedColumns: [],
    updateAction: "",
    deleteAction: "",
    matchType: "",
    ...canonicalConstraintFlags,
    definitionTokens,
  };
}

/**
 * The exact 44-constraint identity emitted by the canonical Migration 011 DDL.
 * Names follow PostgreSQL's 63-byte generated-object naming rule. CHECK
 * definition tokens are the ordered semantic token stream returned by
 * pg_get_constraintdef after PostgreSQL-only cast/deparser noise is removed.
 */
export const sdkMigration011ExpectedConstraints = [
  primary(tables.operations, ["operation_id"]),
  unique(tables.operations, "operation_nonce"),
  unique(tables.operations, "target_key"),
  check(tables.operations, "target_key", ["target_key"], [
    "target_key", "=", "'moi-lab2'", "'yabobojpn-lab'",
  ]),
  check(tables.operations, "environment", ["environment"], [
    "environment", "=", "'development'",
  ]),
  check(tables.operations, "intent", ["intent"], [
    "intent", "=", "'development-private-workspace-import-v1'",
  ]),
  check(tables.operations, "bundle_bytes", ["bundle_bytes"], ["bundle_bytes", ">", "0"]),
  check(tables.operations, "bundle_schema_version", ["bundle_schema_version"], [
    "bundle_schema_version", "=", "1",
  ]),
  check(tables.operations, "game_count", ["game_count"], ["game_count", "=", "2", "5"]),
  check(tables.operations, "runtime_file_count", ["runtime_file_count"], [
    "runtime_file_count", ">", "0",
  ]),
  check(tables.operations, "runtime_bytes", ["runtime_bytes"], ["runtime_bytes", ">", "0"]),
  check(tables.operations, "state", ["state"], ["state", "=", "'pending'", "'completed'"]),
  check(tables.operations, "phase", ["phase"], [
    "phase", "=", "'ledger-recorded'", "'imported-private'",
  ]),
  check(tables.operations, "updated_at", ["created_at", "updated_at"], [
    "updated_at", ">=", "created_at",
  ]),
  check(
    tables.operations,
    "state",
    ["completed_at", "created_at", "phase", "read_back_sha256", "state", "terminal_receipt"],
    [
      "state", "=", "'pending'", "and", "phase", "=", "'ledger-recorded'", "and",
      "terminal_receipt", "is", "null", "and", "read_back_sha256", "is", "null", "and",
      "completed_at", "is", "null", "or", "state", "=", "'completed'", "and", "phase",
      "=", "'imported-private'", "and", "terminal_receipt", "is", "not", "null", "and",
      "read_back_sha256", "is", "not", "null", "and", "completed_at", "is", "not", "null",
      "and", "completed_at", ">=", "created_at",
    ],
    1,
  ),

  primary(tables.workspaces, ["workspace_id"]),
  unique(tables.workspaces, "operation_id"),
  foreignKey(tables.workspaces, ["operation_id"], tables.operations, ["operation_id"]),
  unique(tables.workspaces, "target_key"),
  check(tables.workspaces, "environment", ["environment"], ["environment", "=", "'development'"]),
  check(tables.workspaces, "visibility", ["visibility"], ["visibility", "=", "'private-quarantined'"]),
  check(tables.workspaces, "owner_binding_state", ["owner_binding_state"], [
    "owner_binding_state", "=", "'unbound'",
  ]),
  check(tables.workspaces, "bundle_bytes", ["bundle_bytes"], ["bundle_bytes", ">", "0"]),
  check(tables.workspaces, "bundle_schema_version", ["bundle_schema_version"], [
    "bundle_schema_version", "=", "1",
  ]),
  check(tables.workspaces, "game_count", ["game_count"], ["game_count", "=", "2", "5"]),
  check(tables.workspaces, "grants_created", ["grants_created"], ["grants_created", "=", "0"]),
  check(tables.workspaces, "releases_created", ["releases_created"], ["releases_created", "=", "0"]),
  check(tables.workspaces, "publications_created", ["publications_created"], [
    "publications_created", "=", "0",
  ]),
  check(tables.workspaces, "aliases_created", ["aliases_created"], ["aliases_created", "=", "0"]),
  check(tables.workspaces, "rooms_created", ["rooms_created"], ["rooms_created", "=", "0"]),
  check(tables.workspaces, "target_key", ["game_count", "target_key"], [
    "target_key", "=", "'moi-lab2'", "and", "game_count", "=", "2", "or",
    "target_key", "=", "'yabobojpn-lab'", "and", "game_count", "=", "5",
  ]),

  primary(tables.games, ["workspace_id", "game_id"]),
  foreignKey(tables.games, ["workspace_id"], tables.workspaces, ["workspace_id"]),
  check(tables.games, "game_id", ["game_id"], [
    "game_id", "~", "'^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'",
  ]),
  check(tables.games, "reconstruction_mode", ["reconstruction_mode"], [
    "reconstruction_mode", "=", "'artifact_head'", "'definition_backed_semantic_rebuild'",
  ]),
  check(tables.games, "historical_restoration_claim", ["historical_restoration_claim"], [
    "historical_restoration_claim", "=", "false",
  ]),
  check(tables.games, "runtime_file_count", ["runtime_file_count"], [
    "runtime_file_count", ">", "0",
  ]),
  check(tables.games, "runtime_bytes", ["runtime_bytes"], ["runtime_bytes", ">", "0"]),
  check(
    tables.games,
    "reconstruction_mode",
    ["original_revision", "reconstruction_mode"],
    [
      "reconstruction_mode", "=", "'artifact_head'", "and", "original_revision", "is", "not",
      "null", "or", "reconstruction_mode", "=", "'definition_backed_semantic_rebuild'", "and",
      "original_revision", "is", "null",
    ],
    1,
  ),

  primary(tables.files, ["workspace_id", "game_id", "path"]),
  foreignKey(tables.files, ["workspace_id", "game_id"], tables.games, ["workspace_id", "game_id"]),
  check(tables.files, "byte_length", ["byte_length"], [
    "byte_length", ">=", "0", "and", "byte_length", "<=", "2097152",
  ]),
  check(tables.files, "content_bytes", ["byte_length", "content_bytes"], [
    "octet_length", "content_bytes", "=", "byte_length",
  ]),
  check(tables.files, "path", ["path"], [
    "path", "!~", String.raw`'(^/|\\\\|(^|/)\.\.?(/|$)|\x00)'`,
  ]),
] as const satisfies readonly ExpectedConstraint[];

export const sdkMigration011ExpectedConstraintCount = 44;

if (sdkMigration011ExpectedConstraints.length !== sdkMigration011ExpectedConstraintCount) {
  throw new Error("SDK_MIGRATION_011_CANONICAL_CONSTRAINT_COUNT_INVALID");
}
if (new Set(sdkMigration011ExpectedConstraints.map(({ table, name }) => `${table}.${name}`)).size
  !== sdkMigration011ExpectedConstraintCount) {
  throw new Error("SDK_MIGRATION_011_CANONICAL_CONSTRAINT_IDENTITY_DUPLICATE");
}

const expectedColumns = [
  [tables.operations, [
    "operation_id", "operation_nonce", "target_key", "environment", "intent",
    "plan_receipt", "terminal_receipt", "bundle_bytes", "bundle_sha256",
    "bundle_schema_version", "game_count", "game_identity_set_sha256",
    "per_game_identity_sha256", "content_set_sha256", "workspace_manifest_sha256",
    "per_game_ledger_sha256", "runtime_file_count", "runtime_bytes",
    "before_state_sha256", "source_state_token", "public_state_token",
    "unrelated_private_state_token", "read_back_sha256", "state", "phase",
    "created_at", "updated_at", "completed_at",
  ]],
  [tables.workspaces, [
    "workspace_id", "operation_id", "target_key", "environment", "visibility",
    "owner_binding_state", "bundle_bytes", "bundle_sha256", "bundle_schema_version",
    "game_count", "game_identity_set_sha256", "per_game_identity_sha256",
    "content_set_sha256", "workspace_manifest_sha256", "workspace_manifest",
    "grants_created", "releases_created", "publications_created", "aliases_created",
    "rooms_created", "created_at",
  ]],
  [tables.games, [
    "workspace_id", "game_id", "reconstruction_mode", "original_revision",
    "historical_restoration_claim", "workspace_document_sha256", "provenance_sha256",
    "runtime_files_sha256", "workspace_document", "runtime_file_count",
    "runtime_bytes", "created_at",
  ]],
  [tables.files, [
    "workspace_id", "game_id", "path", "content_bytes", "byte_length",
    "content_sha256", "created_at",
  ]],
] as const;

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlTextArray(values: readonly string[]) {
  return values.length === 0
    ? "ARRAY[]::text[]"
    : `ARRAY[${values.map(sqlText).join(", ")}]::text[]`;
}

const expectedColumnValues = expectedColumns
  .flatMap(([table, columns]) => columns.map((column) => `(${sqlText(table)}, ${sqlText(column)})`))
  .join(",\n      ");

const expectedConstraintValues = sdkMigration011ExpectedConstraints.map((constraint) => `(
      ${sqlText(constraint.table)},
      ${sqlText(constraint.name)},
      ${sqlText(constraint.kind)},
      ${sqlTextArray(constraint.columns)},
      ${sqlText(constraint.referencedTable)},
      ${sqlTextArray(constraint.referencedColumns)},
      ${sqlText(constraint.updateAction)},
      ${sqlText(constraint.deleteAction)},
      ${sqlText(constraint.matchType)},
      ${constraint.deferrable},
      ${constraint.initiallyDeferred},
      ${constraint.validated},
      ${constraint.noInherit},
      ${sqlTextArray(constraint.definitionTokens)}
    )`).join(",\n    ");

export const sdkMigration011ObjectContractSql = `
WITH expected_columns(table_name, column_name) AS (
  VALUES
      ${expectedColumnValues}
), expected_constraints(
  table_name, constraint_name, constraint_type, constrained_columns,
  referenced_table, referenced_columns, update_action, delete_action,
  match_type, deferrable, initially_deferred, validated, no_inherit,
  definition_tokens
) AS (
  VALUES
    ${expectedConstraintValues}
), actual_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN (
      '${tables.operations}',
      '${tables.workspaces}',
      '${tables.games}',
      '${tables.files}'
    )
), object_presence AS (
  SELECT
    (to_regclass('public.${tables.operations}') IS NOT NULL)::integer
    + (to_regclass('public.${tables.workspaces}') IS NOT NULL)::integer
    + (to_regclass('public.${tables.games}') IS NOT NULL)::integer
    + (to_regclass('public.${tables.files}') IS NOT NULL)::integer
    + (to_regclass('public.sdk_development_private_workspace_operation_idx') IS NOT NULL)::integer
    + (to_regclass('public.sdk_development_private_workspace_game_idx') IS NOT NULL)::integer
    + (to_regprocedure(
        'public.sdk_development_private_workspace_import_snapshot(character varying)'
      ) IS NOT NULL)::integer AS present_object_count
), index_contract AS (
  SELECT
    COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_operation_idx'
        AND indexdef LIKE '%(state, created_at)%'
    ) = 1
    AND COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_game_idx'
        AND indexdef LIKE '%(game_id, reconstruction_mode)%'
    ) = 1
    AND COUNT(*) FILTER (WHERE indexname = '${postgresGeneratedName(tables.operations, null, "pkey")}') = 1
    AND COUNT(*) FILTER (WHERE indexname = '${postgresGeneratedName(tables.workspaces, null, "pkey")}') = 1
    AND COUNT(*) FILTER (WHERE indexname = '${postgresGeneratedName(tables.games, null, "pkey")}') = 1
    AND COUNT(*) FILTER (WHERE indexname = '${postgresGeneratedName(tables.files, null, "pkey")}') = 1
    AND COUNT(*) = 10 AS exact
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('${tables.operations}', '${tables.workspaces}', '${tables.games}', '${tables.files}')
), target_relation_oids AS (
  SELECT relation_oid
  FROM (VALUES
    (to_regclass('public.${tables.operations}')::oid),
    (to_regclass('public.${tables.workspaces}')::oid),
    (to_regclass('public.${tables.games}')::oid),
    (to_regclass('public.${tables.files}')::oid)
  ) AS resolved(relation_oid)
  WHERE relation_oid IS NOT NULL
), actual_constraints AS (
  SELECT
    relation.relname::text AS table_name,
    constraint_record.conname::text AS constraint_name,
    constraint_record.contype::text AS constraint_type,
    CASE WHEN constraint_record.contype = 'c' THEN ARRAY(
      SELECT attribute.attname::text
      FROM unnest(constraint_record.conkey) AS key(attnum)
      JOIN pg_attribute attribute
        ON attribute.attrelid = constraint_record.conrelid
       AND attribute.attnum = key.attnum
      ORDER BY attribute.attname
    ) ELSE ARRAY(
      SELECT attribute.attname::text
      FROM unnest(constraint_record.conkey) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_attribute attribute
        ON attribute.attrelid = constraint_record.conrelid
       AND attribute.attnum = key.attnum
      ORDER BY key.position
    ) END AS constrained_columns,
    CASE WHEN constraint_record.contype = 'f' THEN referenced_relation.relname::text ELSE '' END
      AS referenced_table,
    CASE WHEN constraint_record.contype = 'f' THEN ARRAY(
      SELECT attribute.attname::text
      FROM unnest(constraint_record.confkey) WITH ORDINALITY AS key(attnum, position)
      JOIN pg_attribute attribute
        ON attribute.attrelid = constraint_record.confrelid
       AND attribute.attnum = key.attnum
      ORDER BY key.position
    ) ELSE ARRAY[]::text[] END AS referenced_columns,
    CASE WHEN constraint_record.contype = 'f' THEN constraint_record.confupdtype::text ELSE '' END
      AS update_action,
    CASE WHEN constraint_record.contype = 'f' THEN constraint_record.confdeltype::text ELSE '' END
      AS delete_action,
    CASE WHEN constraint_record.contype = 'f' THEN constraint_record.confmatchtype::text ELSE '' END
      AS match_type,
    constraint_record.condeferrable AS deferrable,
    constraint_record.condeferred AS initially_deferred,
    constraint_record.convalidated AS validated,
    constraint_record.connoinherit AS no_inherit,
    CASE WHEN constraint_record.contype = 'c' THEN ARRAY(
      SELECT token[1]
      FROM regexp_matches(
        lower(pg_get_constraintdef(constraint_record.oid, false)),
        $tokens$'(?:[^']|'')*'|!~|~|>=|<=|<>|!=|=|>|<|[a-z_][a-z0-9_]*|[0-9]+$tokens$,
        'g'
      ) AS token
      WHERE token[1] NOT IN ('check', 'text', 'character', 'varying', 'integer', 'boolean', 'any', 'array')
    ) ELSE ARRAY[]::text[] END AS definition_tokens
  FROM pg_constraint constraint_record
  JOIN pg_class relation ON relation.oid = constraint_record.conrelid
  LEFT JOIN pg_class referenced_relation ON referenced_relation.oid = constraint_record.confrelid
  WHERE constraint_record.conrelid IN (SELECT relation_oid FROM target_relation_oids)
), constraint_contract AS (
  SELECT
    (SELECT COUNT(*) FROM actual_constraints)::integer AS constraint_count,
    (SELECT COUNT(*) FROM expected_constraints) = ${sdkMigration011ExpectedConstraintCount}
    AND (SELECT COUNT(*) FROM actual_constraints) = ${sdkMigration011ExpectedConstraintCount}
    AND NOT EXISTS (
      SELECT * FROM expected_constraints
      EXCEPT
      SELECT * FROM actual_constraints
    )
    AND NOT EXISTS (
      SELECT * FROM actual_constraints
      EXCEPT
      SELECT * FROM expected_constraints
    ) AS exact
), function_contract AS (
  SELECT COUNT(*) = 1
    AND COALESCE(bool_and(p.provolatile = 's'), false)
    AND COALESCE(bool_and(p.proretset), false)
    AND COALESCE(bool_and(l.lanname = 'sql'), false)
    AND COALESCE(bool_and(position('target_creators AS MATERIALIZED' in p.prosrc) > 0), false)
    AND COALESCE(bool_and(position('sdk_development_private_workspaces' in p.prosrc) > 0), false)
    AND COALESCE(bool_and(position('unrelated_private_state_token' in pg_get_function_result(p.oid)) > 0), false)
      AS exact
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.proname = 'sdk_development_private_workspace_import_snapshot'
    AND pg_get_function_identity_arguments(p.oid) = 'p_target character varying'
)
SELECT
  object_presence.present_object_count AS "presentObjectCount",
  (
    (SELECT COUNT(*) FROM actual_columns) = 68
    AND NOT EXISTS (
      SELECT table_name, column_name FROM expected_columns
      EXCEPT
      SELECT table_name, column_name FROM actual_columns
    )
    AND NOT EXISTS (
      SELECT table_name, column_name FROM actual_columns
      EXCEPT
      SELECT table_name, column_name FROM expected_columns
    )
  ) AS "columnsExact",
  index_contract.exact AS "indexesExact",
  constraint_contract.constraint_count AS "constraintCount",
  constraint_contract.exact AS "constraintsExact",
  function_contract.exact AS "functionExact"
FROM object_presence, index_contract, constraint_contract, function_contract
`;

export type SdkMigration011ObjectContract = {
  presentObjectCount: number;
  columnsExact: boolean;
  indexesExact: boolean;
  constraintCount: number;
  constraintsExact: boolean;
  functionExact: boolean;
};

export const emptySdkMigration011ObjectContract: SdkMigration011ObjectContract = {
  presentObjectCount: 0,
  columnsExact: false,
  indexesExact: false,
  constraintCount: 0,
  constraintsExact: false,
  functionExact: false,
};

export const completeSdkMigration011ObjectContract: SdkMigration011ObjectContract = {
  presentObjectCount: 7,
  columnsExact: true,
  indexesExact: true,
  constraintCount: sdkMigration011ExpectedConstraintCount,
  constraintsExact: true,
  functionExact: true,
};

export function isCompleteSdkMigration011ObjectContract(
  contract: SdkMigration011ObjectContract,
) {
  return contract.presentObjectCount === completeSdkMigration011ObjectContract.presentObjectCount
    && contract.columnsExact
    && contract.indexesExact
    && contract.constraintCount === sdkMigration011ExpectedConstraintCount
    && contract.constraintsExact
    && contract.functionExact;
}

export function sdkMigration011ObjectContractFromRow(
  row: Record<string, unknown> | undefined,
): SdkMigration011ObjectContract {
  return {
    presentObjectCount: Number(row?.presentObjectCount ?? 0),
    columnsExact: row?.columnsExact === true,
    indexesExact: row?.indexesExact === true,
    constraintCount: Number(row?.constraintCount ?? 0),
    constraintsExact: row?.constraintsExact === true,
    functionExact: row?.functionExact === true,
  };
}

export async function readSdkMigration011ObjectContract(
  sql: NeonQueryFunction<boolean, boolean>,
) {
  const rows = await sql.query(sdkMigration011ObjectContractSql) as Array<Record<string, unknown>>;
  return sdkMigration011ObjectContractFromRow(rows[0]);
}

export const sdkMigration011CompleteContractPredicateSql = `COALESCE((
  SELECT
    contract."presentObjectCount" = 7
    AND contract."columnsExact"
    AND contract."indexesExact"
    AND contract."constraintCount" = ${sdkMigration011ExpectedConstraintCount}
    AND contract."constraintsExact"
    AND contract."functionExact"
  FROM (
    ${sdkMigration011ObjectContractSql}
  ) AS contract
), false)`;
