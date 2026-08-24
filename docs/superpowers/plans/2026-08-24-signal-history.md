# История сигналов и платный доступ — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть сигнал за платным доступом, сохранять каждый разбор по Telegram ID и показать историю в табе
«Сигналы».

**Architecture:** Правило «что видно без доступа» живёт в одном модуле `src/signals/visibility.ts`, через который
проходят оба роута — `/api/analyze` и `/api/signals`; закрытые поля не покидают бэкенд. Сигнал хранится целиком как
JSON в одной колонке `payload TEXT`. Карточка результата выносится в переиспользуемый рендерер и работает и в
разборе, и в истории.

**Tech Stack:** Node 22, Express 4, Postgres (`pg`), pg-mem + Vitest + supertest в тестах, TypeScript
(`tsc --noEmit`), фронтенд — ванильный JS с ES-модулями (сборки нет, требование платформы Bothost).

**Spec:** [docs/superpowers/specs/2026-08-24-signal-history-design.md](../specs/2026-08-24-signal-history-design.md)

## Global Constraints

- **Реализация начинается после мержа `feature/disclaimer-desktop`.** Этот план правит те же файлы (`app.js`,
  `screenshot.js`, `style.css`, `SCHEMA_SQL`), и параллельная работа даст конфликты на ровном месте.
- **Закрытие серверное.** Без доступа `trend`, `entryPrice`, `stopLoss`, `takeProfit1..3`, `keyPoints`, `rationale`
  **не попадают в HTTP-ответ**. Клиентское скрытие поверх полного ответа — не пейволл.
- **Закрытый вид строится по белому списку**, а не удалением полей из копии. `delete view.trend` после спреда —
  запрещённый приём: новое поле в `Signal` автоматически утечёт.
- **Три состояния доступа:** доступ есть → всё открыто; доступа нет и тизер не потрачен → разбор выполняется, ответ
  закрыт; доступа нет и тизер потрачен → `403 NO_ACCESS`, Claude не вызывается.
- **`FREE_RUN_LIMIT_ENABLED` удаляется.** Лимит больше не отключается ничем.
- **Скриншоты не сохраняются** ни в БД, ни на диск.
- **История:** последние 50, новые сверху, содержимое проверяется на каждом чтении (отзыв доступа закрывает её
  обратно).
- **Язык интерфейса — русский**, тема тёмная, палитра из спеки 21.08, мобильная раскладка и брейкпоинты 600/1000 из
  спеки 24.08 не ломаются.
- **Сборки нет.** Никаких новых зависимостей.
- **Вёрстка автотестами не покрывается** (jsdom в проекте нет — решение спеки 21.08). Единственное исключение,
  сделанное сознательно, — `tests/format.test.ts` на `formatSignalDate`: это чистая функция без DOM, а граница
  полуночи в ней — настоящий источник ошибок. Расширять исключение на рендереры нельзя.
