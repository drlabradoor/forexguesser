# Pocket Bot UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перестроить фронтенд Telegram Mini App под дизайн-референс «pocket bot» и расширить контракт сигнала распознаванием инструмента, таймфрейма и «ключевых признаков».

**Architecture:** Бэкенд остаётся Express + Postgres; меняется форма `Signal`, `/api/me` начинает отдавать профиль и баланс, лимит бесплатного прогона уходит за флаг. Фронтенд переписывается с нуля на ванильных ES-модулях без сборки: оболочка с тремя табами, единый объект состояния, экранные модули рендерят DOM.

**Tech Stack:** TypeScript + tsx (без компиляции), Express 4, pg, `@anthropic-ai/sdk`, vitest + supertest + pg-mem. Фронтенд — ES-модули в браузере, `telegram-web-app.js`, без бандлера и без зависимостей.

**Spec:** [docs/superpowers/specs/2026-08-21-pocketbot-ui-redesign.md](../specs/2026-08-21-pocketbot-ui-redesign.md)

## Global Constraints

- **Никакой сборки.** Bothost монтирует исходники в `/app` после сборки образа и затирает артефакты. Ни бандлера, ни шага компиляции, ни новых рантайм-зависимостей во фронтенде. Проверка типов — только `npm run typecheck`.
- **Импорты в `src/` пишутся с расширением `.js`** (ESM + tsx), даже когда файл — `.ts`. Следовать существующему стилю: `import { x } from './y.js'`.
- **Язык:** весь пользовательский текст — русский. Комментарии в коде — английский (как в существующем `src/`).
- **Тема всегда тёмная.** `themeParams` Telegram игнорируются, палитра фиксированная.
- **Дизайн-токены** (точные значения): `--bg: #0D0E10`, `--surface: #17181C`, `--surface-2: #1F2025`, `--border: #26272C`, `--accent: #F5A623`, `--success: #22C55E`, `--danger: #EF4444`, `--warn: #EAB308`, `--text: #F2F3F5`, `--text-dim: #8A8D94`, `--text-mute: #5C5F66`.
- **Радиусы:** карточки `16px`, кнопки `14px`, чипы `999px`. Основная кнопка — высота `52px`, текст `#0D0E10` весом `600` на `--accent`.
- **Цены выводятся через `String(value)`**, без `toFixed` — иначе пятизначные котировки `1.08234` схлопнутся в `1.08`.
- **Баланс форматируется** как `Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` + ` $` → `32 688,59 $`.
- **Каждая задача заканчивается коммитом.** `npm test` и `npm run typecheck` зелёные перед коммитом.
- **Базовая линия:** на старте 44 теста в 11 файлах проходят, `tsc --noEmit` чистый. Ветка — `feat/pocketbot-ui`.

---

## File Structure

**Бэкенд (изменяется):**

| Файл | Ответственность |
|---|---|
| `src/types.ts` | `Signal`, `KeyPoint`, `TelegramUser`, `UserRecord` |
| `src/balance.ts` | детерминированная генерация косметического баланса |
| `src/config.ts` | загрузка и валидация env |
| `src/telegram/initData.ts` | проверка подписи и разбор `initData` |
| `src/telegram/deeplink.ts` | **новый** — сборка ссылки в личку с предзаполненным текстом |
| `src/claude/analyzeChart.ts` | промпт, tool-схема, разбор ответа модели |
| `src/routes/me.ts` | профиль + баланс + флаг использования |
| `src/routes/analyze.ts` | приём картинки, лимит, вызов модели |
| `src/app.ts` | сборка Express-приложения |
| `src/server.ts` | точка входа |

**Фронтенд (создаётся заново):**

| Файл | Ответственность |
|---|---|
| `public/index.html` | оболочка: контейнер контента + таб-бар |
| `public/style.css` | токены и все компоненты |
| `public/js/app.js` | точка входа, загрузка конфига и профиля, роутер табов |
| `public/js/state.js` | единый объект состояния + подписка на изменения |
| `public/js/api.js` | `fetch`-обёртки поверх `initData`, типизированные ошибки |
| `public/js/icons.js` | инлайновые SVG-строки |
| `public/js/format.js` | форматирование цен и баланса |
| `public/js/image.js` | валидация файла и ресайз через canvas |
| `public/js/cta.js` | открытие личного чата через `openTelegramLink` |
| `public/js/screens/screenshot.js` | главный таб: профиль, баланс, дропзона, анализ, результат, ошибки |
| `public/js/screens/locked.js` | общая заглушка «Доступно в полной версии» |

`public/app.js` удаляется. `public/admin.html` и `public/admin.js` не трогаются, но `admin.html` подключает тот же `style.css` — стили админской таблицы и кнопок обязаны сохраниться.

---

## Task 1: Детерминированный баланс

**Files:**
- Modify: `src/balance.ts`
- Test: `tests/balance.test.ts`

**Interfaces:**
- Consumes: ничего
- Produces: `generateBalance(telegramId: number): number` — стабильное для одного ID число в диапазоне 5000–45000 с не более чем двумя знаками после запятой

- [ ] **Step 1: Переписать тест под новое поведение**

Заменить содержимое `tests/balance.test.ts` целиком:

```ts
import { describe, it, expect } from 'vitest';
import { generateBalance } from '../src/balance.js';

describe('generateBalance', () => {
  it('returns the same balance for the same telegram id', () => {
    expect(generateBalance(8185867317)).toBe(generateBalance(8185867317));
  });

  it('stays within 5000 and 45000 with at most two decimals', () => {
    for (let id = 1; id <= 300; id++) {
      const value = generateBalance(id);
      expect(value).toBeGreaterThanOrEqual(5000);
      expect(value).toBeLessThanOrEqual(45000);
      expect(Number(value.toFixed(2))).toBe(value);
    }
  });

  it('produces different balances for different ids', () => {
    const values = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(generateBalance));
    expect(values.size).toBeGreaterThan(8);
  });

  it('produces fractional balances, not only round numbers', () => {
    const anyFractional = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((id) => !Number.isInteger(generateBalance(id)));
    expect(anyFractional).toBe(true);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/balance.test.ts`
Expected: FAIL — `generateBalance` пока игнорирует аргумент и возвращает случайное целое, первый же тест на стабильность не проходит.

- [ ] **Step 3: Реализовать**

Заменить содержимое `src/balance.ts` целиком:

```ts
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
```

- [ ] **Step 4: Обновить единственное место вызова**

`src/routes/analyze.ts` пока ещё вызывает `generateBalance()` без аргумента — без правки `tsc` упадёт. В Task 6 эта строка уйдёт совсем, но сейчас её нужно привести в порядок:

```ts
      const balance = user.balanceOverride ?? generateBalance(telegramUser.id);
```

- [ ] **Step 5: Прогнать тесты и типы**

Run: `npx vitest run tests/balance.test.ts`
Expected: PASS, 4 теста.

Run: `npm test`
Expected: PASS. Тест `uses balanceOverride instead of a random balance when set` продолжает проходить — оверрайд по-прежнему выигрывает у генерации.

Run: `npx tsc --noEmit`
Expected: без вывода.

- [ ] **Step 6: Коммит**

```bash
git add src/balance.ts src/routes/analyze.ts tests/balance.test.ts
git commit -m "feat: make the cosmetic balance deterministic per user"
```

---

## Task 2: `photo_url` в initData

**Files:**
- Modify: `src/types.ts`, `src/telegram/initData.ts`
- Test: `tests/telegram/initData.test.ts`

**Interfaces:**
- Consumes: ничего
- Produces: `TelegramUser.photoUrl?: string` — доступно во всех хендлерах через `req.telegramUser`

- [ ] **Step 1: Добавить тесты**

Дописать в `tests/telegram/initData.test.ts` внутрь `describe('validateInitData', ...)`:

```ts
  it('returns photoUrl when the user object carries photo_url', () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({
      id: 42,
      first_name: 'Dima',
      photo_url: 'https://t.me/i/userpic/320/abc.jpg',
    });
    const initData = buildInitData({ auth_date: authDate, user }, BOT_TOKEN);

    expect(validateInitData(initData, BOT_TOKEN)?.photoUrl).toBe('https://t.me/i/userpic/320/abc.jpg');
  });

  it('leaves photoUrl undefined when photo_url is absent', () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 42, first_name: 'Dima' });
    const initData = buildInitData({ auth_date: authDate, user }, BOT_TOKEN);

    expect(validateInitData(initData, BOT_TOKEN)?.photoUrl).toBeUndefined();
  });
```

- [ ] **Step 2: Убедиться, что первый тест падает**

Run: `npx vitest run tests/telegram/initData.test.ts`
Expected: FAIL — «returns photoUrl…» получает `undefined`.

- [ ] **Step 3: Реализовать**

В `src/types.ts` в интерфейсе `TelegramUser` добавить последним полем:

```ts
  photoUrl?: string;
```

В `src/telegram/initData.ts` заменить финальный блок разбора:

