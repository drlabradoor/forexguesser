export interface Signal {
  trend: 'bullish' | 'bearish' | 'neutral';
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  takeProfit3: number;
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
}