- **Стенд визуальной проверки живёт в scratchpad и не коммитится.** Коммиты собираются явным
  `git add <конкретные пути>`; `git add -A` / `git add .` запрещены.

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/db/db.ts` | + таблица `signals` и индекс в `SCHEMA_SQL` |
| `src/db/signals.repo.ts` | **новый**: `save`, `listByUser` |
| `src/signals/visibility.ts` | **новый**: `forViewer` — единственное место, где решается, что видно без доступа |
| `src/routes/signals.ts` | **новый**: `GET /api/signals` |
| `src/routes/analyze.ts` | тизер-гейт, сохранение, ответ через `forViewer` |
| `src/routes/me.ts` | `hasAccess`, `teaserUsed` вместо `alreadyUsed` |
| `src/config.ts` | `freeRunLimitEnabled` удаляется |
| `src/app.ts` | `SignalsRepo` в зависимостях, регистрация `/api/signals` |
| `src/types.ts` | `StoredSignal`, `LockedSignalView`, `VisibleSignalView` |
| `public/js/screens/screenshot.js` | + экспорт `renderSignalCard`, окно тизера, третье состояние кнопки |
| `public/js/screens/signals.js` | **новый**: список, раскрытие, пустые состояния |
| `public/js/screens/locked.js` | `renderLocked` принимает подпись кнопки и действие |
| `public/js/format.js` | + `formatSignalDate` |
| `public/js/app.js` | таб «Сигналы», ленивая загрузка истории, `hasAccess`/`teaserUsed` |
| `public/js/state.js` | + `hasAccess`, `teaserUsed`, `signals`, `signalsError`, `expandedSignalId` |
| `public/js/api.js` | + `getSignals` |
| `public/style.css` | окно тизера, строки истории |
| `tests/db/signals.repo.test.ts`, `tests/signals/visibility.test.ts`, `tests/routes/signals.test.ts`, `tests/format.test.ts` | **новые** |

---

## Task 1: Таблица `signals` и репозиторий

**Files:**
- Create: `src/db/signals.repo.ts`
- Create: `tests/db/signals.repo.test.ts`
- Modify: `src/db/db.ts` (`SCHEMA_SQL`)
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: `Queryable` из `src/db/db.ts`; `Signal` из `src/types.ts`
- Produces:
  - `interface StoredSignal { id: number; telegramId: number; signal: Signal; createdAt: string }`
  - `class SignalsRepo { constructor(db: Queryable); save(telegramId: number, signal: Signal): Promise<StoredSignal>; listByUser(telegramId: number, limit: number): Promise<StoredSignal[]> }`

- [ ] **Step 1: Написать падающий тест репозитория**

Create `tests/db/signals.repo.test.ts`. Сортировка проверяется на трёх записях подряд: они попадают в одну
миллисекунду, поэтому порядок обязан доопределяться по `id`, а не только по `created_at`.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/testDb.js';
import { SignalsRepo } from '../../src/db/signals.repo.js';
import type { Signal } from '../../src/types.js';

const SIGNAL: Signal = {
  trend: 'bullish',
  instrument: 'AUD/CHF',
  timeframe: 'M15',
  entryPrice: 1.08234,
  stopLoss: 1.0791,
  takeProfit1: 1.0856,
  takeProfit2: 1.0879,
  takeProfit3: 1.0904,
  keyPoints: [{ text: 'пробой подтверждён', status: 'ok' }],
  rationale: 'разбор',
};

let repo: SignalsRepo;

beforeEach(async () => {
  repo = new SignalsRepo(await createTestDb());
});

describe('SignalsRepo', () => {
  it('returns the stored signal with an id and a timestamp', async () => {
    const stored = await repo.save(42, SIGNAL);

    expect(stored.telegramId).toBe(42);
    expect(stored.signal).toEqual(SIGNAL);
    expect(typeof stored.id).toBe('number');
    expect(Number.isNaN(Date.parse(stored.createdAt))).toBe(false);
  });

  it('round-trips every field through the payload column', async () => {
    const stored = await repo.save(42, SIGNAL);
    const [read] = await repo.listByUser(42, 10);

    expect(read.signal).toEqual(stored.signal);
    expect(read.signal.keyPoints[0].text).toBe('пробой подтверждён');
  });

  it('lists newest first even when timestamps collide', async () => {
    const first = await repo.save(1, { ...SIGNAL, instrument: 'A/A' });
    const second = await repo.save(1, { ...SIGNAL, instrument: 'B/B' });
    const third = await repo.save(1, { ...SIGNAL, instrument: 'C/C' });

    const list = await repo.listByUser(1, 10);

    expect(list.map((row) => row.signal.instrument)).toEqual(['C/C', 'B/B', 'A/A']);
    expect(list.map((row) => row.id)).toEqual([third.id, second.id, first.id]);
  });

  it('honours the limit', async () => {
    await repo.save(2, SIGNAL);
    await repo.save(2, SIGNAL);
    await repo.save(2, SIGNAL);

    expect(await repo.listByUser(2, 2)).toHaveLength(2);
  });

  it('never returns another user signals', async () => {
    await repo.save(10, SIGNAL);
    await repo.save(11, SIGNAL);

    const list = await repo.listByUser(10, 10);

    expect(list).toHaveLength(1);
    expect(list[0].telegramId).toBe(10);
  });

  it('returns an empty list for a user without signals', async () => {
    expect(await repo.listByUser(999, 10)).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `npx vitest run tests/db/signals.repo.test.ts`
Expected: FAIL — модуль `src/db/signals.repo.js` не найден.

- [ ] **Step 3: Добавить таблицу в схему**

`src/db/db.ts` — в конец `SCHEMA_SQL`, после таблицы `admins`:

```sql
CREATE TABLE IF NOT EXISTS signals (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signals_user_recent ON signals (telegram_id, created_at DESC);
```

Внешнего ключа на `users` нет намеренно: `users` заводится лениво через `getOrCreate`, и жёсткая связь добавила бы
порядок операций там, где он не нужен.

**Если pg-mem не понимает `BIGSERIAL`** — заменить на `id SERIAL PRIMARY KEY`. Ёмкости `int4` здесь хватит с
запасом: это ручные разборы по скриншоту, а не поток событий. Если замена понадобилась — записать причину
комментарием рядом, чтобы следующий не «вернул как правильнее».

- [ ] **Step 4: Написать репозиторий**

Create `src/db/signals.repo.ts`:

```ts
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
```

- [ ] **Step 5: Добавить тип `StoredSignal`**

`src/types.ts`, после `interface Signal`:

```ts
export interface StoredSignal {
  id: number;
  telegramId: number;
  signal: Signal;
  createdAt: string;
}
```

- [ ] **Step 6: Запустить тест и убедиться, что он проходит**

Run: `npx vitest run tests/db/signals.repo.test.ts`
Expected: PASS, шесть тестов.

- [ ] **Step 7: Коммит**

```bash
git add src/db/db.ts src/db/signals.repo.ts src/types.ts tests/db/signals.repo.test.ts
git commit -m "feat: store issued signals per telegram user"
```

---

## Task 2: Модуль видимости

Главный модуль задачи: он один решает, что уходит клиенту без доступа. Тест проверяет **точный набор ключей**, а не
отсутствие конкретных полей, — тогда новое поле в `Signal`, случайно просочившееся в закрытый вид, уронит тест, а не
пейволл в проде.

**Files:**
- Create: `src/signals/visibility.ts`
- Create: `tests/signals/visibility.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: `StoredSignal`, `Signal` из `src/types.ts`
- Produces:
  - `interface LockedSignalView { id: number; createdAt: string; instrument: string | null; timeframe: string | null; locked: true }`
  - `type VisibleSignalView = { id: number; createdAt: string; locked: false } & Signal`
  - `function forViewer(record: StoredSignal, hasAccess: boolean): LockedSignalView | VisibleSignalView`

- [ ] **Step 1: Написать падающий тест**

Create `tests/signals/visibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { forViewer } from '../../src/signals/visibility.js';
import type { StoredSignal } from '../../src/types.js';

const RECORD: StoredSignal = {
  id: 7,
  telegramId: 42,
  createdAt: '2026-08-24T10:15:00.000Z',
  signal: {
    trend: 'bearish',
    instrument: 'AUD/CHF',
    timeframe: 'M15',
    entryPrice: 1.08234,
    stopLoss: 1.0791,
    takeProfit1: 1.0856,
    takeProfit2: 1.0879,
    takeProfit3: 1.0904,
    keyPoints: [{ text: 'пробой подтверждён', status: 'ok' }],
    rationale: 'подробный разбор',
  },
};

describe('forViewer without access', () => {
  it('exposes exactly id, createdAt, instrument, timeframe and locked', () => {
    const view = forViewer(RECORD, false);

    expect(Object.keys(view).sort()).toEqual(['createdAt', 'id', 'instrument', 'locked', 'timeframe']);
  });

  it('leaks no part of the signal itself', () => {
    const serialised = JSON.stringify(forViewer(RECORD, false));

    expect(serialised).not.toContain('bearish');
    expect(serialised).not.toContain('1.08234');
    expect(serialised).not.toContain('подробный разбор');
    expect(serialised).not.toContain('пробой подтверждён');
  });

  it('keeps the proof that the chart was read', () => {
    const view = forViewer(RECORD, false);

    expect(view).toMatchObject({ id: 7, instrument: 'AUD/CHF', timeframe: 'M15', locked: true });
  });

  it('passes nulls through when the chart was unreadable', () => {
    const record = { ...RECORD, signal: { ...RECORD.signal, instrument: null, timeframe: null } };

    expect(forViewer(record, false)).toMatchObject({ instrument: null, timeframe: null, locked: true });
  });
});

describe('forViewer with access', () => {
  it('returns the whole signal plus id, createdAt and locked=false', () => {
    const view = forViewer(RECORD, true);

    expect(view).toEqual({
      id: 7,
      createdAt: '2026-08-24T10:15:00.000Z',
      locked: false,
      ...RECORD.signal,
    });
  });

  it('never exposes the telegram id', () => {
    expect(Object.keys(forViewer(RECORD, true))).not.toContain('telegramId');
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `npx vitest run tests/signals/visibility.test.ts`
Expected: FAIL — модуль `src/signals/visibility.js` не найден.

- [ ] **Step 3: Написать модуль**

Create `src/signals/visibility.ts`:

```ts
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
```

- [ ] **Step 4: Добавить типы видов**

`src/types.ts`, после `StoredSignal`:

```ts
export interface LockedSignalView {
  id: number;
  createdAt: string;
  instrument: string | null;
  timeframe: string | null;
  locked: true;
}

export type VisibleSignalView = { id: number; createdAt: string; locked: false } & Signal;
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

Run: `npx vitest run tests/signals/visibility.test.ts`
Expected: PASS, шесть тестов.

- [ ] **Step 6: Коммит**

```bash
git add src/signals/visibility.ts src/types.ts tests/signals/visibility.test.ts
git commit -m "feat: add the single place that decides what a viewer may see"
```

---

## Task 3: `/api/analyze` — тизер, сохранение, `NO_ACCESS`

**Files:**
- Modify: `src/routes/analyze.ts`
- Modify: `src/config.ts`, `src/app.ts`
- Modify: `tests/routes/analyze.test.ts`, `tests/config.test.ts`
- Modify: `.env`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: `SignalsRepo.save` (Task 1), `forViewer` (Task 2)
- Produces: `createAnalyzeHandler(usersRepo: UsersRepo, signalsRepo: SignalsRepo, claude: Anthropic)` — параметр
  `freeRunLimitEnabled` исчезает из сигнатуры

- [ ] **Step 1: Переписать тесты роута**

`tests/routes/analyze.test.ts` — заменить `buildApp` и весь блок `describe` целиком. `SAMPLE_SIGNAL`,
`buildInitData` и импорты `crypto`/`supertest` остаются как есть; добавляется импорт `SignalsRepo`.

```ts
import { SignalsRepo } from '../../src/db/signals.repo.js';

function buildApp(usersRepo: UsersRepo, signalsRepo: SignalsRepo, signal: unknown) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  const fakeClaude = {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: 'provide_signal', input: signal }] }),
    },
  } as any;
  app.post(
    '/api/analyze',
    createAuthMiddleware(BOT_TOKEN),
    createAnalyzeHandler(usersRepo, signalsRepo, fakeClaude)
  );
  return app;
}

let usersRepo: UsersRepo;
let signalsRepo: SignalsRepo;

beforeEach(async () => {
  const db = await createTestDb();
  usersRepo = new UsersRepo(db);
  signalsRepo = new SignalsRepo(db);
});

describe('POST /api/analyze', () => {
  it('returns a locked signal for the free teaser', async () => {
    const response = await request(buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(1))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.signal).toMatchObject({ instrument: 'EUR/USD', timeframe: 'M15', locked: true });
    expect(response.body.signal.trend).toBeUndefined();
    expect(response.body.signal.entryPrice).toBeUndefined();
    expect(response.body.signal.rationale).toBeUndefined();
  });

  it('stores the signal even though the viewer cannot read it', async () => {
    await request(buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(4))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    const stored = await signalsRepo.listByUser(4, 10);

    expect(stored).toHaveLength(1);
    expect(stored[0].signal.trend).toBe('bullish');
    expect(stored[0].signal.rationale).toBe('test rationale');
  });

  it('spends the teaser', async () => {
    await request(buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(1))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect((await usersRepo.getOrCreate(1)).freeRunUsed).toBe(true);
  });

  it('returns 403 NO_ACCESS on the second attempt without access', async () => {
    const app = buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(2))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(403);
    expect(second.body).toEqual({ error: 'NO_ACCESS' });
  });

  it('does not call Claude once the teaser is spent', async () => {
    const fakeClaude = {
      messages: {
        create: vi
          .fn()
          .mockResolvedValue({ content: [{ type: 'tool_use', name: 'provide_signal', input: SAMPLE_SIGNAL }] }),
      },
    } as any;
    const app = express();
    app.use(express.json({ limit: '15mb' }));
    app.post(
      '/api/analyze',
      createAuthMiddleware(BOT_TOKEN),
      createAnalyzeHandler(usersRepo, signalsRepo, fakeClaude)
    );
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(12))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    await send();

    expect(fakeClaude.messages.create).toHaveBeenCalledTimes(1);
  });

  it('returns the full signal when access is granted', async () => {
    await usersRepo.setUnlimited(3, true);
    const response = await request(buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(3))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.signal).toMatchObject({ trend: 'bullish', entryPrice: 1.1, locked: false });
  });

  it('never spends the teaser of a user with access', async () => {
    await usersRepo.setUnlimited(13, true);
    const app = buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(13))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(200);
    expect((await usersRepo.getOrCreate(13)).freeRunUsed).toBe(false);
  });

  it('accepts image/webp', async () => {
    const response = await request(buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(8))
      .send({ imageBase64: 'abc', mediaType: 'image/webp' });

    expect(response.status).toBe(200);
  });

  it('returns 400 for an unsupported media type', async () => {
    const response = await request(buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(9))
      .send({ imageBase64: 'abc', mediaType: 'image/gif' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'MISSING_IMAGE' });
  });

  it('returns 400 when imageBase64 is missing', async () => {
    const response = await request(buildApp(usersRepo, signalsRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(5))
      .send({ mediaType: 'image/png' });

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npx vitest run tests/routes/analyze.test.ts`
Expected: FAIL — `createAnalyzeHandler` пока принимает три аргумента другой формы, ответ не содержит `locked`.

- [ ] **Step 3: Переписать роут**

`src/routes/analyze.ts` — заменить `createAnalyzeHandler` целиком (`ALLOWED_MEDIA_TYPES` и `isAllowedMediaType`
остаются как есть):

```ts
import type { SignalsRepo } from '../db/signals.repo.js';
import { forViewer } from '../signals/visibility.js';

export function createAnalyzeHandler(usersRepo: UsersRepo, signalsRepo: SignalsRepo, claude: Anthropic) {
  return async function analyzeHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const { imageBase64, mediaType } = req.body as { imageBase64?: string; mediaType?: string };

      if (!imageBase64 || !isAllowedMediaType(mediaType)) {
        res.status(400).json({ error: 'MISSING_IMAGE' });
        return;
      }

      const user = await usersRepo.getOrCreate(telegramUser.id);
      const hasAccess = user.unlimitedAccess;

      // Тизер один на пользователя навсегда. Без этой проверки любой гоняет
      // vision-разборы бесконечно за наш счёт, не приближаясь к покупке:
      // результат он всё равно не увидит.
      if (!hasAccess && user.freeRunUsed) {
        res.status(403).json({ error: 'NO_ACCESS' });
        return;
      }

      const signal = await analyzeChart(claude, imageBase64, mediaType);
      const stored = await signalsRepo.save(telegramUser.id, signal);

      if (!hasAccess) {
        await usersRepo.markRunUsed(telegramUser.id);
      }

      res.json({ signal: forViewer(stored, hasAccess) });
    } catch (err) {
      next(err);
    }
  };
}
```

- [ ] **Step 4: Убрать флаг из конфига и приложения**

`src/config.ts` — удалить `freeRunLimitEnabled` из интерфейса `Config` и из возвращаемого объекта вместе с
комментарием «Opt-out, not opt-in».

`src/app.ts` — удалить `freeRunLimitEnabled` из `AppDeps`, добавить `signalsRepo: SignalsRepo` и передать его в
хендлер:

```ts
  app.post('/api/analyze', authMiddleware, createAnalyzeHandler(deps.usersRepo, deps.signalsRepo, deps.claude));
```

`src/server.ts` — импорт `import { SignalsRepo } from './db/signals.repo.js';`; рядом с `const usersRepo = new
UsersRepo(pool);` добавить `const signalsRepo = new SignalsRepo(pool);`; в объекте `buildApp({...})` заменить строку
`freeRunLimitEnabled: config.freeRunLimitEnabled,` на `signalsRepo,`.

`tests/server.test.ts` — в объекте `buildApp({...})` заменить `freeRunLimitEnabled: true,` на
`signalsRepo: new SignalsRepo(db),` и добавить импорт `import { SignalsRepo } from '../src/db/signals.repo.js';`.

`tests/config.test.ts` — удалить три теста про `FREE_RUN_LIMIT_ENABLED` (`enables the free run limit by default`,
`disables the free run limit only for the literal "false"`, `keeps the limit enabled for any other value`).

`.env` и `.env.example` — удалить строку `FREE_RUN_LIMIT_ENABLED=false` вместе с комментарием, если он есть.

`README.md` — удалить строку с описанием переменной `FREE_RUN_LIMIT_ENABLED`.

- [ ] **Step 5: Прогнать бэкенд**

Run: `npm test`
Expected: PASS. Если падает `tests/server.test.ts` — проверить, что `AppDeps` в нём собирается с `signalsRepo`.

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 6: Убедиться, что флага не осталось**

Run: `grep -rn "freeRunLimitEnabled\|FREE_RUN_LIMIT_ENABLED\|ALREADY_USED" src tests .env .env.example README.md`
Expected: ноль совпадений.

- [ ] **Step 7: Коммит**

```bash
git add src/routes/analyze.ts src/config.ts src/app.ts src/server.ts tests/routes/analyze.test.ts tests/config.test.ts tests/server.test.ts .env.example README.md
git commit -m "feat!: gate the signal behind access and keep one free teaser"
```

`.env` в репозитории не отслеживается — в `git add` он не входит намеренно; правку в нём сделать всё равно нужно,
иначе локальный запуск будет отличаться от прода.

---

## Task 4: `GET /api/signals`

**Files:**
- Create: `src/routes/signals.ts`
- Create: `tests/routes/signals.test.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: `SignalsRepo.listByUser` (Task 1), `forViewer` (Task 2)
- Produces: `createSignalsHandler(usersRepo: UsersRepo, signalsRepo: SignalsRepo)`; `HISTORY_LIMIT = 50`;
  ответ `{ hasAccess: boolean, signals: (LockedSignalView | VisibleSignalView)[] }`

- [ ] **Step 1: Написать падающий тест**

Create `tests/routes/signals.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb } from '../helpers/testDb.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { SignalsRepo } from '../../src/db/signals.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createSignalsHandler } from '../../src/routes/signals.js';
import type { Signal } from '../../src/types.js';

