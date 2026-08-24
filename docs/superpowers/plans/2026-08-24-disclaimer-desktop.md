# Дисклеймер, удаление баланса, большие экраны — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вернуть юридическую сноску, вырезать косметический баланс целиком (включая колонку в БД) и адаптировать
интерфейс под большие экраны, не меняя мобильную раскладку.

**Architecture:** Ванильный фронтенд на ES-модулях без сборки; всё, что касается больших экранов, живёт исключительно
внутри `@media (min-width: …)`, базовые стили остаются мобильными. Дисклеймер — один статический элемент в оболочке
`index.html`, а не в рендерерах экранов. Удаление баланса проходит сквозь весь стек: клиент → `/api/me` → репозиторий
→ схема БД, с одноразовым `ALTER TABLE … DROP COLUMN` в `initSchema`.

**Tech Stack:** Node 22, Express 4, Postgres (`pg`), pg-mem + Vitest + supertest в тестах, TypeScript (`tsc --noEmit`),
фронтенд — ванильный JS с ES-модулями (сборки нет, требование платформы Bothost).

**Spec:** [docs/superpowers/specs/2026-08-24-disclaimer-desktop.md](../specs/2026-08-24-disclaimer-desktop.md)

## Global Constraints

- **Текст дисклеймера — дословно, менять нельзя:** «Не является индивидуальной инвестиционной рекомендацией. Анализ
  сформирован автоматически; торговля на финансовых рынках связана с риском потери капитала.»
- **Мобильная раскладка не меняется.** Каждое правило для больших экранов — внутри `@media (min-width: 600px)` или
  `@media (min-width: 1000px)`. Базовые селекторы правятся только там, где это прямо предписано задачей.
- **Брейкпоинты и размеры:** `600px` / `1000px`; колонка `max-width: 560px`; контент на `≥1000px`
  `max-width: 1100px`; сайдбар `220px`; уровни на `≥1000px` — `repeat(3, 1fr)`; превью `max-height: 420px` на
  `≥600px` и `70vh` в двухколоночном `result`.
- **Весь `:hover` обёрнут в `@media (hover: hover)`.** Без обёртки на тач-устройствах ховер залипает после тапа.
- **Фокус:** `outline: 2px solid var(--accent)`, `outline-offset: 2px`, только на `:focus-visible`.
- **Палитра не расширяется.** Единственный новый литерал — `#FFB53D` (осветлённый `--accent`) для ховера основной
  кнопки. Остальные ховеры — переход между существующими токенами.
- **Две колонки только в фазе `result`** и только на `≥1000px`.
- **Язык интерфейса — русский**, тема всегда тёмная, `themeParams` Telegram игнорируются (решения из спеки от 21.08).
- **Сборки нет.** Никаких новых зависимостей, никакого Vite/React/Preact, никакого CDN.
- **Автотестов на вёрстку не появляется.** jsdom не добавляется.
- **Стенд визуальной проверки живёт в scratchpad и не коммитится.** Коммиты собираются только явным
  `git add <конкретные пути>`; `git add -A` / `git add .` запрещены.
- **Коммитов пять:** спека+план, дисклеймер, удаление баланса, раскладка, ввод с ПК.

## Структура файлов

Новых файлов в репозитории — только два документа (спека и этот план); всё остальное — правки существующих.

| Файл | Ответственность после изменений |
|---|---|
| `public/index.html` | оболочка: контент, статическая сноска-дисклеймер, таб-бар |
| `public/style.css` | токены, компоненты, два блока `@media` для больших экранов, `@media (hover: hover)`, `:focus-visible` |
| `public/js/app.js` | точка входа, роутер табов, оркестрация, обработчики drop/paste уровня документа |
| `public/js/screens/screenshot.js` | экран «Скриншот» + экспортируемый `acceptFile(file)` — единая точка приёма файла из input/drop/paste |
| `public/js/state.js` | состояние без `balance`/`balanceMode` |
| `public/js/format.js` | только `formatLevels` |
| `public/js/icons.js` | иконки без `wallet`/`refresh` |
| `src/db/db.ts` | `SCHEMA_SQL` без `balance_override` + одноразовый `DROP COLUMN` в `initSchema` |
| `src/db/users.repo.ts` | репозиторий без `setBalanceOverride` и `balanceOverride` |
| `src/routes/me.ts` | `{ alreadyUsed, user }` |
| `src/routes/admin.ts` | админ-роуты без `POST /users/:id/balance` |
| `tests/db/db.test.ts` | **новый**: схема без колонки, снос колонки из старой схемы, идемпотентность |
| `<scratchpad>/preview/server.mjs`, `<scratchpad>/preview/index.html` | **вне репозитория**: стенд визуальной проверки |

---

## Task 1: Стенд визуальной проверки (без коммита)

Фаза `result` в браузере недостижима без реального анализа, а именно в ней включается двухколоночная раскладка —
без стенда главное изменение осталось бы непроверенным. Стенд поднимает статику из `public/`, подсовывает заглушки
`window.Telegram`, `/api/config` и `/api/me`, и даёт кнопки переключения всех четырёх фаз. Модули `public/js/*`
загружаются **настоящие**, копий кода нет: стенд импортирует `./js/state.js` — тот же экземпляр модуля, что уже
использует `app.js`, поэтому `setState` из стенда двигает реальное приложение.

