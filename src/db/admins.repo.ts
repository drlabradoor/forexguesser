import type { Queryable } from './db.js';

export class AdminsRepo {
  constructor(private db: Queryable) {}

  async isAdmin(telegramId: number): Promise<boolean> {
    const result = await this.db.query('SELECT 1 FROM admins WHERE telegram_id = $1', [telegramId]);
    return result.rows.length > 0;
  }

  async add(telegramId: number, addedBy: number | null): Promise<void> {
    await this.db.query(
      'INSERT INTO admins (telegram_id, added_by) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
      [telegramId, addedBy]
    );
  }

  async listAll(): Promise<number[]> {
    const result = await this.db.query('SELECT telegram_id FROM admins');
    return (result.rows as { telegram_id: number }[]).map((r) => Number(r.telegram_id));
  }
}
