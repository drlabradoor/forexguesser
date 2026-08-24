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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  telegram_id BIGINT PRIMARY KEY,
  added_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signals (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signals_user_recent ON signals (telegram_id, created_at DESC);
`;

/**
 * TLS is driven entirely by the connection string: no `sslmode` means a plain
 * connection (what Bothost's internal Postgres serves), while an external
 * database that requires TLS is opted in with `?sslmode=require` in the URL.
 */
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

/**
 * Одноразовая уборка, а не раннер миграций: косметический баланс удалён
 * (спека 2026-08-24), а `CREATE TABLE IF NOT EXISTS` выше никогда не снесёт
 * колонку в базе, где она уже есть. Удалить это выражение отдельным коммитом
 * после первого успешного старта прода.
 */
export const LEGACY_CLEANUP_SQL = 'ALTER TABLE users DROP COLUMN IF EXISTS balance_override';

export async function initSchema(db: Queryable): Promise<void> {
  await db.query(SCHEMA_SQL);
  await db.query(LEGACY_CLEANUP_SQL);
}
