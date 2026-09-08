import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { productionPrivateWorkspaceImportObjectNames, productionPrivateWorkspaceImportSchemaStatements } from "../apps/sdk-portal/lib/production-private-workspace-import-schema.ts";
import { productionPrivateWorkspaceImportIntent, productionPrivateWorkspaceImportRecoveryIdentity } from "../apps/sdk-portal/lib/production-private-workspace-import.ts";
import { productionOwnerRestorationWorkspaceOperationId } from "../lib/production-owner-restoration.ts";
import { projectCompletionDiagnosticResponse } from "../lib/production-owner-restoration-diagnostic-projection.ts";

const root = process.cwd();
const storePath = "apps/sdk-portal/lib/production-private-workspace-import-store.ts";
const panelPath = "app/site-admin/runtime-operations/production-private-workspace-import/moi-lab2/ProductionOwnerRestorationPanel.tsx";
const adminPath = "/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/completed-import-diagnostic";
const sdkPath = "/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/completed-import-diagnostic";
const operationId = productionOwnerRestorationWorkspaceOperationId;
const names = productionPrivateWorkspaceImportObjectNames;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type QueryEvidence = { statement: string; params: unknown[]; rows?: number; sqlstate?: string };
type Harness = {
  setSql(sql: { query(statement: string, params?: unknown[]): Promise<unknown> }): void;
  setAdmin(allowed: boolean): void;
  readCompletedProductionPrivateWorkspaceImport(id: string): Promise<unknown>;
  diagnoseCompletedProductionPrivateWorkspaceImport(id: string): Promise<unknown>;
  adminGET(request: Request): Promise<Response>;
  sdkGET(request: Request): Promise<Response>;
  ProductionOwnerRestorationPanel: () => ReturnType<typeof createElement>;
};

/** Bundle the real store, routes and React panel; replace only the local DB transport
 * and the Next request-bound Site Admin session. The main DB resolver/context
 * and internal service authentication remain real.
 * Never substitute SQL, rows, decoder logic, API response bodies or UI state. */
async function harness(baseStore?: string): Promise<Harness> {
  const output = await build({
    stdin: {
      contents: `export * from './${storePath}';
        export {setSql} from '@neondatabase/serverless';
        export {setAdmin} from './lib/site-admin-auth.ts';
        export {GET as adminGET} from './app${adminPath}/route.ts';
        export {GET as sdkGET} from './apps/sdk-portal/app${sdkPath}/route.ts';
        export {ProductionOwnerRestorationPanel} from './${panelPath}';`,
      resolveDir: root, loader: "ts",
    },
    bundle: true, platform: "node", format: "cjs", write: false,
    external: ["react", "react/jsx-runtime"],
    plugins: [{ name: "isolated-postgres-transport", setup(builder) {
      builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: "local-db", namespace: "isolation" }));
      builder.onResolve({ filter: /(?:^|\/)site-admin-auth(?:\.ts)?$/ }, () => ({ path: "local-admin", namespace: "isolation" }));
      builder.onLoad({ filter: /.*/, namespace: "isolation" }, ({ path }) => ({ loader: "ts", contents: path === "local-db"
        ? `let sql; export function setSql(value) { sql = value; }
           export function neon() { if (!sql) throw new Error('LOCAL_DB_NOT_SET'); return sql; }`
        : `let allowed = true; export function setAdmin(value) { allowed = value; }
           export async function requireFullSiteAdminSession() { if (!allowed) throw new Error('LOCAL_AUTH_REQUIRED'); }
           export function siteAdminAuthorizationError(error) { return error?.message === 'LOCAL_AUTH_REQUIRED'
             ? Response.json({error:'SITE_ADMIN_AUTH_REQUIRED'},{status:401}) : null; }`,
      }));
      builder.onResolve({ filter: /^@\// }, ({ path, importer }) => {
        const absolute = resolve(root, importer.includes("/apps/sdk-portal/") ? "apps/sdk-portal" : ".", path.slice(2));
        return { path: [absolute, `${absolute}.ts`, `${absolute}.tsx`].find(existsSync)! };
      });
      if (baseStore) builder.onLoad({ filter: /\/production-private-workspace-import-store\.ts$/ }, ({ path }) => ({
        contents: readFileSync(baseStore, "utf8"), loader: "ts", resolveDir: resolve(path, ".."),
      }));
    } }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  return compiled.exports as Harness;
}