```ts
  const parsed = JSON.parse(userJson) as {
    id: number;
    first_name: string;
    username?: string;
    photo_url?: string;
  };
  return {
    id: parsed.id,
    firstName: parsed.first_name,
    username: parsed.username,
    photoUrl: parsed.photo_url,
  };
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run tests/telegram/initData.test.ts`
Expected: PASS, 6 тестов. Существующий тест с `toEqual({ id: 42, firstName: 'Dima', username: 'dima' })` продолжает проходить — vitest не различает отсутствующее и `undefined`-поле.

- [ ] **Step 5: Коммит**

```bash
git add src/types.ts src/telegram/initData.ts tests/telegram/initData.test.ts
git commit -m "feat: expose the Telegram avatar url from initData"
```

---

## Task 3: Флаг лимита бесплатного прогона

**Files:**
- Modify: `src/config.ts`, `.env.example`, `README.md`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: ничего
- Produces: `Config.freeRunLimitEnabled: boolean` — `false` только при `FREE_RUN_LIMIT_ENABLED=false`, иначе `true`

- [ ] **Step 1: Добавить тесты**

Дописать в `tests/config.test.ts` внутрь `describe('loadConfig', ...)`:

```ts
  it('enables the free run limit by default', () => {
    delete process.env.FREE_RUN_LIMIT_ENABLED;
    expect(loadConfig().freeRunLimitEnabled).toBe(true);
  });

  it('disables the free run limit only for the literal "false"', () => {
    process.env.FREE_RUN_LIMIT_ENABLED = 'false';
    expect(loadConfig().freeRunLimitEnabled).toBe(false);
  });

  it('keeps the limit enabled for any other value', () => {
    process.env.FREE_RUN_LIMIT_ENABLED = 'true';
    expect(loadConfig().freeRunLimitEnabled).toBe(true);
    process.env.FREE_RUN_LIMIT_ENABLED = 'no';
    expect(loadConfig().freeRunLimitEnabled).toBe(true);
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `freeRunLimitEnabled` отсутствует в возвращаемом объекте.

- [ ] **Step 3: Реализовать**

В `src/config.ts` в интерфейс `Config` добавить после `skipBotPolling`:

```ts
  freeRunLimitEnabled: boolean;
```

В возвращаемый объект `loadConfig()` добавить последним полем:

```ts
    // Opt-out, not opt-in: a forgotten variable keeps the paywall on.
    freeRunLimitEnabled: process.env.FREE_RUN_LIMIT_ENABLED !== 'false',
```

`REQUIRED_KEYS` не трогать — переменная необязательная.

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS, 6 тестов.

- [ ] **Step 5: Задокументировать переменную**

В `.env.example` дописать в конец:

```
# Set to false to let every user analyse without the one-free-run limit.
FREE_RUN_LIMIT_ENABLED=true
```

В `README.md` в таблицу переменных окружения добавить строку после `SKIP_BOT_POLLING`:

```
| `FREE_RUN_LIMIT_ENABLED` | нет | По умолчанию `true`. `false` снимает лимит «один бесплатный анализ на пользователя» — проверка остаётся в коде и включается обратно этой же переменной |
```

- [ ] **Step 6: Коммит**

```bash
git add src/config.ts tests/config.test.ts .env.example README.md
git commit -m "feat: put the free run limit behind FREE_RUN_LIMIT_ENABLED"
```

---

## Task 4: Инструмент, таймфрейм и ключевые признаки от Claude

**Files:**
- Modify: `src/types.ts`, `src/claude/analyzeChart.ts`
- Test: `tests/claude/analyzeChart.test.ts`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `interface KeyPoint { text: string; status: 'ok' | 'warn' }`
  - `Signal` с дополнительными `instrument: string | null`, `timeframe: string | null`, `keyPoints: KeyPoint[]`
  - `analyzeChart(client, imageBase64, mediaType: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<Signal>`

- [ ] **Step 1: Написать падающие тесты**

Заменить содержимое `tests/claude/analyzeChart.test.ts` целиком:

```ts
import { describe, it, expect, vi } from 'vitest';
import { analyzeChart } from '../../src/claude/analyzeChart.js';

function fakeClientReturning(content: unknown[]) {
  return { messages: { create: vi.fn().mockResolvedValue({ content }) } } as any;
}

const FULL_INPUT = {
  trend: 'bearish',
  instrument: 'AUD/CHF',
  timeframe: 'M15',
  entry_price: 1.085,
  stop_loss: 1.09,
  take_profit_1: 1.08,
  take_profit_2: 1.075,
  take_profit_3: 1.07,
  key_points: [
    { text: 'Интерфейс торговой платформы идентифицирован.', status: 'ok' },
    { text: 'Обнаружена валютная пара: AUD/CHF.', status: 'ok' },
    { text: 'Свечная структура распознана.', status: 'ok' },
  ],
  rationale: 'Цена отбилась от сопротивления.',
};

function toolUse(input: unknown) {
  return [{ type: 'tool_use', name: 'provide_signal', input }];
}

describe('analyzeChart', () => {
  it('parses a tool_use response into a Signal', async () => {
    const result = await analyzeChart(fakeClientReturning(toolUse(FULL_INPUT)), 'base64data', 'image/png');

    expect(result).toEqual({
      trend: 'bearish',
      instrument: 'AUD/CHF',
      timeframe: 'M15',
      entryPrice: 1.085,
      stopLoss: 1.09,
      takeProfit1: 1.08,
      takeProfit2: 1.075,
      takeProfit3: 1.07,
      keyPoints: [
        { text: 'Интерфейс торговой платформы идентифицирован.', status: 'ok' },
        { text: 'Обнаружена валютная пара: AUD/CHF.', status: 'ok' },
        { text: 'Свечная структура распознана.', status: 'ok' },
      ],
      rationale: 'Цена отбилась от сопротивления.',
    });
  });

  it('normalises unreadable instrument and timeframe to null', async () => {
    const client = fakeClientReturning(toolUse({ ...FULL_INPUT, instrument: null, timeframe: '' }));
    const result = await analyzeChart(client, 'base64data', 'image/png');

    expect(result.instrument).toBeNull();
    expect(result.timeframe).toBeNull();
  });

  it('defaults a key point to "ok" when the model omits or mangles the status', async () => {
    const client = fakeClientReturning(
      toolUse({ ...FULL_INPUT, key_points: [{ text: 'a' }, { text: 'b', status: 'warn' }, { text: 'c', status: 'x' }] })
    );
    const result = await analyzeChart(client, 'base64data', 'image/png');

    expect(result.keyPoints).toEqual([
      { text: 'a', status: 'ok' },
      { text: 'b', status: 'warn' },
      { text: 'c', status: 'ok' },
    ]);
  });

  it('returns an empty keyPoints array when the model omits the field', async () => {
    const { key_points, ...withoutPoints } = FULL_INPUT;
    const result = await analyzeChart(fakeClientReturning(toolUse(withoutPoints)), 'base64data', 'image/png');

    expect(result.keyPoints).toEqual([]);
  });

  it('declares instrument, timeframe and key_points in the tool schema', async () => {
    const client = fakeClientReturning(toolUse(FULL_INPUT));
    await analyzeChart(client, 'abc', 'image/png');

    const schema = client.messages.create.mock.calls[0][0].tools[0].input_schema;
    expect(schema.properties.instrument).toBeDefined();
    expect(schema.properties.timeframe).toBeDefined();
    expect(schema.properties.key_points.type).toBe('array');
    expect(schema.required).toContain('key_points');
  });

  it('calls the API with model claude-sonnet-5 and the image as a base64 content block', async () => {
    const client = fakeClientReturning(toolUse(FULL_INPUT));
    await analyzeChart(client, 'abc123', 'image/webp');

    const call = client.messages.create.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-5');
    expect(call.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/webp', data: 'abc123' },
    });
  });

  it('throws when no tool_use block is returned', async () => {
    const client = fakeClientReturning([{ type: 'text', text: 'oops' }]);
    await expect(analyzeChart(client, 'base64data', 'image/png')).rejects.toThrow(
      'Claude did not return a tool_use block'
    );
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/claude/analyzeChart.test.ts`
Expected: FAIL — новых полей нет в результате, схема не объявляет `instrument`.

- [ ] **Step 3: Обновить типы**

В `src/types.ts` добавить перед `Signal`:

```ts
export interface KeyPoint {
  text: string;
  status: 'ok' | 'warn';
}
```

И привести `Signal` к виду:

```ts
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
```

- [ ] **Step 4: Обновить промпт и tool-схему**

В `src/claude/analyzeChart.ts` заменить `SYSTEM_PROMPT` на:

```ts
const SYSTEM_PROMPT = `Ты — опытный трейдинг-аналитик, специализирующийся на техническом анализе графиков форекс и
криптовалют. Тебе присылают скриншот графика цены (свечной или линейный). Внимательно изучи видимые на изображении
данные: название инструмента и таймфрейм в интерфейсе платформы, подписи цен на оси, форму последних свечей, видимые
уровни поддержки/сопротивления, видимые индикаторы (если есть).

Верни торговый сигнал: направление (bullish/bearish/neutral), цену входа, стоп-лосс и три уровня тейк-профита. Все
числовые уровни должны быть согласованы между собой и с видимым на графике диапазоном цен:
- Для bullish: stop_loss < entry_price < take_profit_1 < take_profit_2 < take_profit_3
- Для bearish: take_profit_3 < take_profit_2 < take_profit_1 < entry_price < stop_loss

Дополнительно:
- instrument — торговый инструмент так, как он подписан на графике, например "AUD/CHF" или "BTC/USD". Если подпись
  не читается — верни null. Не угадывай пару по форме свечей.
- timeframe — таймфрейм в нотации M1/M5/M15/M30/H1/H4/D1. Если он не виден на скриншоте — верни null.
- key_points — от 3 до 5 коротких утверждений на русском о том, что именно ты разглядел на скриншоте. status "ok"
  для того, что удалось распознать, status "warn" для того, что прочитать не удалось. Если instrument или timeframe
  вернулись как null, обязательно добавь соответствующий пункт со status "warn".
- rationale — обоснование сигнала на русском, 2-3 предложения, простым языком.`;
```

Заменить `SignalToolInput` на:

```ts
interface SignalToolInput {
  trend: 'bullish' | 'bearish' | 'neutral';
  instrument?: string | null;
  timeframe?: string | null;
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  key_points?: { text: string; status?: string }[];
  rationale: string;
}

/** The model may signal "unreadable" as null, an empty string or the word "null". */
function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.toLowerCase() === 'null' ? null : trimmed;
}
```

В `input_schema.properties` добавить (порядок значения не имеет):

```ts
            instrument: {
              type: ['string', 'null'],
              description: 'Инструмент как подписан на графике, например "AUD/CHF". null, если не читается.',
            },
            timeframe: {
              type: ['string', 'null'],
              description: 'Таймфрейм в нотации M1/M5/M15/M30/H1/H4/D1. null, если не виден.',
            },
            key_points: {
              type: 'array',
              minItems: 3,
              maxItems: 5,
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  status: { type: 'string', enum: ['ok', 'warn'] },
                },
                required: ['text', 'status'],
              },
            },
```

В массив `required` добавить `'instrument'`, `'timeframe'`, `'key_points'`.

Заменить финальный `return`:

```ts
  const input = toolUse.input as SignalToolInput;
  return {
    trend: input.trend,
    instrument: normalizeOptional(input.instrument),
    timeframe: normalizeOptional(input.timeframe),
    entryPrice: input.entry_price,
    stopLoss: input.stop_loss,
    takeProfit1: input.take_profit_1,
    takeProfit2: input.take_profit_2,
    takeProfit3: input.take_profit_3,
    keyPoints: (input.key_points ?? []).map((point) => ({
      text: point.text,
      status: point.status === 'warn' ? 'warn' : 'ok',
    })),
    rationale: input.rationale,
  };
```

Расширить сигнатуру функции — третий параметр становится:

```ts
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
```

- [ ] **Step 5: Прогнать тесты**

Run: `npx vitest run tests/claude/analyzeChart.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Step 6: Коммит**

```bash
git add src/types.ts src/claude/analyzeChart.ts tests/claude/analyzeChart.test.ts
git commit -m "feat: recognise instrument, timeframe and key points from the chart"
```

---

## Task 5: `/api/me` отдаёт профиль и баланс

**Files:**
- Modify: `src/routes/me.ts`
- Create: `tests/routes/me.test.ts`

**Interfaces:**
- Consumes: `generateBalance(telegramId)` (Task 1), `TelegramUser.photoUrl` (Task 2)
- Produces: `GET /api/me` → `{ alreadyUsed: boolean, user: { telegramId: number, firstName: string, photoUrl: string | null }, balance: number }`

- [ ] **Step 1: Написать тест**

Создать `tests/routes/me.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb } from '../helpers/testDb.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createMeHandler } from '../../src/routes/me.js';
import { generateBalance } from '../../src/balance.js';

const BOT_TOKEN = 'test-bot-token';

function buildInitData(telegramId: number, extraUserFields: Record<string, unknown> = {}): string {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: 'Max', ...extraUserFields }),
  };
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${(fields as any)[k]}`);
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(pairs.join('\n')).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

