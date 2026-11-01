# Инструкция по настройке Supabase (Free Tier)

Данная инструкция описывает пошаговую настройку проекта в Supabase для универсального PWA детейлинг-центров.

---

## Шаг 1. Создание проекта в Supabase

1. Перейдите на [supabase.com](https://supabase.com) и войдите в свой аккаунт (или зарегистрируйтесь).
2. Нажмите **«New Project»**.
3. Укажите:
   - **Name**: `detailing-pwa` (или любое желаемое имя).
   - **Database Password**: придумайте надёжный пароль (сохраните его для резервного копирования).
   - **Region**: выберите ближайший регион (например, `Central EU (Frankfurt)`).
   - **Pricing Plan**: Free ($0/mo).
4. Нажмите **«Create new project»** и дождитесь инициализации базы данных (1–2 минуты).

---

## Шаг 2. Применение SQL-миграций

В панели проекта Supabase перейдите в раздел **SQL Editor** (иконка терминала `>_` слева) и выполните файлы миграций по порядку:

### 1. Схема базы данных
- Откройте файл `supabase/migrations/001_schema.sql`.
- Скопируйте его содержимое в SQL Editor и нажмите кнопку **«Run»**.
- Создадутся таблицы:
  - `companies`
  - `company_admins`
  - `services`
  - `gallery_photos`
  - `weekly_schedule`
  - `schedule_breaks`
  - `blocked_intervals`
  - `bookings`

### 2. Политики безопасности RLS
- Откройте файл `supabase/migrations/002_rls.sql`.
- Скопируйте его содержимое в SQL Editor и нажмите **«Run»**.
- Активируется Row Level Security с полной изоляцией данных студий друг от друга.

### 3. Серверные RPC-функции бронирования
- Откройте файл `supabase/migrations/003_functions.sql`.
- Скопируйте его содержимое в SQL Editor и нажмите **«Run»**.
- Развернутся атомарные серверные функции:
  - `get_company_by_slug`
  - `get_available_slots`
  - `create_booking` (с транзакционной блокировкой `pg_advisory_xact_lock` и 30-минутным резервом)
  - `confirm_booking`
  - `cancel_booking`
  - `reschedule_booking`
  - `complete_booking`
  - `create_manual_booking`
  - `create_blocked_interval`
  - `cleanup_expired_bookings`

### 4. Первоначальные демонстрационные данные (Seed)
- Откройте файл `supabase/migrations/004_seed.sql`.
- Скопируйте его содержимое в SQL Editor и нажмите **«Run»**.
- Создадутся демонстрационные студии:
  - **Detail Lab** (`/c/detail-lab`, Алматы)
  - **Auto Studio** (`/c/auto-studio`, Астана)
  - **Prime Detailing** (`/c/prime-detailing`, Шымкент)
- И учётные записи владельцев:
  - `owner@detail-lab.kz` (пароль: `password123`)
  - `owner@auto-studio.kz` (пароль: `password123`)

---

## Шаг 3. Настройка хранилища фотографий (Supabase Storage)

1. В левом меню Supabase перейдите в раздел **Storage**.
2. Нажмите **«New Bucket»**.
3. Заполните параметры:
   - **Name**: `detailing-assets`
   - **Public Bucket**: включите переключатель (галочка **ON**), чтобы фотографии портфолио и логотипы загружались в браузер клиентов без токенов авторизации.
4. Нажмите **«Save»**.
5. Структура хранения внутри бакета разделяется по компаниям автоматически:
   ```
   detailing-assets/
     companies/{company_id}/
       logo/
       portfolio/
   ```

---

## Шаг 4. Настройка аутентификации (Supabase Auth)

По ТЗ публичная регистрация владельцев запрещена (аккаунты создаёт администратор продукта):
1. В левом меню перейдите в **Authentication** -> **Providers** -> **Email**.
2. Убедитесь, что переключатель **«Confirm email»** отключен (для быстрого входа владельцев) либо включен по вашему усмотрению.
3. Отключите опцию **«Allow new users to sign up»** (защита от несанкционированной регистрации).

---

## Шаг 5. Получение API-ключей для приложения

1. Перейдите в **Project Settings** -> **API**.
2. Скопируйте следующие значения:
   - **Project URL**: `https://<project-ref>.supabase.co`
   - **Project API Keys** -> `anon` / `public`: длинный JWT-ключ.
3. Добавьте их в файл `.env` локально и в переменные окружения Netlify:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
