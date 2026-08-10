# SDK database migrations

SDK database migrations are operational changes. They are never part of a
Vercel build, `prebuild`, `next build`, Preview build, or application startup.

## Explicit execution only

The runner requires both an explicit target and an environment marker. It reads
only `SDK_DATABASE_URL`; generic `DATABASE_URL` and
`POSTGRES_PRISMA_URL` fallbacks are intentionally not accepted.

Development:

```sh
SDK_DATABASE_ENV=development SDK_DATABASE_URL=<development-url> \
  npm run sdk:migrate -- --environment development
```

Production:

```sh
SDK_DATABASE_ENV=production SDK_DATABASE_URL=<production-url> \
  npm run sdk:migrate -- --environment production
```

Read-only inspection uses the same explicit target and URL:

```sh
SDK_DATABASE_ENV=development SDK_DATABASE_URL=<development-url> \
  npm run sdk:migrate:status -- --environment development
SDK_DATABASE_ENV=production SDK_DATABASE_URL=<production-url> \
  npm run sdk:migrate:check -- --environment production
```

When Vercel context variables are present, the runner also requires the target
pair below. A mismatch fails closed; it is not skipped.

| Target | Vercel project | Branch | Database variable |
| --- | --- | --- | --- |
| development | `app-games-sdk-dev` | `develop` | development `SDK_DATABASE_URL` |
| production | `app-games-sdk` | `main` | production `SDK_DATABASE_URL` |

`app-games-sdk-preview`, `app-games-preview-dev`, the disabled duplicate Portal,
and the Platform projects are not migration targets.

The former `--deploy` mode is removed. A Vercel build cannot silently decide to
connect to a database, and `--deploy` now fails before URL resolution.

## Execution model

Migration files in `db/sdk` are ordered, consecutive, and append-only. The
runner verifies the checksum of every applied ledger row before doing any
change. Pending SQL migrations are applied in order, and the ledger table is
`sdk_schema_migrations`. Version 3's immutable-package backfill hook is part of
the versioned migration contract and may update existing rows.

The migration contract check rejects destructive SQL patterns such as `DROP`,
`TRUNCATE`, and `DELETE FROM`. That is a review gate, not an automatic rollback
mechanism.

Migration checksums use LF as their canonical line ending for both SQL and
versioned hook source. The runner normalizes CRLF and lone CR before hashing or
executing migration SQL, so the same migration ledger is valid from Windows,
macOS, Linux, and Vercel checkouts. `.gitattributes` also keeps the migration
contract files on LF, but checksum correctness does not depend on Git checkout
configuration.

## Failure and rollback policy

1. Take or verify a provider snapshot/restore point for the exact target before
   an apply operation, especially for production.
2. Run `--status` and `--check` against that same target before applying.
3. Apply once, in order, with the target-specific URL and marker.
4. If an apply fails, stop. Do not retry against another environment and do not
   edit the ledger manually.
5. Inspect the failure and ledger state read-only. If the provider supports it,
   restore the target snapshot or use a reviewed forward-fix migration. Existing
   applied migrations are not automatically reversed because DDL and backfill
   changes are not generally reversible.
6. Re-run only after the recovery decision and the exact target have been
   reviewed. Confirm the final version with `--check`.

The application may require the latest schema version at runtime, but it does
not create tables or apply migrations while serving requests. A migration
failure therefore blocks only the explicitly requested operational command;
normal Portal, SDK, and Preview builds remain database-free.
