import type { AdminsRepo } from '../db/admins.repo.js';
import { createTelegramApi, type TelegramUpdate } from './api.js';

export interface BotDeps {
  sendMessage: (chatId: number, text: string, replyMarkup?: unknown) => Promise<unknown>;
  isAdmin: (telegramId: number) => Promise<boolean>;
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
    if (await deps.isAdmin(fromId)) {
      await deps.sendMessage(chatId, 'Админ-панель:', webAppButton('Открыть админку', `${deps.appUrl}/admin.html`));
    }
  }
}

/**
 * Pause after a failed poll, growing with consecutive failures and reset by
 * the first success.
 *
 * A successful getUpdates blocks for the full long-poll timeout, but a refusal
 * comes back in milliseconds -- Telegram's front end answers before the request
 * ever reaches the long-poll handler. Without a pause a single upstream hiccup
 * turns this loop into a hot one: measured at ~100 requests per second, which
 * floods the log and invites a 429 on top of the original error.
 */
const POLL_BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 30_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // A retry pause must not be the reason the process stays alive.
    timer.unref?.();
  });
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
    let failures = 0;
    while (running) {
      try {
        const updates = await api.getUpdates(offset);
        failures = 0;
        for (const update of updates) {
          offset = update.update_id + 1;
          await routeUpdate(update, deps);
        }
      } catch (err) {
        const delay = POLL_BACKOFF_MS[Math.min(failures, POLL_BACKOFF_MS.length - 1)];
        failures += 1;
        console.error(`Bot poll error (retrying in ${delay}ms):`, err);
        await sleep(delay);
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
