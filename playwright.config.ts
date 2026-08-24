import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4322',
    // Установленный в системе Chrome, а не скачанный playwright'ом chromium:
    // CI в проекте нет, а `npx playwright install` тянет несколько сотен
    // мегабайт ради того же движка. Если появится CI -- убрать channel и
    // добавить в пайплайн `npx playwright install --with-deps chromium`.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  // Настоящее приложение на in-memory Postgres; поднимается и гасится само.
  webServer: {
    command: 'npx tsx e2e/server.ts',
    url: 'http://localhost:4322/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
