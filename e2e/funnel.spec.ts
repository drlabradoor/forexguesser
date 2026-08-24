/**
 * Сквозной прогон воронки против настоящего бэкенда.
 *
 * Главное здесь -- проверки тела HTTP-ответа, а не разметки: пейволл держится
 * на сервере, и юнит-тесты `forViewer` не заметят, если кто-то отдаст сигнал
 * в обход него. Разметка проверяется постольку, поскольку она подтверждает,
 * что закрытое действительно не доехало до страницы.
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:4322';

/** 1x1 PNG: короче 1568px по длинной стороне, значит уходит без пересжатия. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** Ничего из этого не должно покидать сервер, пока доступ не выдан. */
const SECRETS = ['bullish', '1.08234', '1.0791', 'закрепилась выше', 'Пробой подтверждён'];

function control(query = '') {
  return fetch(`${BASE}/__control${query}`).then((r) => r.json());
}

function appHtml(page: Page) {
  return page.evaluate(() => document.getElementById('app')!.innerHTML);
}

test.describe.configure({ mode: 'serial' });

test('the paywall holds from the first analysis to a revoked access', async ({ browser }) => {
  // Прогон мутирует состояние пользователя, а сервер между запусками
  // переиспользуется -- без сброса тест проходил бы ровно один раз.
  const fresh = await control('?reset=1');
  expect(fresh.user.freeRunUsed, 'сброс должен вернуть тизер').toBe(false);
  expect(fresh.user.unlimitedAccess, 'сброс должен снять доступ').toBe(false);
  expect(fresh.signals, 'сброс должен стереть историю').toBe(0);

  const { initData } = await fetch(`${BASE}/__initdata`).then((r) => r.json());

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

  // Заглушка Telegram ставится до любого скрипта страницы, а настоящий SDK
  // блокируется -- иначе он перезапишет её при загрузке.
  await context.addInitScript((data) => {
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: data,
        initDataUnsafe: { user: { id: 555001, first_name: 'E2E' } },
        ready() {},
        expand() {},
        openTelegramLink() {},
      },
    };
  }, initData);
  await context.route('https://telegram.org/**', (route) => route.abort());

  const page = await context.newPage();
  const bodies: { url: string; status: number; text: string }[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    try {
      bodies.push({ url: response.url(), status: response.status(), text: await response.text() });
    } catch {
      // Тело могло быть уже освобождено -- для проверок ниже это не критично.
    }
  });

  await test.step('первый разбор выполняется, но результат закрыт', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.setInputFiles('#file-input', { name: 'chart.png', mimeType: 'image/png', buffer: PNG });
    await page.click('.button--primary');
    await page.waitForSelector('.teaser');

    const analyze = bodies.find((b) => b.url.endsWith('/api/analyze'));
    expect(analyze?.status).toBe(200);
    expect(analyze?.text).toContain('"locked":true');
    for (const secret of SECRETS) {
      expect(analyze?.text, `тело /api/analyze не должно содержать "${secret}"`).not.toContain(secret);
    }

    const html = await appHtml(page);
    for (const secret of SECRETS) {
      expect(html, `DOM не должен содержать "${secret}"`).not.toContain(secret);
    }
    expect(html).toContain('AUD/CHF');

    const state = await control();
    expect(state.claudeCalls).toBe(1);
    expect(state.signals).toBe(1);
    expect(state.user.freeRunUsed).toBe(true);
  });

  await test.step('история без доступа: строки есть, содержимого нет', async () => {
    await page.click('[data-tab="signals"]');
    await page.waitForSelector('.sigrow');

    const signals = bodies.find((b) => b.url.endsWith('/api/signals'));
    for (const secret of SECRETS) {
      expect(signals?.text, `тело /api/signals не должно содержать "${secret}"`).not.toContain(secret);
    }
    await expect(page.locator('.sigrow__lock')).toHaveCount(1);
  });

  await test.step('потраченный тизер не тратит деньги на Claude', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.setInputFiles('#file-input', { name: 'chart.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('.button--primary').first()).toHaveText('Получить полный доступ');
    expect((await control()).claudeCalls).toBe(1);

    // Обход интерфейса: сервер обязан отказать сам, без помощи вёрстки.
    const forced = await page.evaluate(async (data) => {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': data as string },
        body: JSON.stringify({ imageBase64: 'abc', mediaType: 'image/png' }),
      });
      return { status: response.status, body: await response.text() };
    }, initData);
    expect(forced.status).toBe(403);
    expect(forced.body).toContain('NO_ACCESS');
    expect((await control()).claudeCalls).toBe(1);
  });

  await test.step('выдача доступа открывает тот самый сохранённый сигнал', async () => {
    await control('?grant=1');
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[data-tab="signals"]');
    await page.click('.sigrow');

    const html = await appHtml(page);
    expect(html).toContain('1.08234');
    expect(html).toContain('Вверх · BUY');
    await expect(page.locator('.sigrow__lock')).toHaveCount(0);
  });

  await test.step('отзыв доступа закрывает историю обратно', async () => {
    await control('?grant=0');
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('[data-tab="signals"]');
    await page.waitForSelector('.sigrow');

    expect(await appHtml(page)).not.toContain('1.08234');
    await expect(page.locator('.sigrow__lock')).toHaveCount(1);
  });

  await context.close();
});
