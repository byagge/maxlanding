# MaxLanding

Telegram-бот и Mini App для студии лендингов: домены через NS, шаблоны, магазин, баланс и админ-панель. Стек: Fastify, Prisma (SQLite), grammY, React/Vite.

## Cursor Cloud specific instructions

- Запуск разработки описан в `README.md` (`npm run dev`). API слушает порт `8787`, Vite — `5173`. Прокси Vite на публичные страницы обязан быть `/l/` и `/t/` со слэшем в конце, иначе маршрут `/landings` уходит в API.
- Без `BOT_TOKEN` процесс API поднимается, а long polling бота не стартует. Это нормальный локальный режим.
- Вход без Telegram работает только при `NODE_ENV` не `production` и `DEV_AUTH` не `0`: админ `telegramId` `10000`, пользователь `20000`. В проде этих кнопок нет.
- Кабинет без магазина и баланса. Новый лендинг получает поддомен `ldngN` на `platformDomain` из настроек. Свой домен подключается A-записью на `platformIp`.
- `BOT_TOKEN` только в `.env`. Без него API живёт, long polling не стартует.
- Файл базы `data/maxlanding.db` не коммитится. Перед тестами и первым запуском: `npm run db:setup`.