let usersRepo: UsersRepo;
let app: express.Express;

beforeEach(async () => {
  usersRepo = new UsersRepo(await createTestDb());
  app = express();
  app.get('/api/me', createAuthMiddleware(BOT_TOKEN), createMeHandler(usersRepo));
});

describe('GET /api/me', () => {
  it('returns the profile, the generated balance and alreadyUsed=false for a new user', async () => {
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(10));

    expect(response.status).toBe(200);
    expect(response.body.alreadyUsed).toBe(false);
    expect(response.body.user).toEqual({ telegramId: 10, firstName: 'Max', photoUrl: null });
    expect(response.body.balance).toBe(generateBalance(10));
  });

  it('passes photo_url through as photoUrl', async () => {
    const initData = buildInitData(11, { photo_url: 'https://t.me/i/userpic/320/x.jpg' });
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', initData);

    expect(response.body.user.photoUrl).toBe('https://t.me/i/userpic/320/x.jpg');
  });

  it('prefers balanceOverride over the generated balance', async () => {
    await usersRepo.setBalanceOverride(12, 32688.59);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(12));

    expect(response.body.balance).toBe(32688.59);
  });

  it('reports alreadyUsed=true once the free run is spent', async () => {
    await usersRepo.markRunUsed(13);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(13));

    expect(response.body.alreadyUsed).toBe(true);
  });

  it('reports alreadyUsed=false for a spent run when unlimited access is granted', async () => {
    await usersRepo.markRunUsed(14);
    await usersRepo.setUnlimited(14, true);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(14));

    expect(response.body.alreadyUsed).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/routes/me.test.ts`
Expected: FAIL — `response.body.user` и `response.body.balance` не определены.

- [ ] **Step 3: Реализовать**

Заменить содержимое `src/routes/me.ts` целиком:

```ts
import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';
import { generateBalance } from '../balance.js';

export function createMeHandler(usersRepo: UsersRepo) {
  return async function meHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const user = await usersRepo.getOrCreate(telegramUser.id);
      res.json({
        alreadyUsed: user.freeRunUsed && !user.unlimitedAccess,
        user: {
          telegramId: telegramUser.id,
          firstName: telegramUser.firstName,
          photoUrl: telegramUser.photoUrl ?? null,
        },
        balance: user.balanceOverride ?? generateBalance(telegramUser.id),
      });
    } catch (err) {
      next(err);
    }
  };
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run tests/routes/me.test.ts`
Expected: PASS, 5 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/routes/me.ts tests/routes/me.test.ts
git commit -m "feat: serve the profile and balance from /api/me"
```

---

## Task 6: Лимит за флагом, WebP, ответ без баланса

**Files:**
- Modify: `src/routes/analyze.ts`, `src/app.ts`
- Test: `tests/routes/analyze.test.ts`, `tests/server.test.ts`

**Interfaces:**
- Consumes: `Config.freeRunLimitEnabled` (Task 3), обновлённый `analyzeChart` (Task 4)
- Produces:
  - `createAnalyzeHandler(usersRepo: UsersRepo, claude: Anthropic, freeRunLimitEnabled: boolean)`
  - `AppDeps.freeRunLimitEnabled: boolean`
  - `POST /api/analyze` → `{ signal }`, принимает `image/png | image/jpeg | image/webp`

- [ ] **Step 1: Переписать тесты роута**

Заменить в `tests/routes/analyze.test.ts` `SAMPLE_SIGNAL`, `buildApp` и весь блок `describe`:

```ts
function buildApp(usersRepo: UsersRepo, signal: unknown, freeRunLimitEnabled = true) {
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
    createAnalyzeHandler(usersRepo, fakeClaude, freeRunLimitEnabled)
  );
  return app;
}

const SAMPLE_SIGNAL = {
  trend: 'bullish',
  instrument: 'EUR/USD',
  timeframe: 'M15',
  entry_price: 1.1,
  stop_loss: 1.09,
  take_profit_1: 1.11,
  take_profit_2: 1.12,
  take_profit_3: 1.13,
  key_points: [{ text: 'a', status: 'ok' }],
  rationale: 'test rationale',
};

let usersRepo: UsersRepo;

beforeEach(async () => {
  usersRepo = new UsersRepo(await createTestDb());
});

describe('POST /api/analyze', () => {
  it('returns the signal without a balance on first use', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(1))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.signal.trend).toBe('bullish');
    expect(response.body.signal.instrument).toBe('EUR/USD');
    expect(response.body.balance).toBeUndefined();
    expect((await usersRepo.getOrCreate(1)).freeRunUsed).toBe(true);
  });

  it('returns 403 ALREADY_USED on the second attempt', async () => {
    const app = buildApp(usersRepo, SAMPLE_SIGNAL);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(2))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(403);
    expect(second.body).toEqual({ error: 'ALREADY_USED' });
  });

  it('allows a second attempt when the limit is disabled', async () => {
    const app = buildApp(usersRepo, SAMPLE_SIGNAL, false);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(6))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(200);
  });

  it('still records the spent run while the limit is disabled', async () => {
    await request(buildApp(usersRepo, SAMPLE_SIGNAL, false))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(7))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect((await usersRepo.getOrCreate(7)).freeRunUsed).toBe(true);
  });

  it('allows repeated use when unlimited_access is set', async () => {
    await usersRepo.setUnlimited(3, true);
    const app = buildApp(usersRepo, SAMPLE_SIGNAL);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(3))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(200);
  });

  it('accepts image/webp', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(8))
      .send({ imageBase64: 'abc', mediaType: 'image/webp' });

    expect(response.status).toBe(200);
  });

  it('returns 400 for an unsupported media type', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(9))
      .send({ imageBase64: 'abc', mediaType: 'image/gif' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'MISSING_IMAGE' });
  });

  it('returns 400 when imageBase64 is missing', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(5))
      .send({ mediaType: 'image/png' });

    expect(response.status).toBe(400);
  });
});
```

