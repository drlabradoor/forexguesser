const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from: { id: number };
    text?: string;
  };
}

export function createTelegramApi(botToken: string) {
  const base = `${TELEGRAM_API_BASE}${botToken}`;

  async function call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const json = (await response.json()) as { ok: boolean; result: T; description?: string };
    if (!json.ok) {
      throw new Error(`Telegram API error in ${method}: ${json.description}`);
    }
    return json.result;
  }

  return {
    sendMessage: (chatId: number, text: string, replyMarkup?: unknown) =>
      call('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup }),
    getUpdates: (offset: number) => call<TelegramUpdate[]>('getUpdates', { offset, timeout: 30 }),
  };
}