async function insert(db: PGlite, table: string, values: Record<string, unknown>) {
  const keys = Object.keys(values);
  await db.query(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(values));
}

async function reset(db: PGlite, pending = false) {
  for (const name of [...names].reverse()) await db.exec(`DROP TABLE IF EXISTS ${name} CASCADE`);
  for (const statement of productionPrivateWorkspaceImportSchemaStatements) await db.exec(statement);
  const identity = {
    bundle_bytes: 127345, bundle_sha256: "71834a0633bb35cb3021c01a758db9f9005f148b790bab9c8b89fd3adb346305",
    bundle_schema_version: 1, game_count: 2, game_identity_set_sha256: hash("games"),
    per_game_identity_sha256: hash("per-game"), content_set_sha256: hash("content"),
    workspace_manifest_sha256: hash("manifest"), per_game_ledger_sha256: hash("ledger"),
  };
  await insert(db, names[0], {
    operation_id: operationId, operation_nonce: operationId, target_key: "moi-lab2", environment: "production",
    intent: productionPrivateWorkspaceImportIntent,
    recovery_operation_id: productionPrivateWorkspaceImportRecoveryIdentity.operationId,
    recovery_terminal_receipt: productionPrivateWorkspaceImportRecoveryIdentity.terminalReceipt,
    plan_receipt: hash("synthetic-plan"), terminal_receipt: pending ? null : hash("synthetic-terminal"),
    ...identity, entry_count: 26, runtime_file_count: 21, runtime_bytes: 21,
    before_state_sha256: hash("before"), source_state_token: hash("source"), public_state_token: hash("public"),
    unrelated_private_state_token: hash("unrelated"), read_back_sha256: pending ? null : hash("readback"),
    state: pending ? "pending" : "completed", phase: pending ? "ledger-recorded" : "imported-private",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:01Z",
    completed_at: pending ? null : "2026-01-01T00:00:01Z",
  });
  await insert(db, names[1], {
    workspace_id: operationId, operation_id: operationId, target_key: "moi-lab2", environment: "production",
    visibility: "private-quarantined", owner_binding_state: "unbound", ...identity, workspace_manifest: {},
  });
  for (let game = 0; game < 2; game++) {
    const files = game === 0 ? 10 : 11;
    await insert(db, names[2], {
      workspace_id: operationId, game_id: `synthetic-${game}`, reconstruction_mode: "DEFINITION_BACKED_SEMANTIC_REBUILD",
      original_revision: null, historical_restoration_claim: false, workspace_document_sha256: hash(`doc-${game}`),
      provenance_sha256: hash(`provenance-${game}`), runtime_files_sha256: hash(`files-${game}`),
      workspace_document: {}, runtime_file_count: files, runtime_bytes: files,
    });
    for (let file = 0; file < files; file++) await insert(db, names[3], {
      workspace_id: operationId, game_id: `synthetic-${game}`, path: `source/file-${file}.js`,
      content_bytes: new Uint8Array([65]), byte_length: 1, content_sha256: hash("A"),
    });
  }
}