Тест `uses balanceOverride instead of a random balance when set` удаляется — баланс переехал в `/api/me`, где он покрыт тестом из Task 5.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run tests/routes/analyze.test.ts`
Expected: FAIL — `createAnalyzeHandler` принимает два аргумента, ответ всё ещё содержит `balance`.

- [ ] **Step 3: Реализовать**

Заменить содержимое `src/routes/analyze.ts` целиком:

```ts
import type { Request, Response, NextFunction } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import type { UsersRepo } from '../db/users.repo.js';
import { analyzeChart } from '../claude/analyzeChart.js';

const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

function isAllowedMediaType(value: unknown): value is AllowedMediaType {
  return ALLOWED_MEDIA_TYPES.includes(value as AllowedMediaType);
}

export function createAnalyzeHandler(usersRepo: UsersRepo, claude: Anthropic, freeRunLimitEnabled: boolean) {
  return async function analyzeHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const { imageBase64, mediaType } = req.body as { imageBase64?: string; mediaType?: string };

      if (!imageBase64 || !isAllowedMediaType(mediaType)) {
        res.status(400).json({ error: 'MISSING_IMAGE' });
        return;
      }

      const user = await usersRepo.getOrCreate(telegramUser.id);
      if (freeRunLimitEnabled && user.freeRunUsed && !user.unlimitedAccess) {
        res.status(403).json({ error: 'ALREADY_USED' });
        return;
      }

      const signal = await analyzeChart(claude, imageBase64, mediaType);

      // Recorded even while the limit is off, so flipping the flag back on
      // does not hand everyone a fresh free run.
      if (!user.unlimitedAccess) {
        await usersRepo.markRunUsed(telegramUser.id);
      }

      res.json({ signal });
    } catch (err) {
      next(err);
    }
  };
}
```

- [ ] **Step 4: Прокинуть флаг через app.ts**

В `src/app.ts` в интерфейс `AppDeps` добавить после `targetUrl`:

```ts
  freeRunLimitEnabled: boolean;
```

И заменить регистрацию роута:

```ts
  app.post(
    '/api/analyze',
    authMiddleware,
    createAnalyzeHandler(deps.usersRepo, deps.claude, deps.freeRunLimitEnabled)
  );
```

- [ ] **Step 5: Починить server.test.ts**

В `tests/server.test.ts` в объект, передаваемый в `buildApp`, добавить после `targetUrl`:

```ts
    freeRunLimitEnabled: true,
```

- [ ] **Step 6: Прогнать всё**

Run: `npm test`
Expected: PASS. `npx tsc --noEmit` — здесь всплывёт ошибка в `src/server.ts`: `buildApp` требует нового поля. Это чинится в Task 7, но чтобы коммит был зелёным, добавь в `src/server.ts` в объект `buildApp({...})` строку `freeRunLimitEnabled: config.freeRunLimitEnabled,` прямо сейчас.

Run: `npx tsc --noEmit`
Expected: без вывода.

- [ ] **Step 7: Коммит**

```bash
git add src/routes/analyze.ts src/app.ts src/server.ts tests/routes/analyze.test.ts tests/server.test.ts
git commit -m "feat: gate the free run limit, accept WebP, drop balance from analyze"
```

---

## Task 7: Диплинк с предзаполненным сообщением

**Files:**
- Create: `src/telegram/deeplink.ts`, `tests/telegram/deeplink.test.ts`
- Modify: `src/server.ts`

**Interfaces:**
- Consumes: ничего
- Produces: `buildTargetUrl(username: string): string`, `ACCESS_REQUEST_TEXT: string`

- [ ] **Step 1: Написать тест**

Создать `tests/telegram/deeplink.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTargetUrl, ACCESS_REQUEST_TEXT } from '../../src/telegram/deeplink.js';

describe('buildTargetUrl', () => {
  it('points at the username and prefills the access request', () => {
    const url = new URL(buildTargetUrl('targetuser'));

    expect(url.origin + url.pathname).toBe('https://t.me/targetuser');
    expect(url.searchParams.get('text')).toBe(ACCESS_REQUEST_TEXT);
  });

  it('percent-encodes the Cyrillic message', () => {
    expect(buildTargetUrl('targetuser')).not.toContain(' ');
    expect(buildTargetUrl('targetuser')).toContain('%');
  });

  it('asks for access in Russian', () => {
    expect(ACCESS_REQUEST_TEXT).toBe('Хочу доступ к боту');
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/telegram/deeplink.test.ts`
Expected: FAIL — модуль `src/telegram/deeplink.ts` не существует.

- [ ] **Step 3: Реализовать**

Создать `src/telegram/deeplink.ts`:

```ts
export const ACCESS_REQUEST_TEXT = 'Хочу доступ к боту';

/**
 * `?text=` prefills the message box in the target's chat, so the user only
 * has to hit send. Telegram applies it to public usernames, not to bots.
 */
export function buildTargetUrl(username: string): string {
  return `https://t.me/${username}?text=${encodeURIComponent(ACCESS_REQUEST_TEXT)}`;
}
```

- [ ] **Step 4: Подключить в server.ts**

В `src/server.ts` добавить импорт:

```ts
import { buildTargetUrl } from './telegram/deeplink.js';
```

И заменить строку в объекте `buildApp`:

```ts
    targetUrl: buildTargetUrl(config.targetUsername),
```

- [ ] **Step 5: Прогнать тесты и типы**

Run: `npx vitest run tests/telegram/deeplink.test.ts` → PASS, 3 теста
Run: `npm test` → PASS
Run: `npx tsc --noEmit` → без вывода

- [ ] **Step 6: Коммит**

```bash
git add src/telegram/deeplink.ts tests/telegram/deeplink.test.ts src/server.ts
git commit -m "feat: prefill the access request in the deeplink"
```

---

## Task 8: Оболочка, токены и таб-бар

**Files:**
- Create: `public/js/state.js`, `public/js/icons.js`, `public/js/api.js`, `public/js/app.js`, `public/js/screens/locked.js`, `public/js/screens/screenshot.js`
- Modify: `public/index.html`, `public/style.css`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: `GET /api/config`, `GET /api/me` (Task 5)
- Produces:
  - `state.js`: `const state`, `setState(patch)`, `subscribe(fn)`
  - `icons.js`: `icons.signals`, `icons.camera`, `icons.trading`, `icons.upload`, `icons.refresh`, `icons.check`, `icons.warn`, `icons.arrowUp`, `icons.arrowDown`, `icons.clock`, `icons.lock` — каждая строка с `<svg>`
  - `api.js`: `getConfig()`, `getMe()`, `postAnalyze({ imageBase64, mediaType })`, `class ApiError extends Error { status }`
  - `screens/locked.js`: `renderLocked({ icon, title, subtitle })` → `HTMLElement`
  - `screens/screenshot.js`: `renderScreenshot()` → `HTMLElement`

- [ ] **Step 1: Написать тест на раздачу статики**

Дописать в `tests/server.test.ts` в блок `describe('full app wiring', ...)`:

```ts
  it('serves the mini app shell', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<div id="app"');
  });

  it('serves the front-end modules', async () => {
    for (const path of ['/js/app.js', '/js/state.js', '/js/api.js', '/js/screens/screenshot.js']) {
      const response = await request(app).get(path);
      expect(response.status, path).toBe(200);
    }
  });
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run tests/server.test.ts`
Expected: FAIL — `/js/app.js` отдаёт 404.

- [ ] **Step 3: Написать `public/js/state.js`**

```js
const listeners = new Set();

export const state = {
  tab: 'screenshot',
  phase: 'loading', // loading | idle | selected | analyzing | result | error
  targetUrl: 'https://t.me/',
  profile: null, // { telegramId, firstName, photoUrl }
  balance: null,
  balanceMode: 'real', // real | demo
  file: null,
  previewUrl: null,
  signal: null,
  error: null, // { title, text, action } where action is 'retry' | 'cta' | 'none'
};

export function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

- [ ] **Step 4: Написать `public/js/icons.js`**

Каждая иконка — строка с `<svg>` на `currentColor`, viewBox `0 0 24 24`, `stroke-width="1.8"`, `fill="none"`, `stroke="currentColor"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. Размер задаётся через CSS (`width`/`height`), в разметке — `width="24" height="24"`.

```js
const svg = (body) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  signals: svg('<path d="M3 17l5-6 4 4 5-8"/><path d="M3 21h18"/>'),
  camera: svg('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>'),
  trading: svg('<path d="M3 21h18"/><path d="M5 21V10M10 21V10M14 21V10M19 21V10"/><path d="M12 3l9 5H3z"/>'),
  upload: svg('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>'),
  refresh: svg('<path d="M20 12a8 8 0 10-2.3 5.6"/><path d="M20 5v5h-5"/>'),
  check: svg('<path d="M4 12.5l5 5 11-11"/>'),
  warn: svg('<path d="M12 8v5"/><circle cx="12" cy="16.5" r="0.6" fill="currentColor"/><circle cx="12" cy="12" r="9"/>'),
  arrowUp: svg('<path d="M5 15l7-7 7 7"/>'),
  arrowDown: svg('<path d="M5 9l7 7 7-7"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  lock: svg('<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>'),
  wallet: svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h2"/>'),
};
```

- [ ] **Step 5: Написать `public/js/api.js`**

```js
const tg = window.Telegram?.WebApp;

export class ApiError extends Error {
  constructor(status, code) {
    super(`API ${status} ${code ?? ''}`.trim());
    this.status = status;
    this.code = code;
  }
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Telegram-Init-Data': tg?.initData ?? '',
    },
  });
  if (!response.ok) {
    let code;
    try {
      code = (await response.json()).error;
    } catch {
      code = undefined;
    }
    throw new ApiError(response.status, code);
  }
  return response.json();
}

