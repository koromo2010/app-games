import { requireFullSiteAdminSession, siteAdminAuthorizationError } from '@/lib/site-admin-auth';
import { assertRuntimeEnvironmentAgreement } from '@/lib/storage-environment-guard';
import { getVocabularyPostgresClient, isVocabularyPostgresConfigured } from '@/lib/vocabulary-postgres-store';
import { handleVocabularySchemaDiagnostic } from '@/lib/vocabulary-schema-diagnostic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return handleVocabularySchemaDiagnostic(request, {
    authorize: requireFullSiteAdminSession,
    authorizationError: siteAdminAuthorizationError,
    environment: assertRuntimeEnvironmentAgreement,
    source: () => process.env.VERCEL_GIT_COMMIT_SHA,
    configured: isVocabularyPostgresConfigured,
    read: async (query, parameters) => {
      const sql = getVocabularyPostgresClient();
      // Session settings are transaction-local. Shared data and settings are unchanged.
      const results = await sql.transaction([
        sql`SELECT set_config('statement_timeout', '5000', true), set_config('lock_timeout', '1000', true)`,
        sql.query(query, parameters),
      ], { readOnly: true, arrayMode: false, fullResults: false });
      return results[1] as Record<string, unknown>[];
    },
  });
}
