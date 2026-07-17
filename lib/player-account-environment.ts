export function usesStrictAppDatabase(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.APP_DATABASE_URL?.trim());
}
