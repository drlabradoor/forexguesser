# Forex Signal Mini App

## Настройка бота (один раз, через @BotFather)

1. `/newbot` — создать бота, сохранить токен в `BOT_TOKEN`.
2. Задеплоить приложение на любой HTTPS-хостинг (Mini App URL обязан быть https). Записать этот URL в `APP_URL`.
3. Узнать свой numeric Telegram ID (например через @userinfobot) и записать в `OWNER_TELEGRAM_ID`.
4. Записать username бота Николая (без `@`) в `NIKOLAI_BOT_USERNAME`.
5. Скопировать `.env.example` в `.env` и заполнить все поля.

Открытие Mini App происходит через кнопки, которые бот присылает на команды `/start` (обычный анализатор) и
`/admin` (админ-панель, только для админов) — см. `src/telegram/bot.ts`. Отдельно настраивать Menu Button в
BotFather не обязательно.

## Разработка

```bash
npm install
npm run dev
```

Для локальной проверки внутри Telegram нужен публичный HTTPS-туннель (например `cloudflared tunnel --url
http://localhost:3000`), потому что Telegram не открывает `http://` или `localhost` как Mini App. Укажите
URL туннеля в `APP_URL`.

## Тесты

```bash
npm test
```

## Продакшн

```bash
docker build -t forex-signal-miniapp .
docker run --env-file .env -p 3000:3000 -v $(pwd)/data:/app/data forex-signal-miniapp
```

Смонтируйте `/app/data` как volume, чтобы файл SQLite (`DB_PATH`) переживал перезапуск контейнера. Укажите
`DB_PATH=/app/data/data.sqlite` в `.env`, чтобы файл попадал в примонтированный volume.
