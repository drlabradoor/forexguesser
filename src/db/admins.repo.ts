import type Database from 'better-sqlite3';

export class AdminsRepo {
  constructor(private db: Database.Database) {}

  isAdmin(telegramId: number): boolean {
    const row = this.db.prepare('SELECT 1 FROM admins WHERE telegram_id = ?').get(telegramId);
    return !!row;
  }

  add(telegramId: number, addedBy: number | null): void {
    this.db.prepare('INSERT OR IGNORE INTO admins (telegram_id, added_by) VALUES (?, ?)').run(telegramId, addedBy);
  }

  listAll(): number[] {
    const rows = this.db.prepare('SELECT telegram_id FROM admins').all() as { telegram_id: number }[];
    return rows.map((r) => r.telegram_id);
  }
}
