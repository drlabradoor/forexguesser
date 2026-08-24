import type { Queryable } from './db.js';
import type { Signal, StoredSignal } from '../types.js';

interface SignalRow {
  id: number | string;
  telegram_id: number | string;
  payload: string;
  created_at: Date | string;
}

function rowToStored(row: SignalRow): StoredSignal {
  return {
    id: Number(row.id),
    telegramId: Number(row.telegram_id),
    signal: JSON.parse(row.payload) as Signal,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export class SignalsRepo {
  constructor(private db: Queryable) {}

  async save(telegramId: number, signal: Signal): Promise<StoredSignal> {
    const result = await this.db.query(
      'INSERT INTO signals (telegram_id, payload) VALUES ($1, $2) RETURNING id, telegram_id, payload, created_at',
      [telegramId, JSON.stringify(signal)]
    );
    return rowToStored(result.rows[0] as SignalRow);
  }

  /**
   * Порядок доопределяется по id: три разбора подряд попадают в одну
   * миллисекунду, и сортировки только по created_at недостаточно.
   */
  async listByUser(telegramId: number, limit: number): Promise<StoredSignal[]> {
    const result = await this.db.query(
      `SELECT id, telegram_id, payload, created_at
         FROM signals
        WHERE telegram_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [telegramId, limit]
    );
    return (result.rows as SignalRow[]).map(rowToStored);
  }
}
