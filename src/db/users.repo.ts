import type { Queryable } from './db.js';
import type { UserRecord } from '../types.js';

interface UserRow {
  telegram_id: number;
  free_run_used: boolean;
  unlimited_access: boolean;
  balance_override: number | null;
  created_at: Date | string;
}

function rowToUser(row: UserRow): UserRecord {
  return {
    telegramId: Number(row.telegram_id),
    freeRunUsed: !!row.free_run_used,
    unlimitedAccess: !!row.unlimited_access,
    balanceOverride: row.balance_override === null ? null : Number(row.balance_override),
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

  async resetRun(telegramId: number): Promise<void> {
    await this.getOrCreate(telegramId);
    await this.db.query('UPDATE users SET free_run_used = FALSE WHERE telegram_id = $1', [telegramId]);
  }

  async setBalanceOverride(telegramId: number, value: number | null): Promise<void> {
    await this.getOrCreate(telegramId);
    await this.db.query('UPDATE users SET balance_override = $1 WHERE telegram_id = $2', [value, telegramId]);
  }

  async listAll(): Promise<UserRecord[]> {
    const result = await this.db.query('SELECT * FROM users ORDER BY created_at DESC');
    return (result.rows as UserRow[]).map(rowToUser);
  }
}
