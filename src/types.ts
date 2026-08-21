export interface KeyPoint {
  text: string;
  status: 'ok' | 'warn';
}

export interface Signal {
  trend: 'bullish' | 'bearish' | 'neutral';
  instrument: string | null;
  timeframe: string | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
  keyPoints: KeyPoint[];
  rationale: string;
}

export interface UserRecord {
  telegramId: number;
  freeRunUsed: boolean;
  unlimitedAccess: boolean;
  balanceOverride: number | null;
  createdAt: string;
}

export interface TelegramUser {
  id: number;
  firstName: string;
  username?: string;
  photoUrl?: string;
}