export function getConfig() {
  return fetch('/api/config').then((r) => {
    if (!r.ok) throw new ApiError(r.status);
    return r.json();
  });
}

export function getMe() {
  return apiFetch('/api/me');
}

export function postAnalyze({ imageBase64, mediaType }) {
  return apiFetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mediaType }),
  });
}
```

- [ ] **Step 6: Написать `public/js/screens/locked.js`**

```js
import { icons } from '../icons.js';

export function renderLocked({ icon, title, subtitle }) {
  const section = document.createElement('section');
  section.className = 'locked';
  section.innerHTML = `
    <div class="locked__icon">${icon}</div>
    <h2 class="locked__title">${title}</h2>
    <p class="locked__subtitle">${subtitle}</p>
    <button class="button button--primary" data-action="cta">Получить полный доступ</button>
  `;
  section.querySelector('.locked__icon').insertAdjacentHTML('beforeend', icons.lock);
  return section;
}
```

- [ ] **Step 7: Написать заглушку `public/js/screens/screenshot.js`**

Полноценный рендер приходит в Task 9–13. Пока — минимум, чтобы роутер собрался:

```js
export function renderScreenshot() {
  const section = document.createElement('section');
  section.className = 'screen';
  return section;
}
```

- [ ] **Step 8: Написать `public/js/app.js`**

```js
import { state, setState, subscribe } from './state.js';
import { icons } from './icons.js';
import { getConfig, getMe } from './api.js';
import { renderScreenshot } from './screens/screenshot.js';
import { renderLocked } from './screens/locked.js';

const tg = window.Telegram?.WebApp;

const TABS = [
  { id: 'signals', label: 'Сигналы', icon: icons.signals },
  { id: 'screenshot', label: 'Скриншот', icon: icons.camera },
  { id: 'trading', label: 'Торговля', icon: icons.trading },
];

function renderTabBar() {
  const nav = document.getElementById('tabbar');
  nav.innerHTML = TABS.map(
    (tab) => `
      <button class="tabbar__item ${tab.id === state.tab ? 'is-active' : ''}" data-tab="${tab.id}">
        <span class="tabbar__icon">${tab.icon}</span>
        <span class="tabbar__label">${tab.label}</span>
      </button>`
  ).join('');
}

function renderContent() {
  const root = document.getElementById('content');
  root.innerHTML = '';
  if (state.tab === 'screenshot') {
    root.appendChild(renderScreenshot());
  } else if (state.tab === 'signals') {
    root.appendChild(
      renderLocked({
        icon: icons.signals,
        title: 'Доступно в полной версии',
        subtitle: 'История сигналов и уведомления о новых входах открываются вместе с полным доступом.',
      })
    );
  } else {
    root.appendChild(
      renderLocked({
        icon: icons.trading,
        title: 'Доступно в полной версии',
        subtitle: 'Сопровождение сделок и разбор точек входа — в полном доступе.',
      })
    );
  }
}

function render() {
  renderTabBar();
  renderContent();
}

document.getElementById('tabbar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (button) setState({ tab: button.dataset.tab });
});

subscribe(render);

async function init() {
  tg?.ready();
  tg?.expand();

  const [config, me] = await Promise.allSettled([getConfig(), getMe()]);

  const patch = { phase: 'idle' };
  if (config.status === 'fulfilled') patch.targetUrl = config.value.targetUrl;
  if (me.status === 'fulfilled') {
    patch.profile = me.value.user;
    patch.balance = me.value.balance;
  } else {
    // Falling back to initDataUnsafe keeps the header populated when /api/me
    // is down; the balance card stays hidden rather than showing a lie.
    const unsafe = tg?.initDataUnsafe?.user;
    patch.profile = unsafe
      ? { telegramId: unsafe.id, firstName: unsafe.first_name, photoUrl: unsafe.photo_url ?? null }
      : null;
  }
  setState(patch);
}

init();
```

- [ ] **Step 9: Переписать `public/index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Анализ графика</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="app" class="app">
    <main id="content" class="content"></main>
    <nav id="tabbar" class="tabbar"></nav>
  </div>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 10: Переписать `public/style.css` — токены, оболочка, таб-бар, заглушка**

Существующие правила для `table`, `th`, `td`, `button` из старого файла **сохранить в конце файла** под комментарием `/* Admin panel (admin.html) */` — иначе `admin.html` останется без стилей.

```css
:root {
  --bg: #0D0E10;
  --surface: #17181C;
  --surface-2: #1F2025;
  --border: #26272C;
  --accent: #F5A623;
  --success: #22C55E;
  --danger: #EF4444;
  --warn: #EAB308;
  --text: #F2F3F5;
  --text-dim: #8A8D94;
  --text-mute: #5C5F66;
  --radius-card: 16px;
  --radius-button: 14px;
  --tabbar-height: 62px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.app { min-height: 100vh; }

.content {
  padding: 16px 16px calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 24px);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: rgba(13, 14, 16, 0.94);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
}

.tabbar__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: none;
  border: 0;
  padding: 0;
  color: var(--text-mute);
  cursor: pointer;
  font: inherit;
}

.tabbar__item.is-active { color: var(--accent); }

.tabbar__item.is-active::before {
  content: '';
  position: absolute;
  top: 0;
  width: 36px;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: var(--accent);
}

.tabbar__icon { display: flex; }
.tabbar__icon svg { width: 22px; height: 22px; }
.tabbar__label { font-size: 10px; letter-spacing: 0.02em; }

.button {
  font: inherit;
  border: 0;
  border-radius: var(--radius-button);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.button--primary {
  height: 52px;
  width: 100%;
  background: var(--accent);
  color: #0D0E10;
  font-weight: 600;
  font-size: 15px;
}

.button--primary:disabled { opacity: 0.6; cursor: default; }
.button--primary svg { width: 18px; height: 18px; }

.locked {
  margin-top: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
}

.locked__icon {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.locked__icon svg { width: 30px; height: 30px; }
.locked__icon svg:last-child {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 22px;
  height: 22px;
  padding: 3px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--accent);
}

.locked__title { margin: 0; font-size: 17px; font-weight: 600; }
.locked__subtitle { margin: 0 0 12px; font-size: 13px; line-height: 1.5; color: var(--text-dim); max-width: 300px; }
.locked .button--primary { max-width: 320px; }
```

- [ ] **Step 11: Удалить старый фронтенд-скрипт**

```bash
git rm public/app.js
```

- [ ] **Step 12: Проверить синтаксис модулей и прогнать тесты**

Run: `node --check public/js/app.js && node --check public/js/state.js && node --check public/js/api.js && node --check public/js/icons.js && node --check public/js/screens/locked.js && node --check public/js/screens/screenshot.js`
Expected: без вывода (`node --check` парсит файлы как ESM, потому что `package.json` объявляет `"type": "module"`).

Run: `npm test`
Expected: PASS, включая два новых теста на статику.

- [ ] **Step 13: Коммит**

```bash
git add public tests/server.test.ts
git commit -m "feat: rebuild the mini app shell with a three-tab layout"
```

---

## Task 9: Шапка профиля и карточка баланса

