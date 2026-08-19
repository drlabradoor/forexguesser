# Forex Signal Mini App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Telegram Mini App that takes a forex/crypto chart screenshot, sends it to Claude Sonnet 5 for vision analysis, and returns a full trading signal (trend + entry + stop-loss + 3 take-profits) — one free signal per Telegram user forever, then a deep-link upsell to an external bot, plus a small admin panel.

**Architecture:** A single Node.js/TypeScript Express server serves both the static Mini App frontend (`public/`) and a JSON API. State lives in a single-file SQLite database holding only two tiny tables (`users`, `admins`) — no screenshot or analysis content is ever persisted. A long-polling Telegram bot loop (same process) handles `/start` and `/admin` to hand users the Mini App launch buttons.

**Tech Stack:** Node.js 20+, TypeScript (NodeNext modules), Express, better-sqlite3, @anthropic-ai/sdk, Vitest + Supertest for tests, vanilla HTML/CSS/JS for the frontend (no build step).

**Spec:** [docs/superpowers/specs/2026-08-19-forex-signal-miniapp.md](../specs/2026-08-19-forex-signal-miniapp.md)

## Global Constraints

- Model for chart analysis is exactly `claude-sonnet-5` — never Haiku (spec §11).
- All user-facing text (bot messages, Mini App UI, signal rationale) is in Russian.
- No disclaimer text anywhere in the product (spec §5) — do not add one even defensively.
- No screenshot bytes or analysis text are ever written to disk or DB — only the three per-user flags in `users`
  (spec §9).
- The free-signal limit is lifetime-per-user (not per-day): exactly one free run unless `unlimited_access` is set.
- Every module that talks to an external system (Telegram API, Anthropic API) must be injectable/mockable so its
  callers are unit-testable without network access.

---

## File Structure

```
package.json
tsconfig.json
vitest.config.ts
.env.example
src/
  types.ts                    # Shared TS interfaces: Signal, UserRecord, TelegramUser
  config.ts                   # loadConfig(): reads/validates env vars
  balance.ts                  # generateBalance(): cosmetic balance number
  db/
    schema.sql                # CREATE TABLE users, admins
    db.ts                     # createDb(path): opens sqlite + applies schema
    users.repo.ts             # UsersRepo class
    admins.repo.ts            # AdminsRepo class
  telegram/
    initData.ts               # validateInitData(): HMAC verification per Telegram docs
    api.ts                    # createTelegramApi(): thin fetch wrapper (sendMessage, getUpdates)
    bot.ts                    # routeUpdate() (pure, testable) + createBotPoller() (IO loop)
  claude/
    analyzeChart.ts           # analyzeChart(): forced tool-use call to claude-sonnet-5
  middleware/
    auth.ts                   # createAuthMiddleware(): validates X-Telegram-Init-Data header
    requireAdmin.ts           # createRequireAdminMiddleware(): checks admins table
  routes/
    config.ts                 # createConfigHandler(): GET /api/config
    me.ts                     # createMeHandler(): GET /api/me
    analyze.ts                # createAnalyzeHandler(): POST /api/analyze
    admin.ts                  # createAdminRouter(): /api/admin/*
  server.ts                   # wires everything together, starts Express + bot poller
public/
  index.html
  app.js
  admin.html
  admin.js
  style.css
tests/
  telegram/initData.test.ts
  telegram/bot.test.ts
  db/users.repo.test.ts
  db/admins.repo.test.ts
  claude/analyzeChart.test.ts
  balance.test.ts
  config.test.ts
  middleware/auth.test.ts
  routes/analyze.test.ts
  routes/admin.test.ts
  server.test.ts
Dockerfile
README.md
```

---

