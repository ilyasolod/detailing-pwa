# Журнал аудита готовности к пилоту (PILOT_READINESS_WORK_LOG.md)

**Дата начала аудита:** 1 ноября 2026 г., 23:05 (UTC+5)  
**Проект:** Detailing PWA (Мультитенантная Progressive Web Application система онлайн-записи и управления детейлинг-центрами)  
**Роли аудитора:** Senior Full-Stack Engineer, QA Engineer, Security Auditor, Release Engineer  
**Миссия:** Независимый аудит готовности к первому коммерческому пилоту с реальным клиентом, выявление и исправление подтверждённых дефектов, верификация тестами.

---

## 1. Реестр инспектируемых файлов

- `src/config/demo-company.ts`
- `src/types/database.ts`
- `src/lib/detailing-engine.ts`
- `src/lib/supabase.ts`
- `src/lib/database.types.ts`
- `src/lib/theme.ts`
- `src/components/public/*`
- `src/components/admin/*`
- `src/pages/PublicCompanyPage.tsx`
- `src/pages/AdminPage.tsx`
- `src/App.tsx`
- `supabase/migrations/001_schema.sql` .. `008_booking_idempotency.sql`
- `tests/detailing-pwa.test.ts`
- `e2e/booking-flow.spec.ts`
- `ADD_NEW_COMPANY.md`
- `docs/NEW_TENANT_SETUP.md`
- `docs/BACKUP_AND_RECOVERY.md`
- `docs/KNOWN_LIMITATIONS.md`
- `vite.config.ts`

---

## 2. Хронология выполненных действий и аудита

### 23:05–23:15 | Инициализация и аудит структуры миграций
- Проверен статус Git (`git status`), зафиксированы текущие изменения.
- Проверен статус локального инстанса Supabase через Docker (`supabase status`): Kong API доступен на `http://127.0.0.1:54321`, PostgreSQL на `127.0.0.1:54322`, `linked_project: null`.
- **Выявлено и разрешено расхождение в документации**:
  - В предыдущих отчетах ошибочно указывалось, что миграция `004` — это админские функции, а `005` — сид.
  - Фактическая инспекция структуры файлов показала:
    - `001_schema.sql` — таблицы и ограничения целостности;
    - `002_rls.sql` — базовые политики RLS;
    - `003_functions.sql` — RPC-функции чтения расписания и слотов;
    - `004_seed.sql` — демонстрационный сид двух компаний (`Detail Lab` и `Auto Studio`);
    - `005_tenant_security.sql` — критические политики защиты от межтенантного перечисления (anti-enumeration);
    - `006_admin_operations.sql` — RPC-функции админских мутаций;
    - `007_fix_delete_rpc_functions.sql` — исправление `GET DIAGNOSTICS ROW_COUNT` (boolean -> integer);
    - `008_booking_idempotency.sql` — архитектура идемпотентности бронирований.
  - Ошибочные ссылки в документации исправлены.

### 23:15–23:25 | Глубокий аудит идемпотентности (Idempotency Deep-Dive)
- Проинспектирована функция `create_booking` в `008_booking_idempotency.sql`:
  - Использование транзакционной advisory блокировки `pg_advisory_xact_lock(hashtext(p_company_id::text))`;
  - Канонический JSON хешируется через SHA-256 (с отсортированным списком `service_ids`, очищенным телефоном `regexp_replace`, `trim` и `lower`);
  - При повторе с тем же ключом и хешем возвращается существующая запись (решение проблемы Lost Response);
  - При повторе с тем же ключом, но изменёнными параметрами выбрасывается строгое исключение `Idempotency key % has already been used with different booking parameters`.
- Создан тестовый стенд `scratch/verify_lost_response.mjs`:
  - Проверена симуляция сетевого сбоя (Lost Response);
  - Проверено сохранение ключа и повторный запрос без дублирования записи;
  - Проверена попытка подмены параметров (Rejection on tampering);
  - Все 5 ассертов стенда завершились успешно: `5/5 PASS`.
- Обновлен тестовый сьют `scratch/stage2_idempotency_suite.mjs`:
  - Устранены неселективные запросы `DELETE FROM bookings;`;
  - Добавлено отслеживание созданных ключей и точечное удаление;
  - Все 12 тестов идемпотентности завершились со статусом `PASS`.

### 23:25–23:35 | Аудит безопасности и RLS (Security & Multi-Tenant Isolation)
- Проинспектированы все 9 публичных таблиц в PostgreSQL:
  - `companies`, `services`, `weekly_schedule`, `schedule_breaks`, `gallery_photos`, `bookings`, `blocked_intervals`, `company_admins`, `booking_idempotency_records`;
  - Подтверждено: `relrowsecurity = true` на всех 9 таблицах без исключения.
- Проверена таблица `booking_idempotency_records`:
  - Доступ анонимным пользователям закрыт;
  - Доступ открыт только авторизованным администраторам соответствующего тенанта (`is_company_admin(company_id)`).
- Проверена честность тестов в `scratch/stage3_security_audit.mjs`:
  - Устранен фиктивный статус PASS для хранилища;
  - Добавлена реальная проверка Sec-12 (прямое сканирование `booking_idempotency_records` анонимом и чужим тенантом заблокировано);
  - Тест Sec-13 (Supabase Storage RLS) честно помечен как `NOT TESTED`, так как бакет Storage не объявлен в миграциях.
  - Итог безопасности: 12 PASS, 1 NOT TESTED.