const BOT_TOKEN = 'test-bot-token';

function buildInitData(telegramId: number): string {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: 'T' }),
  };
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${(fields as any)[k]}`);
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(pairs.join('\n')).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const SIGNAL: Signal = {
  trend: 'bullish',
  instrument: 'AUD/CHF',
  timeframe: 'M15',
  entryPrice: 1.08234,
  stopLoss: 1.0791,
  takeProfit1: 1.0856,
  takeProfit2: 1.0879,
  takeProfit3: 1.0904,
  keyPoints: [{ text: 'пробой подтверждён', status: 'ok' }],
  rationale: 'подробный разбор',
};

let usersRepo: UsersRepo;
let signalsRepo: SignalsRepo;
let app: express.Express;

beforeEach(async () => {
  const db = await createTestDb();
  usersRepo = new UsersRepo(db);
  signalsRepo = new SignalsRepo(db);
  app = express();
  app.get('/api/signals', createAuthMiddleware(BOT_TOKEN), createSignalsHandler(usersRepo, signalsRepo));
});

describe('GET /api/signals', () => {
  it('returns an empty history for a new user', async () => {
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(1));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hasAccess: false, signals: [] });
  });

  it('locks every signal for a user without access', async () => {
    await signalsRepo.save(2, SIGNAL);
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(2));

    expect(response.body.hasAccess).toBe(false);
    expect(response.body.signals[0]).toMatchObject({ instrument: 'AUD/CHF', timeframe: 'M15', locked: true });
    expect(JSON.stringify(response.body)).not.toContain('подробный разбор');
    expect(JSON.stringify(response.body)).not.toContain('1.08234');
  });

  it('opens the history once access is granted', async () => {
    await signalsRepo.save(3, SIGNAL);
    await usersRepo.setUnlimited(3, true);
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(3));

    expect(response.body.hasAccess).toBe(true);
    expect(response.body.signals[0]).toMatchObject({ trend: 'bullish', entryPrice: 1.08234, locked: false });
    expect(response.body.signals[0].rationale).toBe('подробный разбор');
  });

  it('closes the history again when access is revoked', async () => {
    await signalsRepo.save(4, SIGNAL);
    await usersRepo.setUnlimited(4, true);
    await usersRepo.setUnlimited(4, false);
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(4));

    expect(response.body.hasAccess).toBe(false);
    expect(response.body.signals[0].locked).toBe(true);
    expect(response.body.signals[0].rationale).toBeUndefined();
  });

  it('never returns another user history', async () => {
    await signalsRepo.save(5, SIGNAL);
    await signalsRepo.save(6, SIGNAL);
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(5));

    expect(response.body.signals).toHaveLength(1);
  });

  it('caps the history at 50 entries', async () => {
    for (let i = 0; i < 55; i++) {
      await signalsRepo.save(7, SIGNAL);
    }
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(7));

    expect(response.body.signals).toHaveLength(50);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npx vitest run tests/routes/signals.test.ts`