**Files:**
- Create: `public/js/format.js`
- Modify: `public/js/screens/screenshot.js`, `public/style.css`

**Interfaces:**
- Consumes: `state.profile`, `state.balance`, `state.balanceMode` (Task 8)
- Produces:
  - `format.js`: `formatBalance(value): string`, `formatPrice(value): string`, `DEMO_BALANCE: number`
  - `screens/screenshot.js`: `renderScreenshot()` рисует шапку и баланс

- [ ] **Step 1: Написать `public/js/format.js`**

```js
export const DEMO_BALANCE = 10000;

const balanceFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBalance(value) {
  return `${balanceFormatter.format(value)} $`;
}

/**
 * Prices keep exactly the precision the model returned: a five-decimal forex
 * quote must not be rounded to two by a well-meaning toFixed.
 */
export function formatPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}
```

- [ ] **Step 2: Дописать рендер профиля и баланса**

Заменить содержимое `public/js/screens/screenshot.js`:

```js
import { state, setState } from '../state.js';
import { icons } from '../icons.js';
import { formatBalance, DEMO_BALANCE } from '../format.js';

function initials(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function renderProfile() {
  const profile = state.profile;
  const header = document.createElement('header');
  header.className = 'profile';
  const avatar = profile?.photoUrl
    ? `<img class="profile__avatar" src="${profile.photoUrl}" alt="" />`
    : `<div class="profile__avatar profile__avatar--fallback">${initials(profile?.firstName)}</div>`;
  header.innerHTML = `
    ${avatar}
    <div class="profile__meta">
      <div class="profile__name">${profile?.firstName ?? 'Гость'}</div>
      <div class="profile__id">ID ${profile?.telegramId ?? '—'}</div>
    </div>
  `;
  return header;
}

function currentBalance() {
  return state.balanceMode === 'demo' ? DEMO_BALANCE : state.balance;
}

function animateBalance(el, target) {
  const duration = 800;
  const start = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatBalance(target * eased);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function renderBalance() {
  if (state.balance === null) return null;
  const card = document.createElement('section');
  card.className = 'balance';
  card.innerHTML = `
    <div class="balance__top">
      <span class="balance__label">${icons.wallet}Баланс</span>
      <div class="balance__controls">
        <div class="chips">
          <button class="chip ${state.balanceMode === 'demo' ? 'is-active' : ''}" data-mode="demo">Демо</button>
          <button class="chip chip--real ${state.balanceMode === 'real' ? 'is-active' : ''}" data-mode="real">Реал</button>
        </div>
        <button class="icon-button" data-action="refresh-balance">${icons.refresh}</button>
      </div>
    </div>
    <div class="balance__value">0,00 $</div>
  `;

  const value = card.querySelector('.balance__value');
  animateBalance(value, currentBalance());

  card.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-mode]');
    if (chip) {
      const mode = chip.dataset.mode;
      localStorage.setItem('balanceMode', mode);
      setState({ balanceMode: mode });
      return;
    }
    if (event.target.closest('[data-action="refresh-balance"]')) {
      animateBalance(value, currentBalance());
    }
  });

  return card;
}

export function renderScreenshot() {
  const section = document.createElement('section');
  section.className = 'screen';
  section.appendChild(renderProfile());
  const balance = renderBalance();
  if (balance) section.appendChild(balance);
  return section;
}
```

- [ ] **Step 3: Восстановить выбранный режим при старте**

В `public/js/app.js` в функции `init()` в объект `patch` добавить первой строкой:

```js
  patch.balanceMode = localStorage.getItem('balanceMode') === 'demo' ? 'demo' : 'real';
```

- [ ] **Step 4: Добавить стили**

Дописать в `public/style.css` перед блоком админки:

```css
.screen { display: flex; flex-direction: column; gap: 14px; }

.profile { display: flex; align-items: center; gap: 10px; }

.profile__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.profile__avatar--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--text-dim);
  font-weight: 600;
  font-size: 16px;
}

.profile__name { font-size: 15px; font-weight: 600; line-height: 1.2; }
.profile__id { font-size: 12px; color: var(--text-mute); }

.balance {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 14px 16px 16px;
}

.balance__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }

.balance__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.balance__label svg { width: 13px; height: 13px; }
.balance__controls { display: flex; align-items: center; gap: 8px; }
.balance__value { margin-top: 10px; font-size: 28px; font-weight: 700; letter-spacing: -0.01em; }

.chips { display: flex; gap: 2px; background: var(--surface-2); border-radius: 999px; padding: 2px; }

.chip {
  font: inherit;
  font-size: 11px;
  border: 0;
  background: none;
  color: var(--text-dim);
  border-radius: 999px;
  padding: 4px 10px;
  cursor: pointer;
}

.chip.is-active { background: rgba(255, 255, 255, 0.08); color: var(--text); }
.chip--real.is-active { background: var(--success); color: #0D0E10; font-weight: 600; }

.icon-button {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.icon-button svg { width: 15px; height: 15px; }
```

- [ ] **Step 5: Проверить**

Run: `node --check public/js/screens/screenshot.js && node --check public/js/format.js && node --check public/js/app.js`
Expected: без вывода.

Run: `npm test` → PASS.

- [ ] **Step 6: Коммит**

```bash
git add public
git commit -m "feat: add the profile header and balance card"
```

---

## Task 10: Дропзона, превью и подготовка изображения

**Files:**
- Create: `public/js/image.js`
- Modify: `public/js/screens/screenshot.js`, `public/style.css`

**Interfaces:**
- Consumes: `state.phase`, `state.file`, `state.previewUrl`
- Produces: `image.js`: `ALLOWED_TYPES: string[]`, `prepareImage(file): Promise<{ imageBase64, mediaType }>`, `class ImageError extends Error`

- [ ] **Step 1: Написать `public/js/image.js`**

```js
const MAX_EDGE = 1568;
const MAX_BYTES = 4 * 1024 * 1024;

export const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export class ImageError extends Error {}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new ImageError('read failed'));
    reader.readAsDataURL(file);
  });
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> path below.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImageError('decode failed'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Claude downsizes anything past 1568px on the long edge anyway, and its API
 * rejects images over 5MB — doing the resize here keeps us clear of both and
 * cuts the upload on a phone connection. Re-encoding is lossless PNG on
 * purpose: JPEG artefacts smear thin candles and price labels.
 */
export async function prepareImage(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ImageError('unsupported type');
  }

  const source = await decode(file);
  const longEdge = Math.max(source.width, source.height);

  if (longEdge <= MAX_EDGE && file.size <= MAX_BYTES) {
    return { imageBase64: await fileToBase64(file), mediaType: file.type };
  }

  const scale = Math.min(1, MAX_EDGE / longEdge);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);

  return { imageBase64: canvas.toDataURL('image/png').split(',')[1], mediaType: 'image/png' };
}
```

- [ ] **Step 2: Добавить дропзону и превью в экран**

В `public/js/screens/screenshot.js` добавить импорты:

```js
import { ALLOWED_TYPES } from '../image.js';
```

И функции перед `renderScreenshot`:

```js
const DROPZONE_HINT =
  'В т.ч. с телефона: без логотипа, таймер учитывается. PNG, JPG, WebP до 5MB. ' +
  'На iPhone используйте скриншот, а не фото из галереи.';

function renderDropzone() {
  const zone = document.createElement('section');
  zone.className = 'dropzone';
  zone.innerHTML = `
    <label class="dropzone__inner" for="file-input">
      <span class="dropzone__icon">${icons.upload}</span>
      <span class="dropzone__title">Загрузите скриншот графика</span>
      <span class="dropzone__hint">${DROPZONE_HINT}</span>
    </label>
    <input type="file" id="file-input" accept="${ALLOWED_TYPES.join(',')}" />
  `;
  zone.querySelector('#file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setState({ phase: 'error', error: { title: 'Неподдерживаемый формат', text: 'Подойдут PNG, JPG или WebP.', action: 'retry' } });
      return;
    }
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    setState({ phase: 'selected', file, previewUrl: URL.createObjectURL(file), signal: null, error: null });
  });
  return zone;
}

function renderPreview() {
  const box = document.createElement('section');
  box.className = 'dropzone dropzone--filled';
  box.innerHTML = `<img class="dropzone__preview" src="${state.previewUrl}" alt="" />`;
  box.addEventListener('click', () => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    setState({ phase: 'idle', file: null, previewUrl: null });
  });
  return box;
}
```

И расширить `renderScreenshot`:

```js
export function renderScreenshot() {
  const section = document.createElement('section');
  section.className = 'screen';
  section.appendChild(renderProfile());
  const balance = renderBalance();
  if (balance) section.appendChild(balance);

  if (state.phase === 'idle' || state.phase === 'loading') {
    section.appendChild(renderDropzone());
  } else {
    section.appendChild(renderPreview());
  }
  return section;
}
```

- [ ] **Step 3: Добавить стили**

Дописать в `public/style.css` перед блоком админки:

