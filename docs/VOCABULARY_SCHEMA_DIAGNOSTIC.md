# Vocabulary schema read-only diagnostic

Development Site Admin can open `/api/admin/vocabulary-schema` using the existing
full Site Admin session. Recovery-only and anonymous sessions are denied. The
runtime environment agreement guard must resolve to `development`; Production
and inconsistent configuration are denied before any database call.

The GET accepts no query, body, SQL, relation name or connection parameter. It uses
the same `getVocabularyPostgresClient()` as the games. No connection URL is read
back or exposed, and no new environment variable or binding is needed.

Two fixed, read-only transactions inspect the resolved `active_words` and
`word_pool_memberships` catalog columns, then EXPLAIN the current reviewed query
without ANALYZE. Statement/lock timeouts are transaction-local (5s/1s). Output
contains source SHA, relation presence, SELECT privilege, column names/types,
missing required columns and safe SQLSTATE only. Query plans, raw external errors,
vocabulary rows, defaults, credentials, hostnames and connection URLs are omitted.
Responses, including failures, are not cached.

The exact query comparison regression test prevents diagnostic SQL drift from
`reviewed-word-pool.ts`. Metadata and plan are separate transactions so a plan
failure does not discard column evidence. They are not an atomic schema snapshot;
concurrent schema changes require reconciling the observations.

A missing required column identifies an unresolved reference in the current
query. Do not add columns or reimport data on that basis: reconcile the authoritative
sync schema and apply the smallest repository mapping correction. A successful
plan proves neither data availability nor successful game starts. Preserve reviewed
membership, difficulty, deduplication and history policies during any later fix.

T-201 evidence: the user supplied SQLSTATE 42703 for development source
618faf15da0c at 2026-09-21 18:52:12.996 JST, operation reviewed-query. This does
not supply SQLSTATE observations for the other five failed acceptance conditions.