**Files:**
- Create: `<scratchpad>/preview/server.mjs`
- Create: `<scratchpad>/preview/index.html`
- Modify: ничего в репозитории

**Interfaces:**
- Consumes: `public/js/state.js` → `setState(patch)`; `public/js/app.js` (side-effectful entry point)
- Produces: команда `node <scratchpad>/preview/server.mjs` → `http://localhost:4321/preview` для всех последующих
  задач. Порт `4321` фиксирован, чтобы ссылка в отчётах не менялась.

- [ ] **Step 1: Создать сервер стенда**

`<scratchpad>/preview/server.mjs` — **без зависимостей вообще**, на голом `node:http`. Express взять нельзя: файл
живёт в scratchpad, а Node ищет `node_modules` от каталога файла вверх, поэтому `import express` отсюда не
разрешится. `PUBLIC_DIR` указывает на `public/` рабочего каталога, поэтому стенд всегда отдаёт актуальные файлы
репозитория без копирования.

```js
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.argv[2] ?? 'c:/Users/Dmitriy/Work/forexguesser';
const PUBLIC_DIR = path.join(REPO, 'public');
const PREVIEW_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const STUBS = {
  '/api/config': { targetUrl: 'https://t.me/example?text=%D0%A5%D0%BE%D1%87%D1%83' },
  '/api/me': {
    alreadyUsed: false,
    user: { telegramId: 8185867317, firstName: 'Дмитрий', photoUrl: null },
  },
};

async function send(res, filePath) {
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (STUBS[url.pathname]) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(STUBS[url.pathname]));
      return;
    }

    if (url.pathname === '/preview' || url.pathname === '/') {
      await send(res, path.join(PREVIEW_DIR, 'index.html'));
      return;
    }

    const target = path.normalize(path.join(PUBLIC_DIR, url.pathname));
    if (!target.startsWith(path.normalize(PUBLIC_DIR))) {
      res.writeHead(403).end('403');
      return;
    }
    await send(res, target);
  })
  .listen(PORT, () => console.log(`preview: http://localhost:${PORT}/preview`));
