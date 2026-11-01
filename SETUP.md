# SETUP.md: Инструкция по локальному запуску и развертыванию

Данный документ описывает процесс локального запуска, применения миграций Supabase, настройки секретов, планировщика cron и развертывания PWA на Cloudflare Pages или Vercel.

---

## 1. Локальный запуск приложения

### Требования:
- Node.js 20+
- pnpm 9+ / 10+

### Установка зависимостей:
```bash
pnpm install
```

### Запуск в режиме разработки:
```bash
pnpm dev
```
Приложение откроется по адресу `http://localhost:5173/`:
- **Выбор студий (Hub):** `http://localhost:5173/`
- **GRAPHITE Detailing (Клиент):** `http://localhost:5173/s/graphite/`
- **GRAPHITE Detailing (Кабинет владельца):** `http://localhost:5173/s/graphite/owner/`
  *(Вход: `demo@example.com` / `demo12345`)*
- **MOTOR PLUS Автосервис (Клиент):** `http://localhost:5173/s/motorplus/`
- **MOTOR PLUS Автосервис (Кабинет владельца):** `http://localhost:5173/s/motorplus/owner/`

### Запуск тестов:
```bash
# Модульные и интеграционные тесты (Vitest, 19 тестов)
pnpm test

# Сквозной E2E-тест полного пути записи (Playwright)
pnpm test:e2e

# Проверка сборки со строгим TypeScript и PWA injectManifest
pnpm build
```

---

## 2. Развертывание базы данных Supabase

Все SQL-миграции расположены в каталоге `supabase/migrations/`:
1. `001_schema.sql` — 14 таблиц, расширения `pgcrypto` и `btree_gist`, исключающее ограничение `resource_occupancies EXCLUDE USING gist (resource_id WITH =, tstzrange(start_at, end_at) WITH &&)`, триггеры целостности `tenant_id`, индексы.
2. `002_rls.sql` — Row Level Security на всех 14 таблицах. Полный запрет доступа anon к персональным данным, токенам, платежам и очередям. Доступ владельца только к своему tenant.
3. `003_functions.sql` — Атомарные транзакции `create_booking`, `reschedule_booking`, `cancel_booking`, `get_available_slots`, `get_tenant_stats`, `increment_rate_limit`, `lease_notification_jobs`.
4. `004_seed.sql` — Инициализирующие данные для двух демо-студий: `graphite` и `motorplus`.

### Применение миграций:
Если используется Supabase CLI:
```bash
# Локальный запуск Supabase
supabase start

# Применение миграций
supabase db reset
```

Если используется облачный проект Supabase:
1. Перейдите в [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**.
2. Поочередно выполните файлы `001_schema.sql`, `002_rls.sql`, `003_functions.sql` и `004_seed.sql`.

---

## 3. Настройка переменных окружения и Edge Functions

Скопируйте пример файла конфигурации:
```bash
cp .env.example .env
```

Заполните переменные:
```ini
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_APP_URL=https://your-domain.com
```

### Секреты Edge Functions (серверные):
В панели Supabase Dashboard (**Project Settings** → **Edge Functions** → **Secrets**) или через CLI:
```bash
supabase secrets set LLM_BASE_URL="https://api.openai.com/v1"
supabase secrets set LLM_API_KEY="sk-..."
supabase secrets set LLM_MODEL="gpt-4o-mini"
supabase secrets set VAPID_PUBLIC_KEY="B..."
supabase secrets set VAPID_PRIVATE_KEY="..."
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="eyJ..."
```

> **Примечание:** При отсутствии `LLM_API_KEY` в Edge Function автоматически активируется встроенный локальный fallback (JSON Intent Router), который корректно отвечает по реальным услугам, ценам и адресу студии без сбоев.

### Развертывание Edge Functions:
```bash
supabase functions deploy ai-chat
supabase functions deploy process-notifications
```

### Настройка Supabase Cron для очереди уведомлений:
Для обработки outbox-очереди `notification_jobs` создайте cron-задачу в SQL Editor:
```sql
-- Вызов функции обработки уведомлений каждую минуту
SELECT cron.schedule(
    'process-notifications-every-minute',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://<your-project-id>.supabase.co/functions/v1/process-notifications',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
    );
    $$
);
```

---

## 4. Конвейер публикации новых студий

Для создания новой студии выполните:
```bash
# 1. Создать шаблон студии
pnpm tenant:new royal "ROYAL Detailing"

# 2. Отредактировать tenants/royal/business.json

# 3. Проверить валидность конфигурации
pnpm tenant:validate royal

# 4. Сгенерировать PWA-манифест и загрузить в БД
pnpm tenant:publish royal

# 5. Проверить готовность и активировать Live
pnpm tenant:verify royal
```

---

## 5. Сборка и деплой на Cloudflare Pages / Vercel

Frontend является полностью статическим SPA (Single Page Application) с Service Worker:

### Cloudflare Pages:
- **Build command:** `pnpm build`
- **Build output directory:** `dist`
- **Node.js Version:** `20`
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`

Для поддержки client-side роутинга в Cloudflare Pages добавьте правило в `public/_redirects`:
```
/* /index.html 200
```

### Vercel:
- **Framework Preset:** Vite
- **Build Command:** `pnpm build`
- **Output Directory:** `dist`
