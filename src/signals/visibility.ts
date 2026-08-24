import type { LockedSignalView, StoredSignal, VisibleSignalView } from '../types.js';

/**
 * Единственное место, где решается, что видно без доступа. Оба роута --
 * /api/analyze и /api/signals -- обязаны проходить через него: две проверки
 * по месту разойдутся, и расхождение будет не разницей стиля, а дырой в
 * пейволле.
 *
 * Закрытый вид собирается по белому списку, а не удалением полей из копии:
 * при спреде новое поле в Signal утекло бы автоматически.
 */
export function forViewer(record: StoredSignal, hasAccess: boolean): LockedSignalView | VisibleSignalView {
  if (hasAccess) {
    return { id: record.id, createdAt: record.createdAt, locked: false, ...record.signal };
  }
  return {
    id: record.id,
    createdAt: record.createdAt,
    instrument: record.signal.instrument,
    timeframe: record.signal.timeframe,
    locked: true,
  };
}