Expected: FAIL — модуль `src/routes/signals.js` не найден.

- [ ] **Step 3: Написать роут**

Create `src/routes/signals.ts`:

```ts
import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';
import type { SignalsRepo } from '../db/signals.repo.js';
import { forViewer } from '../signals/visibility.js';

/**
 * Потолок, который на практике не наступит: каждый разбор -- это ручной
 * скриншот. Нужен, чтобы ответ не распух, если кто-то устроит марафон.
 */
export const HISTORY_LIMIT = 50;

export function createSignalsHandler(usersRepo: UsersRepo, signalsRepo: SignalsRepo) {
  return async function signalsHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const user = await usersRepo.getOrCreate(telegramUser.id);
      const records = await signalsRepo.listByUser(telegramUser.id, HISTORY_LIMIT);

      // Доступ проверяется на каждом чтении: отзыв доступа должен закрывать
      // историю обратно, а не работать наполовину.
      res.json({
        hasAccess: user.unlimitedAccess,
        signals: records.map((record) => forViewer(record, user.unlimitedAccess)),
      });
    } catch (err) {
      next(err);
    }
  };
}
```

- [ ] **Step 4: Зарегистрировать роут**

`src/app.ts`, рядом с `/api/me`:

```ts
  app.get('/api/signals', authMiddleware, createSignalsHandler(deps.usersRepo, deps.signalsRepo));
```

