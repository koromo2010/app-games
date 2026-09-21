/** Fixed read-only inspection of the same relations used by reviewed-word-pool. */
export const vocabularySchemaQuery = `
WITH wanted(name) AS (VALUES ('active_words'), ('word_pool_memberships'))
SELECT wanted.name AS relation, c.oid IS NOT NULL AS present,
       CASE WHEN c.oid IS NOT NULL THEN has_table_privilege(c.oid, 'SELECT') END AS can_select,
       a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS column_type
FROM wanted
LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass(wanted.name)
LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY wanted.name, a.attnum`;

// Regression test requires this SQL to match the deployed repository template.
export const vocabularyReviewedQuery = `
      WITH ranked AS (
        SELECT word.id, word.surface, word.normalized_surface, word.reading,
               membership.difficulty,
               ROW_NUMBER() OVER (
                 PARTITION BY membership.difficulty, word.normalized_surface
                 ORDER BY word.id
               ) AS surface_order
        FROM active_words word
        JOIN word_pool_memberships membership
          ON membership.word_id = word.id
        WHERE membership.pool = $1
          AND membership.difficulty = ANY($2::text[])
      ), limited AS (
        SELECT id, surface, normalized_surface, reading, difficulty,
               ROW_NUMBER() OVER (
                 PARTITION BY difficulty ORDER BY id
               ) AS difficulty_order
        FROM ranked
        WHERE surface_order = 1
      )
      SELECT id, surface, normalized_surface, reading, difficulty
      FROM limited
      WHERE difficulty_order <= $3
      ORDER BY difficulty, id
    `;

const requiredColumns = {
  active_words: ['id', 'surface', 'normalized_surface', 'reading'],
  word_pool_memberships: ['word_id', 'pool', 'difficulty'],
} as const;

type Read = (query: string, parameters: unknown[]) => Promise<Record<string, unknown>[]>;
export type VocabularyDiagnosticDependencies = {
  authorize(): Promise<unknown>;
  authorizationError(error: unknown): Response | null;
  environment(): string;
  source(): string | undefined;
  configured(): boolean;
  read: Read;
};

function safeFailure(error: unknown) {
  const fields = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const databaseCode = typeof fields.code === 'string' && /^[0-9A-Z]{5}$/.test(fields.code) ? fields.code : undefined;
  return { outcome: 'failed' as const, databaseCode };
}

function safeMetadata(rows: Record<string, unknown>[]) {
  return Object.entries(requiredColumns).map(([relation, required]) => {
    const entries = rows.filter(row => row.relation === relation);
    const columns = entries.flatMap(row => {
      const name = row.column_name;
      const type = row.column_type;
      return typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name)
        ? [{ name, type: typeof type === 'string' && /^[a-zA-Z0-9_ .(),[\]"]{1,128}$/.test(type) ? type : 'other' }]
        : [];
    });
    return {
      relation, present: entries.some(row => row.present === true),
      canSelect: entries.some(row => row.can_select === true), columns,
      missingRequiredColumns: required.filter(name => !columns.some(column => column.name === name)),
    };
  });
}

export async function handleVocabularySchemaDiagnostic(request: Request, deps: VocabularyDiagnosticDependencies) {
  const headers = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  try {
    await deps.authorize();
  } catch (error) {
    const response = deps.authorizationError(error);
    if (response) {
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      return response;
    }
    return reply({ error: 'ADMIN_AUTH_REQUIRED' }, 401);
  }
  try {
    if (deps.environment() !== 'development') return reply({ error: 'DEVELOPMENT_ONLY' }, 403);
  } catch {
    return reply({ error: 'RUNTIME_ENVIRONMENT_UNAVAILABLE' }, 503);
  }
  // This endpoint accepts no caller-controlled SQL, identifiers or connection.
  if (request.method !== 'GET' || new URL(request.url).search || request.body !== null) {
    return reply({ error: 'DIAGNOSTIC_INPUT_NOT_ALLOWED' }, 400);
  }
  if (!deps.configured()) return reply({ error: 'VOCABULARY_STORE_NOT_CONFIGURED' }, 503);
  const source = deps.source();
  const identity = { environment: 'development', source: source && /^[a-f0-9]{40}$/.test(source) ? source : null };
  let relations;
  try {
    relations = safeMetadata(await deps.read(vocabularySchemaQuery, []));
  } catch (error) {
    return reply({ ...identity, schema: safeFailure(error) }, 503);
  }
  let query;
  try {
    // EXPLAIN without ANALYZE never executes the word draw. Discard plan text.
    await deps.read('EXPLAIN (COSTS OFF) ' + vocabularyReviewedQuery, ['general', ['easy', 'normal', 'hard'], 500]);
    query = { outcome: 'planned' as const };
  } catch (error) {
    query = safeFailure(error);
  }
  return reply({ ...identity, schema: { outcome: 'read', relations }, query });
}
