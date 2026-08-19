import type Database from 'better-sqlite3';
import type { UserRecord } from '../types.js';

interface UserRow {
  telegram_id: number;
  free_run_used: number;
  unlimited_access: number;
  balance_override: number | null;
  created_at: string;
}

function rowToUser(row: UserRow): UserRecord {
  return {
    telegramId: row.telegram_id,
    freeRunUsed: !!row.free_run_used,
    unlimitedAccess: !!row.unlimited_access,
    balanceOverride: row.balance_override,
    createdAt: row.created_at,
  };
}

export class UsersRepo {
  constructor(private db: Database.Database) {}

  getOrCreate(telegramId: number): UserRecord {
    const existing = this.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as
      | UserRow
      | undefined;
    if (existing) return rowToUser(existing);

    this.db.prepare('INSERT INTO users (telegram_id) VALUES (?)').run(telegramId);
    const created = this.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as UserRow;
    return rowToUser(created);
  }

  markRunUsed(telegramId: number): void {
    this.getOrCreate(telegramId);
    this.db.prepare('UPDATE users SET free_run_used = 1 WHERE telegram_id = ?').run(telegramId);
  }

  setUnlimited(telegramId: number, enabled: boolean): void {
    this.getOrCreate(telegramId);
    this.db.prepare('UPDATE users SET unlimited_access = ? WHERE telegram_id = ?').run(enabled ? 1 : 0, telegramId);
  }

  resetRun(telegramId: number): void {
    this.getOrCreate(telegramId);
    this.db.prepare('UPDATE users SET free_run_used = 0 WHERE telegram_id = ?').run(telegramId);
  }

  setBalanceOverride(telegramId: number, value: number | null): void {
    this.getOrCreate(telegramId);
    this.db.prepare('UPDATE users SET balance_override = ? WHERE telegram_id = ?').run(value, telegramId);
  }

  listAll(): UserRecord[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
    return rows.map(rowToUser);
  }
}
