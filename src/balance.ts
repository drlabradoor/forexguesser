import crypto from 'node:crypto';

const MIN_BALANCE = 5000;
const MAX_BALANCE = 45000;

/**
 * The balance is cosmetic, but it must not move: the card is on screen
 * before the analysis starts, so a value re-rolled on every request would
 * visibly jump between app opens. Hashing the Telegram id gives a stable
 * per-user number without another column to store it in.
 */
export function generateBalance(telegramId: number): number {
  const digest = crypto.createHash('sha256').update(String(telegramId)).digest();
  const fraction = digest.readUInt32BE(0) / 0x1_0000_0000;
  return Math.round((MIN_BALANCE + fraction * (MAX_BALANCE - MIN_BALANCE)) * 100) / 100;
}
