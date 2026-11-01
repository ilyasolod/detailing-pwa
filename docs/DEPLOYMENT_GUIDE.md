# Руководство по развёртыванию (DEPLOYMENT_GUIDE.md)

Это руководство содержит полную инструкцию по выводу многотенантной PWA системы онлайн-записи детейлинг-центров в промышленную эксплуатацию (Production) для первого коммерческого пилота.

---

## 1. Архитектурный обзор

Продукт состоит из двух ключевых компонентов:
1. **Frontend PWA (Single Page Application)**:
   - Стек: React 19, Vite 8, TypeScript, Tailwind CSS, Workbox PWA.
   - Хостинг: Vercel, Cloudflare Pages, Netlify или любой статический CDN/Nginx.
   - Изоляция тенантов: маршрутизация по slug (`/c/:slug` — клиентская страница, `/c/:slug/admin` — изолированный кабинет владельца).

2. **Backend & Database (Supabase Cloud / PostgreSQL 15+)**:
   - Авторизация: Supabase GoTrue (JWT).
   - Изоляция данных: Row-Level Security (RLS) на всех 8 таблицах + RPC-функции с `SECURITY DEFINER` и проверкой принадлежности компании (`company_admins`).
   - Идемпотентность: `idempotency_key UUID` + таблица `booking_idempotency_records` с SHA-256 хэшированием параметров.
   - Защита от овербукинга: сериализация через `pg_advisory_xact_lock(hashtext(company_id::text))` на уровне PostgreSQL.

---

## 2. Предварительные требования

Перед развёртыванием убедитесь в наличии:
- Node.js v20+ и pnpm v9+;
- Учётная запись Supabase Cloud (или собственный self-hosted инстанс Supabase);
- Платформа хостинга фронтенда (рекомендуется Vercel или Cloudflare Pages);
- Доменное имя с настроенным SSL-сертификатом (HTTPS обязателен для работы Service Worker / PWA).

---

## 3. Развёртывание базы данных Supabase

### 3.1. Создание проекта в Supabase
1. Зарегистрируйтесь на [supabase.com](https://supabase.com) и создайте новый проект (например, `detailing-pwa-prod`).
2. Выберите регион, ближайший к вашей целевой аудитории (для Казахстана/СНГ рекомендуется `eu-central-1` Франкфурт).
3. Сохраните пароль базы данных (`POSTGRES_PASSWORD`).

### 3.2. Применение миграций в строгом порядке
Миграции должны применяться строго последовательно от `001` до `008`:

```bash
# 1. Авторизуйтесь в Supabase CLI
pnpm dlx supabase login

# 2. Свяжите проект с вашим облачным проектом
pnpm dlx supabase link --project-ref <YOUR_PROJECT_REF>

# 3. Примените все миграции
pnpm dlx supabase db push
```

#### Порядок миграций:
1. `001_schema.sql` — Базовая реляционная схема: `companies`, `services`, `weekly_schedule`, `schedule_breaks`, `blocked_intervals`, `gallery_photos`, `bookings`, `company_admins`. Включение RLS на всех таблицах.
2. `002_rls_policies.sql` — Базовые политики безопасности RLS.
3. `003_public_rpc.sql` — Публичные RPC-функции (`get_company_public_data`, `get_available_slots`, `create_booking`).
4. `004_admin_rpc.sql` — Административные RPC-функции чтения (`get_owner_dashboard_data`).
5. `005_seed.sql` — Начальные тестовые компании (Detail Lab и Auto Studio). *Примечание: для боевого запуска тестовые записи можно не накатывать или заменить на данные первого клиента.*
6. `006_admin_operations.sql` — Административные RPC-функции мутаций (`confirm_booking`, `cancel_booking`, `reschedule_booking`, `save_service`, `delete_service`, `create_blocked_interval`, `delete_blocked_interval`, `add_portfolio_photo`, `delete_portfolio_photo`, `update_company_settings`, `update_schedule_and_breaks`).
7. `007_fix_delete_rpc.sql` — Исправление типа `v_deleted` на `integer` в RPC удаления.
8. `008_booking_idempotency.sql` — Добавление `idempotency_key` в `bookings`, создание таблицы `booking_idempotency_records` и обновление RPC `create_booking` с защитой от дублирования и Lost Response.

---

## 4. Переменные окружения (.env)

Для production-сборки создайте файл `.env.production` (или задайте переменные в панели хостинга):

```env
# URL вашего облачного проекта Supabase
VITE_SUPABASE_URL=https://<YOUR_PROJECT_REF>.supabase.co

# Публичный анонимный ключ Supabase (Anon Key)
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Публичный URL продакшн-приложения (с протоколом HTTPS)
VITE_APP_URL=https://detailing.yourdomain.kz
```

> [!CAUTION]
> Никогда не помещайте `SERVICE_ROLE_KEY` во фронтенд или в переменные с префиксом `VITE_`! Фронтенд должен использовать исключительно `VITE_SUPABASE_ANON_KEY`. Все привилегированные операции выполняются через `SECURITY DEFINER` RPC с авторизацией по JWT.

---

## 5. Сборка и оптимизация фронтенда

### 5.1. Проверка типов и линтинг
Перед сборкой убедитесь, что TypeScript компилируется без ошибок:
```bash
pnpm exec tsc -b
pnpm test
```

### 5.2. Сборка продакшн-бандла
```bash
pnpm build
```

Результат сборки в директории `dist/`:
- Оптимизированные чанки:
  - `dist/assets/index-*.js` (~87 kB) — ядро клиентской страницы;
  - `dist/assets/AdminPage-*.js` (~65 kB) — лениво загружаемый админ-кабинет;
  - `dist/assets/vendor-*.js` (~274 kB) — React, React Router, TanStack Query;
  - `dist/assets/supabase-*.js` (~214 kB) — клиент Supabase;
  - `dist/assets/icons-*.js` (~112 kB) — иконки Phosphor;
  - `dist/sw.js` (~17 kB) — скомпилированный Service Worker с precache-манифестом.

---

## 6. Требования к PWA и HTTPS

1. **Обязательный HTTPS**: Service Worker регистрируется исключительно по безопасному протоколу HTTPS (или на `localhost` для отладки).
2. **Web Manifest**: Файл `manifest.webmanifest` отдаётся с `Content-Type: application/manifest+json`.
3. **MIME-типы Service Worker**: Скрипт `sw.js` должен отдаваться с заголовком `Service-Worker-Allowed: /` и кэшированием `Cache-Control: no-cache, no-store, must-revalidate`.
4. **Single Page Application Routing**: Сервер должен перенаправлять все маршруты (`/c/:slug`, `/c/:slug/admin`, `/admin`) на `index.html` (rewrite rule `/* -> /index.html 200`).

---

## 7. Чек-лист готовности к запуску

- [ ] Все миграции (001–008) применены на базе Supabase.
- [ ] RLS включён и протестирован на всех таблицах.
- [ ] Переменные окружения заданы в панели хостинга.
- [ ] Успешно проходит production build (`pnpm build`).
- [ ] HTTPS настроен, SSL-сертификат активен.
- [ ] Сервис-воркер регистрируется в браузере без ошибок.
- [ ] Вход в админ-панель протестирован с реальной учётной записью.
- [ ] Тестовое бронирование проходит успешно с получением ссылки в WhatsApp.
