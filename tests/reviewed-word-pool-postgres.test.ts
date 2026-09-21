import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import type { ReviewedWordRecord } from "../lib/reviewed-word-pool.ts";

const root = process.cwd();
const bands = ["easy", "normal", "hard"] as const;
type Band = typeof bands[number];
type Event = { fields: { errorCode?: string; databaseCode?: string; operation?: string } };
type Harness = {
  setQuery(query: (sql: string, params: unknown[]) => Promise<unknown[]>): void;
  setHistory(history: string[][], error?: unknown): void;
  events: Event[];
  loadReviewedWordPoolRecords: typeof import("../lib/reviewed-word-pool.ts").loadReviewedWordPoolRecords;
  loadGeneralGameWordRecords: typeof import("../lib/general-game-word-repository.ts").loadGeneralGameWordRecords;
  drawGameContentWords: typeof import("../lib/game-content-source.ts").drawGameContentWords;
  prepareGeneralGameWordDraw: typeof import("../lib/general-game-word-history-store.ts").prepareGeneralGameWordDraw;
  loadCodeInterceptWordPool: typeof import("../lib/code-intercept-word-repository.ts").loadCodeInterceptWordPool;
  loadNigoichiWordPool: typeof import("../lib/nigoichi-word-repository.ts").loadNigoichiWordPool;
  createGameFieldsSdkContentSource: typeof import("../lib/game-sdk-content-source.ts").createGameFieldsSdkContentSource;
};

