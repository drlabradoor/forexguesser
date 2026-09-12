import type { Queryable } from './db.js';
import type { UserRecord } from '../types.js';

interface UserRow {
  telegram_id: number;
  free_run_used: boolean;
  unlimited_access: boolean;
  demo_mode: boolean;
  created_at: Date | string;
}

function rowToUser(row: UserRow): UserRecord {
  return {
    telegramId: Number(row.telegram_id),
    freeRunUsed: !!row.free_run_used,
    unlimitedAccess: !!row.unlimited_access,
    demoMode: !!row.demo_mode,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export class UsersRepo {
  constructor(private db: Queryable) {}

  async getOrCreate(telegramId: number): Promise<UserRecord> {
    await this.db.query('INSERT INTO users (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING', [
      telegramId,
    ]);
    const result = await this.db.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    return rowToUser(result.rows[0] as UserRow);
  }

  async markRunUsed(telegramId: number): Promise<void> {
    await this.getOrCreate(telegramId);
    await this.db.query('UPDATE users SET free_run_used = TRUE WHERE telegram_id = $1', [telegramId]);
  }

  async setUnlimited(telegramId: number, enabled: boolean): Promise<void> {
    await this.getOrCreate(telegramId);
    await this.db.query('UPDATE users SET unlimited_access = $1 WHERE telegram_id = $2', [enabled, telegramId]);
  }

  async setDemoMode(telegramId: number, enabled: boolean): Promise<void> {
    await this.getOrCreate(telegramId);
    await this.db.query('UPDATE users SET demo_mode = $1 WHERE telegram_id = $2', [enabled, telegramId]);
  }

  async resetRun(telegramId: number): Promise<void> {
    await this.getOrCreate(telegramId);
    await this.db.query('UPDATE users SET free_run_used = FALSE WHERE telegram_id = $1', [telegramId]);
  }

  async listAll(): Promise<UserRecord[]> {
    const result = await this.db.query('SELECT * FROM users ORDER BY created_at DESC');
    return (result.rows as UserRow[]).map(rowToUser);
  }
}
