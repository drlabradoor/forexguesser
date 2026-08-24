import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBotPoller } from '../../src/telegram/bot.js';
import type { AdminsRepo } from '../../src/db/admins.repo.js';

const adminsRepo = { isAdmin: async () => false } as unknown as AdminsRepo;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ответ Telegram при отказе фронтенда: валидный JSON с `ok: false`, приходит
 * сразу, не дожидаясь long-poll. Задержка в 1 мс -- щедрая модель сетевого
 * round-trip (в реальности десятки миллисекунд); без неё цикл без паузы
 * выедает всю память на счётчиках за считанные секунды.
 */
function failingFetch() {
  const state = { calls: 0 };
  const fetchImpl = async () => {
    state.calls++;
    await sleep(1);
    return {
      json: async () => ({ ok: false, error_code: 502, description: 'Bad Gateway' }),
    } as unknown as Response;
  };
  return { state, fetchImpl };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createBotPoller under a failing Telegram API', () => {
  it('does not hammer the API when getUpdates keeps failing', async () => {
    const { state, fetchImpl } = failingFetch();
    vi.stubGlobal('fetch', fetchImpl);

    const poller = createBotPoller('token', 'https://example.com', adminsRepo);
    poller.start();
    await sleep(400);
    poller.stop();

    // Без паузы цикл делает сотни запросов за 400 мс. С паузой -- единицы.
    expect(state.calls).toBeLessThanOrEqual(2);
  });

  it('backs off further the longer the failure lasts', async () => {
    const { state, fetchImpl } = failingFetch();
    vi.stubGlobal('fetch', fetchImpl);

    const poller = createBotPoller('token', 'https://example.com', adminsRepo);
    poller.start();
    await sleep(1300);
    const firstWindow = state.calls;
    await sleep(1300);
    poller.stop();

    // Пауза растёт, поэтому во втором окне попыток строго меньше, чем в
    // первом. Нестрогое сравнение прошло бы и на сломанном коде: без паузы
    // окна одинаковые.
    expect(state.calls - firstWindow).toBeLessThan(firstWindow);
  });

  it('reports the error code so 502 is distinguishable from 409 and 401', async () => {
    const { fetchImpl } = failingFetch();
    vi.stubGlobal('fetch', fetchImpl);
    const logged: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      logged.push(args);
    });

    const poller = createBotPoller('token', 'https://example.com', adminsRepo);
    poller.start();
    await sleep(150);
    poller.stop();

    // 502 -- транзиентный сбой Telegram, ждём; 409 -- второй инстанс поллит
    // того же бота; 401 -- умер токен. Реакция разная, а в логе они были
    // неразличимы.
    expect(logged.flat().map(String).join(' ')).toContain('502');
  });
});