async function harness(): Promise<Harness> {
  const output = await build({
    stdin: {
      contents: [
        ...["reviewed-word-pool", "general-game-word-repository", "game-content-source",
          "general-game-word-history-store", "code-intercept-word-repository",
          "nigoichi-word-repository", "game-sdk-content-source"].map(name => `export * from './lib/${name}.ts';`),
        "export {setQuery} from '@neondatabase/serverless';",
        "export {setHistory} from './lib/redis-store.ts';",
        "export {events} from './lib/observability/sink.ts';",
      ].join("\n"), resolveDir: root, loader: "ts",
    },
    bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
    plugins: [{ name: "isolated-transports", setup(builder) {
      builder.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: "neon", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        let query;
        export function setQuery(value) { query = value; }
        export function neon() { return (parts, ...params) => {
          const sql = parts.reduce((s, part, i) => s + (i ? '$' + i : '') + part, '');
          return query(sql, params);
        }; }
      `, loader: "js" }));
      builder.onResolve({ filter: /^@game-fields\/game-sdk\/content-source$/ }, () => ({ path: resolve(root, "packages/game-sdk/src/content-source.ts") }));
      builder.onLoad({ filter: /\/redis-store\.ts$/ }, () => ({ contents: `
        let history = [], failure;
        export function setHistory(value, error) { history = value; failure = error; }
        export async function redisPipeline() { if (failure) throw failure; return history; }
        export async function redisCommand() { throw new Error('UNEXPECTED_REDIS_WRITE'); }
      `, loader: "js" }));
      // Keep the production logger and sanitizer; only replace its final storage sink.
      builder.onLoad({ filter: /\/observability\/sink\.ts$/ }, () => ({ contents: `
        export const events = [];
        export function getObservabilitySink() { return {emit(event) { events.push(event); }}; }
        export function reportObservabilitySinkFailure() { throw new Error('UNEXPECTED_SINK_FAILURE'); }
      `, loader: "js" }));
      if (process.env.T201_BASELINE_REVIEWED_SOURCE) {
        builder.onLoad({ filter: /\/reviewed-word-pool\.ts$/ }, ({path}) => ({
          contents: readFileSync(process.env.T201_BASELINE_REVIEWED_SOURCE!, "utf8"),
          loader: "ts", resolveDir: resolve(path, ".."),
        }));
      }
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0]!.text).toString("base64")}`);
}

function counts(rows: readonly ReviewedWordRecord[]) {
  return Object.fromEntries(bands.map(b => [b, rows.filter(r => r.difficulty === b).length]));
}

test("reviewed word SQL and shared consumers on isolated PostgreSQL", async t => {
  const original = { ...process.env };
  // Synthetic configuration; the driver is replaced before this URL can be used.
  process.env.NODE_ENV = "test";
  process.env.VOCABULARY_DATABASE_URL = "postgresql://fixture:fixture@invalid/fixture";
  delete process.env.SHARED_VOCABULARY_DATABASE_URL;
  delete process.env.PLAYER_SESSION_SECRET;
  delete process.env.LLM_SESSION_SECRET;
  process.env.OBSERVABILITY_LOG_LEVEL = "info";
  const db = new PGlite();
  t.after(async () => {
    await db.close();
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  });
  const app = await harness();
  let queries = 0;
  const execute = async (sql: string, params: unknown[]) => {
    queries++;
    assert.match(sql.trim(), /^WITH\s/i, "product transport must execute SELECT CTEs only");
    return (await db.query(sql, params)).rows;
  };
  app.setQuery(execute);
  async function reset(distribution: [number, number, number], copies = 1) {
    await db.exec(`DROP VIEW IF EXISTS active_words; DROP TABLE IF EXISTS words, word_pool_memberships, active_word_game_eligibility;
      CREATE TABLE words(id text PRIMARY KEY, surface text, normalized_surface text, reading text, active boolean);
      CREATE VIEW active_words AS SELECT id, surface, normalized_surface, reading FROM words WHERE active;
      CREATE TABLE word_pool_memberships(word_id text, pool text, difficulty text);
      CREATE TABLE active_word_game_eligibility(subject_type text, subject_id text, game_id text, difficulty text, valid_from timestamptz, valid_until timestamptz);`);
    for (const [index, band] of bands.entries()) {
      await db.query(`INSERT INTO words SELECT $1 || '-' || lpad(n::text, 4, '0') || '-' || c,
        $1 || '-' || n, $1 || '-' || n, NULL, true
        FROM generate_series(1, $2::int) n CROSS JOIN generate_series(1, $3::int) c`, [band, distribution[index], copies]);
      await db.query(`INSERT INTO word_pool_memberships SELECT id, 'general', $1 FROM words WHERE id LIKE $1 || '-%'`, [band]);
    }
    app.setHistory([]); app.events.length = 0; app.setQuery(execute);
  }
  async function read(limit = 50) {
    await db.exec("BEGIN READ ONLY");
    try { return await app.loadReviewedWordPoolRecords({pool:"general", limitPerDifficulty:limit}); }
    finally { await db.exec("ROLLBACK"); }
  }

  await t.test("all bands above the limit remain independently populated", async () => {
    await reset([200,200,200]);
    assert.deepEqual(counts(await read()), {easy:50,normal:50,hard:50});
  });
  await t.test("skewed distribution does not starve normal after hard", async () => {
    await reset([20,200,200]);
    assert.deepEqual(counts(await read()), {easy:20,normal:50,hard:50});
  });
  await t.test("duplicates are removed before consuming each band quota", async () => {
    await reset([80,80,80], 4);
    const rows = await read();
    assert.deepEqual(counts(rows), {easy:50,normal:50,hard:50});
    assert.equal(new Set(rows.map(r => r.normalizedSurface)).size, 150);
    assert.ok(rows.every(r => r.id.endsWith("-1")));
  });
  await t.test("single difficulty and explicit pool never spill into another pool", async () => {
    await reset([80,80,80]);
    await db.exec("INSERT INTO word_pool_memberships SELECT word_id, 'proper-noun', difficulty FROM word_pool_memberships");
    for (const difficulty of bands) {
      const rows = await app.loadReviewedWordPoolRecords({pool:"proper-noun",difficulty,limitPerDifficulty:7});
      assert.equal(rows.length,7); assert.ok(rows.every(r => r.pool === "proper-noun" && r.difficulty === difficulty));
    }
    assert.equal((await app.loadReviewedWordPoolRecords({pool:"four-character-idiom"})).length,0);
  });
  await t.test("inactive and nonmember words remain excluded", async () => {
    await reset([20,20,20]);
    await db.exec("UPDATE words SET active=false WHERE id LIKE 'easy-%'; DELETE FROM word_pool_memberships WHERE difficulty='hard'");
    assert.deepEqual(counts(await read()), {easy:0,normal:20,hard:0});
  });
  await t.test("empty and genuinely short pools stay short and fail closed", async () => {
    await reset([0,0,0]); assert.deepEqual(counts(await read()), {easy:0,normal:0,hard:0});
    await assert.rejects(app.drawGameContentWords({pool:"general",difficulty:"easy",count:1}), /GAME_CONTENT_UNAVAILABLE/);
    await reset([2,2,2]); assert.deepEqual(counts(await read()), {easy:2,normal:2,hard:2});
    await assert.rejects(app.drawGameContentWords({pool:"general",difficulty:"easy",count:3}), /GAME_CONTENT_UNAVAILABLE/);
  });
  await t.test("both games' debug draws and normal-start word preparation use real SQL", async () => {
    await reset([200,200,200]);
    for (const difficulty of bands) {
      assert.equal((await app.loadCodeInterceptWordPool(10,difficulty)).length,10);
      assert.equal((await app.loadNigoichiWordPool(difficulty,10)).length,10);
      for (const game of ["code-intercept","nigoichi"] as const) {
        const result = await app.prepareGeneralGameWordDraw({game,playerIds:["synthetic"],difficulty,count:10,random:()=>0.75});
        assert.equal(result.words.length,10); assert.equal(new Set(result.words).size,10);
        assert.ok(result.words.every(w => w.startsWith(difficulty)));
        assert.equal(result.resetHistory,false);
      }
    }
  });
  await t.test("SDK default repository executes SQL and honors opaque exclusions", async () => {
    await reset([600,600,600]);
    assert.deepEqual(counts((await app.loadGeneralGameWordRecords()).map(r=>({...r,pool:"general"}))),{easy:500,normal:500,hard:500});
    const sdk = app.createGameFieldsSdkContentSource({random:()=>0.75});
    for (const difficulty of bands) {
      const words = await sdk.drawWords({pool:"general-words",difficulty,count:10});
      assert.equal(words.length,10); assert.ok(words.every(w => w.difficulty === difficulty));
      const next = await sdk.drawWords({pool:"general-words",difficulty,count:10,excludeIds:words.map(w=>w.id)});
      assert.ok(next.every(w => !words.some(old=>old.surface===w.surface)));
    }
  });
  await t.test("history exclusions stay enforced and only existing exhaustion reset applies", async () => {
    await reset([20,20,20]);
    app.setHistory([["easy-1","easy-2"]]);
    const request = {game:"code-intercept" as const,playerIds:["synthetic"],difficulty:"easy" as const,count:10,random:()=>0.75};
    const unseen = await app.prepareGeneralGameWordDraw(request);
    assert.equal(unseen.resetHistory,false); assert.ok(unseen.words.every(w=>w!=="easy-1" && w!=="easy-2"));
    app.setHistory([Array.from({length:20},(_,i)=>`easy-${i+1}`)]);
    assert.equal((await app.prepareGeneralGameWordDraw(request)).resetHistory,true);
    await assert.rejects(app.drawGameContentWords({pool:"general",difficulty:"easy",count:1,excludeSurfaces:Array.from({length:20},(_,i)=>`easy-${i+1}`)}),/GAME_CONTENT_UNAVAILABLE/);
    const all = await app.drawGameContentWords({pool:"general",difficulty:"easy",count:20});
    await assert.rejects(app.drawGameContentWords({pool:"general",difficulty:"easy",count:1,historyIds:all.map(w=>w.opaqueId)}),/GAME_CONTENT_UNAVAILABLE/);
  });
  await t.test("Redis read failure cannot become empty history or a DB failure", async () => {
    await reset([20,20,20]); const before = queries;
    const failure = new Error("PRIVATE_HISTORY_SENTINEL"); app.setHistory([],failure);
    await assert.rejects(app.prepareGeneralGameWordDraw({game:"nigoichi",playerIds:["synthetic"],difficulty:"easy",count:1}), e=>e===failure);
    assert.equal(queries,before);
    assert.equal(app.events.at(-1)?.fields.errorCode,"WORD_POOL_HISTORY_READ_FAILED");
    assert.doesNotMatch(JSON.stringify(app.events), /PRIVATE_HISTORY_SENTINEL|synthetic/);
  });
  await t.test("SQLSTATE access, schema and connection errors remain distinct and private", async () => {
    await reset([20,20,20]);
    for (const [code,expected] of [["42501","ACCESS"],["28P01","ACCESS"],["42703","SCHEMA"],["08006","CONNECTION"],["XX000","QUERY"]]) {
      const failure = Object.assign(new Error("PRIVATE_DB_SENTINEL postgresql://credential@host"),{code});
      app.events.length=0; app.setQuery(async()=>{throw failure;});
      await assert.rejects(app.loadReviewedWordPoolRecords({pool:"general"}), e=>e===failure);
      assert.equal(app.events.at(-1)?.fields.errorCode,`WORD_POOL_DATABASE_${expected}_FAILED`);
      assert.equal(app.events.at(-1)?.fields.databaseCode,code);
      assert.doesNotMatch(JSON.stringify(app.events),/PRIVATE_DB_SENTINEL|credential|postgresql/);
    }
  });
  await t.test("missing membership table uses only reviewed legacy eligibility", async () => {
    await reset([100,100,100]);
    await db.exec(`INSERT INTO active_word_game_eligibility
      SELECT 'word',word_id,flag,difficulty,NULL,NULL FROM word_pool_memberships
      CROSS JOIN LATERAL unnest(ARRAY['standard-game','general_game_pool','difficulty_'||difficulty]) flag;
      DROP TABLE word_pool_memberships;`);
    assert.deepEqual(counts((await app.loadGeneralGameWordRecords(7)).map(r=>({...r,pool:"general"}))),{easy:7,normal:7,hard:7});
    await db.exec("DELETE FROM active_word_game_eligibility WHERE game_id='difficulty_normal'");
    assert.deepEqual(counts((await app.loadGeneralGameWordRecords(7)).map(r=>({...r,pool:"general"}))),{easy:7,normal:0,hard:7});
    await db.exec("UPDATE active_word_game_eligibility SET valid_until=NOW()-INTERVAL '1 day' WHERE game_id='general_game_pool'");
    assert.equal((await app.loadGeneralGameWordRecords()).length,0);
  });
  await t.test("missing database configuration is not reported as an empty pool", async () => {
    delete process.env.VOCABULARY_DATABASE_URL; app.events.length=0;
    await assert.rejects(app.loadGeneralGameWordRecords(),/GENERAL_GAME_WORD_POOL_UNAVAILABLE/);
    assert.equal(app.events.at(-1)?.fields.errorCode,"WORD_POOL_NOT_CONFIGURED");
  });
});