```

- [ ] **Step 2: Создать страницу стенда**

`<scratchpad>/preview/index.html`. Копией `public/index.html` быть не должна — она повторяет только оболочку
(`#app` / `#content` / сноска / `#tabbar`), а весь код тянет из настоящих модулей. После каждого изменения оболочки
в Task 2 эту разметку нужно синхронизировать — это единственное место, где стенд дублирует репозиторий.

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Стенд — Анализ графика</title>
  <link rel="stylesheet" href="/style.css" />
  <style>
    .harness { position: fixed; top: 8px; right: 8px; z-index: 99; display: flex; gap: 4px; }
    .harness button { font: 12px/1 sans-serif; padding: 6px 8px; background: #333; color: #fff;
      border: 1px solid #555; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="app" class="app">
    <main id="content" class="content"></main>
    <p class="disclaimer">
      Не является индивидуальной инвестиционной рекомендацией. Анализ сформирован автоматически; торговля на
      финансовых рынках связана с риском потери капитала.
    </p>
    <nav id="tabbar" class="tabbar"></nav>
  </div>

  <div class="harness">
    <button data-phase="idle">idle</button>
    <button data-phase="selected">selected</button>
    <button data-phase="analyzing">analyzing</button>
    <button data-phase="result">result</button>
  </div>

  <script>
    // Заглушка Telegram до загрузки app.js: api.js читает tg?.initData на этапе
    // импорта модуля.
    window.Telegram = {
      WebApp: {
        initData: 'stub',
        initDataUnsafe: { user: { id: 8185867317, first_name: 'Дмитрий' } },
        ready() {},
        expand() {},
        openTelegramLink(url) { console.log('openTelegramLink', url); },
      },
    };
  </script>

  <script type="module">
    import '/js/app.js';
    import { setState } from '/js/state.js';

    function fakeChart() {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 560;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#101216';
      ctx.fillRect(0, 0, 900, 560);
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x < 900; x += 18) {
        ctx.lineTo(x, 300 + Math.sin(x / 60) * 120 + (Math.random() - 0.5) * 40);
      }
      ctx.stroke();
      return canvas.toDataURL('image/png');
    }

    const preview = fakeChart();

    const SIGNAL = {
      trend: 'bullish',
      instrument: 'AUD/CHF',
      timeframe: 'M15',
      entryPrice: 1.08234,
      stopLoss: 1.0791,
      takeProfit1: 1.0856,
      takeProfit2: 1.0879,
      takeProfit3: 1.0904,
      keyPoints: [
        { text: 'Пробой локального максимума подтверждён объёмом', status: 'ok' },
        { text: 'RSI выходит из зоны перепроданности', status: 'ok' },
        { text: 'Метки времени на оси читаются частично', status: 'warn' },
      ],
      rationale:
        'Цена закрепилась выше уровня сопротивления, откат к зоне пробоя выкуплен. Ближайшее сопротивление — ' +
        'верхняя граница канала, что и определяет расположение тейк-профитов.',
    };

    const PHASES = {
      idle: { phase: 'idle', file: null, previewUrl: null, signal: null, error: null },
      selected: { phase: 'selected', file: {}, previewUrl: preview, signal: null, error: null },
      analyzing: { phase: 'analyzing', file: {}, previewUrl: preview, signal: null, error: null },
      result: { phase: 'result', file: {}, previewUrl: preview, signal: SIGNAL, error: null },
    };

    document.querySelector('.harness').addEventListener('click', (event) => {
      const phase = event.target.dataset.phase;
      if (phase) setState(PHASES[phase]);
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Запустить стенд и убедиться, что все четыре фазы рисуются**

Run: `node "<scratchpad>/preview/server.mjs" "c:/Users/Dmitriy/Work/forexguesser"`
Открыть `http://localhost:4321/preview`, нажать по очереди `idle`, `selected`, `analyzing`, `result`.
Expected: на `idle` — профиль «Дмитрий» + дропзона; на `result` — вердикт «Вверх · BUY», `AUD/CHF`, бейдж `M15`, пять
уровней, три признака, раскрывающийся разбор, кнопка CTA. Ошибок в консоли нет.

- [ ] **Step 4: Убедиться, что стенд не попал в репозиторий**

Run: `git status --short`
Expected: только `docs/superpowers/specs/2026-08-24-disclaimer-desktop.md` и
`docs/superpowers/plans/2026-08-24-disclaimer-desktop.md` как untracked. Ничего из `<scratchpad>`.

- [ ] **Step 5: Закоммитить спеку и план**

```bash
git add docs/superpowers/specs/2026-08-24-disclaimer-desktop.md docs/superpowers/plans/2026-08-24-disclaimer-desktop.md
git commit -m "docs: spec and plan for the disclaimer, balance removal and wide screens"
```

---

## Task 2: Дисклеймер и перестройка оболочки

Сноска — статический текст в `index.html`, а не строка в JS: единственный экземпляр, ноль кода, невозможно
рассинхронизировать. Она сестра `#content`, а не его ребёнок, потому что `renderContent()` делает
`root.innerHTML = ''` и вычистила бы её при каждом переключении таба. Из-за этого запас под таб-бар переезжает с
`.content` на `.app`: иначе сноска, стоящая ниже контента, оказалась бы под таб-баром.

**Files:**
- Modify: `public/index.html:10-15`
- Modify: `public/style.css:26-35` (`.app`, `.content`)
- Modify: `<scratchpad>/preview/index.html` (синхронизация оболочки — уже содержит финальный вид из Task 1)

**Interfaces:**
- Consumes: ничего
- Produces: CSS-класс `.disclaimer` и flex-колонка `.app` с `padding-bottom` под таб-бар — на них опирается Task 4

- [ ] **Step 1: Добавить сноску в оболочку**

`public/index.html`, тело целиком:

```html
<body>
  <div id="app" class="app">
    <main id="content" class="content"></main>
    <p class="disclaimer">
      Не является индивидуальной инвестиционной рекомендацией. Анализ сформирован автоматически; торговля на
      финансовых рынках связана с риском потери капитала.
    </p>
    <nav id="tabbar" class="tabbar"></nav>
  </div>
  <script type="module" src="js/app.js"></script>
</body>
```

- [ ] **Step 2: Перенести запас под таб-бар на `.app` и оформить сноску**

`public/style.css` — заменить существующие правила `.app` и `.content` на:

```css
/* Запас под фиксированный таб-бар живёт здесь, а не на .content: сноска
   стоит ниже контента, и с прежним padding она уехала бы под таб-бар. */
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 16px);
}

.content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.disclaimer {
  margin: 0;
  padding: 4px 16px 8px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-mute);
}
```

- [ ] **Step 3: Проверить на стенде на всех трёх табах**

Открыть `http://localhost:4321/preview` при ширине окна 360px (DevTools → device toolbar).
Expected:
- на табе «Скриншот» в фазе `idle` сноска стоит под дропзоной, над таб-баром, не перекрыта им;
- на табах «Сигналы» и «Торговля» сноска на месте и текст тот же;
- в фазе `result` сноска ниже кнопки «Получить полный доступ»;
- контент скроллится, сноска скроллится вместе с ним (не залипает).

- [ ] **Step 4: Проверить, что ничего не поехало в админке**

Открыть `http://localhost:4321/admin.html`.
Expected: таблица и кнопки выглядят как раньше. (`admin.html` делит `style.css` с мини-аппом, а `.app`/`.content`
там не используются — регрессии быть не должно, но проверка стоит десять секунд.)

- [ ] **Step 5: Коммит**

```bash
git add public/index.html public/style.css
git commit -m "feat: add the not-financial-advice disclaimer to every tab"
```

---

## Task 3: Полное удаление косметического баланса

Сквозная правка: клиент → `/api/me` → репозиторий → схема. Начинается с тестов, потому что удаление колонки в БД —
единственное необратимое действие в этом плане, и оно должно быть зафиксировано проверкой до, а не после.

**Files:**
- Create: `tests/db/db.test.ts`
- Delete: `src/balance.ts`, `tests/balance.test.ts`
- Modify: `src/db/db.ts:18-32`, `src/db/users.repo.ts:5-20,46-49`, `src/types.ts:19-25`, `src/routes/me.ts:3,17`,
  `src/routes/admin.ts:28-37`
- Modify: `tests/routes/me.test.ts:10,44,58-63`, `tests/routes/admin.test.ts:67-74`,
  `tests/db/users.repo.test.ts:18,43-46`
- Modify: `public/js/state.js`, `public/js/format.js:1-10`, `public/js/icons.js:17`,
  `public/js/screens/screenshot.js:3,29-105,272-274`, `public/js/app.js:73,78`, `public/style.css` (`.balance*`,
  `.chips`, `.chip*`, `.icon-button`), `public/admin.html:13`, `public/admin.js:60,66`, `README.md:8`

**Interfaces:**
- Consumes: `initSchema(db: Queryable): Promise<void>` из `src/db/db.ts`
- Produces:
  - `GET /api/me` → `{ alreadyUsed: boolean, user: { telegramId: number, firstName: string, photoUrl: string | null } }`
  - `UserRecord = { telegramId: number, freeRunUsed: boolean, unlimitedAccess: boolean, createdAt: string }`
  - `UsersRepo` без `setBalanceOverride`
  - `public/js/format.js` экспортирует только `formatLevels(values: number[]): string[]`

- [ ] **Step 1: Написать падающий тест на схему**

Create `tests/db/db.test.ts`. Проверка идёт через `Object.keys` строки, а **не** через `information_schema` —
поддержка `information_schema` в pg-mem неполная, и тест сломался бы по причине, не связанной с задачей.

```ts
import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import { initSchema, type Queryable } from '../../src/db/db.js';

function memPool(): Queryable {
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as Queryable;
}

async function userColumns(db: Queryable): Promise<string[]> {
  await db.query('INSERT INTO users (telegram_id) VALUES (1) ON CONFLICT (telegram_id) DO NOTHING');
  const result = await db.query('SELECT * FROM users WHERE telegram_id = 1');
  return Object.keys(result.rows[0]);
}

describe('initSchema', () => {
  it('creates users without a balance_override column', async () => {
    const db = memPool();
    await initSchema(db);
    expect(await userColumns(db)).not.toContain('balance_override');
  });

  it('drops balance_override left behind by the older schema', async () => {
    const db = memPool();
    await db.query(`CREATE TABLE users (
      telegram_id BIGINT PRIMARY KEY,
      free_run_used BOOLEAN NOT NULL DEFAULT FALSE,
      unlimited_access BOOLEAN NOT NULL DEFAULT FALSE,
      balance_override DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await initSchema(db);
    expect(await userColumns(db)).not.toContain('balance_override');
  });

  it('runs twice without failing', async () => {
    const db = memPool();
    await initSchema(db);
    await initSchema(db);
    expect(await userColumns(db)).not.toContain('balance_override');
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `npx vitest run tests/db/db.test.ts`
Expected: FAIL — первый и второй тесты сообщают, что `balance_override` присутствует в списке колонок.

- [ ] **Step 3: Убрать колонку из схемы и добавить одноразовый снос**

`src/db/db.ts` — заменить `SCHEMA_SQL` и `initSchema`:

```ts
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  free_run_used BOOLEAN NOT NULL DEFAULT FALSE,
  unlimited_access BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
  telegram_id BIGINT PRIMARY KEY,
  added_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/**
 * Одноразовая уборка, а не раннер миграций: косметический баланс удалён
 * (спека 2026-08-24), а `CREATE TABLE IF NOT EXISTS` выше никогда не снесёт
 * колонку в базе, где она уже есть. Удалить это выражение отдельным коммитом
 * после первого успешного старта прода.
 */
const DROP_BALANCE_OVERRIDE_SQL = 'ALTER TABLE users DROP COLUMN IF EXISTS balance_override';

export async function initSchema(db: Queryable): Promise<void> {
  await db.query(SCHEMA_SQL);
  await db.query(DROP_BALANCE_OVERRIDE_SQL);
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npx vitest run tests/db/db.test.ts`
Expected: PASS, три теста.

**Если pg-mem не понимает `DROP COLUMN IF EXISTS`** (ошибка парсера на `IF EXISTS`) — заменить константу и функцию
на вариант с точечным перехватом «колонки нет» (`42703` — Postgres `undefined_column`), не глотая остальные ошибки:

```ts
const DROP_BALANCE_OVERRIDE_SQL = 'ALTER TABLE users DROP COLUMN balance_override';

export async function initSchema(db: Queryable): Promise<void> {
  await db.query(SCHEMA_SQL);
  try {
    await db.query(DROP_BALANCE_OVERRIDE_SQL);
  } catch (err) {
    // 42703 = undefined_column: колонки уже нет, это и есть цель.
    if ((err as { code?: string }).code !== '42703') throw err;
  }
}
```

Если сработал этот вариант — записать причину в комментарий, чтобы следующий не «упростил» его обратно.

- [ ] **Step 5: Вычистить баланс из типов, репозитория и роутов**

`src/types.ts` — `UserRecord` без `balanceOverride`:

```ts
export interface UserRecord {
  telegramId: number;
  freeRunUsed: boolean;
  unlimitedAccess: boolean;
  createdAt: string;
}
```

`src/db/users.repo.ts` — убрать `balance_override` из `UserRow`, `balanceOverride` из `rowToUser` и метод
`setBalanceOverride` целиком:

```ts
interface UserRow {
  telegram_id: number;
  free_run_used: boolean;
  unlimited_access: boolean;
  created_at: Date | string;
}

function rowToUser(row: UserRow): UserRecord {
  return {
    telegramId: Number(row.telegram_id),
    freeRunUsed: !!row.free_run_used,
    unlimitedAccess: !!row.unlimited_access,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}
```

`src/routes/me.ts` — убрать импорт `generateBalance` и поле `balance`:

```ts
import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';

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
      });
    } catch (err) {
      next(err);
    }
  };
}
```

`src/routes/admin.ts` — удалить блок `router.post('/users/:telegramId/balance', …)` целиком (строки 28-37).

Удалить файлы:

```bash
git rm src/balance.ts tests/balance.test.ts
```

- [ ] **Step 6: Поправить оставшиеся тесты**

`tests/routes/me.test.ts`:
- удалить строку `import { generateBalance } from '../../src/balance.js';`
- в тесте нового пользователя удалить `expect(response.body.balance).toBe(generateBalance(10));`, переименовать его в
  `'returns the profile and alreadyUsed=false for a new user'`
- удалить тест `'prefers balanceOverride over the generated balance'` целиком
- добавить проверку, что баланс больше не отдаётся, в тест нового пользователя:

```ts
    expect(response.body.balance).toBeUndefined();
```

`tests/routes/admin.test.ts` — удалить тест `'sets a balance override'` (строки 67-74).

`tests/db/users.repo.test.ts` — убрать `balanceOverride: null,` из `toMatchObject` и удалить тест
`'setBalanceOverride stores a custom balance'`.

- [ ] **Step 7: Прогнать весь бэкенд**

Run: `npm test`
Expected: PASS, ни одного упоминания `balance` в списке тестов.

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 8: Вычистить баланс из фронтенда**

`public/js/state.js` — убрать `balance` и `balanceMode`:

```js
export const state = {
  tab: 'screenshot',
  phase: 'loading', // loading | idle | selected | analyzing | result | error
  targetUrl: 'https://t.me/',
  profile: null, // { telegramId, firstName, photoUrl }
  file: null,
  previewUrl: null,
  signal: null,
  error: null, // { title, text, action } where action is 'retry' | 'cta' | 'none'
};
```

`public/js/format.js` — оставить только `formatLevels`: удалить `DEMO_BALANCE`, `balanceFormatter` и
`formatBalance`, комментарий к `formatLevels` и функции `isPrice`/`decimalsOf` сохранить как есть.

`public/js/icons.js` — удалить записи `refresh` и `wallet`.

`public/js/screens/screenshot.js`:
- импорт становится `import { formatLevels } from '../format.js';`
- удалить `currentBalance`, `shownBalances`, `animateBalance`, `paintBalance`, `renderBalance` (строки 29-105) вместе
  с их комментариями
- в `renderScreenshot` удалить:

```js
  const balance = renderBalance();
  if (balance) section.appendChild(balance);
```

`public/js/app.js`:
- удалить `patch.balanceMode = localStorage.getItem('balanceMode') === 'demo' ? 'demo' : 'real';`
- удалить `patch.balance = me.value.balance;`
- в комментарии фолбэка убрать фразу про скрытый баланс — там останется только про шапку:

```js
    // Falling back to initDataUnsafe keeps the header populated when /api/me
    // is down.
```

`public/style.css` — удалить правила `.balance`, `.balance__top`, `.balance__label`, `.balance__label svg`,
`.balance__controls`, `.balance__value`, `.chips`, `.chip`, `.chip.is-active`, `.chip--real.is-active`,
`.icon-button`, `.icon-button svg`.

И там же — отдать освободившуюся вертикаль дропзоне (решение 7 спеки). Без этого экран выглядит обрезанным сверху:
карточка баланса занимала ~90px, и на её месте остаётся пустота между профилем и дропзоной. Правило базовое, не в
`@media`: карточка исчезла и на мобильном тоже. `:not(.dropzone--filled)` обязателен — растягивать рамку с превью
незачем, а `max-height` не даёт дашед-боксу разъехаться на весь экран 900px высотой.

Заменить существующее правило `.screen`:

```css
.screen { flex: 1; display: flex; flex-direction: column; gap: 14px; }
```

и добавить сразу после правил `.dropzone` / `.dropzone__inner`:

```css
/* Карточка баланса занимала ~90px; без неё дропзона забирает освободившуюся
   вертикаль и центрирует своё содержимое, иначе экран читается как обрезанный
   сверху. */
.dropzone:not(.dropzone--filled) {
  flex: 1;
  max-height: 420px;
  display: flex;
  align-items: center;
}

.dropzone:not(.dropzone--filled) .dropzone__inner { width: 100%; }
```

- [ ] **Step 9: Вычистить баланс из админки и README**

`public/admin.html` — в заголовке таблицы убрать `<th>Баланс</th>`:

```html
      <tr><th>ID</th><th>Прогон</th><th>Безлимит</th><th>Действия</th></tr>
```

`public/admin.js`:
- убрать `<td>${user.balanceOverride ?? '-'}</td>` из строки таблицы
- убрать кнопку `<button data-action="balance" …>Задать баланс</button>`
- удалить ветку `else if (action === 'balance') { … }` целиком

`README.md`, строка 8 — убрать упоминание баланса:

```
Интерфейс — три таба: «Скриншот» (профиль, загрузка и результат), «Сигналы» и «Торговля»
```

- [ ] **Step 10: Проверить, что упоминаний баланса не осталось**

Run: `grep -rn -i "balance\|баланс" src public tests README.md`
Expected: ноль совпадений, кроме `DROP_BALANCE_OVERRIDE_SQL` и его комментария в `src/db/db.ts` и теста
`tests/db/db.test.ts`.

- [ ] **Step 11: Проверить на стенде**

Перезагрузить `http://localhost:4321/preview`.
Expected: карточки баланса нет ни в одной фазе; под шапкой профиля сразу дропзона, и она занимает освободившееся
место, а не оставляет пустоту над собой; между профилем и дропзоной нет разрыва больше `14px`; в консоли нет ошибок
(`formatBalance is not a function`, `icons.wallet is undefined` и т.п.); в фазе `result` уровни и признаки на месте,
рамка с превью **не** растянута.
Открыть `http://localhost:4321/admin.html` — таблица из четырёх колонок, кнопки «Сброс» и «Безлимит вкл/выкл».

- [ ] **Step 12: Коммит**

```bash
git add -u src public tests README.md
git add tests/db/db.test.ts
git status --short
git commit -m "refactor!: drop the cosmetic balance end to end, including the DB column"
```

`git status --short` перед коммитом обязателен: `git add -u` берёт только уже отслеживаемые файлы, но стенд из
scratchpad всё равно не должен всплыть.

---

## Task 4: Раскладка под большие экраны

Всё, кроме одного класса-маркера и одной строки в `app.js`, — чистый CSS внутри двух `@media`. Маркер нужен потому,
что CSS не знает фазу приложения: двухколоночная сетка включается только в `result`, и `screenshot.js` должен об этом
сообщить классом.

**Files:**
- Modify: `public/js/screens/screenshot.js` (класс `is-result` в `renderScreenshot`)
- Modify: `public/js/app.js` (класс `content--centered` в `renderContent`)
- Modify: `public/style.css` (два блока `@media (min-width: …)`, блок `@media (hover: hover)`, `:focus-visible`)

**Interfaces:**
- Consumes: `.app` как flex-колонка и `.disclaimer` из Task 2; отсутствие `.balance`/`.chips`/`.icon-button` из Task 3
- Produces: классы `.screen.is-result` и `.content--centered`; CSS-переменная `--sidebar-width`

- [ ] **Step 1: Проставить маркер фазы `result`**

`public/js/screens/screenshot.js`, начало `renderScreenshot`. `previewUrl` в условии обязателен: без превью левая
колонка сетки осталась бы пустой.

```js
export function renderScreenshot() {
  const section = document.createElement('section');
  // Маркер для CSS: двухколоночная раскладка на >=1000px включается только в
  // результате и только когда есть превью для левой колонки.
  section.className = state.phase === 'result' && state.previewUrl ? 'screen is-result' : 'screen';
  section.appendChild(renderProfile());
```

- [ ] **Step 2: Проставить маркер пустого экрана**

`public/js/app.js`, в начале `renderContent`:

```js
function renderContent() {
  const root = document.getElementById('content');
  root.innerHTML = '';
  // Заглушки центрируются по вертикали, но только на широких экранах -- правило
  // живёт в @media (min-width: 600px).
  root.classList.toggle('content--centered', state.tab !== 'screenshot');
```

- [ ] **Step 3: Добавить брейкпоинт 600px**

`public/style.css`, в конец файла (после админских правил, чтобы порядок «мобильное → широкое» читался сверху вниз):

```css
/* ===== Большие экраны =====
   Мини-апп в Telegram Desktop, планшет, развёрнутое окно. Мобильная
   раскладка выше не меняется: всё живёт внутри @media. */

@media (min-width: 600px) {
  .content,
  .disclaimer {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
  }

  /* Таб-бар отрывается от нижнего края и становится плавающей панелью. */
  .tabbar {
    left: 50%;
    right: auto;
    width: min(560px, calc(100% - 32px));
    transform: translateX(-50%);
    bottom: calc(env(safe-area-inset-bottom) + 16px);
    height: var(--tabbar-height);
    padding-bottom: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    overflow: hidden;
  }

  .app { padding-bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 32px); }

  /* Пустой экран центрируется: центрировать нечего, кроме самого сообщения. */
  .content--centered { justify-content: center; }
  .content--centered .locked { margin-top: 0; }

  /* На 360px ограничение по ширине имело смысл, на 560+ график превращается в
     нечитаемую полоску -- ограничиваем высоту, а не ширину. */
  .dropzone__preview {
    max-width: 100%;
    max-height: 420px;
  }
}
```

- [ ] **Step 4: Проверить брейкпоинт 600px на стенде**

Открыть стенд, выставить ширину окна 700px.
Expected:
- контент и сноска — колонка 560px по центру, поля по бокам пустые;
- таб-бар — плавающая панель по центру, 16px от низа, со скруглением и рамкой по кругу;
- на табах «Сигналы»/«Торговля» блок-заглушка стоит по центру по вертикали, а не прижат к верху;
- на фазе `selected` превью не выше 420px и не уже, чем раньше;
- при возврате к 360px всё выглядит точно как до Task 4.

- [ ] **Step 5: Добавить брейкпоинт 1000px**

`public/style.css`, следом за предыдущим блоком:

```css
@media (min-width: 1000px) {
  :root { --sidebar-width: 220px; }

  .app {
    padding-bottom: 0;
    padding-left: var(--sidebar-width);
  }

  .content,
  .disclaimer { max-width: 1100px; }

  .content { padding: 28px 28px 0; }
  .disclaimer { padding: 8px 28px 28px; }

  /* Таб-бар -> сайдбар. Базовое правило -- grid из трёх колонок, здесь это
     колонка из трёх строк. */
  .tabbar {
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--sidebar-width);
    height: auto;
    transform: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 20px 12px;
    border: 0;
    border-right: 1px solid var(--border);
    border-radius: 0;
    backdrop-filter: none;
    background: var(--bg);
  }

  .tabbar__item {
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
    height: 46px;
    padding: 0 12px;
    border-radius: 10px;
  }

  /* Полоска-индикатор поворачивается: сверху на мобильном, слева в сайдбаре. */
  .tabbar__item.is-active::before {
    top: 50%;
    left: 0;
    width: 2px;
    height: 22px;
    transform: translateY(-50%);
    border-radius: 0 2px 2px 0;
  }

  .tabbar__label { font-size: 13px; }

  .levels { grid-template-columns: repeat(3, 1fr); }

  /* Результат в две колонки: график и уровни видны одновременно, сверять их
     скроллом больше не нужно. Профиль -- на всю ширину, иначе колонки
     стартовали бы с разной вертикали. */
  .screen.is-result {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
    gap: 20px;
  }

  .screen.is-result .profile { grid-column: 1 / -1; }
  .screen.is-result .dropzone--filled { grid-column: 1; }
  .screen.is-result .result { grid-column: 2; }
  .screen.is-result .dropzone__preview { max-height: 70vh; }
}
```

- [ ] **Step 6: Проверить брейкпоинт 1000px на стенде**

Ширина окна 1400px, пройти все четыре фазы.
Expected:
- слева сайдбар 220px, три пункта строками «иконка + подпись», активный оранжевый с полоской у левого края;
- контент не шире 1100px, сноска внизу под контентом, таб-бара снизу нет;
- `idle`/`selected`/`analyzing` — одна колонка, вторая не появляется;
- `result` — профиль на всю ширину, слева превью (до 70vh), справа вердикт → уровни (три в ряд) → признаки →
  «Технический разбор» → CTA; верхние края превью и вердикта на одной линии;
- заглушки-табы: блок по центру области контента.

- [ ] **Step 7: Добавить ховер и фокус**

`public/style.css`, в конец файла:

```css
/* Ховер только там, где есть настоящий курсор: на тач-устройствах :hover
   залипает после тапа до следующего касания. */
@media (hover: hover) {
  .button--primary:hover:not(:disabled) { background: #FFB53D; }
  .tabbar__item:hover { color: var(--text-dim); }
  .tabbar__item.is-active:hover { color: var(--accent); }
  .dropzone:hover { border-color: var(--text-mute); }
  .dropzone__inner:hover { background: var(--surface-2); }
  .breakdown__summary:hover { color: var(--text); }
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 8: Проверить ховер и фокус**

На стенде при 1400px: провести мышью по кнопке «Анализировать скриншот» (осветляется), по дропзоне (рамка светлеет,
подложка чуть светлее), по пунктам таб-бара. Затем нажимать `Tab` от начала страницы.
Expected: у каждого интерактивного элемента — оранжевая обводка с отступом 2px; порядок обхода естественный
(контент, затем таб-бар). В режиме device toolbar (эмуляция тача) ховер-эффектов нет.

- [ ] **Step 9: Коммит**

```bash
git add public/style.css public/js/app.js public/js/screens/screenshot.js
git commit -m "feat: adapt the layout to tablet and desktop widths"
```

---

## Task 5: Ввод с ПК — перетаскивание и вставка

На ПК скриншот лежит в буфере обмена, а не в галерее. Приём файла из трёх источников (input, drop, paste) должен
идти через одну функцию — иначе валидация формата и освобождение прежнего `previewUrl` разъедутся по трём копиям.

**Files:**
- Modify: `public/js/screens/screenshot.js` (экспорт `acceptFile`, обработчик `#file-input` через него)
- Modify: `public/js/app.js` (обработчики `dragover`/`dragleave`/`drop`/`paste`)
- Modify: `public/style.css` (`.dropzone--dragover`)

**Interfaces:**
- Consumes: `state.tab`, `state.phase`, `state.previewUrl`; `ALLOWED_TYPES` из `public/js/image.js`
- Produces: `acceptFile(file: File | null | undefined): void` — экспорт из `public/js/screens/screenshot.js`

- [ ] **Step 1: Вынести приём файла в экспортируемую функцию**

`public/js/screens/screenshot.js` — добавить функцию перед `renderDropzone`:

```js
/**
 * Единственная точка приёма файла: input, drop и вставка из буфера обмена
 * ведут сюда, чтобы проверка формата и освобождение прежнего previewUrl не
 * разъехались по трём копиям.
 */
export function acceptFile(file) {
  if (!file) return;
  if (state.phase === 'analyzing') return;
  if (!ALLOWED_TYPES.includes(file.type)) {
    setState({
      phase: 'error',
      error: { title: 'Неподдерживаемый формат', text: 'Подойдут PNG, JPG или WebP.', action: 'retry' },
    });
    return;
  }
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  setState({ phase: 'selected', file, previewUrl: URL.createObjectURL(file), signal: null, error: null });
}
```

и заменить обработчик `#file-input` в `renderDropzone` на:

```js
  zone.querySelector('#file-input').addEventListener('change', (event) => {
    acceptFile(event.target.files[0]);
  });
```

- [ ] **Step 2: Добавить стиль состояния перетаскивания**

`public/style.css`, сразу после правил `.dropzone--filled` / `.dropzone__preview`:

```css
.dropzone--dragover {
  border-color: var(--accent);
  background: rgba(245, 166, 35, 0.08);
}
```

- [ ] **Step 3: Подключить drop и paste**

`public/js/app.js` — поправить импорт и добавить обработчики после существующего слушателя клика на `#content`:

```js
import { renderScreenshot, acceptFile } from './screens/screenshot.js';
```

```js
const content = document.getElementById('content');

// Браузер по умолчанию открывает брошенный файл как страницу -- в вебвью это
// уводит из приложения без возврата. Гасим на уровне документа, а принимаем
// только внутри контента.
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', (event) => event.preventDefault());

function setDragover(on) {
  document.querySelector('.dropzone')?.classList.toggle('dropzone--dragover', on);
}

// Дроп ловит вся область контента, а не пунктирный прямоугольник: промахнуться
// мышью легко, а «файл упал в никуда» -- худший исход.
content.addEventListener('dragover', (event) => {
  if (state.tab !== 'screenshot' || state.phase === 'analyzing') return;
  event.preventDefault();
  setDragover(true);
});

content.addEventListener('dragleave', (event) => {
  if (event.relatedTarget && content.contains(event.relatedTarget)) return;
  setDragover(false);
});

content.addEventListener('drop', (event) => {
  if (state.tab !== 'screenshot') return;
  event.preventDefault();
  setDragover(false);
  acceptFile(event.dataTransfer?.files?.[0]);
});

// Только на табе «Скриншот» и без автопереключения: вставка, телепортирующая
// пользователя с заглушки на другой экран, -- фокус, а не функция.
window.addEventListener('paste', (event) => {
  if (state.tab !== 'screenshot') return;
  const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.kind === 'file');
  if (!item) return;
  event.preventDefault();
  acceptFile(item.getAsFile());
});
```

- [ ] **Step 4: Проверить перетаскивание**

На стенде при 1400px, фаза `idle`: перетащить PNG-файл из проводника на дропзону.
Expected: при наведении дропзона получает оранжевую рамку и подсветку; после отпускания появляется превью и кнопка
«Анализировать скриншот»; браузер не переходит на файл.

Повторить, отпустив файл **рядом** с дропзоной, но внутри области контента.
Expected: тот же результат.

Отпустить файл на сноске-дисклеймере (вне `.content`).
Expected: ничего не происходит, браузер файл не открывает.

Перетащить `.txt`.
Expected: карточка «Неподдерживаемый формат» с кнопкой «Попробовать снова».

Перетащить второй PNG поверх уже выбранного.
Expected: превью заменилось.

- [ ] **Step 5: Проверить вставку**

`Win+Shift+S`, выделить любую область, затем `Ctrl+V` на табе «Скриншот».
Expected: появилось превью снятой области.

Переключиться на таб «Сигналы», нажать `Ctrl+V`.
Expected: ничего не происходит, таб не переключается.

Переключиться в фазу `analyzing` кнопкой стенда и нажать `Ctrl+V`.
Expected: ничего не происходит (`acceptFile` выходит на проверке фазы).

- [ ] **Step 6: Коммит**

```bash
git add public/js/app.js public/js/screens/screenshot.js public/style.css
git commit -m "feat: accept charts by drag-and-drop and clipboard paste"
```

---

## Task 6: Итоговая верификация

**Files:** ничего не меняется — только проверки.

- [ ] **Step 1: Тесты и типы**

Run: `npm test`
Expected: PASS, все файлы.

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 2: Мобильная раскладка не пострадала**

Стенд, ширина 360px, все четыре фазы + оба таба-заглушки.
Expected: единственное видимое отличие от `main` — отсутствие карточки баланса и появившаяся сноска. Таб-бар
по-прежнему прижат к нижнему краю во всю ширину, заглушки прижаты к верху с отступом 48px, превью прежнего размера,
ховер-эффектов нет.

- [ ] **Step 3: Три ширины подряд**

Стенд на 360 / 700 / 1400px, фаза `result` на каждой.
Expected: 360 — одна колонка, таб-бар внизу; 700 — колонка 560px по центру, плавающий таб-бар; 1400 — сайдбар слева,
две колонки, уровни по три в ряд. Горизонтального скролла нет ни на одной ширине.

- [ ] **Step 4: Чистота репозитория**

Run: `git status --short`
Expected: пусто.

Run: `git log --oneline main..HEAD`
Expected: ровно пять коммитов — спека+план, дисклеймер, удаление баланса, раскладка, ввод с ПК.

Run: `grep -rn -i "balance\|баланс" src public tests README.md`
Expected: только `DROP_BALANCE_OVERRIDE_SQL` в `src/db/db.ts` и `tests/db/db.test.ts`.

- [ ] **Step 5: Проход в Telegram Desktop (делает владелец)**

Поднять туннель, открыть мини-апп в Telegram Desktop в обычном и развёрнутом окне, на телефоне — в обычном.
Expected: сноска видна на всех табах; баланса нет; в развёрнутом окне включается сайдбар; на телефоне всё как раньше.

Проверить `/admin.html` в Telegram: таблица из четырёх колонок, кнопки «Сброс» и «Безлимит вкл/выкл» работают.

- [ ] **Step 6: Записать, что снос колонки отработал**

После первого успешного старта прода проверить в логах отсутствие ошибок `initSchema` и подтвердить, что колонки
больше нет:

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'users';
```

Expected: `telegram_id`, `free_run_used`, `unlimited_access`, `created_at`.

После этого `DROP_BALANCE_OVERRIDE_SQL` и его вызов можно удалить отдельным коммитом — он свою работу сделал. До
этого момента удалять нельзя.
