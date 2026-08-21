import type { AdminsRepo } from '../db/admins.repo.js';
import { createTelegramApi, type TelegramUpdate } from './api.js';

export interface BotDeps {
  sendMessage: (chatId: number, text: string, replyMarkup?: unknown) => Promise<unknown>;
  isAdmin: (telegramId: number) => boolean;
  appUrl: string;
}

function webAppButton(text: string, url: string) {
  return { inline_keyboard: [[{ text, web_app: { url } }]] };
}

export async function routeUpdate(update: TelegramUpdate, deps: BotDeps): Promise<void> {
  const message = update.message;
  if (!message?.text) return;
  const chatId = message.chat.id;
  const fromId = message.from.id;

  if (message.text.startsWith('/start')) {
    await deps.sendMessage(
      chatId,
      'Загрузи скриншот графика — получишь торговый сигнал.',
      webAppButton('Открыть анализатор', deps.appUrl)
    );
  } else if (message.text.startsWith('/id')) {
    await deps.sendMessage(chatId, `Твой Telegram ID: ${fromId}`);
  } else if (message.text.startsWith('/admin')) {
    if (deps.isAdmin(fromId)) {
      await deps.sendMessage(chatId, 'Админ-панель:', webAppButton('Открыть админку', `${deps.appUrl}/admin.html`));
    }
  }
}

export function createBotPoller(botToken: string, appUrl: string, adminsRepo: AdminsRepo) {
  const api = createTelegramApi(botToken);
  let offset = 0;
  let running = false;

  const deps: BotDeps = {
    sendMessage: api.sendMessage,
    isAdmin: (id: number) => adminsRepo.isAdmin(id),
    appUrl,
  };

  async function pollLoop() {
    while (running) {
      try {
        const updates = await api.getUpdates(offset);
        for (const update of updates) {
          offset = update.update_id + 1;
          await routeUpdate(update, deps);
        }
      } catch (err) {
        console.error('Bot poll error:', err);
      }
    }
  }

  return {
    start() {
      running = true;
      void pollLoop();
    },
    stop() {
      running = false;
    },
  };
}