```css
.dropzone {
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-card);
  background: var(--surface);
  overflow: hidden;
}

.dropzone__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 34px 20px 30px;
  cursor: pointer;
}

.dropzone__icon {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(245, 166, 35, 0.12);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}

.dropzone__icon svg { width: 22px; height: 22px; }
.dropzone__title { font-size: 14px; font-weight: 500; color: var(--text-dim); }
.dropzone__hint { font-size: 11px; line-height: 1.5; color: var(--text-mute); max-width: 290px; }

.dropzone--filled { display: flex; align-items: center; justify-content: center; padding: 14px; cursor: pointer; }
.dropzone__preview { max-width: 55%; max-height: 260px; border-radius: 10px; display: block; }

#file-input { display: none; }
```

- [ ] **Step 4: Проверить**

Run: `node --check public/js/image.js && node --check public/js/screens/screenshot.js`
Expected: без вывода.

Run: `npm test` → PASS.

- [ ] **Step 5: Коммит**

```bash
git add public
git commit -m "feat: add the upload dropzone with client-side downscaling"
```

---

## Task 11: Состояние анализа и бегущие статусы

**Files:**
- Create: `public/js/statuses.js`
- Modify: `public/js/screens/screenshot.js`, `public/style.css`

**Interfaces:**
- Consumes: `prepareImage` (Task 10), `postAnalyze`, `ApiError` (Task 8)
- Produces: `statuses.js`: `startStatusRotation(element): { finish(): Promise<void> }`

- [ ] **Step 1: Написать `public/js/statuses.js`**

```js
const PHRASE_MS = 4000;

const PHRASES = [
  'Сопоставляем инструмент и таймфрейм…',
  'Оцениваем читаемость меток цены и времени…',
  'Разбираем свечную структуру…',
  'Считаем уровни входа и защиты…',
];

/**
 * The phrases are on a timer, not tied to real progress — the request is a
 * single round trip. `finish()` waits for the phrase on screen to run its
 * course, because cutting a sentence off mid-way reads as a glitch.
 */
export function startStatusRotation(element) {
  let index = 0;
  let pendingResolve = null;
  element.textContent = PHRASES[0];

  const timer = setInterval(() => {
    if (pendingResolve) {
      clearInterval(timer);
      pendingResolve();
      return;
    }
    index += 1;
    element.textContent = PHRASES[index % PHRASES.length];
  }, PHRASE_MS);

  return {
    finish() {
      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },
  };
}
```

- [ ] **Step 2: Добавить кнопку анализа и карточку разбора**

В `public/js/screens/screenshot.js` добавить импорты:

```js
import { prepareImage, ImageError } from '../image.js';
import { postAnalyze, ApiError } from '../api.js';
import { startStatusRotation } from '../statuses.js';
```

Добавить функции перед `renderScreenshot`:

```js
function errorFor(err) {
  if (err instanceof ImageError) {
    return { title: 'Не удалось прочитать изображение', text: 'Попробуйте другой скриншот.', action: 'retry' };
  }
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return {
        title: 'Бесплатный анализ уже использован',
        text: 'Полный доступ открывает неограниченный разбор графиков.',
        action: 'cta',
      };
    }
    if (err.status === 401) {
      return { title: 'Сессия устарела', text: 'Закройте и откройте приложение заново.', action: 'none' };
    }
    if (err.status === 400) {
      return { title: 'Не удалось прочитать изображение', text: 'Попробуйте другой скриншот.', action: 'retry' };
    }
  }
  return { title: 'Не удалось разобрать график', text: 'Попробуйте другой скриншот.', action: 'retry' };
}

async function runAnalysis() {
  setState({ phase: 'analyzing', error: null });
  const statusEl = document.querySelector('.analysis__status');
  const rotation = statusEl ? startStatusRotation(statusEl) : null;

  try {
    const prepared = await prepareImage(state.file);
    const data = await postAnalyze(prepared);
    if (rotation) await rotation.finish();
    setState({ phase: 'result', signal: data.signal });
  } catch (err) {
    if (rotation) await rotation.finish();
    setState({ phase: 'error', error: errorFor(err) });
  }
}

function renderAnalyzeButton() {
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

function renderAnalysisCard() {
  const card = document.createElement('section');
  card.className = 'analysis';
  card.innerHTML = `
    <div class="analysis__label">${icons.clock}Технический разбор</div>
    <div class="analysis__status"></div>
  `;
  return card;
}
```

Расширить `renderScreenshot` — заменить хвост функции:

```js
  if (state.phase === 'idle' || state.phase === 'loading') {
    section.appendChild(renderDropzone());
    return section;
  }

  section.appendChild(renderPreview());

  if (state.phase === 'selected' || state.phase === 'analyzing') {
    section.appendChild(renderAnalyzeButton());
  }
  if (state.phase === 'analyzing') {
    section.appendChild(renderAnalysisCard());
  }
  return section;
}
```

**Важно:** `runAnalysis` вызывает `setState({ phase: 'analyzing' })` до того, как ищет `.analysis__status`, поэтому карточка к этому моменту уже в DOM — `render()` из `app.js` отрабатывает синхронно внутри `setState`.

- [ ] **Step 3: Добавить стили**

Дописать в `public/style.css` перед блоком админки:

```css
.analysis {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 14px 16px;
}

.analysis__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent);
}

.analysis__label svg { width: 13px; height: 13px; }
.analysis__status { margin-top: 8px; font-size: 13px; line-height: 1.5; color: var(--text-dim); }

.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(13, 14, 16, 0.25);
  border-top-color: #0D0E10;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 4: Проверить**

Run: `node --check public/js/statuses.js && node --check public/js/screens/screenshot.js`
Expected: без вывода.

Run: `npm test` → PASS.

- [ ] **Step 5: Коммит**

```bash
git add public
git commit -m "feat: add the analysing state with rotating status phrases"
```

---

## Task 12: Карточка результата

**Files:**
- Modify: `public/js/screens/screenshot.js`, `public/style.css`

**Interfaces:**
- Consumes: `state.signal` (Task 6/11), `formatPrice` (Task 9)
- Produces: рендер результата внутри `renderScreenshot()`

- [ ] **Step 1: Добавить рендер результата**

В `public/js/screens/screenshot.js` расширить импорт формата:

```js
import { formatBalance, formatPrice, DEMO_BALANCE } from '../format.js';
```

Добавить функции перед `renderScreenshot`:

```js
const TREND = {
  bullish: { label: 'Вверх · BUY', modifier: 'up', icon: 'arrowUp' },
  bearish: { label: 'Вниз · SELL', modifier: 'down', icon: 'arrowDown' },
  neutral: { label: 'Нейтрально', modifier: 'flat', icon: 'clock' },
};

const MAX_KEY_POINTS = 5;