### Task 1: Project scaffolding + health check

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/server.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Produces: an Express `app` export from `src/server.ts` usable by Supertest in later route tests
  (`export { app };` alongside the `listen()` call, guarded so `listen` doesn't run under test — see step 3).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "forex-signal-miniapp",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "better-sqlite3": "^11.3.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules` created, `package-lock.json` written, no errors.

- [ ] **Step 5: Write the failing test for a health check**

```ts
// tests/server.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

beforeAll(() => {
  process.env.BOT_TOKEN = 'test-bot-token';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OWNER_TELEGRAM_ID = '1';
  process.env.NIKOLAI_BOT_USERNAME = 'nikolai_bot';
  process.env.APP_URL = 'https://example.com';
  process.env.DB_PATH = ':memory:';
  process.env.SKIP_BOT_POLLING = 'true';
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const { app } = await import('../src/server.js');
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/server.test.ts`
Expected: FAIL — `src/server.ts` does not exist yet.

- [ ] **Step 7: Write minimal `src/server.ts`**

```ts
import 'dotenv/config';
import express from 'express';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export { app };
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/server.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git init
git add package.json tsconfig.json vitest.config.ts src/server.ts tests/server.test.ts .gitignore
git commit -m "chore: scaffold project with health check endpoint"
```

Note: create a `.gitignore` containing `node_modules\ndist\n*.sqlite\n.env\n` before this commit.

---

### Task 2: SQLite schema + repositories

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/db.ts`
- Create: `src/types.ts`
- Create: `src/db/users.repo.ts`
- Create: `src/db/admins.repo.ts`
- Test: `tests/db/users.repo.test.ts`
- Test: `tests/db/admins.repo.test.ts`

**Interfaces:**
- Produces: `UserRecord { telegramId: number; freeRunUsed: boolean; unlimitedAccess: boolean; balanceOverride:
  number | null; createdAt: string }`
- Produces: `createDb(filePath: string): Database.Database`
- Produces: `class UsersRepo { getOrCreate(id): UserRecord; markRunUsed(id): void; setUnlimited(id, enabled): void;
  resetRun(id): void; setBalanceOverride(id, value): void; listAll(): UserRecord[] }`
- Produces: `class AdminsRepo { isAdmin(id): boolean; add(id, addedBy): void; listAll(): number[] }`

- [ ] **Step 1: Write `src/types.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  free_run_used INTEGER NOT NULL DEFAULT 0,
  unlimited_access INTEGER NOT NULL DEFAULT 0,
  balance_override REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  telegram_id INTEGER PRIMARY KEY,
  added_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 3: Write `src/db/db.ts`**

```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createDb(filePath: string): Database.Database {
  const db = new Database(filePath);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}
```

- [ ] **Step 4: Write the failing test for `UsersRepo`**

```ts
// tests/db/users.repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../src/db/db.js';
import { UsersRepo } from '../../src/db/users.repo.js';

let repo: UsersRepo;

beforeEach(() => {
  const db = createDb(':memory:');
  repo = new UsersRepo(db);
});

describe('UsersRepo', () => {
  it('creates a new user with defaults on first access', () => {
    const user = repo.getOrCreate(42);
    expect(user).toMatchObject({
      telegramId: 42,
      freeRunUsed: false,
      unlimitedAccess: false,
      balanceOverride: null,
    });
  });

  it('returns the same user on repeated access', () => {
    repo.getOrCreate(42);
    repo.markRunUsed(42);
    const user = repo.getOrCreate(42);
    expect(user.freeRunUsed).toBe(true);
  });

  it('setUnlimited toggles unlimited_access', () => {
    repo.setUnlimited(7, true);
    expect(repo.getOrCreate(7).unlimitedAccess).toBe(true);
    repo.setUnlimited(7, false);
    expect(repo.getOrCreate(7).unlimitedAccess).toBe(false);
  });

  it('resetRun clears free_run_used', () => {
    repo.getOrCreate(9);
    repo.markRunUsed(9);
    repo.resetRun(9);
    expect(repo.getOrCreate(9).freeRunUsed).toBe(false);
  });

  it('setBalanceOverride stores a custom balance', () => {
    repo.setBalanceOverride(3, 5000);
    expect(repo.getOrCreate(3).balanceOverride).toBe(5000);
  });

  it('listAll returns every created user', () => {
    repo.getOrCreate(1);
    repo.getOrCreate(2);
    expect(repo.listAll().map((u) => u.telegramId).sort()).toEqual([1, 2]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run tests/db/users.repo.test.ts`
Expected: FAIL — `src/db/users.repo.ts` does not exist.

- [ ] **Step 6: Write `src/db/users.repo.ts`**

```ts
import type Database from 'better-sqlite3';
import type { UserRecord } from '../types.js';

interface UserRow {
  telegram_id: number;
  free_run_used: number;
  unlimited_access: number;
  balance_override: number | null;
  created_at: string;
}

function rowToUser(row: UserRow): UserRecord {
  return {
    telegramId: row.telegram_id,
    freeRunUsed: !!row.free_run_used,
    unlimitedAccess: !!row.unlimited_access,
    balanceOverride: row.balance_override,
    createdAt: row.created_at,
  };
}

export class UsersRepo {
  constructor(private db: Database.Database) {}

  getOrCreate(telegramId: number): UserRecord {
    const existing = this.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as
      | UserRow
      | undefined;
    if (existing) return rowToUser(existing);

    this.db.prepare('INSERT INTO users (telegram_id) VALUES (?)').run(telegramId);
    const created = this.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as UserRow;
    return rowToUser(created);
  }

  markRunUsed(telegramId: number): void {
    this.getOrCreate(telegramId);
    this.db.prepare('UPDATE users SET free_run_used = 1 WHERE telegram_id = ?').run(telegramId);
  }

  setUnlimited(telegramId: number, enabled: boolean): void {
    this.getOrCreate(telegramId);
    this.db.prepare('UPDATE users SET unlimited_access = ? WHERE telegram_id = ?').run(enabled ? 1 : 0, telegramId);
  }

  resetRun(telegramId: number): void {
    this.getOrCreate(telegramId);
    this.db.prepare('UPDATE users SET free_run_used = 0 WHERE telegram_id = ?').run(telegramId);
  }

  setBalanceOverride(telegramId: number, value: number | null): void {
    this.getOrCreate(telegramId);
    this.db.prepare('UPDATE users SET balance_override = ? WHERE telegram_id = ?').run(value, telegramId);
  }

  listAll(): UserRecord[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as UserRow[];
    return rows.map(rowToUser);
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/db/users.repo.test.ts`
Expected: PASS

- [ ] **Step 8: Write the failing test for `AdminsRepo`**

```ts
// tests/db/admins.repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../../src/db/db.js';
import { AdminsRepo } from '../../src/db/admins.repo.js';

let repo: AdminsRepo;

beforeEach(() => {
  const db = createDb(':memory:');
  repo = new AdminsRepo(db);
});

describe('AdminsRepo', () => {
  it('isAdmin returns false for an unknown id', () => {
    expect(repo.isAdmin(1)).toBe(false);
  });

  it('add makes isAdmin return true', () => {
    repo.add(1, null);
    expect(repo.isAdmin(1)).toBe(true);
  });

  it('add is idempotent for the same id', () => {
    repo.add(1, null);
    repo.add(1, 2);
    expect(repo.listAll()).toEqual([1]);
  });

  it('listAll returns every admin id', () => {
    repo.add(1, null);
    repo.add(2, 1);
    expect(repo.listAll().sort()).toEqual([1, 2]);
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `npx vitest run tests/db/admins.repo.test.ts`
Expected: FAIL — `src/db/admins.repo.ts` does not exist.

- [ ] **Step 10: Write `src/db/admins.repo.ts`**

```ts
import type Database from 'better-sqlite3';

export class AdminsRepo {
  constructor(private db: Database.Database) {}

  isAdmin(telegramId: number): boolean {
    const row = this.db.prepare('SELECT 1 FROM admins WHERE telegram_id = ?').get(telegramId);
    return !!row;
  }

  add(telegramId: number, addedBy: number | null): void {
    this.db.prepare('INSERT OR IGNORE INTO admins (telegram_id, added_by) VALUES (?, ?)').run(telegramId, addedBy);
  }

  listAll(): number[] {
    const rows = this.db.prepare('SELECT telegram_id FROM admins').all() as { telegram_id: number }[];
    return rows.map((r) => r.telegram_id);
  }
}
```

- [ ] **Step 11: Run both repo tests to verify they pass**

Run: `npx vitest run tests/db`
Expected: PASS (10 tests)

- [ ] **Step 12: Commit**

```bash
git add src/types.ts src/db tests/db
git commit -m "feat: add sqlite schema and users/admins repositories"
```

---

### Task 3: Telegram initData validation

**Files:**
- Create: `src/telegram/initData.ts`
- Test: `tests/telegram/initData.test.ts`

**Interfaces:**
- Consumes: `TelegramUser` from `src/types.ts` (Task 2)
- Produces: `validateInitData(initData: string, botToken: string, maxAgeSeconds?: number): TelegramUser | null`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/telegram/initData.test.ts
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { validateInitData } from '../../src/telegram/initData.js';

const BOT_TOKEN = 'test-bot-token-123';

function buildInitData(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`);
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