test("completed-import SQL and API/decoder/UI run on isolated PostgreSQL (PGlite WASM)", async (t) => {
  const db = new PGlite();
  const app = await harness();
  const queries: QueryEvidence[] = [];
  const outcomes: Array<Record<string, unknown>> = [];
  const version = (await db.query<{ version: string }>("SELECT version() AS version")).rows[0].version;
  t.diagnostic(version);
  const sql = { async query(statement: string, params: unknown[] = []) {
    const evidence: QueryEvidence = { statement, params: [...params] };
    queries.push(evidence);
    try {
      const result = await db.query(statement, params);
      evidence.rows = result.rows.length;
      return result.rows;
    } catch (error) {
      evidence.sqlstate = (error as { code: string }).code;
      throw error;
    }
  } };
  app.setSql(sql);
  const previous = { fetch: globalThis.fetch, env: { ...process.env }, window: globalThis.window, document: globalThis.document };
  const reactGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = reactGlobal.IS_REACT_ACT_ENVIRONMENT;
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
  Object.assign(globalThis, { window, document });
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  process.env.APP_ENV = "production";
  process.env.SDK_DATABASE_URL = "postgresql://synthetic:synthetic@isolated.invalid/synthetic";
  process.env.VERCEL_GIT_COMMIT_REF = "main";
  process.env.SDK_ACCOUNT_LINK_SECRET = "isolated-synthetic-service-secret-at-least-32-characters";
  let active = app;
  let uiCalls = 0;
  let internalCalls = 0;
  let delay: Promise<void> | null = null;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === adminPath) {
      uiCalls++;
      if (delay) await delay;
      return active.adminGET(new Request(`http://isolated.invalid${adminPath}`, init));
    }
    assert.equal(url, `https://sdk.game-fields.com${sdkPath}`, "all network is trapped; unexpected target is forbidden");
    internalCalls++;
    return active.sdkGET(new Request(url, init));
  }) as typeof fetch;

  async function response() {
    const result = await active.adminGET(new Request(`http://isolated.invalid${adminPath}`));
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    return { status: result.status, body: await result.json() };
  }

  async function display(expected: string, expectedStatus: "result" | "failure", httpStatus = expectedStatus === "result" ? 200 : 503) {
    const container = document.getElementById("root")!;
    const reactRoot = createRoot(container);
    const before = uiCalls;
    let release!: () => void;
    delay = new Promise<void>((resolve) => { release = resolve; });
    try {
      await act(async () => { reactRoot.render(createElement(active.ProductionOwnerRestorationPanel)); });
      const button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent?.includes("canonical completed-import diagnostic"))!;
      await act(async () => { button.dispatchEvent(new window.Event("click", { bubbles: true })); });
      assert.equal(uiCalls, before + 1);
      assert.equal(button.hasAttribute("disabled"), true);
      assert.ok(container.querySelector("[data-completed-import-diagnostic-pending]"));
      await act(async () => { release(); await delay; });
      assert.ok(container.querySelector(expectedStatus === "result" ? "[data-completed-import-diagnostic]" : "[data-completed-import-diagnostic-failure]"));
      assert.match(container.textContent ?? "", new RegExp(expected));
      assert.equal(button.hasAttribute("disabled"), true);
      assert.equal(container.querySelector("[data-completed-import-diagnostic-pending]"), null);
      assert.equal(container.querySelector("[data-completed-import-diagnostic-http]")?.textContent?.trim(), `HTTP ${httpStatus} / 診断送信済み（再送不可）`);
      await act(async () => { button.dispatchEvent(new window.Event("click", { bubbles: true })); });
      assert.equal(uiCalls, before + 1, "consumed UI must not send again");
      outcomes.push({ display: expected, phase: expectedStatus, httpStatus, consumed: true, uiCalls: 1, retryCalls: 0 });
    } finally {
      release(); delay = null;
      await act(async () => { reactRoot.unmount(); });
    }
  }

  try {
    await t.test("original product-generated SQL fails on PostgreSQL, without rewriting SQL", { skip: !process.env.T131_A6_BASE_STORE }, async () => {
      await reset(db);
      const base = await harness(process.env.T131_A6_BASE_STORE);
      base.setSql(sql);
      active = base;
      await assert.rejects(base.readCompletedProductionPrivateWorkspaceImport(operationId), { code: "42703" });
      const result = await response();
      assert.equal(result.status, 503);
      assert.equal(result.body.error, "OWNER_RESTORATION_DIAGNOSTIC_REQUIRED_COLUMN_UNAVAILABLE");
      await display("OWNER_RESTORATION_DIAGNOSTIC_REQUIRED_COLUMN_UNAVAILABLE", "failure");
      outcomes.push({ scenario: "exact-base-sql", sqlstate: "42703", status: result.status, body: result.body });
      active = app;
    });

    await t.test("complete canonical A5 contract returns a real API result and consumed UI", async () => {
      await reset(db);
      const start = queries.length;
      assert.ok(await app.readCompletedProductionPrivateWorkspaceImport(operationId));
      const result = await response();
      assert.equal(result.status, 200);
      assert.equal(result.body.canonicalReader.matched, true);
      assert.equal(result.body.database.canonicalReaderSelector, "SDK_DATABASE_URL");
      assert.equal(result.body.database.selectorMatch, true);
      assert.equal(result.body.database.fingerprintMatch, true);
      assert.match(result.body.database.canonicalReaderFingerprint, /^sdb_v1_[A-Za-z0-9_-]{43}$/);
      assert.deepEqual(result.body.canonicalReader.excludedBy, []);
      assert.equal(result.body.schema.evidence, "canonical-query-confirmed");
      assert.equal(projectCompletionDiagnosticResponse(result.status, result.body).phase, "result");
      const calls = queries.slice(start).filter((query) => query.params.length > 0);
      assert.equal(calls.length, 3, "canonical direct / diagnostic preflight / diagnostic CTE");
      for (const query of calls) {
        assert.deepEqual(query.params, [operationId, productionPrivateWorkspaceImportIntent]);
        assert.ok(!query.statement.includes(productionPrivateWorkspaceImportIntent));
      }
      await display("canonical reader MATCHED", "result");
      outcomes.push({ scenario: "completed", status: result.status, body: result.body });
    });

    await t.test("UUID comparison preserves identity across equivalent textual casing", async () => {
      await reset(db);
      assert.ok(await app.readCompletedProductionPrivateWorkspaceImport(operationId.toUpperCase()));
      const diagnostic = await app.diagnoseCompletedProductionPrivateWorkspaceImport(operationId.toUpperCase()) as { operation: { operationIdExact: string } };
      assert.equal(diagnostic.operation.operationIdExact, "pass");
      outcomes.push({ scenario: "uuid-equivalent-text", operationIdExact: diagnostic.operation.operationIdExact });
    });

    await t.test("normal zero-row search is distinct from an SQL execution failure", async () => {
      await reset(db);
      await db.exec(`TRUNCATE ${names.join(",")}`);
      assert.equal(await app.readCompletedProductionPrivateWorkspaceImport(operationId), null);
      const result = await response();
      assert.equal(result.status, 200);
      assert.equal(result.body.operation.row, "absent");
      assert.equal(result.body.canonicalReader.matched, false);
      await display("canonical reader EXCLUDED", "result");
      outcomes.push({ scenario: "no-target", status: result.status, body: result.body });
    });

    await t.test("pending / ledger-recorded with 1/2/21 is never completed", async () => {
      await reset(db, true);
      assert.equal(await app.readCompletedProductionPrivateWorkspaceImport(operationId), null);
      const result = await response();
      assert.equal(result.status, 200);
      assert.equal(result.body.operation.state, "pending");
      assert.equal(result.body.operation.phase, "ledger-recorded");
      assert.deepEqual(result.body.canonicalReader.excludedBy, ["OPERATION", "TERMINAL"]);
      await display("state pending / phase ledger-recorded", "result");
      outcomes.push({ scenario: "pending-ledger", status: result.status, body: result.body });
    });

    for (const [column, field] of [["terminal_receipt", "terminalReceiptPresent"], ["read_back_sha256", "readBackShaPresent"]]) {
      await t.test(`schema rejects missing ${column}; canonical reader also rejects isolated corrupted row`, async () => {
        await reset(db);
        await assert.rejects(db.exec(`UPDATE ${names[0]} SET ${column} = NULL`), { code: "23514" });
        // Only in this isolated negative fixture: remove the terminal combination CHECK,
        // after proving the canonical schema rejects corruption. Never change product DDL.
        const checks = await db.query<{ conname: string; definition: string }>(
          "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'c'", [names[0]]);
        const check = checks.rows.find((row) => row.definition.includes("terminal_receipt IS NULL"))!;
        assert.ok(check);
        await db.exec(`ALTER TABLE ${names[0]} DROP CONSTRAINT "${check.conname.replaceAll('"', '""')}"`);
        await db.exec(`UPDATE ${names[0]} SET ${column} = NULL`);
        assert.equal(await app.readCompletedProductionPrivateWorkspaceImport(operationId), null);
        const result = await response();
        assert.equal(result.status, 200);
        assert.equal(result.body.operation[field], "fail");
        assert.ok(result.body.canonicalReader.excludedBy.includes("TERMINAL"));
        outcomes.push({ scenario: `missing-${column}`, schemaRejectedFirst: true, status: result.status, body: result.body });
      });
    }

    const mismatches = [
      { name: "wrong-operation", sql: "", id: "11111111-1111-4111-8111-111111111111", excluded: "OPERATION" },
      { name: "workspace-identity", sql: `UPDATE ${names[3]} SET workspace_id = '11111111-1111-4111-8111-111111111111'`, excluded: "WORKSPACE" },
      ...["bundle_sha256", "workspace_manifest_sha256", "per_game_ledger_sha256", "content_set_sha256"].map((column) => ({
        name: column, sql: `UPDATE ${names[1]} SET ${column} = '${"f".repeat(64)}'`, excluded: "INTEGRITY",
      })),
      { name: "runtime-byte-sum", sql: `UPDATE ${names[2]} SET runtime_bytes = runtime_bytes + 1`, excluded: "INTEGRITY" },
      { name: "runtime-file-count", sql: `DELETE FROM ${names[3]} WHERE game_id = 'synthetic-0' AND path = 'source/file-0.js'`, excluded: "INTEGRITY" },
    ];
    for (const mismatch of mismatches) await t.test(`fail-closed: ${mismatch.name}`, async () => {
      await reset(db);
      if (mismatch.name === "workspace-identity") {
        // Recreate only synthetic child rows after changing the workspace PK; FK contract remains intact.
        await db.exec(`DELETE FROM ${names[3]}; DELETE FROM ${names[2]}; UPDATE ${names[1]} SET workspace_id = '11111111-1111-4111-8111-111111111111'`);
      } else if (mismatch.sql) await db.exec(mismatch.sql);
      const id = "id" in mismatch ? mismatch.id! : operationId;
      assert.equal(await app.readCompletedProductionPrivateWorkspaceImport(id), null);
      const diagnostic = await app.diagnoseCompletedProductionPrivateWorkspaceImport(id) as { canonicalReader: { matched: boolean; excludedBy: string[] } };
      assert.equal(diagnostic.canonicalReader.matched, false);
      assert.ok(diagnostic.canonicalReader.excludedBy.includes(mismatch.excluded));
      outcomes.push({ scenario: mismatch.name, diagnostic });
    });

    await t.test("real SQL missing-table failure is a safe API reason, never an absent row", async () => {
      await reset(db);
      await db.exec(`DROP TABLE ${names[3]}`);
      await assert.rejects(app.readCompletedProductionPrivateWorkspaceImport(operationId), { code: "42P01" });
      const result = await response();
      assert.equal(result.status, 503);
      assert.deepEqual(result.body, { error: "OWNER_RESTORATION_DIAGNOSTIC_REQUIRED_TABLE_UNAVAILABLE" });
      await display(result.body.error, "failure");
      outcomes.push({ scenario: "sql-error", status: result.status, body: result.body });
    });

    await t.test("route authentication and input rejection make no SQL calls", async () => {
      const count = queries.length;
      assert.equal((await app.sdkGET(new Request(`http://isolated.invalid${sdkPath}`))).status, 403);
      assert.equal((await app.adminGET(new Request(`http://isolated.invalid${adminPath}?extra=1`))).status, 400);
      app.setAdmin(false);
      assert.equal((await app.adminGET(new Request(`http://isolated.invalid${adminPath}`))).status, 401);
      app.setAdmin(true);
      assert.equal(queries.length, count);
    });
    t.diagnostic(`PostgreSQL queries ${queries.length}; synthetic UI GET ${uiCalls}; in-process SDK calls ${internalCalls}; external requests 0`);
    if (process.env.T131_A6_SQL_EVIDENCE) writeFileSync(process.env.T131_A6_SQL_EVIDENCE, JSON.stringify({
      engine: version, driver: "PGlite 0.5.8 (PostgreSQL WASM, not Neon/network transport)",
      baseStoreSha256: process.env.T131_A6_BASE_STORE ? hash(readFileSync(process.env.T131_A6_BASE_STORE, "utf8")) : null,
      candidateStoreSha256: hash(readFileSync(storePath, "utf8")),
      queries, outcomes, externalRequests: 0,
      scope: "Real SQL and schema; real SDK and Platform GET handlers; actual service HMAC; stubbed Next Site Admin session; real decoder and React DOM via linkedom",
    }, null, 2) + "\n", { flag: "wx" });
  } finally {
    globalThis.fetch = previous.fetch;
    Object.assign(globalThis, { window: previous.window, document: previous.document });
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct;
    for (const key of ["APP_ENV", "VERCEL_GIT_COMMIT_REF", "SDK_ACCOUNT_LINK_SECRET", "SDK_DATABASE_URL"]) {
      if (previous.env[key] === undefined) delete process.env[key]; else process.env[key] = previous.env[key];
    }
    await db.close();
  }
});