плюс импорт `import { createSignalsHandler } from './routes/signals.js';`

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run tests/routes/signals.test.ts`
Expected: PASS, шесть тестов.

Run: `npm test && npm run typecheck`
Expected: PASS, без ошибок типов.

- [ ] **Step 6: Коммит**

```bash
git add src/routes/signals.ts src/app.ts tests/routes/signals.test.ts
git commit -m "feat: serve the signal history over GET /api/signals"
```

---

## Task 5: `/api/me` — `hasAccess` и `teaserUsed`

**Files:**
- Modify: `src/routes/me.ts`
- Modify: `tests/routes/me.test.ts`

**Interfaces:**
- Produces: `GET /api/me` → `{ user: { telegramId, firstName, photoUrl }, hasAccess: boolean, teaserUsed: boolean }`

- [ ] **Step 1: Переписать тесты**

`tests/routes/me.test.ts` — заменить блок `describe` целиком (импорты и `buildInitData` остаются):

```ts
describe('GET /api/me', () => {
  it('returns the profile with no access and an unspent teaser for a new user', async () => {
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(10));

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ telegramId: 10, firstName: 'Max', photoUrl: null });
    expect(response.body.hasAccess).toBe(false);
    expect(response.body.teaserUsed).toBe(false);
    expect(response.body.alreadyUsed).toBeUndefined();
  });

  it('passes photo_url through as photoUrl', async () => {
    const initData = buildInitData(11, { photo_url: 'https://t.me/i/userpic/320/x.jpg' });
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', initData);

    expect(response.body.user.photoUrl).toBe('https://t.me/i/userpic/320/x.jpg');
  });

  it('reports a spent teaser', async () => {
    await usersRepo.markRunUsed(13);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(13));

    expect(response.body.teaserUsed).toBe(true);
    expect(response.body.hasAccess).toBe(false);
  });

  it('reports access independently of the spent teaser', async () => {
    await usersRepo.markRunUsed(14);
    await usersRepo.setUnlimited(14, true);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(14));

    expect(response.body.hasAccess).toBe(true);
    expect(response.body.teaserUsed).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npx vitest run tests/routes/me.test.ts`
Expected: FAIL — `hasAccess` и `teaserUsed` не определены.

- [ ] **Step 3: Переписать хендлер**

`src/routes/me.ts` — тело `res.json`:

```ts
      res.json({
        user: {
          telegramId: telegramUser.id,
          firstName: telegramUser.firstName,
          photoUrl: telegramUser.photoUrl ?? null,
        },
        hasAccess: user.unlimitedAccess,
        // Клиенту нужно знать не «потрачен ли прогон», а можно ли жать кнопку:
        // иначе отказ стоил бы пользователю выгрузки мегабайта на мобильной связи.
        teaserUsed: user.freeRunUsed,
      });
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/routes/me.test.ts`
Expected: PASS, четыре теста.

- [ ] **Step 5: Коммит**

```bash
git add src/routes/me.ts tests/routes/me.test.ts
git commit -m "feat: report access and teaser state from /api/me"
```

---

## Task 6: Фронтенд — окно тизера и третье состояние

**Files:**
- Modify: `public/js/state.js`, `public/js/api.js`, `public/js/app.js`
- Modify: `public/js/screens/screenshot.js`
- Modify: `public/style.css`

**Interfaces:**
- Consumes: `POST /api/analyze` → `{ signal }` с полем `locked`; `GET /api/me` → `{ user, hasAccess, teaserUsed }`
- Produces: `export function renderSignalCard(signal)` из `screens/screenshot.js` — карточка **без** CTA, для
  переиспользования в истории (Task 7); `getSignals()` из `api.js`

- [ ] **Step 1: Расширить состояние и API-обёртки**

`public/js/state.js` — добавить в объект `state`:

```js
  hasAccess: false,
  teaserUsed: false,
  signals: null, // null = ещё не загружали
  signalsError: false,
  expandedSignalId: null,
```

`public/js/api.js` — добавить рядом с `getMe`:

```js
export function getSignals() {
  return apiFetch('/api/signals');
}
```

- [ ] **Step 2: Прокинуть доступ из `/api/me`**

`public/js/app.js`, в `init()` — в ветке `if (me.status === 'fulfilled')`:

```js
  if (me.status === 'fulfilled') {
    patch.profile = me.value.user;
    patch.hasAccess = me.value.hasAccess;
    patch.teaserUsed = me.value.teaserUsed;
  } else {
```

- [ ] **Step 3: Вынести карточку результата в переиспользуемый рендерер**

`public/js/screens/screenshot.js` — заменить `renderResult()` на функцию, принимающую сигнал и **не** рисующую CTA,
плюс тонкую обёртку для фазы результата. Тело разметки (`verdict`, `badge`, `levels`, `keypoints`, `breakdown`)
переносится без изменений, убирается только последняя строка с кнопкой:

```js
/**
 * Карточка сигнала без CTA: её же показывает история, где кнопка «получить
 * доступ» неуместна. Второй вариант карточки для истории был бы копией,
 * которая разойдётся.
 */
export function renderSignalCard(signal) {
  const trend = TREND[signal.trend] ?? TREND.neutral;

  const labels = ['Вход', 'Стоп-лосс', 'ТП1', 'ТП2', 'ТП3'];
  const formatted = formatLevels([
    signal.entryPrice,
    signal.stopLoss,
    signal.takeProfit1,
    signal.takeProfit2,
    signal.takeProfit3,
  ]);
  const levels = labels.map((label, index) => [label, formatted[index]]);
  const keyPoints = (signal.keyPoints ?? []).slice(0, MAX_KEY_POINTS);

  const wrapper = document.createElement('section');
  wrapper.className = 'result';
  wrapper.innerHTML = `
    <div class="verdict verdict--${trend.modifier}">
      <span class="verdict__icon">${icons[trend.icon]}</span>
      <div class="verdict__label">${trend.label}</div>
      <div class="verdict__instrument">${signal.instrument ?? 'Инструмент не определён'}</div>
      <div class="badge">
        ${icons.clock}
        <span class="badge__label">Таймфрейм</span>
        <span class="badge__value">${signal.timeframe ?? 'не определён'}</span>
      </div>
    </div>

    <div class="levels">
      ${levels
        .map(
          ([label, value]) => `
        <div class="level">
          <div class="level__label">${label}</div>
          <div class="level__value">${value}</div>
        </div>`
        )
        .join('')}
    </div>

    ${
      keyPoints.length
        ? `<div class="keypoints">
             <div class="keypoints__label">Ключевые признаки</div>
             ${keyPoints
               .map(
                 (point) => `
               <div class="keypoint keypoint--${point.status}">
                 <span class="keypoint__icon">${point.status === 'warn' ? icons.warn : icons.check}</span>
                 <span>${point.text}</span>
               </div>`
               )
               .join('')}
           </div>`
        : ''
    }

    <details class="breakdown">
      <summary class="breakdown__summary">Технический разбор</summary>
      <p class="breakdown__text">${signal.rationale}</p>
    </details>
  `;
  return wrapper;
}

function renderResult() {
  const card = renderSignalCard(state.signal);
  card.insertAdjacentHTML(
    'beforeend',
    '<button class="button button--primary" data-action="cta">Получить полный доступ</button>'
  );
  return card;
}
```

- [ ] **Step 4: Добавить закрытый результат и окно тизера**

`public/js/screens/screenshot.js` — рядом с `renderResult`:

```js
/** Под окном тизера: доказательство, что график прочитан, и больше ничего. */
function renderLockedResult(signal) {
  const wrapper = document.createElement('section');
  wrapper.className = 'result';
  wrapper.innerHTML = `
    <div class="verdict verdict--flat">
      <span class="verdict__icon">${icons.lock}</span>
      <div class="verdict__label">Сигнал готов</div>
      <div class="verdict__instrument">${signal.instrument ?? 'Инструмент не определён'}</div>
      <div class="badge">
        ${icons.clock}
        <span class="badge__label">Таймфрейм</span>
        <span class="badge__value">${signal.timeframe ?? 'не определён'}</span>
      </div>
    </div>
  `;
  return wrapper;
}

function renderTeaser() {
  const overlay = document.createElement('div');
  overlay.className = 'teaser';
  overlay.innerHTML = `
    <div class="teaser__box">
      <span class="teaser__icon">${icons.lock}</span>
      <div class="teaser__title">Сигнал готов</div>
      <p class="teaser__text">
        График разобран, уровни входа и защиты рассчитаны. Сигнал сохранён — он появится во вкладке «Сигналы»,
        как только вы откроете полный доступ.
      </p>
      <button class="button button--primary" data-action="cta">Получить полный доступ</button>
      <button class="button button--ghost" data-action="reset">Загрузить другой скриншот</button>
    </div>
  `;
  overlay.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="reset"]')) {
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      setState({ phase: 'idle', file: null, previewUrl: null, signal: null });
    }
  });
  return overlay;
}
```

- [ ] **Step 5: Развести три состояния в сборке экрана**

`public/js/screens/screenshot.js` — `renderAnalyzeButton` и хвост `renderScreenshot`:

```js
function renderAnalyzeButton() {
  // Третье состояние: тизер потрачен, доступа нет. Кнопку анализа показывать
  // нечестно -- сервер всё равно ответит 403, а пользователь заплатит за это
  // выгрузкой картинки.
  if (!state.hasAccess && state.teaserUsed) {
    const cta = document.createElement('button');
    cta.className = 'button button--primary';
    cta.dataset.action = 'cta';
    cta.textContent = 'Получить полный доступ';
    return cta;
  }

  const button = document.createElement('button');
  button.className = 'button button--primary';
  button.disabled = state.phase === 'analyzing';
  button.innerHTML =
    state.phase === 'analyzing'
      ? '<span class="spinner"></span>Анализ'
      : `${icons.camera}Анализировать скриншот`;
  button.addEventListener('click', runAnalysis);
  return button;
}
```

в `renderScreenshot`, ветка результата:

```js
  if (state.phase === 'result' && state.signal) {
    if (state.signal.locked) {
      section.appendChild(renderLockedResult(state.signal));
      section.appendChild(renderTeaser());
    } else {
      section.appendChild(renderResult());
    }
  }
