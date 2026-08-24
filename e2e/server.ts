/**
 * Настоящее приложение поверх in-memory Postgres: подделан только Claude.
 * Поднимается автоматически из `playwright.config.ts` перед прогоном e2e,
 * в продакшн-путь не входит и `npm start` его не касается.
 *
 * Почему не мокать роуты: смысл e2e ровно в том, чтобы проверить контракт,
 * который отдаёт настоящий `buildApp` -- включая то, что закрытые поля не
 * покидают сервер. Заглушка на месте роутов проверяла бы саму себя.
 */
import crypto from 'node:crypto';
import { newDb } from 'pg-mem';
import { buildApp } from '../src/app.js';
import { initSchema, type Queryable } from '../src/db/db.js';
import { UsersRepo } from '../src/db/users.repo.js';
import { SignalsRepo } from '../src/db/signals.repo.js';
import { AdminsRepo } from '../src/db/admins.repo.js';

export const E2E_BOT_TOKEN = 'e2e-bot-token';
export const E2E_USER_ID = 555001;
const PORT = 4322;

/** То, что «возвращает Claude»: snake_case, как в настоящем tool-use ответе. */
const SIGNAL_FROM_CLAUDE = {
  trend: 'bullish',
  instrument: 'AUD/CHF',
  timeframe: 'M15',
  entry_price: 1.08234,
  stop_loss: 1.0791,
  take_profit_1: 1.0856,
  take_profit_2: 1.0879,
  take_profit_3: 1.0904,
  key_points: [{ text: 'Пробой подтверждён объёмом', status: 'ok' }],
  rationale: 'Цена закрепилась выше уровня сопротивления.',
};

const { Pool } = newDb().adapters.createPg();
const db = new Pool() as Queryable;
await initSchema(db);

const usersRepo = new UsersRepo(db);
const signalsRepo = new SignalsRepo(db);
const adminsRepo = new AdminsRepo(db);

let claudeCalls = 0;
const claude = {
  messages: {
    create: async () => {
      claudeCalls++;
      return { content: [{ type: 'tool_use', name: 'provide_signal', input: SIGNAL_FROM_CLAUDE }] };
    },
  },
} as never;

const app = buildApp({
  usersRepo,
  signalsRepo,
  adminsRepo,
  claude,
  botToken: E2E_BOT_TOKEN,
  ownerTelegramId: 1,
  targetUrl: 'https://t.me/example',
  versionInfo: { version: '0.0.0', commit: null, commitSource: null, startedAt: new Date().toISOString() },
});

/**
 * Пульт теста: выдать и отозвать доступ, обнулить состояние, посмотреть
 * счётчик вызовов Claude. Существует только в этом файле -- в приложении
 * такого роута нет.
 *
 * `reset=1` возвращает пользователя в состояние «первый раз открыл
 * приложение»: снимает доступ, возвращает тизер и стирает историю. Без этого
 * прогон был бы одноразовым -- второй запуск начинался бы с потраченным
 * тизером и падал, а сервер между запусками переиспользуется.
 */
app.get('/__control', async (req, res) => {
  const { grant, reset } = req.query as { grant?: string; reset?: string };
  if (reset === '1') {
    await usersRepo.resetRun(E2E_USER_ID);
    await usersRepo.setUnlimited(E2E_USER_ID, false);
    await db.query('DELETE FROM signals WHERE telegram_id = $1', [E2E_USER_ID]);
    claudeCalls = 0;
  }
  if (grant !== undefined) await usersRepo.setUnlimited(E2E_USER_ID, grant === '1');
  const user = await usersRepo.getOrCreate(E2E_USER_ID);
  res.json({ user, claudeCalls, signals: (await signalsRepo.listByUser(E2E_USER_ID, 50)).length });
});

/** Валидный `initData`, подписанный тем же алгоритмом, что проверяет middleware. */
app.get('/__initdata', (_req, res) => {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: E2E_USER_ID, first_name: 'E2E' }),
  };
  const pairs = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`);
  const secret = crypto.createHmac('sha256', 'WebAppData').update(E2E_BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  res.json({ initData: new URLSearchParams({ ...fields, hash }).toString() });
});

app.listen(PORT, () => console.log(`e2e backend on http://localhost:${PORT}/`));