describe('validateInitData', () => {
  it('returns the parsed user for a validly signed initData string', () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 42, first_name: 'Dima', username: 'dima' });
    const initData = buildInitData({ auth_date: authDate, user }, BOT_TOKEN);

    const result = validateInitData(initData, BOT_TOKEN);

    expect(result).toEqual({ id: 42, firstName: 'Dima', username: 'dima' });
  });

  it('returns null when the hash was signed with the wrong bot token', () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 42, first_name: 'Dima' });
    const initData = buildInitData({ auth_date: authDate, user }, 'wrong-token');

    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('returns null when auth_date is older than maxAgeSeconds', () => {
    const oldAuthDate = String(Math.floor(Date.now() / 1000) - 100000);
    const user = JSON.stringify({ id: 42, first_name: 'Dima' });
    const initData = buildInitData({ auth_date: oldAuthDate, user }, BOT_TOKEN);

    expect(validateInitData(initData, BOT_TOKEN, 86400)).toBeNull();
  });

  it('returns null when the hash field is missing', () => {
    expect(validateInitData('auth_date=123&user=%7B%7D', BOT_TOKEN)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/telegram/initData.test.ts`
Expected: FAIL — `src/telegram/initData.ts` does not exist.

- [ ] **Step 3: Write `src/telegram/initData.ts`**

```ts
import crypto from 'node:crypto';
import type { TelegramUser } from '../types.js';

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs: string[] = [];
  for (const key of Array.from(params.keys()).sort()) {
    pairs.push(`${key}=${params.get(key)}`);
  }
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const userJson = params.get('user');
  if (!userJson) return null;

  const parsed = JSON.parse(userJson) as { id: number; first_name: string; username?: string };
  return {
    id: parsed.id,
    firstName: parsed.first_name,
    username: parsed.username,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/telegram/initData.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/telegram/initData.ts tests/telegram/initData.test.ts
git commit -m "feat: validate Telegram WebApp initData signature"
```

---

### Task 4: Auth + requireAdmin middleware

**Files:**
- Create: `src/middleware/auth.ts`
- Create: `src/middleware/requireAdmin.ts`
- Test: `tests/middleware/auth.test.ts`

**Interfaces:**
- Consumes: `validateInitData` (Task 3), `AdminsRepo` (Task 2)
- Produces: `createAuthMiddleware(botToken: string)` — Express middleware setting `req.telegramUser`
- Produces: `createRequireAdminMiddleware(adminsRepo: AdminsRepo)` — Express middleware, 403 if not admin

- [ ] **Step 1: Write the failing test**

```ts
// tests/middleware/auth.test.ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createAuthMiddleware } from '../../src/middleware/auth.js';

const BOT_TOKEN = 'test-bot-token';

function buildInitData(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`);
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function buildApp() {
  const app = express();
  app.get('/protected', createAuthMiddleware(BOT_TOKEN), (req, res) => {
    res.json({ user: req.telegramUser });
  });
  return app;
}

describe('createAuthMiddleware', () => {
  it('attaches req.telegramUser and calls next for valid initData', async () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 5, first_name: 'Test' });
    const initData = buildInitData({ auth_date: authDate, user }, BOT_TOKEN);

    const response = await request(buildApp()).get('/protected').set('X-Telegram-Init-Data', initData);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: 5, firstName: 'Test', username: undefined });
  });

  it('returns 401 when the header is missing', async () => {
    const response = await request(buildApp()).get('/protected');
    expect(response.status).toBe(401);
  });

  it('returns 401 when initData is invalid', async () => {
    const response = await request(buildApp()).get('/protected').set('X-Telegram-Init-Data', 'garbage=1');
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/middleware/auth.test.ts`
Expected: FAIL — `src/middleware/auth.ts` does not exist.

- [ ] **Step 3: Write `src/middleware/auth.ts`**

```ts
import type { Request, Response, NextFunction } from 'express';
import { validateInitData } from '../telegram/initData.js';
import type { TelegramUser } from '../types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      telegramUser?: TelegramUser;
    }
  }
}

export function createAuthMiddleware(botToken: string) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const initData = req.header('X-Telegram-Init-Data');
    if (!initData) {
      res.status(401).json({ error: 'MISSING_INIT_DATA' });
      return;
    }
    const user = validateInitData(initData, botToken);
    if (!user) {
      res.status(401).json({ error: 'INVALID_INIT_DATA' });
      return;
    }
    req.telegramUser = user;
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/middleware/auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `src/middleware/requireAdmin.ts` (no separate test — covered end-to-end in Task 8)**

```ts
import type { Request, Response, NextFunction } from 'express';
import type { AdminsRepo } from '../db/admins.repo.js';

export function createRequireAdminMiddleware(adminsRepo: AdminsRepo) {
  return function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const telegramUser = req.telegramUser;
    if (!telegramUser || !adminsRepo.isAdmin(telegramUser.id)) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 6: Commit**

```bash
git add src/middleware tests/middleware
git commit -m "feat: add Telegram auth and admin-gating middleware"
```

---

### Task 5: Balance generator

**Files:**
- Create: `src/balance.ts`
- Test: `tests/balance.test.ts`

**Interfaces:**
- Produces: `generateBalance(): number`

- [ ] **Step 1: Write the failing test**

```ts
// tests/balance.test.ts
import { describe, it, expect } from 'vitest';
import { generateBalance } from '../src/balance.js';

describe('generateBalance', () => {
  it('returns a whole number between 1300 and 2800', () => {
    for (let i = 0; i < 200; i++) {
      const value = generateBalance();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1300);
      expect(value).toBeLessThanOrEqual(2800);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/balance.test.ts`
Expected: FAIL — `src/balance.ts` does not exist.

- [ ] **Step 3: Write `src/balance.ts`**

```ts
const BASE_BALANCE = 1000;
const MIN_GROWTH_PERCENT = 30;
const MAX_GROWTH_PERCENT = 180;

export function generateBalance(): number {
  const growthPercent = MIN_GROWTH_PERCENT + Math.random() * (MAX_GROWTH_PERCENT - MIN_GROWTH_PERCENT);
  return Math.round(BASE_BALANCE * (1 + growthPercent / 100));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/balance.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/balance.ts tests/balance.test.ts
git commit -m "feat: add cosmetic balance generator"
```

---

### Task 6: Claude chart analysis module

**Files:**
- Create: `src/claude/analyzeChart.ts`
- Test: `tests/claude/analyzeChart.test.ts`

**Interfaces:**
- Consumes: `Signal` from `src/types.ts` (Task 2)
- Produces: `analyzeChart(client: Anthropic, imageBase64: string, mediaType: 'image/png' | 'image/jpeg'):
  Promise<Signal>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/claude/analyzeChart.test.ts
import { describe, it, expect, vi } from 'vitest';
import { analyzeChart } from '../../src/claude/analyzeChart.js';

function fakeClientReturning(content: unknown[]) {
  return { messages: { create: vi.fn().mockResolvedValue({ content }) } } as any;
}

describe('analyzeChart', () => {
  it('parses a tool_use response into a Signal', async () => {
    const client = fakeClientReturning([
      {
        type: 'tool_use',
        name: 'provide_signal',
        input: {
          trend: 'bullish',
          entry_price: 1.085,
          stop_loss: 1.08,
          take_profit_1: 1.09,
          take_profit_2: 1.095,
          take_profit_3: 1.1,
          rationale: 'Цена оттолкнулась от уровня поддержки.',
        },
      },
    ]);

    const result = await analyzeChart(client, 'base64data', 'image/png');

    expect(result).toEqual({
      trend: 'bullish',
      entryPrice: 1.085,
      stopLoss: 1.08,
      takeProfit1: 1.09,
      takeProfit2: 1.095,
      takeProfit3: 1.1,
      rationale: 'Цена оттолкнулась от уровня поддержки.',
    });
  });

  it('calls the API with model claude-sonnet-5 and the image as a base64 content block', async () => {
    const client = fakeClientReturning([
      {
        type: 'tool_use',
        name: 'provide_signal',
        input: {
          trend: 'neutral',
          entry_price: 1,
          stop_loss: 1,
          take_profit_1: 1,
          take_profit_2: 1,
          take_profit_3: 1,
          rationale: 'x',
        },
      },
    ]);

    await analyzeChart(client, 'abc123', 'image/jpeg');

    const call = client.messages.create.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-5');
    expect(call.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' },
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/claude/analyzeChart.test.ts`
Expected: FAIL — `src/claude/analyzeChart.ts` does not exist.

- [ ] **Step 3: Write `src/claude/analyzeChart.ts`**

```ts
import type Anthropic from '@anthropic-ai/sdk';
import type { Signal } from '../types.js';

const SYSTEM_PROMPT = `Ты — опытный трейдинг-аналитик, специализирующийся на техническом анализе графиков форекс и
криптовалют. Тебе присылают скриншот графика цены (свечной или линейный). Внимательно изучи видимые на изображении
данные: подписи цен на оси, форму последних свечей, видимые уровни поддержки/сопротивления, видимые индикаторы
(если есть).

На основе этого дай торговый сигнал: направление (bullish/bearish/neutral), цену входа, стоп-лосс и три уровня
тейк-профита. Все числовые уровни должны быть согласованы между собой и с видимым на графике диапазоном цен:
- Для bullish: stop_loss < entry_price < take_profit_1 < take_profit_2 < take_profit_3
- Для bearish: take_profit_3 < take_profit_2 < take_profit_1 < entry_price < stop_loss
Обоснование (rationale) пиши на русском, 2-3 предложения, простым языком.`;

interface SignalToolInput {
  trend: 'bullish' | 'bearish' | 'neutral';
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  take_profit_3: number;
  rationale: string;
}

export async function analyzeChart(
  client: Anthropic,
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg'
): Promise<Signal> {
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: 'provide_signal',
        description: 'Возвращает торговый сигнал, извлечённый из скриншота графика',
        input_schema: {
          type: 'object',
          properties: {
            trend: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
            entry_price: { type: 'number' },
            stop_loss: { type: 'number' },
            take_profit_1: { type: 'number' },
            take_profit_2: { type: 'number' },
            take_profit_3: { type: 'number' },
            rationale: { type: 'string' },
          },
          required: [
            'trend',
            'entry_price',
            'stop_loss',
            'take_profit_1',
            'take_profit_2',
            'take_profit_3',
            'rationale',
          ],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'provide_signal' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Проанализируй этот график и дай торговый сигнал.' },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }

  const input = toolUse.input as SignalToolInput;
  return {
    trend: input.trend,
    entryPrice: input.entry_price,
    stopLoss: input.stop_loss,
    takeProfit1: input.take_profit_1,
    takeProfit2: input.take_profit_2,
    takeProfit3: input.take_profit_3,
    rationale: input.rationale,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/claude/analyzeChart.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/claude tests/claude
git commit -m "feat: analyze chart screenshots with claude-sonnet-5"
```

---

### Task 7: Config loader + `/api/config`, `/api/me`, `/api/analyze` routes

**Files:**
- Create: `src/config.ts`
- Create: `src/routes/config.ts`
- Create: `src/routes/me.ts`
- Create: `src/routes/analyze.ts`
- Test: `tests/config.test.ts`
- Test: `tests/routes/analyze.test.ts`

**Interfaces:**
- Consumes: `UsersRepo` (Task 2), `analyzeChart` (Task 6), `generateBalance` (Task 5), `createAuthMiddleware`
  (Task 4)
- Produces: `loadConfig(): Config` where `Config = { port, botToken, anthropicApiKey, ownerTelegramId, dbPath,
  nikolaiBotUsername, appUrl, skipBotPolling }`
- Produces: `createConfigHandler(nikolaiBotUrl: string)`, `createMeHandler(usersRepo)`,
  `createAnalyzeHandler(usersRepo, claude)` — Express request handlers

- [ ] **Step 1: Write the failing test for `loadConfig`**

```ts
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

const REQUIRED_ENV = {
  BOT_TOKEN: 'bot-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
  OWNER_TELEGRAM_ID: '123',
  NIKOLAI_BOT_USERNAME: 'nikolai_bot',
  APP_URL: 'https://example.com',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, ...REQUIRED_ENV };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  it('reads all required fields', () => {
    const config = loadConfig();
    expect(config.botToken).toBe('bot-token');
    expect(config.ownerTelegramId).toBe(123);
    expect(config.nikolaiBotUsername).toBe('nikolai_bot');
    expect(config.appUrl).toBe('https://example.com');
    expect(config.port).toBe(3000);
    expect(config.dbPath).toBe('data.sqlite');
  });

  it('throws when a required variable is missing', () => {
    delete process.env.BOT_TOKEN;
    expect(() => loadConfig()).toThrow('Missing required environment variable: BOT_TOKEN');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `src/config.ts` does not exist.

- [ ] **Step 3: Write `src/config.ts`**

```ts
export interface Config {
  port: number;
  botToken: string;
  anthropicApiKey: string;
  ownerTelegramId: number;
  dbPath: string;
  nikolaiBotUsername: string;
  appUrl: string;
  skipBotPolling: boolean;
}

const REQUIRED_KEYS = ['BOT_TOKEN', 'ANTHROPIC_API_KEY', 'OWNER_TELEGRAM_ID', 'NIKOLAI_BOT_USERNAME', 'APP_URL'];

export function loadConfig(): Config {
  for (const key of REQUIRED_KEYS) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    botToken: process.env.BOT_TOKEN!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    ownerTelegramId: Number(process.env.OWNER_TELEGRAM_ID),
    dbPath: process.env.DB_PATH ?? 'data.sqlite',
    nikolaiBotUsername: process.env.NIKOLAI_BOT_USERNAME!,
    appUrl: process.env.APP_URL!,
    skipBotPolling: process.env.SKIP_BOT_POLLING === 'true',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `src/routes/config.ts` (no dedicated test — trivial, covered by Task 11 smoke test)**

```ts
import type { Request, Response } from 'express';

export function createConfigHandler(nikolaiBotUrl: string) {
  return function configHandler(_req: Request, res: Response) {
    res.json({ nikolaiBotUrl });
  };
}
```

- [ ] **Step 6: Write `src/routes/me.ts` (no dedicated test — trivial branch, covered by Task 11 smoke test)**

```ts
import type { Request, Response } from 'express';
import type { UsersRepo } from '../db/users.repo.js';

export function createMeHandler(usersRepo: UsersRepo) {
  return function meHandler(req: Request, res: Response) {
    const telegramUser = req.telegramUser!;
    const user = usersRepo.getOrCreate(telegramUser.id);
    const alreadyUsed = user.freeRunUsed && !user.unlimitedAccess;
    res.json({ alreadyUsed });
  };
}
```

- [ ] **Step 7: Write the failing test for the analyze route**

```ts
// tests/routes/analyze.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createDb } from '../../src/db/db.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createAnalyzeHandler } from '../../src/routes/analyze.js';

const BOT_TOKEN = 'test-bot-token';

function buildInitData(telegramId: number): string {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: telegramId, first_name: 'T' }) };
  const pairs = Object.keys(fields).sort().map((k) => `${k}=${(fields as any)[k]}`);
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(pairs.join('\n')).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function buildApp(usersRepo: UsersRepo, signal: unknown) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  const fakeClaude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: 'provide_signal', input: signal }] }) } } as any;
  app.post('/api/analyze', createAuthMiddleware(BOT_TOKEN), createAnalyzeHandler(usersRepo, fakeClaude));
  return app;
}

const SAMPLE_SIGNAL = {
  trend: 'bullish',
  entry_price: 1.1,
  stop_loss: 1.09,
  take_profit_1: 1.11,
  take_profit_2: 1.12,
  take_profit_3: 1.13,
  rationale: 'test rationale',
};

let usersRepo: UsersRepo;

beforeEach(() => {
  usersRepo = new UsersRepo(createDb(':memory:'));
});

describe('POST /api/analyze', () => {
  it('returns a signal and balance on first use', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(1))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.signal.trend).toBe('bullish');
    expect(typeof response.body.balance).toBe('number');
    expect(usersRepo.getOrCreate(1).freeRunUsed).toBe(true);
  });

  it('returns 403 ALREADY_USED on the second attempt', async () => {
    const app = buildApp(usersRepo, SAMPLE_SIGNAL);
    await request(app).post('/api/analyze').set('X-Telegram-Init-Data', buildInitData(2)).send({ imageBase64: 'abc', mediaType: 'image/png' });

    const second = await request(app).post('/api/analyze').set('X-Telegram-Init-Data', buildInitData(2)).send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(second.status).toBe(403);
    expect(second.body).toEqual({ error: 'ALREADY_USED' });
  });

  it('allows repeated use when unlimited_access is set', async () => {
    usersRepo.setUnlimited(3, true);
    const app = buildApp(usersRepo, SAMPLE_SIGNAL);
    await request(app).post('/api/analyze').set('X-Telegram-Init-Data', buildInitData(3)).send({ imageBase64: 'abc', mediaType: 'image/png' });

    const second = await request(app).post('/api/analyze').set('X-Telegram-Init-Data', buildInitData(3)).send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(second.status).toBe(200);
  });

  it('uses balanceOverride instead of a random balance when set', async () => {
    usersRepo.setBalanceOverride(4, 9999);
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(4))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.body.balance).toBe(9999);
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

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run tests/routes/analyze.test.ts`
Expected: FAIL — `src/routes/analyze.ts` does not exist.

- [ ] **Step 9: Write `src/routes/analyze.ts`**

```ts
import type { Request, Response } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import type { UsersRepo } from '../db/users.repo.js';
import { analyzeChart } from '../claude/analyzeChart.js';
import { generateBalance } from '../balance.js';

export function createAnalyzeHandler(usersRepo: UsersRepo, claude: Anthropic) {
  return async function analyzeHandler(req: Request, res: Response) {
    const telegramUser = req.telegramUser!;
    const { imageBase64, mediaType } = req.body as {
      imageBase64?: string;
      mediaType?: 'image/png' | 'image/jpeg';
    };

    if (!imageBase64 || !mediaType) {
      res.status(400).json({ error: 'MISSING_IMAGE' });
      return;
    }

    const user = usersRepo.getOrCreate(telegramUser.id);
    if (user.freeRunUsed && !user.unlimitedAccess) {
      res.status(403).json({ error: 'ALREADY_USED' });
      return;
    }

    const signal = await analyzeChart(claude, imageBase64, mediaType);
    const balance = user.balanceOverride ?? generateBalance();

    if (!user.unlimitedAccess) {
      usersRepo.markRunUsed(telegramUser.id);
    }

    res.json({ signal, balance });
  };
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run tests/routes/analyze.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 11: Commit**

```bash
git add src/config.ts src/routes/config.ts src/routes/me.ts src/routes/analyze.ts tests/config.test.ts tests/routes/analyze.test.ts
git commit -m "feat: add config loader and /api/config, /api/me, /api/analyze routes"
```

---

### Task 8: Admin routes

**Files:**
- Create: `src/routes/admin.ts`
- Test: `tests/routes/admin.test.ts`

**Interfaces:**
- Consumes: `UsersRepo`, `AdminsRepo` (Task 2), `createAuthMiddleware`, `createRequireAdminMiddleware` (Task 4)
- Produces: `createAdminRouter(usersRepo: UsersRepo, adminsRepo: AdminsRepo, ownerTelegramId: number): Router`

- [ ] **Step 1: Write the failing test**

```ts
// tests/routes/admin.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createDb } from '../../src/db/db.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { AdminsRepo } from '../../src/db/admins.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createRequireAdminMiddleware } from '../../src/middleware/requireAdmin.js';
import { createAdminRouter } from '../../src/routes/admin.js';

const BOT_TOKEN = 'test-bot-token';
const OWNER_ID = 100;

function buildInitData(telegramId: number): string {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: telegramId, first_name: 'T' }) };
  const pairs = Object.keys(fields).sort().map((k) => `${k}=${(fields as any)[k]}`);
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(pairs.join('\n')).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

let usersRepo: UsersRepo;
let adminsRepo: AdminsRepo;
let app: express.Express;

beforeEach(() => {
  const db = createDb(':memory:');
  usersRepo = new UsersRepo(db);
  adminsRepo = new AdminsRepo(db);
  adminsRepo.add(OWNER_ID, null);

  app = express();
  app.use(express.json());
  app.use(
    '/api/admin',
    createAuthMiddleware(BOT_TOKEN),
    createRequireAdminMiddleware(adminsRepo),
    createAdminRouter(usersRepo, adminsRepo, OWNER_ID)
  );
});

describe('admin routes', () => {
  it('rejects non-admins with 403', async () => {
    const response = await request(app).get('/api/admin/users').set('X-Telegram-Init-Data', buildInitData(1));
    expect(response.status).toBe(403);
  });

  it('lists users for an admin', async () => {
    usersRepo.getOrCreate(1);
    const response = await request(app).get('/api/admin/users').set('X-Telegram-Init-Data', buildInitData(OWNER_ID));
    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
  });

  it('sets a balance override', async () => {
    const response = await request(app)
      .post('/api/admin/users/1/balance')
      .set('X-Telegram-Init-Data', buildInitData(OWNER_ID))
      .send({ value: 4242 });
    expect(response.status).toBe(200);
    expect(usersRepo.getOrCreate(1).balanceOverride).toBe(4242);
  });

  it('toggles unlimited access', async () => {
    await request(app)
      .post('/api/admin/users/1/unlimited')
      .set('X-Telegram-Init-Data', buildInitData(OWNER_ID))
      .send({ enabled: true });
    expect(usersRepo.getOrCreate(1).unlimitedAccess).toBe(true);
  });

  it('resets the free run flag', async () => {
    usersRepo.markRunUsed(1);
    await request(app).post('/api/admin/users/1/reset').set('X-Telegram-Init-Data', buildInitData(OWNER_ID));
    expect(usersRepo.getOrCreate(1).freeRunUsed).toBe(false);
  });

  it('lets the owner add a new admin', async () => {
    const response = await request(app)
      .post('/api/admin/admins')
      .set('X-Telegram-Init-Data', buildInitData(OWNER_ID))
      .send({ telegramId: 55 });
    expect(response.status).toBe(200);
    expect(adminsRepo.isAdmin(55)).toBe(true);
  });

  it('forbids a non-owner admin from adding a new admin', async () => {
    adminsRepo.add(2, OWNER_ID);
    const response = await request(app)
      .post('/api/admin/admins')
      .set('X-Telegram-Init-Data', buildInitData(2))
      .send({ telegramId: 55 });
    expect(response.status).toBe(403);
    expect(adminsRepo.isAdmin(55)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/routes/admin.test.ts`
Expected: FAIL — `src/routes/admin.ts` does not exist.

- [ ] **Step 3: Write `src/routes/admin.ts`**

```ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { UsersRepo } from '../db/users.repo.js';
import type { AdminsRepo } from '../db/admins.repo.js';

export function createAdminRouter(usersRepo: UsersRepo, adminsRepo: AdminsRepo, ownerTelegramId: number): Router {
  const router = Router();

  router.get('/users', (_req: Request, res: Response) => {
    res.json({ users: usersRepo.listAll() });
  });

  router.post('/users/:telegramId/balance', (req: Request, res: Response) => {
    const telegramId = Number(req.params.telegramId);
    const { value } = req.body as { value: number | null };
    usersRepo.setBalanceOverride(telegramId, value);
    res.json({ ok: true });
  });

  router.post('/users/:telegramId/unlimited', (req: Request, res: Response) => {
    const telegramId = Number(req.params.telegramId);
    const { enabled } = req.body as { enabled: boolean };
    usersRepo.setUnlimited(telegramId, enabled);
    res.json({ ok: true });
  });

  router.post('/users/:telegramId/reset', (req: Request, res: Response) => {
    const telegramId = Number(req.params.telegramId);
    usersRepo.resetRun(telegramId);
    res.json({ ok: true });
  });

  router.post('/admins', (req: Request, res: Response) => {
    const telegramUser = req.telegramUser!;
    if (telegramUser.id !== ownerTelegramId) {
      res.status(403).json({ error: 'OWNER_ONLY' });
      return;
    }
    const { telegramId } = req.body as { telegramId: number };
    adminsRepo.add(telegramId, telegramUser.id);
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/routes/admin.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.ts tests/routes/admin.test.ts
git commit -m "feat: add admin routes for user management and admin provisioning"
```

---

### Task 9: Telegram bot command router

**Files:**
- Create: `src/telegram/api.ts`
- Create: `src/telegram/bot.ts`
- Test: `tests/telegram/bot.test.ts`

**Interfaces:**
- Consumes: `AdminsRepo` (Task 2)
- Produces: `createTelegramApi(botToken): { sendMessage, getUpdates }`, `routeUpdate(update, deps): Promise<void>`,
  `createBotPoller(botToken, appUrl, adminsRepo): { start(): void; stop(): void }`

- [ ] **Step 1: Write `src/telegram/api.ts` (thin IO wrapper — no dedicated unit test, exercised via Task 9 Step
  5's fake `deps` and manually in Task 14)**

```ts
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
```

- [ ] **Step 2: Write the failing test for `routeUpdate`**

```ts
// tests/telegram/bot.test.ts
import { describe, it, expect, vi } from 'vitest';
import { routeUpdate } from '../../src/telegram/bot.js';

describe('routeUpdate', () => {
  it('sends the analyzer button on /start', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const deps = { sendMessage, isAdmin: () => false, appUrl: 'https://example.com' };
    const update = { update_id: 1, message: { chat: { id: 10 }, from: { id: 10 }, text: '/start' } };

    await routeUpdate(update, deps);

    expect(sendMessage).toHaveBeenCalledWith(10, expect.any(String), {
      inline_keyboard: [[{ text: 'Открыть анализатор', web_app: { url: 'https://example.com' } }]],
    });
  });

  it('does nothing on /admin for a non-admin', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const deps = { sendMessage, isAdmin: (id: number) => id === 99, appUrl: 'https://example.com' };
    const update = { update_id: 2, message: { chat: { id: 5 }, from: { id: 5 }, text: '/admin' } };

    await routeUpdate(update, deps);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends the admin panel button on /admin for an admin', async () => {
    const sendMessage = vi.fn().mockResolvedValue({});
    const deps = { sendMessage, isAdmin: (id: number) => id === 5, appUrl: 'https://example.com' };
    const update = { update_id: 3, message: { chat: { id: 5 }, from: { id: 5 }, text: '/admin' } };

    await routeUpdate(update, deps);

    expect(sendMessage).toHaveBeenCalledWith(5, expect.any(String), {
      inline_keyboard: [[{ text: 'Открыть админку', web_app: { url: 'https://example.com/admin.html' } }]],
    });
  });

  it('ignores updates without a text message', async () => {
    const sendMessage = vi.fn();
    const deps = { sendMessage, isAdmin: () => true, appUrl: 'https://example.com' };
    await routeUpdate({ update_id: 4 }, deps);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/telegram/bot.test.ts`
Expected: FAIL — `src/telegram/bot.ts` does not exist.

- [ ] **Step 4: Write `src/telegram/bot.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/telegram/bot.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/telegram/api.ts src/telegram/bot.ts tests/telegram/bot.test.ts
git commit -m "feat: add Telegram bot command router for /start and /admin"
```

---

### Task 10: Wire everything into `server.ts`

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 2–9.
- Produces: fully wired `app` export; owner is seeded into `admins` on boot.

- [ ] **Step 1: Extend `tests/server.test.ts` with a full-flow smoke test**

```ts
// append to tests/server.test.ts, inside the existing describe block or a new one
describe('full app wiring', () => {
  it('serves /api/config publicly', async () => {
    const { app } = await import('../src/server.js');
    const response = await request(app).get('/api/config');
    expect(response.status).toBe(200);
    expect(response.body.nikolaiBotUrl).toBe('https://t.me/nikolai_bot');
  });

  it('rejects /api/me without initData', async () => {
    const { app } = await import('../src/server.js');
    const response = await request(app).get('/api/me');
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server.test.ts`
Expected: FAIL — `/api/config` and `/api/me` are not yet mounted.

- [ ] **Step 3: Rewrite `src/server.ts` to wire all modules together**

```ts
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { createDb } from './db/db.js';
import { UsersRepo } from './db/users.repo.js';
import { AdminsRepo } from './db/admins.repo.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRequireAdminMiddleware } from './middleware/requireAdmin.js';
import { createConfigHandler } from './routes/config.js';
import { createMeHandler } from './routes/me.js';
import { createAnalyzeHandler } from './routes/analyze.js';
import { createAdminRouter } from './routes/admin.js';
import { createBotPoller } from './telegram/bot.js';

const config = loadConfig();
const db = createDb(config.dbPath);
const usersRepo = new UsersRepo(db);
const adminsRepo = new AdminsRepo(db);
adminsRepo.add(config.ownerTelegramId, null);

const claude = new Anthropic({ apiKey: config.anthropicApiKey });
const authMiddleware = createAuthMiddleware(config.botToken);
const requireAdmin = createRequireAdminMiddleware(adminsRepo);
const nikolaiBotUrl = `https://t.me/${config.nikolaiBotUsername}`;

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.get('/api/config', createConfigHandler(nikolaiBotUrl));
app.get('/api/me', authMiddleware, createMeHandler(usersRepo));
app.post('/api/analyze', authMiddleware, createAnalyzeHandler(usersRepo, claude));
app.use('/api/admin', authMiddleware, requireAdmin, createAdminRouter(usersRepo, adminsRepo, config.ownerTelegramId));

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });

  if (!config.skipBotPolling) {
    createBotPoller(config.botToken, config.appUrl, adminsRepo).start();
  }
}

export { app };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test file from Tasks 1–10 passes.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat: wire config, db, routes, and bot poller into server.ts"
```

---

### Task 11: Frontend — main Mini App

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/style.css`

**Interfaces:**
- Consumes: `GET /api/config`, `GET /api/me`, `POST /api/analyze` (Task 10)

- [ ] **Step 1: Write `public/index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Анализ графика</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="app">
    <h1>Анализ графика</h1>
    <div id="upload-screen">
      <label class="upload-button" for="file-input">📷 Загрузить скриншот</label>
      <input type="file" id="file-input" accept="image/*" capture="environment" />
    </div>
    <div id="loading-screen" class="hidden">Анализирую график...</div>
    <div id="result-screen" class="hidden">
      <div id="balance" class="balance"></div>
      <div id="signal"></div>
      <a id="cta-button" class="cta-button" href="#" target="_blank" rel="noopener">Хочешь больше точных сигналов?</a>
    </div>
    <div id="used-screen" class="hidden">
      <p>Бесплатный анализ уже использован.</p>
      <a id="cta-button-used" class="cta-button" href="#" target="_blank" rel="noopener">Получить больше сигналов</a>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/style.css`**

```css
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #0e0e10;
  color: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 16px;
}
.hidden { display: none; }
h1 { font-size: 20px; text-align: center; }
.upload-button {
  display: block;
  background: #f5c518;
  color: #0e0e10;
  font-weight: bold;
  text-align: center;
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;
  margin-top: 24px;
}
#file-input { display: none; }
.balance {
  font-size: 32px;
  font-weight: bold;
  color: #4ade80;
  text-align: center;
  margin: 24px 0;
}
#signal p { margin: 8px 0; line-height: 1.4; }
.cta-button {
  display: block;
  background: #f5c518;
  color: #0e0e10;
  font-weight: bold;
  text-align: center;
  padding: 16px;
  border-radius: 12px;
  margin-top: 24px;
  text-decoration: none;
}
#loading-screen { text-align: center; margin-top: 40px; font-size: 18px; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
th, td { border: 1px solid #333; padding: 8px; text-align: left; font-size: 14px; }
button { background: #2a2a2e; color: #f5f5f5; border: 1px solid #444; border-radius: 6px; padding: 6px 10px; margin: 2px; cursor: pointer; }
```

- [ ] **Step 3: Write `public/app.js`**

```js
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const uploadScreen = document.getElementById('upload-screen');
const loadingScreen = document.getElementById('loading-screen');
const resultScreen = document.getElementById('result-screen');
const usedScreen = document.getElementById('used-screen');
const fileInput = document.getElementById('file-input');

let nikolaiBotUrl = '#';

function showScreen(el) {
  for (const screen of [uploadScreen, loadingScreen, resultScreen, usedScreen]) {
    screen.classList.add('hidden');
  }
  el.classList.remove('hidden');
}

function apiFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Telegram-Init-Data': tg.initData,
    },
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function animateBalance(target) {
  const el = document.getElementById('balance');
  let current = 0;
  const step = Math.max(1, Math.round(target / 40));
  const timer = setInterval(() => {
    current = Math.min(target, current + step);
    el.textContent = `$${current.toLocaleString('ru-RU')}`;
    if (current >= target) clearInterval(timer);
  }, 30);
}

function renderSignal(signal) {
  const trendLabel = { bullish: 'Бычий 📈', bearish: 'Медвежий 📉', neutral: 'Нейтральный ⏸' }[signal.trend];
  document.getElementById('signal').innerHTML = `
    <p><strong>Направление:</strong> ${trendLabel}</p>
    <p><strong>Вход:</strong> ${signal.entryPrice}</p>
    <p><strong>Стоп-лосс:</strong> ${signal.stopLoss}</p>
    <p><strong>Тейк-профит 1:</strong> ${signal.takeProfit1}</p>
    <p><strong>Тейк-профит 2:</strong> ${signal.takeProfit2}</p>
    <p><strong>Тейк-профит 3:</strong> ${signal.takeProfit3}</p>
    <p>${signal.rationale}</p>
  `;
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  showScreen(loadingScreen);
  const imageBase64 = await fileToBase64(file);

  const response = await apiFetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mediaType: file.type }),
  });

  if (response.status === 403) {
    document.getElementById('cta-button-used').href = nikolaiBotUrl;
    showScreen(usedScreen);
    return;
  }

  const data = await response.json();
  renderSignal(data.signal);
  document.getElementById('cta-button').href = nikolaiBotUrl;
  showScreen(resultScreen);
  animateBalance(data.balance);
});

async function init() {
  const configData = await (await fetch('/api/config')).json();
  nikolaiBotUrl = configData.nikolaiBotUrl;

  const me = await (await apiFetch('/api/me')).json();
  if (me.alreadyUsed) {
    document.getElementById('cta-button-used').href = nikolaiBotUrl;
    showScreen(usedScreen);
  } else {
    showScreen(uploadScreen);
  }
}

init();
```

- [ ] **Step 4: Manual verification**

Run: `SKIP_BOT_POLLING=true npm run dev` (with a valid `.env` — see Task 13), then open `https://<your-tunnel-url>`
inside Telegram via the bot's `/start` button (a plain browser tab has no `tg.initData`, so `/api/me` will 401 —
this must be tested through Telegram, e.g. via an `ngrok`/`cloudflared` tunnel set as the bot's Mini App URL).
Expected: upload button appears, picking an image shows the loading state, then the signal + balance animation.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/style.css
git commit -m "feat: add main Mini App frontend"
```

---

### Task 12: Frontend — admin panel

**Files:**
- Create: `public/admin.html`
- Create: `public/admin.js`

**Interfaces:**
- Consumes: `GET /api/admin/users`, `POST /api/admin/users/:id/{balance,unlimited,reset}` (Task 8)

- [ ] **Step 1: Write `public/admin.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Админка</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Пользователи</h1>
  <table id="users-table">
    <thead>
      <tr><th>ID</th><th>Прогон</th><th>Безлимит</th><th>Баланс</th><th>Действия</th></tr>
    </thead>
    <tbody id="users-body"></tbody>
  </table>
  <script src="admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/admin.js`**

```js
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

function apiFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Telegram-Init-Data': tg.initData,
      'Content-Type': 'application/json',
    },
  });
}

async function loadUsers() {
  const response = await apiFetch('/api/admin/users');
  if (!response.ok) {
    document.body.innerHTML = '<p>Доступ запрещён.</p>';
    return;
  }
  const data = await response.json();
  const tbody = document.getElementById('users-body');
  tbody.innerHTML = '';
  for (const user of data.users) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${user.telegramId}</td>
      <td>${user.freeRunUsed ? 'да' : 'нет'}</td>
      <td>${user.unlimitedAccess ? 'да' : 'нет'}</td>
      <td>${user.balanceOverride ?? '-'}</td>
      <td>
        <button data-action="reset" data-id="${user.telegramId}">Сброс</button>
        <button data-action="unlimited" data-id="${user.telegramId}">Безлимит вкл/выкл</button>
        <button data-action="balance" data-id="${user.telegramId}">Задать баланс</button>
      </td>
    `;
    tbody.appendChild(row);
  }
}

document.getElementById('users-body').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const { action, id } = button.dataset;

  if (action === 'reset') {
    await apiFetch(`/api/admin/users/${id}/reset`, { method: 'POST' });
  } else if (action === 'unlimited') {
    const enabled = confirm('Включить безлимит для этого пользователя?');
    await apiFetch(`/api/admin/users/${id}/unlimited`, { method: 'POST', body: JSON.stringify({ enabled }) });
  } else if (action === 'balance') {
    const value = prompt('Новый баланс:');
    if (value === null) return;
    await apiFetch(`/api/admin/users/${id}/balance`, { method: 'POST', body: JSON.stringify({ value: Number(value) }) });
  }
  await loadUsers();
});

loadUsers();
```

- [ ] **Step 3: Manual verification**

With the server running and your Telegram ID seeded as `OWNER_TELEGRAM_ID`, send `/admin` to the bot, open the
returned button. Expected: table lists any users who have opened the main app, and each action button updates the
row after confirmation.

- [ ] **Step 4: Commit**

```bash
git add public/admin.html public/admin.js
git commit -m "feat: add admin panel frontend"
```

---

### Task 13: Deployment files and setup docs

**Files:**
- Create: `.env.example`
- Create: `Dockerfile`
- Create: `README.md`

**Interfaces:** None — operational/documentation task.

- [ ] **Step 1: Write `.env.example`**

```
PORT=3000
BOT_TOKEN=
ANTHROPIC_API_KEY=
OWNER_TELEGRAM_ID=
NIKOLAI_BOT_USERNAME=
DB_PATH=data.sqlite
APP_URL=https://your-domain.example.com
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm install --no-save typescript && npx tsc && npm uninstall typescript
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 3: Write `README.md`**

```markdown
# Forex Signal Mini App

## Настройка бота (один раз, через @BotFather)

1. `/newbot` — создать бота, сохранить токен в `BOT_TOKEN`.
2. `/mybots` → выбрать бота → Bot Settings → Menu Button — не обязательно, приложение открывается по кнопкам из
   `/start` и `/admin` (см. `src/telegram/bot.ts`).
3. Задеплоить приложение на любой HTTPS-хостинг (Mini App URL обязан быть https). Записать этот URL в `APP_URL`.
4. Узнать свой numeric Telegram ID (например через @userinfobot) и записать в `OWNER_TELEGRAM_ID`.
5. Записать username бота Николая (без `@`) в `NIKOLAI_BOT_USERNAME`.
6. Скопировать `.env.example` в `.env` и заполнить все поля.

## Разработка

```bash
npm install
npm run dev
```

Для локальной проверки внутри Telegram нужен публичный HTTPS-туннель (например `cloudflared tunnel --url
http://localhost:3000`), потому что Telegram не открывает `http://` или `localhost` как Mini App.

## Тесты

```bash
npm test
```

## Продакшн

```bash
docker build -t forex-signal-miniapp .
docker run --env-file .env -p 3000:3000 -v $(pwd)/data:/app/data forex-signal-miniapp
```

Смонтируйте `/app/data` как volume, чтобы файл SQLite (`DB_PATH`) переживал перезапуск контейнера.
```

- [ ] **Step 4: Commit**

```bash
git add .env.example Dockerfile README.md
git commit -m "docs: add deployment instructions and Dockerfile"
```

---

## Self-Review Notes

- **Spec coverage:** every numbered decision in the spec (§1–§11) maps to a task above — UI/style (11, 12),
  one-shot signal flow (7, 9), lifetime limit (7's tests), balance (5), no disclaimer (verified absent from all
  frontend/prompt text), auth (3, 4), minimal persistence (2), admin panel + owner-only provisioning (8), model
  choice (6's `claude-sonnet-5` assertion).
- **Placeholder scan:** no `TODO`/`TBD` strings; the one templated value (`nikolaiBotUrl`) is resolved via
  `/api/config` at runtime, not left as a literal placeholder in shipped code.
- **Type consistency:** `Signal`, `UserRecord`, `TelegramUser` are defined once in `src/types.ts` (Task 2) and
  reused verbatim by every later task (`analyzeChart`, `UsersRepo`, `createAnalyzeHandler`, `createMeHandler`,
  route tests) — checked field names (`entryPrice`, `takeProfit1/2/3`, `telegramId`, `freeRunUsed`,
  `unlimitedAccess`, `balanceOverride`) match across Tasks 2, 6, 7, 8, 11, 12.