```

и там же, в начале функции, маркер двухколоночной раскладки не должен включаться на закрытом результате — закрывать
нечего:

```js
  section.className =
    state.phase === 'result' && state.previewUrl && !state.signal?.locked ? 'screen is-result' : 'screen';
```

- [ ] **Step 6: Обновить `runAnalysis` и текст ошибки**

`public/js/screens/screenshot.js`:

```js
    const data = await postAnalyze(prepared);
    if (rotation) await rotation.finish();
    // Успешный закрытый разбор сам по себе означает, что тизер израсходован;
    // перезапрашивать /api/me ради факта, который только что произошёл, незачем.
    setState({
      phase: 'result',
      signal: data.signal,
      teaserUsed: state.hasAccess ? state.teaserUsed : true,
      signals: null, // история устарела, перезагрузится при открытии таба
    });
```

и в `errorFor`, ветка `err.status === 403`:

```js
    if (err.status === 403) {
      return {
        title: 'Нужен полный доступ',
        text: 'Бесплатный разбор уже использован. Полный доступ открывает сигналы целиком.',
        action: 'cta',
      };
    }
```

- [ ] **Step 7: Стили окна тизера**

`public/style.css` — после правил `.result` и до `.verdict`:

```css
.teaser {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(13, 14, 16, 0.78);
  backdrop-filter: blur(2px);
}

