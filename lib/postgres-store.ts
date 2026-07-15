import { neon } from "@neondatabase/serverless";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const postgresUrlEnvironmentNames = [
  "DATABASE_URL",
  "database_DATABASE_URL",
  "database_POSTGRES_URL",
  "POSTGRES_URL",
] as const;

type QueryRows = QueryResultRow[];
type QueryPromise = Promise<QueryRows>;

export type PostgresClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): QueryPromise;
  query(query: string, values?: unknown[]): QueryPromise;
  transaction(callback: (sql: PostgresClient) => QueryPromise[]): Promise<QueryRows[]>;
};

let client: PostgresClient | null = null;
let clientUrl = "";
let localPool: Pool | null = null;
let localPoolUrl = "";

function usesLocalTcpDriver(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

function compileTemplate(strings: TemplateStringsArray, values: unknown[]) {
  let text = strings[0];
  for (let index = 0; index < values.length; index += 1) {
    text += "$" + (index + 1) + strings[index + 1];
  }
  return { text, values };
}

type QueryExecutor = (text: string, values?: unknown[]) => Promise<{ rows: QueryRows }>;

function createTcpClient(execute: QueryExecutor, runTransaction?: PostgresClient["transaction"]): PostgresClient {
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = compileTemplate(strings, values);
    return (await execute(query.text, query.values)).rows;
  }) as PostgresClient;

  sql.query = async (query, values = []) => (await execute(query, values)).rows;
  sql.transaction = runTransaction ?? (async () => {
    throw new Error("POSTGRES_NESTED_TRANSACTION_NOT_SUPPORTED");
  });
  return sql;
}

function createLocalPostgresClient(url: string) {
  if (!localPool || localPoolUrl !== url) {
    localPool = new Pool({ connectionString: url, max: 4, allowExitOnIdle: true });
    localPoolUrl = url;
  }
  const pool = localPool;

  const runTransaction: PostgresClient["transaction"] = async (callback) => {
    const connection: PoolClient = await pool.connect();
    try {
      await connection.query("BEGIN");
      const transactionClient = createTcpClient((text, values) => connection.query(text, values));
      const rows = await Promise.all(callback(transactionClient));
      await connection.query("COMMIT");
      return rows;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  };

  return createTcpClient((text, values) => pool.query(text, values), runTransaction);
}

export function getPostgresConfig() {
  for (const name of postgresUrlEnvironmentNames) {
    const url = process.env[name]?.trim();
    if (url) return { name, url };
  }
  return null;
}

export function isPostgresConfigured() {
  return Boolean(getPostgresConfig());
}

export function getPostgresClient() {
  const config = getPostgresConfig();
  if (!config) throw new Error("POSTGRES_STORE_NOT_CONFIGURED");
  if (!client || clientUrl !== config.url) {
    client = usesLocalTcpDriver(config.url)
      ? createLocalPostgresClient(config.url)
      : neon(config.url) as unknown as PostgresClient;
    clientUrl = config.url;
  }
  return client;
}

export async function closePostgresClient() {
  if (localPool) await localPool.end();
  localPool = null;
  localPoolUrl = "";
  client = null;
  clientUrl = "";
}
