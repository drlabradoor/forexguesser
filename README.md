# Forex Signal Mini App

Telegram Mini App: пользователь загружает скриншот графика, Claude Sonnet 5 анализирует его и выдаёт торговый
сигнал (направление, вход, стоп-лосс, 3 тейк-профита). Один бесплатный сигнал на пользователя, дальше — переход
по диплинку в личку.

## Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `BOT_TOKEN` | да | Токен бота от @BotFather |
| `ANTHROPIC_API_KEY` | да | Ключ Anthropic API |
| `OWNER_TELEGRAM_ID` | да | Ваш numeric Telegram ID (владелец, может назначать админов) |
| `DATABASE_URL` | да | Строка подключения PostgreSQL |
| `TARGET_USERNAME` | да | Username для диплинка (с `@` или без) |
| `APP_URL` | да | Публичный HTTPS-URL приложения |
| `DATABASE_SSL` | нет | `true`, если Postgres требует SSL (частый случай у облачных БД) |
| `PORT` | нет | По умолчанию `3000` |
| `SKIP_BOT_POLLING` | нет | `true` — не запускать поллинг бота |

## Настройка (один раз)

1. Создать бота через @BotFather, сохранить токен в `BOT_TOKEN`.
2. Задеплоить приложение на HTTPS-хостинг, записать выданный URL в `APP_URL`.
3. Написать боту `/id` — он ответит вашим Telegram ID. Записать его в `OWNER_TELEGRAM_ID` и передеплоить.
4. Заполнить `TARGET_USERNAME`, `DATABASE_URL` и `ANTHROPIC_API_KEY`.

Схема БД создаётся автоматически при старте (`CREATE TABLE IF NOT EXISTS`) — миграции запускать не нужно.

## Команды бота

- `/start` — кнопка запуска анализатора
- `/id` — узнать свой Telegram ID
- `/admin` — кнопка админ-панели (только для админов)

## Разработка

```bash
npm install
npm run dev
```

Для проверки внутри Telegram нужен публичный HTTPS-туннель (например `cloudflared tunnel --url
http://localhost:3000`) — Telegram не открывает `http://` или `localhost` как Mini App. URL туннеля указать в
`APP_URL`.

## Тесты и типы

```bash
npm test        # vitest, использует pg-mem — реальная БД не нужна
npm run typecheck   # tsc --noEmit
```

## Продакшн

Шага сборки нет: `npm start` запускает `tsx src/server.ts`, который срезает типы на лету. Это сделано намеренно —
хостинги обычно ставят только production-зависимости (`npm ci --omit=dev`), где нет ни `typescript`, ни `@types/*`,
поэтому компиляция на сервере невозможна. Проверка типов живёт в `npm run typecheck` (локально и в CI).

Требования к платформе: `npm ci --omit=dev` + `npm start`, ничего больше.

```bash
docker build -t forex-signal-miniapp .
docker run --env-file .env -p 3000:3000 forex-signal-miniapp
```
