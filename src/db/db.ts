import pg from 'pg';

/**
 * Minimal surface both a real `pg.Pool` and pg-mem's test adapter satisfy,
 * so repositories can be constructed against either.
 */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
}

// Telegram IDs arrive as BIGINT. node-postgres returns those as strings by
// default; every id we store fits comfortably inside a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number(value));

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  free_run_used BOOLEAN NOT NULL DEFAULT FALSE,
  unlimited_access BOOLEAN NOT NULL DEFAULT FALSE,
  balance_override DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  telegram_id BIGINT PRIMARY KEY,
  added_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * TLS is driven entirely by the connection string: no `sslmode` means a plain
 * connection (what Bothost's internal Postgres serves), while an external
 * database that requires TLS is opted in with `?sslmode=require` in the URL.
 */
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

export async function initSchema(db: Queryable): Promise<void> {
  await db.query(SCHEMA_SQL);
}
