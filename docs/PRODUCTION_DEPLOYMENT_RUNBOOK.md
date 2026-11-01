# Руководство по развёртыванию в Production (PRODUCTION_DEPLOYMENT_RUNBOOK.md)

**Продукт:** Detailing PWA — Мультитенантная платформа онлайн-записи и управления детейлинг-центрами  
**Версия:** 1.0 (Production Release Candidate)  
**Назначение:** Пошаговая эксплуатационная инструкция для DevOps-инженера и администратора платформы по развёртыванию проекта в облачной инфраструктуре и подключению первого коммерческого клиента.

> [!CAUTION]
> **ПРАВИЛО БЕЗОПАСНОСТИ:**
> Настоящее руководство предназначено для ручного контролируемого исполнения инженером. Автоматические агенты не имеют права самостоятельно подключаться к удалённым базам данных или публиковать сборки без прямого поручения пользователя.

---

## 1. Необходимые сервисы и аккаунты

Для промышленного запуска требуются следующие учётные записи и сервисы:

1. **Supabase Cloud (https://supabase.com):**
   - Учётная запись администратора платформы (Free или Pro план);
   - Рекомендуемый регион: `eu-central-1` (Франкфурт) — минимальный пинг до Казахстана и СНГ (~70–90 мс).
2. **Хостинг фронтенда — Vercel (https://vercel.com):**
   - Бесплатный (Hobby) или командный (Pro) тариф;
   - Автоматический Anycast CDN, поддержка HTTPS «из коробки», интеграция с Git.
3. **Регистратор доменных имён:**
   - Домен для сервиса (например, `detailing-app.kz` или поддомен `app.client-domain.kz`).
4. **WhatsApp Business аккаунт клиента:**
   - Номер телефона первого детейлинг-центра с установленным WhatsApp Business для приёма структурированных заявок от клиентов.

---

## 2. Переменные окружения (Environment Variables)

### 2.1. Клиентские переменные (Vercel Project Settings)
Все переменные с префиксом `VITE_` встраиваются в открытую клиентскую сборку:

| Имя переменной | Пример значения | Описание |
|----------------|-----------------|----------|
| `VITE_SUPABASE_URL` | `https://abcdefghijklm.supabase.co` | Публичный URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5c...` | Публичный анонимный API-ключ Supabase |
| `VITE_APP_URL` | `https://detailing-app.kz` | Базовый публичный URL сервиса (для генерации ссылок и PWA) |
| `VITE_DEFAULT_COMPANY_SLUG` | `prime-detailing` | Slug студии по умолчанию (при заходе на корень `/`) |

> [!WARNING]
> **Категорически запрещено:**
> Передавать переменную `SUPABASE_SERVICE_ROLE_KEY` или пароль к базе данных `postgres` во фронтенд или настройки проекта Vercel.

---

## 3. Развёртывание базы данных Supabase

### 3.1. Создание нового проекта
1. Войдите в консоль Supabase: `https://app.supabase.com`.
2. Нажмите **«New Project»**.
3. Заполните параметры:
   - **Name:** `detailing-pwa-prod`
   - **Database Password:** сгенерируйте стойкий пароль (не менее 20 знаков) через менеджер паролей и сохраните в защищённом хранилище (1Password/Bitwarden).
   - **Region:** `Frankfurt (eu-central-1)`.
   - **Pricing Plan:** Free (или Pro для автоматических бэкапов).
4. Дождитесь инициализации инстанса PostgreSQL (1–2 минуты).

### 3.2. Настройка Supabase Auth
В панели Supabase:
1. Перейдите в раздел **Authentication -> URL Configuration**:
   - **Site URL:** укажите публичный домен приложения: `https://detailing-app.kz`.
   - **Redirect URLs:** добавьте `https://detailing-app.kz/**`.
2. Перейдите в раздел **Authentication -> Providers -> Email**:
   - Убедитесь, что авторизация по Email активна;
   - Рекомендуется включить «Confirm email», если планируется регистрация клиентов, либо отключать для служебных аккаунтов студий при ручном создании через UI.

---

## 4. Применение чистой схемы БД (Без демо-данных)

В репозитории подготовлен эталонный файл `supabase/production_schema.sql`. Он содержит полное DDL-описание (миграции 001, 002, 003, 005, 006, 007, 008) и **полностью исключает** демонстрационные данные из `004_seed.sql`.

### 4.1. Применение через SQL Editor в консоли Supabase
1. В панели проекта Supabase перейдите в раздел **SQL Editor**.
2. Нажмите **«New query»**.
3. Скопируйте целиком содержимое файла `supabase/production_schema.sql` из репозитория.
4. Нажмите **«Run»**.
5. Убедитесь, что запрос завершился со статусом `Success. No rows returned`.

### 4.2. Проверка успешности наката схемы
Выполните проверочный запрос в SQL Editor:

```sql
SELECT 
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
ORDER BY c.relname;
```

**Ожидаемый результат:**
- 9 таблиц: `blocked_intervals`, `booking_idempotency_records`, `bookings`, `companies`, `company_admins`, `gallery_photos`, `schedule_breaks`, `services`, `weekly_schedule`.
- Все 9 таблиц имеют `rls_enabled = true`.
- Количество записей в каждой таблице строго равно `0`.

---

## 5. Подключение первого детейлинг-центра (Тенанта)

### 5.1. Создание учётной записи владельца в Supabase Auth
1. В консоли Supabase откройте **Authentication -> Users**.
2. Нажмите **«Add user»** -> **«Create user»**.
3. Заполните:
   - **Email:** email владельца студии (например, `owner@prime-detailing.kz`);
   - **Password:** сгенерируйте надёжный пароль (минимум 16 знаков с буквами разного регистра, цифрами и спецсимволами);
   - Отметьте галочку **«Auto Confirm User»**.
4. Скопируйте полученный **User UID** (например, `e1a2b3c4-d5e6-7890-abcd-ef1234567890`).

### 5.2. Регистрация данных студии в PostgreSQL
Откройте **SQL Editor** и выполните транзакционный скрипт, подставив реальные параметры клиента:

```sql
DO $$
DECLARE
    v_company_id    uuid := gen_random_uuid();
    v_owner_user_id uuid := 'ВСТАВЬТЕ_USER_UID_ИЗ_ШАГА_5_1'::uuid;
BEGIN
    -- 1. Создание компании
    INSERT INTO companies (
        id,
        slug,
        name,
        description,
        address,
        whatsapp_number,
        timezone,
        duration_calculation_mode,
        design_settings,
        active
    ) VALUES (
        v_company_id,
        'prime-detailing', -- Уникальный slug для ссылок
        'Prime Detailing',
        'Премиальный детейлинг-центр: оклейка антигравийной плёнкой, нанокерамика, восстановительная полировка и химчистка салона.',
        'г. Алматы, пр. Достык, 180',
        '77011234567', -- Номер WhatsApp без знака плюс
        'Asia/Almaty',
        'max', -- 'max' (параллельно) или 'sum' (последовательно)
        '{
            "theme_preset": "dark_studio",
            "primary_color": "#E5A93C",
            "secondary_color": "#1E2024",
            "accent_color": "#F59E0B",
            "background_color": "#0A0A0C",
            "text_color": "#F4F4F6",
            "font_pair": "Inter",
            "border_radius": "16px",
            "hero_image": "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1600&q=85",
            "image_style": "rounded-xl shadow-2xl"
        }'::jsonb,
        true
    );

    -- 2. Привязка владельца к студии
    INSERT INTO company_admins (company_id, user_id, role)
    VALUES (v_company_id, v_owner_user_id, 'owner');

    -- 3. Базовый каталог услуг
    INSERT INTO services (company_id, name, description, price_from, duration_minutes, active, sort_order)
    VALUES
        (v_company_id, 'Детейлинг-мойка 3-х фазная', 'Безопасная мойка кузова, деконтаминация дисков, чистка проемов, сушка турбосушкой.', 12000, 90, true, 1),
        (v_company_id, 'Химчистка салона с озонацией', 'Глубокая биочистка торпедо, кожи, текстиля и ковролина с обработкой кондиционером.', 45000, 300, true, 2),
        (v_company_id, 'Восстановительная полировка', 'Устранение до 95% царапин и паутинки, возвращение глубокого блеска лака.', 65000, 240, true, 3),
        (v_company_id, 'Керамическое покрытие 9H', '2 слоя нанокерамики 9H + гидрофобный слой. Защита от реагентов и ультрафиолета.', 85000, 180, true, 4),
        (v_company_id, 'Оклейка зон риска пленкой', 'Бронирование полиуретаном: капот, бампер, крылья, фары, зеркала, пороги.', 95000, 240, true, 5);

    -- 4. График работы (0=Вс, 1=Пн, ..., 6=Сб)
    INSERT INTO weekly_schedule (company_id, weekday, is_working, opening_time, closing_time)
    VALUES
        (v_company_id, 0, false, '10:00:00', '18:00:00'), -- Воскресенье - выходной
        (v_company_id, 1, true,  '09:00:00', '20:00:00'), -- Пн
        (v_company_id, 2, true,  '09:00:00', '20:00:00'), -- Вт
        (v_company_id, 3, true,  '09:00:00', '20:00:00'), -- Ср
        (v_company_id, 4, true,  '09:00:00', '20:00:00'), -- Чт
        (v_company_id, 5, true,  '09:00:00', '20:00:00'), -- Пт
        (v_company_id, 6, true,  '10:00:00', '19:00:00'); -- Сб

    -- 5. Обеденные перерывы (13:00–14:00)
    INSERT INTO schedule_breaks (company_id, weekday, start_time, end_time)
    VALUES
        (v_company_id, 1, '13:00:00', '14:00:00'),
        (v_company_id, 2, '13:00:00', '14:00:00'),
        (v_company_id, 3, '13:00:00', '14:00:00'),
        (v_company_id, 4, '13:00:00', '14:00:00'),
        (v_company_id, 5, '13:00:00', '14:00:00'),
        (v_company_id, 6, '13:00:00', '14:00:00');

    RAISE NOTICE 'Company successfully created with ID: %', v_company_id;
END $$;
```

---

## 6. Настройка хостинга (Vercel)

### 6.1. Подключение репозитория к Vercel
1. Войдите в аккаунт Vercel: `https://vercel.com`.
2. Нажмите **«Add New...» -> «Project»**.
3. Выберите Git-репозиторий проекта.
4. Настройте конфигурацию:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `./`
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist`
   - **Install Command:** `pnpm install`

### 6.2. Переменные окружения в Vercel
В разделе **Environment Variables** добавьте:
- `VITE_SUPABASE_URL` = URL вашего Supabase проекта
- `VITE_SUPABASE_ANON_KEY` = anon public key вашего Supabase проекта
- `VITE_APP_URL` = ваш продакшен-домен (например, `https://detailing-app.kz`)
- `VITE_DEFAULT_COMPANY_SLUG` = slug первого клиента (например, `prime-detailing`)

### 6.3. Конфигурация маршрутизации и кэширования (`vercel.json`)
Файл `vercel.json` в корне репозитория гарантирует:
- SPA Fallback (`/* -> /index.html 200`);
- Отсутствие кэширования для Service Worker (`sw.js`, `registerSW.js` -> `Cache-Control: public, max-age=0, must-revalidate`);
- Долговременное кэширование хешированных бандлов (`/assets/*` -> `Cache-Control: public, max-age=31536000, immutable`);
- Базовые заголовки безопасности (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).

Нажмите кнопку **«Deploy»**.

---

## 7. Настройка собственного домена и HTTPS

1. В настройках проекта Vercel перейдите в **Settings -> Domains**.
2. Введите рабочий домен (например, `detailing-app.kz` или `app.client-studio.kz`).
3. В панели регистратора домена (DNS) добавьте предложенные записи:
   - Для поддомена: `CNAME` -> `cname.vercel-dns.com`
   - Для корневого домена: `A` -> `76.76.21.21`
4. Vercel автоматически выпустит бесплатный SSL/TLS сертификат Let's Encrypt.
5. Проверьте открытие сайта по безопасному протоколу `https://`.

---

## 8. Пошаговые Smoke-тесты после развёртывания

Выполните на опубликованном домене со смартфона и настольного компьютера:

1. **Проверка витрины студии:**
   - Откройте `https://detailing-app.kz/c/prime-detailing` (или корневой `https://detailing-app.kz/`);
   - Проверьте отображение логотипа, названия, адреса, прайс-листа и кнопок записи.
2. **Проверка расписания:**
   - Нажмите на дату воскресенья — должно быть заблокировано (выходной день);
   - Выберите будний день — слоты должны начинаться с шагом 30 минут, за исключением обеда 13:00–14:00.
3. **Оформление бронирования:**
   - Выберите услугу «Детейлинг-мойка», дату и свободное время;
   - Заполните имя, телефон, марку и модель авто;
   - Нажмите «Забронировать»;
   - Должно появиться модальное окно успешного бронирования с кодом записи;
   - Нажмите кнопку «Перейти в WhatsApp» — откроется диалог с предзаполненным сообщением на номер студии.
4. **Проверка панели администратора:**
   - Перейдите на `https://detailing-app.kz/c/prime-detailing/admin`;
   - Войдите по email и паролю владельца;
   - Убедитесь, что созданная заявка видна в списке;
   - Нажмите «Подтвердить запись» — статус изменится на `confirmed`;
   - Добавьте тестовый заблокированный интервал на завтра — проверьте, что на витрине этот слот исчез.
5. **Очистка тестовых записей:**
   - Отмените тестовую заявку и удалите тестовый заблокированный интервал.

---

## 9. Процедура отката (Rollback Procedure)

### При сбое фронтенда:
1. Откройте панель **Vercel -> Deployments**.
2. Найдите предыдущий стабильный деплой.
3. В меню деплоя выберите **«Promote to Production»** (мгновенный откат за 2 секунды без повторной сборки).

### При сбое базы данных:
1. При наличии снапшота Supabase Pro: восстановите состояние базы на момент до инцидента через пункт **Point-in-Time Recovery (PITR)**.
2. При использовании ручного дампа:
   ```bash
   psql -h <SUPABASE_DB_HOST> -p 5432 -U postgres -d postgres -f backups/production_backup_latest.sql
   ```

---

## 10. Регламент резервного копирования

- **Для Supabase Free Tier:**
  Настройте регулярный логический дамп структуры и данных через GitHub Actions или планировщик cron:
  ```bash
  pg_dump -h <HOST> -p 5432 -U postgres -d postgres --data-only -f backup_$(date +%Y%m%d).sql
  ```
- **Для Supabase Pro Tier:**
  Активируйте встроенное 7-дневное ежедневное резервное копирование в разделе **Database -> Backups**.

---

## 11. Памятка по архитектурным ограничениям (Single Bay Model)

Пилотный релиз v1.0 оптимизирован под модель **одного поста обслуживания**. Это значит:
- Каждая запись блокирует всё рабочее окно студии целиком на время выполнения услуги;
- Параллельное обслуживание двух разных автомобилей в одно и то же время в текущей версии не поддерживается;
- Предоплата согласуется напрямую через WhatsApp без интеграции платёжного шлюза внутри PWA.
