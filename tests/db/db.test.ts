import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import { initSchema, LEGACY_CLEANUP_SQL, type Queryable } from '../../src/db/db.js';

function memPool(): Queryable {
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as Queryable;
}

/**
 * Колонки читаются из настоящей строки, а не из information_schema:
 * поддержка information_schema в pg-mem неполная, и тест падал бы по причине,
 * не связанной с проверяемым поведением.
 */
async function userColumns(db: Queryable): Promise<string[]> {
  await db.query('INSERT INTO users (telegram_id) VALUES (1) ON CONFLICT (telegram_id) DO NOTHING');
  const result = await db.query('SELECT * FROM users WHERE telegram_id = 1');
  return Object.keys(result.rows[0]);
}

/** Форма таблицы до спеки 2026-08-24, дословно, но без `IF NOT EXISTS`. */
const LEGACY_USERS_SQL = `CREATE TABLE users (
  telegram_id BIGINT PRIMARY KEY,
  free_run_used BOOLEAN NOT NULL DEFAULT FALSE,
  unlimited_access BOOLEAN NOT NULL DEFAULT FALSE,
  balance_override DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

describe('initSchema', () => {
  it('creates users without a balance_override column', async () => {
    const db = memPool();
    await initSchema(db);
    expect(await userColumns(db)).not.toContain('balance_override');
  });
});

/**
 * Проверяется сам сносящий statement, а не `initSchema` целиком: pg-mem
 * бросает "Not supported" на `CREATE TABLE IF NOT EXISTS`, если таблица уже
 * есть, поэтому прогнать `initSchema` дважды или поверх старой схемы в тестах
 * невозможно. Настоящий Postgres это умеет, и именно так прод и работает --
 * непокрытым остаётся только `IF NOT EXISTS`, а необратимая часть покрыта.
 */
describe('LEGACY_CLEANUP_SQL', () => {
  it('drops balance_override left behind by the older schema', async () => {
    const db = memPool();
    await db.query(LEGACY_USERS_SQL);
    await db.query(LEGACY_CLEANUP_SQL);
    expect(await userColumns(db)).not.toContain('balance_override');
  });

  it('is a no-op when the column is already gone', async () => {
    const db = memPool();
    await initSchema(db);
    await db.query(LEGACY_CLEANUP_SQL);
    expect(await userColumns(db)).not.toContain('balance_override');
  });
});
