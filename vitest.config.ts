import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Явный список вместо умолчания: e2e/*.spec.ts запускается playwright'ом,
    // и vitest подхватил бы его по умолчанию, пытаясь стартовать браузер.
    include: ['tests/**/*.test.ts'],
  },
});
