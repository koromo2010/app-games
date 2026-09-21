import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import {
  handleVocabularySchemaDiagnostic, vocabularyReviewedQuery,
  type VocabularyDiagnosticDependencies,
} from '../lib/vocabulary-schema-diagnostic.ts';

const url = 'https://dev.game-fields.com/api/admin/vocabulary-schema';
function dependencies(overrides: Partial<VocabularyDiagnosticDependencies> = {}): VocabularyDiagnosticDependencies {
  return {
    authorize: async () => {}, authorizationError: () => null,
    environment: () => 'development', source: () => 'a'.repeat(40), configured: () => true,
    read: async () => { throw new Error('UNEXPECTED_DATABASE_ACCESS'); }, ...overrides,
  };
}

test('diagnostic SQL matches the actual word repository query and parameter order', () => {
  const source = readFileSync(new URL('../lib/reviewed-word-pool.ts', import.meta.url), 'utf8');
  const match = source.match(/const rows = await sql`([\s\S]*?)` as ReviewedWordRow/);
  assert.ok(match);
  const actual = match[1].replace('${input.pool}', '$1').replace('${difficulties}', '$2').replace('${safeLimit}', '$3');
  assert.equal(actual, vocabularyReviewedQuery);
});

test('authorization, recovery scope, environment and arbitrary input fail before database access', async () => {
  let reads = 0;
  const read = async () => { reads++; return []; };
  for (const [scope,status] of [['anonymous',401],['recovery',403]] as const) {
    const response = await handleVocabularySchemaDiagnostic(new Request(url), dependencies({
      read, authorize: async () => { throw new Error(scope); },
      authorizationError: () => Response.json({error:'DENIED'}, {status}),
    }));
    assert.equal(response.status,status); assert.match(response.headers.get('Cache-Control')!, /no-store/);
  }
  for (const environment of ['production','test']) {
    assert.equal((await handleVocabularySchemaDiagnostic(new Request(url), dependencies({read,environment:()=>environment}))).status,403);
  }
  assert.equal((await handleVocabularySchemaDiagnostic(new Request(url), dependencies({read,environment:()=>{throw new Error('mismatch');}}))).status,503);
  for (const request of [new Request(url+'?sql=DROP'),new Request(url,{method:'POST',body:'anything'})]) {
    assert.equal((await handleVocabularySchemaDiagnostic(request, dependencies({read}))).status,400);
  }
  assert.equal((await handleVocabularySchemaDiagnostic(new Request(url),dependencies({read,configured:()=>false}))).status,503);
  assert.equal(reads,0);
});

test('metadata and planning failures expose no raw exception, word row or query plan', async () => {
  const secret = 'postgresql://secret:password@private/word';
  const response = await handleVocabularySchemaDiagnostic(new Request(url),dependencies({
    read:async()=>{throw {code:'42703',message:secret,detail:secret,query:secret};},
  }));
  assert.equal(response.status,503); assert.equal((await response.clone().json()).schema.databaseCode,'42703');
  assert.ok(!(await response.text()).includes(secret));
  let calls = 0;
  const planned = await handleVocabularySchemaDiagnostic(new Request(url),dependencies({
    read:async()=>++calls===1 ? [] : [{'QUERY PLAN':secret}],
  }));
  assert.ok(!(await planned.text()).includes(secret));
});