function renderResult() {
  const signal = state.signal;
  const trend = TREND[signal.trend] ?? TREND.neutral;

  const levels = [
    ['Вход', signal.entryPrice],
    ['Стоп-лосс', signal.stopLoss],
    ['ТП1', signal.takeProfit1],
    ['ТП2', signal.takeProfit2],
    ['ТП3', signal.takeProfit3],
  ];

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
          <div class="level__value">${formatPrice(value)}</div>
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

    <button class="button button--primary" data-action="cta">Получить полный доступ</button>
  `;
  return wrapper;
}
```

В `renderScreenshot` добавить перед финальным `return section;`:

```js
  if (state.phase === 'result' && state.signal) {
    section.appendChild(renderResult());
  }
```

Условие показа кнопки анализа не меняется — в фазе `result` она уже не рисуется.

- [ ] **Step 2: Добавить стили**

Дописать в `public/style.css` перед блоком админки:

```css
.result { display: flex; flex-direction: column; gap: 12px; }

.verdict {
  border-radius: var(--radius-card);
  border: 1px solid;
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
}

.verdict--up { background: rgba(34, 197, 94, 0.08); border-color: rgba(34, 197, 94, 0.35); color: var(--success); }
.verdict--down { background: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.35); color: var(--danger); }
.verdict--flat { background: var(--surface); border-color: var(--border); color: var(--text-dim); }

.verdict__icon svg { width: 30px; height: 30px; }
.verdict__label { font-size: 19px; font-weight: 700; }
.verdict__instrument { font-size: 13px; color: var(--text-dim); }

.badge {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.28);
  border-radius: 999px;
  padding: 6px 12px;
  color: var(--text-dim);
}

.badge svg { width: 13px; height: 13px; color: var(--accent); }
.badge__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.badge__value { font-size: 12px; font-weight: 600; color: var(--text); }

.levels { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.level {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
}

.level__label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-mute); }
.level__value { margin-top: 3px; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }

.keypoints {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.keypoints__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-mute);
}

.keypoint { display: flex; gap: 9px; font-size: 13px; line-height: 1.45; color: var(--text-dim); }
.keypoint__icon { flex-shrink: 0; margin-top: 1px; }
.keypoint__icon svg { width: 15px; height: 15px; }
.keypoint--ok .keypoint__icon { color: var(--success); }
.keypoint--warn .keypoint__icon { color: var(--warn); }

.breakdown {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 13px 16px;
}

.breakdown__summary { font-size: 13px; font-weight: 500; cursor: pointer; list-style: none; color: var(--text-dim); }
.breakdown__summary::-webkit-details-marker { display: none; }
.breakdown__text { margin: 10px 0 0; font-size: 13px; line-height: 1.55; color: var(--text-dim); }
```

- [ ] **Step 3: Проверить**

Run: `node --check public/js/screens/screenshot.js`
Expected: без вывода.

Run: `npm test` → PASS.

- [ ] **Step 4: Коммит**

```bash
git add public
git commit -m "feat: render the signal verdict, levels and key points"
```

---

## Task 13: Экран ошибки и CTA

**Files:**
- Create: `public/js/cta.js`
- Modify: `public/js/screens/screenshot.js`, `public/js/app.js`, `public/style.css`

**Interfaces:**
- Consumes: `state.error` (Task 11), `state.targetUrl` (Task 8)
- Produces: `cta.js`: `openAccessChat(targetUrl)`

- [ ] **Step 1: Написать `public/js/cta.js`**

```js
/**
 * Inside a mini app a plain link opens Telegram's in-app browser instead of
 * the chat; openTelegramLink collapses the app and lands in the dialog.
 */
export function openAccessChat(targetUrl) {
  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(targetUrl);
  } else {
    window.open(targetUrl, '_blank', 'noopener');
  }
}
```

- [ ] **Step 2: Повесить общий обработчик CTA**

В `public/js/app.js` добавить импорт:

```js
import { openAccessChat } from './cta.js';
```

И после обработчика таб-бара:

```js
document.getElementById('content').addEventListener('click', (event) => {
  if (event.target.closest('[data-action="cta"]')) openAccessChat(state.targetUrl);
});
```

- [ ] **Step 3: Добавить рендер ошибки**

В `public/js/screens/screenshot.js` добавить функцию перед `renderScreenshot`:

```js
function renderError() {
  const { title, text, action } = state.error;
  const card = document.createElement('section');
  card.className = 'errorbox';
  const button =
    action === 'cta'
      ? '<button class="button button--primary" data-action="cta">Получить полный доступ</button>'
      : action === 'retry'
        ? '<button class="button button--primary" data-action="retry">Попробовать снова</button>'
        : '';
  card.innerHTML = `
    <span class="errorbox__icon">${icons.warn}</span>
    <div class="errorbox__title">${title}</div>
    <p class="errorbox__text">${text}</p>
    ${button}
  `;
  card.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) {
      setState({ phase: state.file ? 'selected' : 'idle', error: null });
    }
  });
  return card;
}
```

В `renderScreenshot` заменить блок выбора экрана на:

```js
  if (state.phase === 'idle' || state.phase === 'loading') {
    section.appendChild(renderDropzone());
    return section;
  }

  if (state.previewUrl) section.appendChild(renderPreview());

  if (state.phase === 'selected' || state.phase === 'analyzing') {
    section.appendChild(renderAnalyzeButton());
  }
  if (state.phase === 'analyzing') {
    section.appendChild(renderAnalysisCard());
  }
  if (state.phase === 'result' && state.signal) {
    section.appendChild(renderResult());
  }
  if (state.phase === 'error' && state.error) {
    section.appendChild(renderError());
  }
  return section;
```

- [ ] **Step 4: Добавить стили**

Дописать в `public/style.css` перед блоком админки:

```css
.errorbox {
  background: var(--surface);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-card);
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}

.errorbox__icon { color: var(--danger); }
.errorbox__icon svg { width: 26px; height: 26px; }
.errorbox__title { font-size: 15px; font-weight: 600; }
.errorbox__text { margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: var(--text-dim); }
```

- [ ] **Step 5: Проверить**

Run: `node --check public/js/cta.js && node --check public/js/app.js && node --check public/js/screens/screenshot.js`
Expected: без вывода.

Run: `npm test` → PASS.

- [ ] **Step 6: Коммит**

```bash
git add public
git commit -m "feat: handle analysis failures and wire the access CTA"
```

---

## Task 14: Ручная проверка и документация

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: всё предыдущее
- Produces: ничего

- [ ] **Step 1: Полная проверка репозитория**

```bash
npm test
npx tsc --noEmit
for f in public/js/*.js public/js/screens/*.js; do node --check "$f" || echo "FAIL $f"; done
```

Expected: тесты зелёные (ожидается 55+ тестов), типы чистые, ни одного `FAIL`.

- [ ] **Step 2: Проверить, что админка не сломалась**

Запустить `npm run dev`, открыть `http://localhost:3000/admin.html` в браузере. Ожидается: таблица с рамками и кнопками читается (доступ к данным потребует валидного `initData`, достаточно убедиться, что вёрстка и стили на месте, а не «голый» HTML).

- [ ] **Step 3: Проверить мини-апп в Telegram**

Поднять туннель (`cloudflared tunnel --url http://localhost:3000`), прописать его URL в `APP_URL`, перезапустить, открыть бота, нажать `/start` → «Открыть анализатор».

Пройти чек-лист:

- [ ] Аватар, имя и `ID` в шапке совпадают с аккаунтом
- [ ] Баланс набирается анимацией, формат `32 688,59 $`
- [ ] Чип «Демо» показывает `10 000,00 $`, «Реал» возвращает сгенерированный; выбор переживает переоткрытие приложения
- [ ] `⟳` переигрывает анимацию
- [ ] Дропзона принимает скриншот; превью появляется, тап по превью сбрасывает выбор
- [ ] Кнопка «Анализировать скриншот» уходит в состояние «Анализ» со спиннером
- [ ] Статусы в «Техническом разборе» держатся ~4 секунды каждый, не мигают
- [ ] Результат: цвет карточки соответствует направлению, пара и таймфрейм на месте, пять уровней читаются без округления
- [ ] «Ключевые признаки» — зелёные галочки, жёлтый значок при нераспознанном
- [ ] «Технический разбор» раскрывается
- [ ] «Получить полный доступ» открывает диалог с предзаполненным «Хочу доступ к боту»
- [ ] Табы «Сигналы» и «Торговля» показывают заглушку с рабочей кнопкой
- [ ] Таб-бар не перекрывает контент внизу страницы

- [ ] **Step 4: Обновить README**

В `README.md` в разделе про Mini App заменить описание потока на актуальное: три таба, распознавание инструмента и таймфрейма, ключевые признаки, баланс из `/api/me`. Добавить абзац:

```
Фронтенд — ванильные ES-модули в `public/js/` без сборки: `app.js` (роутер табов), `api.js`, `state.js`,
`screens/`. Бандлера нет намеренно — по той же причине, по которой нет шага сборки на бэкенде.
```

- [ ] **Step 5: Коммит**

```bash
git add README.md
git commit -m "docs: describe the redesigned mini app front-end"
```

---

## Self-Review

**Spec coverage:**

| Требование спеки | Задача |
|---|---|
| Решения 1, 13 (дизайн 1:1, тёмная тема), токены | 8–13 |
| Решение 2 (три таба, заглушки) | 8 |
| Решения 3, 4, 5 (инструмент, таймфрейм, nullable, keyPoints) | 4 |
| Решение 6 (профиль без «Отвязать», аватар) | 2, 9 |
| Решения 7, 8 (детерминированный баланс, Демо/Реал, localStorage) | 1, 5, 9 |
| Решение 9 (флаг лимита, удаление used-экрана) | 3, 6 |
| Решение 10 (статусы по 4 секунды, доигрывание фразы) | 11 |
| Решение 11 (`openTelegramLink`, `?text=`) | 7, 13 |
| Решение 12 (ваниль, ES-модули) | 8 |
| Решение 14 (админка не трогается) | 8 (сохранение стилей), 14 (проверка) |
| Карточка результата, точность цен | 9 (`formatPrice`), 12 |
| Подготовка изображения (1568px, PNG, WebP) | 6, 10 |
| Обработка ошибок (403/401/400/500/сеть/файл/старт) | 8 (`Promise.allSettled`), 11 (`errorFor`), 13 |
| Тесты: 5 правок + `me.test.ts` | 1, 2, 3, 4, 5, 6 |

Пробелов нет. `deeplink.test.ts` — сверх плана спеки: без него сборка URL с `?text=` осталась бы непокрытой, так как `src/server.ts` не тестируется.

**Placeholder scan:** плейсхолдеров нет — каждый шаг несёт готовый код или точную команду.

**Type consistency:** `generateBalance(telegramId)` — Task 1, используется в Task 5. `KeyPoint`/`keyPoints` — Task 4, читается в Task 12. `freeRunLimitEnabled` — Task 3 → Task 6 (`Config`, `AppDeps`, третий аргумент `createAnalyzeHandler`). `prepareImage` возвращает `{ imageBase64, mediaType }` — ровно то, что принимает `postAnalyze` (Task 8). `state.phase` принимает одни и те же шесть значений в Tasks 8–13. `icons.*` — ключи из Task 8 используются в 9–13, включая `wallet` и `lock`.
