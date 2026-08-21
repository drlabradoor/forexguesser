import { newDb } from 'pg-mem';
import { initSchema, type Queryable } from '../../src/db/db.js';

/**
 * An in-memory Postgres backed by pg-mem, schema already applied.
 * Each call returns an isolated database.
 */
export async function createTestDb(): Promise<Queryable> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as Queryable;
  await initSchema(pool);
  return pool;
}