test('production route uses full authorization and the existing client with read-only transaction options', async () => {
  const output = await build({
    stdin: { contents: `export {GET} from './app/api/admin/vocabulary-schema/route.ts';
      export {state} from '@/lib/site-admin-auth';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{name:'route-boundaries',setup(builder) {
      builder.onResolve({filter:/^@\/lib\/site-admin-auth$/},()=>({path:'auth',namespace:'fixture'}));
      builder.onLoad({filter:/^auth$/,namespace:'fixture'},()=>({loader:'js',contents:`
        export const state = {authorized:false,transactions:[]};
        export async function requireFullSiteAdminSession(){if(!state.authorized)throw new Error('denied');}
        export function siteAdminAuthorizationError(){return Response.json({error:'denied'},{status:403});}
      `}));
      builder.onResolve({filter:/^@\/lib\/vocabulary-postgres-store$/},()=>({path:'database',namespace:'fixture'}));
      builder.onLoad({filter:/^database$/,namespace:'fixture'},()=>({loader:'js',contents:`
        import {state} from '@/lib/site-admin-auth';
        export const isVocabularyPostgresConfigured=()=>true;
        export function getVocabularyPostgresClient(){
          const sql=(parts,...params)=>({query:parts.join('?'),params});
          sql.query=(query,params)=>({query,params});
          sql.transaction=async(queries,options)=>{state.transactions.push({queries,options});return [[],[]];};
          return sql;
        }
      `}));
      builder.onResolve({filter:/^@\//},args=>({path:resolve(process.cwd(),args.path.slice(2)+'.ts')}));
    }}],
  });
  const route = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
  const saved = {...process.env};
  try {
    Object.assign(process.env,{APP_ENV:'development',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'develop'});
    assert.equal((await route.GET(new Request(url))).status,403);
    assert.equal(route.state.transactions.length,0);
    route.state.authorized=true;
    assert.equal((await route.GET(new Request(url))).status,200);
    assert.equal(route.state.transactions.length,2);
    for(const transaction of route.state.transactions) {
      assert.deepEqual(transaction.options,{readOnly:true,arrayMode:false,fullResults:false});
      assert.match(transaction.queries[0].query,/set_config\('statement_timeout', '5000', true\)/);
      assert.match(transaction.queries[1].query.trim(),/^(WITH wanted|EXPLAIN \(COSTS OFF\))/);
    }
    Object.assign(process.env,{APP_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'});
    assert.equal((await route.GET(new Request(url))).status,403);
    assert.equal(route.state.transactions.length,2);
  } finally {
    for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key];
    Object.assign(process.env,saved);
  }
});

test('actual PostgreSQL metadata identifies each missing reference without guessing pool', async t => {
  const db = new PGlite();
  t.after(()=>db.close());
  const read: VocabularyDiagnosticDependencies['read'] = async (query,params) => {
    await db.exec('BEGIN READ ONLY');
    try {
      await db.query("SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true)");
      return (await db.query<Record<string, unknown>>(query,params)).rows;
    } finally { await db.exec('ROLLBACK'); }
  };
  const columns = {
    active_words: {id:'uuid',surface:'text',normalized_surface:'text',reading:'text'},
    word_pool_memberships: {word_id:'uuid',pool:'text',difficulty:'text'},
  };
  for (const missing of [null,...Object.entries(columns).flatMap(([relation,cols])=>Object.keys(cols).map(column=>({relation,column})))]) {
    await t.test(missing ? `${missing.relation}.${missing.column}` : 'complete UUID/text contract',async()=>{
      await db.exec('DROP TABLE IF EXISTS active_words,word_pool_memberships');
      for (const [relation,cols] of Object.entries(columns)) {
        await db.exec(`CREATE TABLE ${relation} (${Object.entries(cols).filter(([column])=>!(missing?.relation===relation&&missing.column===column)).map(([name,type])=>`${name} ${type}`).join(',')})`);
      }
      const response=await handleVocabularySchemaDiagnostic(new Request(url),dependencies({read}));
      assert.equal(response.status,200);
      const body=await response.json();
      if(missing) {
        assert.deepEqual(body.schema.relations.find((r:{relation:string})=>r.relation===missing.relation).missingRequiredColumns,[missing.column]);
        assert.equal(body.query.databaseCode,'42703');
      } else {
        assert.ok(body.schema.relations.every((r:{missingRequiredColumns:string[]})=>r.missingRequiredColumns.length===0));
        assert.equal(body.query.outcome,'planned');
      }
    });
  }
  await t.test('read-only transaction rejects writes',async()=>{
    await assert.rejects(read('INSERT INTO active_words DEFAULT VALUES',[]),(e:unknown)=>(e as {code:string}).code==='25006');
  });
});