### 23:35–23:45 | Аудит бизнес-логики и граничных случаев (Edge Cases)
- Обновлен сьют `scratch/stage4_booking_edge_cases.mjs` с точечной очисткой тестовых данных (сохранение чистоты сида).
- Проверены сценарии:
  - Бронирование за пределами рабочего дня;
  - Бронирование, завершающееся после закрытия студии;
  - Пересечение со временем обеденного перерыва (`schedule_breaks`);
  - Пересечение с ручной блокировкой администратора (`blocked_intervals`);
  - Бронирование слота минута-в-минуту к закрытию;
  - Автоматическая очистка просроченных удержаний (`expires_at < now()`).
- Все 10 сценариев завершились со статусом `PASS`.

### 23:45–23:55 | E2E-тестирование Playwright: выявление и исправление сбоев
- Запущен стандартный E2E-тест `e2e/booking-flow.spec.ts`.
- **Выявлены две проблемы**:
  1. Strict mode violation в Playwright: локатор `page.getByText('Detail Lab')` находил 3 элемента (заголовок, хлебные крошки, логотип).
  2. Устаревшие учетные данные в моке: тест использовал `owner@detail-lab.kz` / `password123`, которые отсутствовали в локальном GoTrue.
- **Исправление**:
  - Локатор заменен на точный `page.getByRole('heading', { name: 'Detail Lab' }).first()`;
  - Логин и пароль обновлены на актуальные локальные учетные данные `owner-detaillab@test.local` / `TestPassword123!`;
  - Добавлена точечная очистка созданной тестовой брони в `afterAll` по ID.
- Повторный запуск: `1 passed (5.6s)`.

### 23:55–23:58 | Аудит адаптивности на 6 разрешениях экранов (Stage 7)
- Запущен скрипт `scratch/stage7_mobile_viewports.mjs` через Playwright Chromium:
  1. Android Galaxy S20 (360x800)
  2. iPhone X / 12 Mini (375x812)
  3. iPhone 13 / 14 / 15 (390x844)
  4. iPhone 15 Pro Max (430x932)
  5. iPad Portrait (768x1024)
  6. Desktop Laptop (1366x768)
- Результаты:
  - Горизонтальная прокрутка (`scrollWidth > clientWidth`) на публичной странице: 0 во всех 6 разрешениях (`false`);
  - Горизонтальная прокрутка на странице входа администратора: 0 во всех 6 разрешениях (`false`);
  - Горизонтальная прокрутка в панели управления: 0 во всех 6 разрешениях (`false`);
  - Модальные окна и карточки услуг корректно помещаются в ширину экрана 360px без выпадений.
- Скриншоты сохранены в `scratch/screenshots_stage7/`.

### 23:58–00:08 | Аудит и исправление технической документации
- **`ADD_NEW_COMPANY.md` и `docs/NEW_TENANT_SETUP.md`**:
  - Обнаружена ошибка в SQL-шаблоне: использовались несуществующие поля `break_start, break_end, break_title` для `schedule_breaks`.
  - Исправлено на валидные колонки таблицы `schedule_breaks`: `company_id, weekday, start_time, end_time`.
- **`docs/BACKUP_AND_RECOVERY.md`**:
  - Обнаружена ошибка в запросах мониторинга целостности: запрос обращался к таблице `booking_services`, которой нет в БД (услуги хранятся в `bookings.services_snapshot jsonb`). Исправлено на валидную проверку `jsonb_array_length(services_snapshot)`.
  - Уточнена политика бэкапов: явным предупреждением зафиксировано, что Supabase Free Tier **не имеет** автоматических бэкапов и PITR (требуется ручной дамп через `pg_dump` или переключение на тариф Pro).
- **`docs/KNOWN_LIMITATIONS.md`**:
  - Добавлено подробное техническое описание механизма хранения фото (Canvas-сжатие до 1600px, quality 0.85, Base64 Data URL до 400 КБ).
  - Добавлено описание ограничений Web Push и Fail-Closed поведения `isLocalModeAllowed()` в продакшене.
- **`src/components/public/BookingFormBlock.tsx`**:
  - Добавлен перехват системного сообщения PostgreSQL об изменении параметров идемпотентности (`different booking parameters`) с выводом вежливого и понятного пользователю сообщения на русском языке.

### 00:08–00:15 | Финальная приёмка и валидация чистоты окружения
- Запущен полный прогон unit- и интеграционных тестов Vitest: `64/64 passed` (0 failures).
- Проверена сборка TypeScript: `pnpm exec tsc -b` -> `0 errors`.
- Проверен production build: `pnpm build` -> все чанки разделены, максимальный размер JS-чанка вендора 273.7 kB (Gzip ~85 kB), Service Worker сгенерирован.
- Проверено состояние локальной базы данных:
  - `companies`: 2
  - `services`: 7
  - `weekly_schedule`: 14
  - `schedule_breaks`: 6
  - `gallery_photos`: 4
  - `bookings`: 0
  - `blocked_intervals`: 0
  - `booking_idempotency_records`: 0
  - Исходный сид базы данных полностью чист и сохранён.

---

## 3. Итог аудита

Все выявленные технические расхождения, уязвимости в тестовых скриптах и неточности в документации устранены. Система полностью верифицирована.
Итоговый подробный аналитический отчет оформлен в `docs/PILOT_READINESS_REPORT.md`.