.teaser__box {
  width: 100%;
  max-width: 340px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 22px 18px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.teaser__icon {
  display: flex;
  color: var(--accent);
  margin-bottom: 2px;
}

.teaser__icon svg { width: 28px; height: 28px; }
.teaser__title { font-size: 17px; font-weight: 600; }
.teaser__text { margin: 0 0 8px; font-size: 13px; line-height: 1.5; color: var(--text-dim); }

.button--ghost {
  height: 44px;
  width: 100%;
  background: none;
  color: var(--text-dim);
  font-size: 14px;
}
```

- [ ] **Step 8: Проверить на стенде**

Стенд из плана 24.08 подсовывает `/api/me`; чтобы увидеть три состояния, в его `STUBS['/api/me']` меняются
`hasAccess` и `teaserUsed`, а в кнопку `result` подставляется закрытый сигнал:
`{ id: 1, createdAt: new Date().toISOString(), instrument: 'AUD/CHF', timeframe: 'M15', locked: true }`.

Expected:
- `hasAccess: false, teaserUsed: false` → кнопка «Анализировать скриншот» на месте; в фазе `result` с закрытым
  сигналом — затемнение и окно, под ним видны `AUD/CHF` и `M15`, направления и уровней нет;
- «Загрузить другой скриншот» возвращает в `idle`, окно исчезает;
- `hasAccess: false, teaserUsed: true` → вместо кнопки анализа CTA;
- `hasAccess: true` → кнопка анализа, полная карточка результата, окна нет;
- на 1400px окно по центру вьюпорта, двухколоночная раскладка на закрытом результате не включается.

- [ ] **Step 9: Коммит**

```bash
git add public/js/state.js public/js/api.js public/js/app.js public/js/screens/screenshot.js public/style.css
git commit -m "feat: lock the result behind a teaser window until access is granted"
```

---

## Task 7: Фронтенд — таб «Сигналы»

**Files:**
- Create: `public/js/screens/signals.js`
- Create: `tests/format.test.ts`
- Modify: `public/js/format.js`, `public/js/screens/locked.js`, `public/js/app.js`, `public/style.css`

**Interfaces:**
- Consumes: `renderSignalCard(signal)` (Task 6), `getSignals()` (Task 6), `GET /api/signals`
- Produces: `renderSignals()` из `screens/signals.js`; `formatSignalDate(iso)` из `format.js`;
  `renderLocked({ icon, title, subtitle, buttonLabel, action })`

- [ ] **Step 1: Написать падающий тест форматирования даты**

Create `tests/format.test.ts`. Это первый тест фронтенда в проекте: спека 21.08 отказалась от автотестов вёрстки
из-за отсутствия jsdom, но `formatSignalDate` — чистая функция без DOM, и граница полуночи в ней — настоящий
источник ошибок.

```ts
import { describe, it, expect } from 'vitest';
import { formatSignalDate } from '../public/js/format.js';

function at(offsetDays: number, hours: number, minutes: number): string {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

describe('formatSignalDate', () => {
  it('labels today by time', () => {
    expect(formatSignalDate(at(0, 14, 32))).toBe('сегодня, 14:32');
  });

  it('labels just after midnight as today, not yesterday', () => {
    expect(formatSignalDate(at(0, 0, 5))).toBe('сегодня, 00:05');
  });

  it('labels yesterday', () => {
    expect(formatSignalDate(at(-1, 9, 12))).toBe('вчера, 09:12');
  });

  it('falls back to a day and month for older entries', () => {
    expect(formatSignalDate(at(-8, 9, 12))).toMatch(/^\d{2}\.\d{2}, 09:12$/);
  });

  it('returns an empty string for garbage', () => {
    expect(formatSignalDate('not a date')).toBe('');
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — `formatSignalDate` не экспортируется.

- [ ] **Step 3: Написать форматирование даты**

`public/js/format.js` — добавить в конец:

```js
const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });

/**
 * Относительные подписи для свежих записей: «сегодня» -- самый частый случай
 * в истории, которая пополняется вручную, и читается быстрее полной даты.
 */
export function formatSignalDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const time = timeFormatter.format(date);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  if (date >= midnight) return `сегодня, ${time}`;
  if (date >= new Date(midnight.getTime() - 86400000)) return `вчера, ${time}`;
  return `${dayFormatter.format(date)}, ${time}`;
}
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS, пять тестов.

- [ ] **Step 5: Научить `renderLocked` другой кнопке**

`public/js/screens/locked.js` — сигнатура и кнопка:

```js
export function renderLocked({
  icon,
  title,
  subtitle,
  buttonLabel = 'Получить полный доступ',
  action = 'cta',
}) {
  const section = document.createElement('section');
  section.className = 'locked';
  section.innerHTML = `
    <div class="locked__icon">${icon}</div>
    <h2 class="locked__title">${title}</h2>
    <p class="locked__subtitle">${subtitle}</p>
    <button class="button button--primary" data-action="${action}">${buttonLabel}</button>
  `;
  section.querySelector('.locked__icon').insertAdjacentHTML('beforeend', icons.lock);
  return section;
}
```

Существующие вызовы не меняются: значения по умолчанию повторяют текущее поведение.

- [ ] **Step 6: Написать экран истории**

Create `public/js/screens/signals.js`:

```js
import { state, setState } from '../state.js';
import { icons } from '../icons.js';
import { formatSignalDate } from '../format.js';
import { renderSignalCard } from './screenshot.js';
import { renderLocked } from './locked.js';

const BADGE = {
  bullish: { label: 'BUY', modifier: 'up' },
  bearish: { label: 'SELL', modifier: 'down' },
  neutral: { label: 'FLAT', modifier: 'flat' },
};

function renderRow(signal) {
  const row = document.createElement('div');
  row.className = 'sigrow-wrap';

  const title = [signal.instrument ?? 'Инструмент не определён', signal.timeframe]
    .filter(Boolean)
    .join(' · ');

  const right = signal.locked
    ? `<span class="sigrow__lock">${icons.lock}</span>`
    : `<span class="sigrow__badge sigrow__badge--${(BADGE[signal.trend] ?? BADGE.neutral).modifier}">${
        (BADGE[signal.trend] ?? BADGE.neutral).label
      }</span>`;

  row.innerHTML = `
    <button class="sigrow" data-signal="${signal.id}">
      <span class="sigrow__meta">
        <span class="sigrow__title">${title}</span>
        <span class="sigrow__date">${formatSignalDate(signal.createdAt)}</span>
      </span>
      ${right}
    </button>
  `;

  if (!signal.locked && state.expandedSignalId === signal.id) {
    const card = renderSignalCard(signal);
    card.classList.add('sigrow__card');
    row.appendChild(card);
  }

  row.addEventListener('click', (event) => {
    if (!event.target.closest('[data-signal]')) return;
    // Закрытая строка не раскрывается: раскрывать нечего, и клик, который
    // ничего не делает, читается как поломка.
    if (signal.locked) return;
    setState({ expandedSignalId: state.expandedSignalId === signal.id ? null : signal.id });
  });

  return row;
}

function renderError() {
  const card = document.createElement('section');
  card.className = 'errorbox';
  card.innerHTML = `
    <span class="errorbox__icon">${icons.warn}</span>
    <div class="errorbox__title">Не удалось загрузить сигналы</div>
    <p class="errorbox__text">Проверьте соединение и попробуйте снова.</p>
    <button class="button button--primary" data-action="retry-signals">Попробовать снова</button>
  `;
  return card;
}

export function renderSignals() {
  if (state.signalsError) return renderError();

  // null = запрос ещё не вернулся. Спиннера нет намеренно: на любой живой сети
  // он успел бы только мигнуть.
  if (state.signals === null) return document.createElement('div');

  if (state.signals.length === 0) {
    return state.hasAccess
      ? renderLocked({
          icon: icons.signals,
          title: 'Здесь появятся твои сигналы',
          subtitle: 'Загрузите скриншот графика — разбор сохранится и останется в этой вкладке.',
          buttonLabel: 'Загрузить скриншот',
          action: 'go-screenshot',
        })
      : renderLocked({
          icon: icons.signals,
          title: 'Доступно в полной версии',
          subtitle: 'История сигналов и уведомления о новых входах открываются вместе с полным доступом.',
        });
  }

  const section = document.createElement('section');
  section.className = 'siglist';
  for (const signal of state.signals) {
    section.appendChild(renderRow(signal));
  }

  if (!state.hasAccess) {
    section.insertAdjacentHTML(
      'beforeend',
      `<p class="siglist__note">Сигналы сохранены. Откройте полный доступ, чтобы прочитать их целиком.</p>
       <button class="button button--primary" data-action="cta">Получить полный доступ</button>`
    );
  }

  return section;
}
```

- [ ] **Step 7: Подключить таб и ленивую загрузку**

`public/js/app.js` — импорт, загрузка и роутинг:

```js
import { renderSignals } from './screens/signals.js';
import { getConfig, getMe, getSignals } from './api.js';
```

```js
// Флаг вне state: это транспорт, а не то, что рисуется. В state он вызывал бы
// лишние перерисовки на каждый старт запроса.
let signalsLoading = false;

async function loadSignals() {
  if (signalsLoading || state.signals !== null) return;
  signalsLoading = true;
  try {
    const data = await getSignals();
    setState({ signals: data.signals, hasAccess: data.hasAccess, signalsError: false });
  } catch {
    setState({ signalsError: true });
  } finally {
    signalsLoading = false;
  }
}
```

в обработчике таб-бара:

```js
document.getElementById('tabbar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  setState({ tab: button.dataset.tab });
  if (button.dataset.tab === 'signals') loadSignals();
});
```

в `renderContent` — заменить заглушку «Сигналы» на экран:

```js
  if (state.tab === 'screenshot') {
    root.appendChild(renderScreenshot());
  } else if (state.tab === 'signals') {
    root.appendChild(renderSignals());
  } else {
```

в обработчике кликов по контенту — два новых действия:

```js
content.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="cta"]')) {
    openAccessChat(state.targetUrl);
    return;
  }
  if (event.target.closest('[data-action="go-screenshot"]')) {
    setState({ tab: 'screenshot' });
    return;
  }
  if (event.target.closest('[data-action="retry-signals"]')) {
    setState({ signalsError: false, signals: null });
    loadSignals();
  }
});
```

и в `renderContent` центрирование пустого экрана должно работать только когда «Сигналы» действительно пусты:

```js
  root.classList.toggle('content--centered', state.tab === 'trading' || (state.tab === 'signals' && !state.signals?.length));
```

- [ ] **Step 8: Стили списка**

`public/style.css` — перед блоком «Большие экраны»:

```css
.siglist { display: flex; flex-direction: column; gap: 8px; }

.siglist__note {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-dim);
  text-align: center;
}

.sigrow-wrap { display: flex; flex-direction: column; }

.sigrow {
  font: inherit;
  color: inherit;
  text-align: left;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.sigrow__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sigrow__title { font-size: 14px; font-weight: 600; }
.sigrow__date { font-size: 11px; color: var(--text-mute); }

.sigrow__badge {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

.sigrow__badge--up { background: rgba(34, 197, 94, 0.14); color: var(--success); }
.sigrow__badge--down { background: rgba(239, 68, 68, 0.14); color: var(--danger); }
.sigrow__badge--flat { background: var(--surface-2); color: var(--text-dim); }

.sigrow__lock { display: flex; color: var(--text-mute); }
.sigrow__lock svg { width: 16px; height: 16px; }

.sigrow__card { margin-top: 8px; }
```

Закрытая строка курсором не приглашает: добавить сразу следом

```css
.sigrow:has(.sigrow__lock) { cursor: default; }
```

Если `:has()` в целевом вебвью окажется недоступен, курсор останется `pointer` — это косметика, а не поведение;
блокировка раскрытия сделана в JS.

- [ ] **Step 9: Проверить на стенде**

В заглушке стенда добавить `/api/signals`, возвращающий три записи: две закрытые и одну открытую (для открытой —
полный `SIGNAL` из стенда плюс `id`, `createdAt`, `locked: false`).

Expected:
- с доступом: строки с бейджами `BUY`/`SELL`, тап раскрывает полную карточку под строкой, повторный тап сворачивает;
- без доступа: замки вместо бейджей, тап ничего не делает, под списком текст и CTA;
- пустой список с доступом: «Здесь появятся твои сигналы» и кнопка, ведущая на таб «Скриншот»;
- пустой список без доступа: прежняя заглушка «Доступно в полной версии»;
- ошибка `/api/signals` (заглушку временно переключить на `500`): карточка с «Попробовать снова», кнопка
  перезапрашивает;
- даты: «сегодня, HH:MM» на свежих записях.

- [ ] **Step 10: Коммит**

```bash
git add public/js/screens/signals.js public/js/screens/locked.js public/js/format.js public/js/app.js public/style.css tests/format.test.ts
git commit -m "feat: show the signal history in the Signals tab"
```

---

## Task 8: Итоговая верификация

**Files:** ничего не меняется.

- [ ] **Step 1: Тесты и типы**

Run: `npm test`
Expected: PASS, все файлы.

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 2: Пейволл не течёт**

Run: `grep -rn "forViewer" src`
Expected: три совпадения — объявление в `src/signals/visibility.ts` и по одному использованию в
`src/routes/analyze.ts` и `src/routes/signals.ts`. Любой четвёртый путь, отдающий сигнал клиенту в обход
`forViewer`, — дыра.

Run: `grep -rn "record.signal\|\.signal\b" src/routes`
Expected: ни одного места, где содержимое сигнала кладётся в ответ напрямую.

- [ ] **Step 3: Старый контракт не остался**

Run: `grep -rn "ALREADY_USED\|alreadyUsed\|freeRunLimitEnabled\|FREE_RUN_LIMIT_ENABLED" src public tests README.md .env.example`
Expected: ноль совпадений.

- [ ] **Step 4: Три состояния доступа на стенде**

Пройти на 360px и 1400px все три конфигурации `/api/me` (`hasAccess`/`teaserUsed`: `false/false`, `false/true`,
`true/*`) во всех четырёх фазах экрана «Скриншот» и на табе «Сигналы».
Expected: поведение совпадает с таблицей состояний в спеке; горизонтального скролла нет; мобильная раскладка не
изменилась.

- [ ] **Step 5: Чистота репозитория**

Run: `git status --short`
Expected: пусто (кроме незакоммиченного `.env`, который не отслеживается).

Run: `git log --oneline main..HEAD`
Expected: семь коммитов — таблица и репозиторий, модуль видимости, `/api/analyze`, `/api/signals`, `/api/me`,
окно тизера, таб «Сигналы».

- [ ] **Step 6: Проход в Telegram (делает владелец)**

Поднять туннель. Проверить на своём аккаунте: без доступа — разбор один раз, окно, вторая попытка даёт CTA без
ожидания; выдать себе доступ в админке — история открывается целиком, включая тот самый закрытый сигнал; снять
доступ — история закрывается обратно.
