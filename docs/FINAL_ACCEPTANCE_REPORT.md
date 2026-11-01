# Отчёт независимой технической приёмки проекта (FINAL_ACCEPTANCE_REPORT.md)

**Дата приёмки:** 1 ноября 2026 г.  
**Тип аудита:** Независимая верификация фактического кода, SQL, тестов и runtime-состояния PostgreSQL  
**Статус готовности к локальной демонстрации:** **ГОТОВ (READY)**  
**Статус готовности к пилоту (MVP):** **ГОТОВ С ОГРАНИЧЕНИЯМИ (READY WITH DOCUMENTED LIMITATIONS)**  
**Статус готовности к Enterprise Production:** **ТРЕБУЕТ ДОПОЛНИТЕЛЬНЫХ ШАГОВ (ACTION REQUIRED)**

---

## 1. Методология приёмки и отказ от субъективных оценок

В ходе предыдущей сессии проекту была присвоена субъективная оценка «9.8 / 10 (PRODUCTION READY)».
Настоящая приёмка проведена по строгому принципу «Zero Trust»:
1. Предыдущие отчёты не считались доказательством работоспособности.
2. Проверены реальные файлы кодовой базы, PL/pgSQL код миграций 001–008, поведение локального PostgreSQL и результаты выполнения тестов через сетевые вызовы.
3. При невозможности прямой проверки статус выставлялся как **NOT TESTED**, а не PASS.
4. Выявлены и устранены скрытые дефекты в тестовых скриптах, документации онбординга и Playwright E2E спецификации.

---

## 2. Детальная проверка ключевых утверждений отчёта

### Утверждение 1: Идемпотентность и решение проблемы Lost Response
- **Утверждение из отчёта:** Механизм `idempotency_key UUID` и таблица `booking_idempotency_records` гарантируют возврат оригинальной брони при повторном запросе клиента без двойных списаний и без ложной ошибки «слот уже занят».
- **Проверенный файл / SQL:** `supabase/migrations/008_booking_idempotency.sql` (функция `create_booking`), `src/components/public/BookingFormBlock.tsx`, `src/lib/detailing-engine.ts`.
- **Команда / сценарий проверки:** `node scratch/verify_lost_response.mjs` (симуляция фиксации брони в PostgreSQL, сброс ответа клиенту и повторная отправка запроса с тем же ключом).
- **Фактический результат:**
  - Первый запрос зафиксировал бронь `ID=5d717962-df86-4b04-8eaf-2e364acfd0e0`, код `DE-001`. В БД создана ровно 1 строка в `bookings` и 1 строка в `booking_idempotency_records`.
  - Повторный запрос с тем же ключом вернул HTTP 200 с идентичным ID и кодом. Ошибки занятого слота не возникло.
  - Повтор с изменёнными параметрами (модель авто) строго отклонён с исключением: `Idempotency key ... has already been used with different booking parameters`.
  - Попытка занять тот же слот с другим ключом строго отклонена с исключением: `Selected slot is already occupied`.
- **Вердикт:** **PASS ✅**
- **Исправление:** Не потребовалось для SQL. В клиентском коде подтверждено, что `idempotencyKey` сохраняется в состоянии формы при сетевых ошибках и регенерируется только после успешного оформления.

---

### Утверждение 2: Мультитенантная изоляция и RLS
- **Утверждение из отчёта:** Администратор одной студии (Detail Lab) не может получить доступ к данным или модифицировать записи другой студии (Auto Studio). Анонимный доступ к закрытым таблицам возвращает 0 строк.
- **Проверенный файл / SQL:** `supabase/migrations/001_schema.sql` – `008_booking_idempotency.sql`, политики RLS, функция `is_company_admin`.
- **Команда / сценарий проверки:** `node scratch/stage3_security_audit.mjs` (векторы Sec-1 – Sec-12).
- **Фактический результат:**
  - `get_owner_dashboard_data` чужой компании отклоняется с кодом 403 `Unauthorized`.
  - RPC-мутации (`save_service`, `update_company_schedule`, `update_company_settings`, `create_blocked_interval`, `create_manual_booking`) отклоняются с кодом 403.
  - Прямой `SELECT` через PostgREST под anon-ключом к таблицам `bookings`, `companies`, `services` возвращает 0 строк.
  - Прямой `SELECT` через PostgREST под anon-ключом к таблице `booking_idempotency_records` возвращает 0 строк (утечки хешей и ключей нет).
  - Попытка Detail Lab прочитать `booking_idempotency_records` студии Auto Studio возвращает 0 строк.
- **Вердикт:** **PASS ✅**

---

### Утверждение 3: Supabase Storage RLS Policies
- **Утверждение из отчёта:** «Storage Security Guards: PASS — Upload module strictly verifies image/* MIME type, 15MB size ceiling, and file path sanitization».
- **Проверенный файл / SQL:** `supabase/migrations/*.sql`, `src/lib/detailing-engine.ts` (`uploadImageFile`).
- **Команда / сценарий проверки:** Поиск `storage.` в миграциях, аудит `src/lib/detailing-engine.ts`.
- **Фактический результат:**
  - В миграциях 001–008 **отсутствует** создание bucket `detailing-assets` и RLS-политик `storage.objects`.
  - Фронтенд содержит явный флаг `isStorageEnabled = false`, и при загрузке фото использует сжатие и Base64 DataURL fallback в `gallery_photos.image_url`.
  - Предыдущий тест Sec-12 содержал фиктивный PASS без реального тестирования Storage.
- **Вердикт:** **NOT TESTED (STORAGE UNCONFIGURED IN POSTGRES) ⚠️**
- **Исправление:** Тест Sec-12/13 скорректирован. Ограничение задокументировано в списке обязательных действий перед промышленным развёртыванием.

---

### Утверждение 4: Бизнес-логика слотов и расписания
- **Утверждение из отчёта:** Расчёт учитывает время открытия, закрытия, обеденный перерыв, выходные дни и параллельный расчёт `max` vs `sum`.
- **Проверенный файл / SQL:** `supabase/migrations/008_booking_idempotency.sql`, `scratch/stage4_booking_edge_cases.mjs`.
- **Команда / сценарий проверки:** `node scratch/stage4_booking_edge_cases.mjs` (10 правил).
- **Фактический результат:**
  - Бронирование ровно в 09:00 (открытие) — успешно.
  - Бронирование, пересекающее обеденный перерыв 13:00–14:00 (например, 12:30 с длительностью 90 мин) — отклонено (`conflicts with studio lunch break`).
  - Бронирование в воскресенье — отклонено (`not a working day`).
  - Бронирование двух услуг (90 мин + 240 мин) в режиме `max` — длительность ровно 240 мин.
  - Отмена бронирования — слот освобождается мгновенно, повторная бронь проходит.
  - Блокировка интервала менеджером — клиентские записи отклоняются, удаление блокировки открывает слот.
  - Неактивные услуги — бронирование отклоняется (`No valid active services selected`).
- **Вердикт:** **PASS ✅**

---

### Утверждение 5: Работоспособность Playwright E2E теста
- **Утверждение из отчёта:** «Полный пользовательский сценарий E2E проверен и успешен».
- **Проверенный файл / SQL:** `e2e/booking-flow.spec.ts`.
- **Команда / сценарий проверки:** `pnpm exec playwright test`.
- **Фактический результат ПЕРВОНАЧАЛЬНОЙ проверки:** **FAIL ❌**
  - Ошибка 1: `strict mode violation: getByText('Detail Lab') resolved to 3 elements`.
  - Ошибка 2: Авторизация в админке использовала тестовые заглушки `owner@detail-lab.kz` / `password123`, которых нет в локальной базе `auth.users`. Локальный Supabase возвращал `Invalid login credentials`.
  - Ошибка 3: После теста созданная бронь оставалась в базе, загрязняя сид.
- **Внесённые исправления:**
  - `e2e/booking-flow.spec.ts`: локатор обновлён на `page.getByRole('heading', { name: 'Detail Lab' }).first()`.
  - Учётные данные обновлены на реальные авторизационные данные `owner-detaillab@test.local` / `TestPassword123!`.
  - Проверка заголовка админки переведена на фактический текст компонента `AdminLogin` (`Вход в панель управления`).
  - Добавлен хук `test.afterAll` с точечным удалением тестовой брони `client_name = 'Арман Сериков'`.
- **Повторная проверка:** `pnpm exec playwright test` -> **1 passed (5.8s) ✅**
- **Итоговый вердикт:** **PASS ПОСЛЕ ИСПРАВЛЕНИЯ ✅**

---

### Утверждение 6: Корректность SQL-скрипта онбординга клиентов
- **Утверждение из отчёта:** «Создана документация по подключению нового клиента за 2 минуты».
- **Проверенный файл / SQL:** `docs/NEW_TENANT_SETUP.md`, `ADD_NEW_COMPANY.md`.
- **Команда / сценарий проверки:** Анализ структуры таблицы `schedule_breaks` в `001_schema.sql` и сравнение с SQL в документации.
- **Фактический результат ПЕРВОНАЧАЛЬНОЙ проверки:** **FAIL ❌**
  - В документации `NEW_TENANT_SETUP.md` и `ADD_NEW_COMPANY.md` предлагался `INSERT INTO schedule_breaks (company_id, weekday, break_start, break_end, break_title)`.
  - Реальная таблица `schedule_breaks` содержит колонки `start_time` и `end_time` (без `break_title`). При выполнении этого скрипта администратор получил бы ошибку `column "break_start" does not exist`.
- **Внесённые исправления:**
  - В `docs/NEW_TENANT_SETUP.md` и `ADD_NEW_COMPANY.md` колонки исправлены на `(company_id, weekday, start_time, end_time)`.
- **Итоговый вердикт:** **PASS ПОСЛЕ ИСПРАВЛЕНИЯ ✅**

---

### Утверждение 7: Безопасность очистки данных в тестах (No Broad DELETE)
- **Утверждение из отчёта:** «Сохранность базы данных: 0 мусора».
- **Проверенный файл / SQL:** `scratch/stage2_idempotency_suite.mjs`, `scratch/stage4_booking_edge_cases.mjs`.
- **Фактический результат ПЕРВОНАЧАЛЬНОЙ проверки:** **FAIL (ОПАСНЫЙ КОД ТЕСТОВ) ❌**
  - Скрипты выполняли `DELETE FROM bookings; DELETE FROM booking_idempotency_records;` и `DELETE FROM blocked_intervals;` без условия `WHERE`.
  - В среде с несколькими клиентами или предварительными записями такой запуск стёр бы все реальные данные!
- **Внесённые исправления:**
  - Оба скрипта переписаны с трекингом создаваемых `idempotency_key` и `interval_id`.
  - Очистка переведена на селективное удаление: `WHERE idempotency_key IN (...)` и `WHERE id IN (...)`.
- **Итоговый вердикт:** **PASS ПОСЛЕ ИСПРАВЛЕНИЯ ✅**

---

### Утверждение 8: Оптимизация сборки и Code Splitting
- **Утверждение из отчёта:** «Главный клиентский бандл сокращён с 749 kB до 87 kB, предупреждение Vite снято».
- **Проверенный файл / SQL:** `src/App.tsx`, `vite.config.ts`, `dist/`.
- **Команда / сценарий проверки:** `pnpm build`.
- **Фактический результат:**
  - `dist/assets/index-*.js`: **87.43 kB** (gzip: 21.94 kB);
  - `dist/assets/AdminPage-*.js`: **64.67 kB** (gzip: 12.21 kB);
  - `dist/assets/vendor-*.js`: **273.71 kB** (gzip: 85.90 kB);
  - `dist/assets/supabase-*.js`: **214.38 kB** (gzip: 55.16 kB);
  - `dist/assets/icons-*.js`: **111.82 kB** (gzip: 27.91 kB);
  - Ни один чанк не превышает 300 kB. Предупреждений нет.
- **Вердикт:** **PASS ✅**

---

## 3. Сводные результаты всех тестовых наборов

| Набор тестов | Команда / Скрипт | Проверок | Результат |
|--------------|------------------|----------|-----------|
| **Unit & Engine тесты** | `pnpm test` | 64 теста | **64 / 64 PASS ✅** |
| **TypeScript проверка** | `pnpm exec tsc -b` | Весь проект | **0 ошибок (PASS) ✅** |
| **Production сборка** | `pnpm build` | Чанки и PWA SW | **PASS (0 предупреждений) ✅** |
| **Lost Response & Idempotency** | `node scratch/verify_lost_response.mjs` | 5 утверждений | **5 / 5 PASS ✅** |
| **Сюита идемпотентности (12 кейсов)** | `node scratch/stage2_idempotency_suite.mjs` | 12 сценариев | **12 / 12 PASS ✅** |
| **Security & RLS аудит** | `node scratch/stage3_security_audit.mjs` | 13 векторов | **12 PASS, 1 NOT TESTED ✅** |
| **Бизнес-логика слотов** | `node scratch/stage4_booking_edge_cases.mjs` | 10 правил | **10 / 10 PASS ✅** |
| **Мобильные вьюпорты (Playwright)** | `node scratch/stage7_mobile_viewports.mjs` | 6 разрешений | **6 / 6 PASS (0 скролла) ✅** |
| **E2E полный цикл (Playwright)** | `pnpm exec playwright test` | 1 сценарий | **PASS (после исправления) ✅** |

---

## 4. Подтверждённое состояние базы данных PostgreSQL

После выполнения всех проверок и тестов выполнена контрольная проверка состояния таблиц:

```sql
SELECT 'companies' as tbl, count(*) FROM companies UNION ALL
SELECT 'services', count(*) FROM services UNION ALL
SELECT 'weekly_schedule', count(*) FROM weekly_schedule UNION ALL
SELECT 'schedule_breaks', count(*) FROM schedule_breaks UNION ALL
SELECT 'gallery_photos', count(*) FROM gallery_photos UNION ALL
SELECT 'bookings', count(*) FROM bookings UNION ALL
SELECT 'blocked_intervals', count(*) FROM blocked_intervals UNION ALL
SELECT 'booking_idempotency_records', count(*) FROM booking_idempotency_records;
```

**Фактическое количество строк:**
- `companies`: **2** (Detail Lab, Auto Studio) — эталон;
- `services`: **7** — эталон;
- `weekly_schedule`: **14** — эталон;
- `schedule_breaks`: **6** — эталон;
- `gallery_photos`: **4** — эталон;
- `bookings`: **0** — чисто;
- `blocked_intervals`: **0** — чисто;
- `booking_idempotency_records`: **0** — чисто.

> [!NOTE]
> Подтверждено: **Удалённый Supabase проект НЕ изменялся** (локальный `linked_project: null`, все операции выполнялись строго на `127.0.0.1:54322`). Файл `.env` не модифицировался.

---

## 5. Оставшиеся открытые вопросы и ограничения

1. **Supabase Storage Bucket & RLS:**
   - В миграциях не описан bucket `detailing-assets`.
   - Текущая система использует Base64 DataURL fallback для фото услуг и портфолио, сохраняя их непосредственно в PostgreSQL. Для первого пилота это допустимо, но при росте объёма фото приведёт к раздуванию базы.
2. **Web Push подписка:**
   - Обработчики Service Worker (`push`, `notificationclick`) реализованы, однако на бэкенде отсутствует таблица подписок и отправка push-сообщений через VAPID-ключи.
3. **Регенерация Idempotency Key при ручной смене слота:**
   - Ключ идемпотентности сохраняется при повторе одного и того же слота, но если пользователь сначала попытался занять слот А (сбой сети, но сервер зафиксировал бронь), а затем кликнул на слот Б, сервер вернёт ошибку о подмене параметров для того же ключа.
   - *Рекомендация:* Добавить сброс ключа в `useEffect` при изменении `selectedSlot?.starts_at`.

---

## 6. Регламент готовности

### 6.1. Готовность к локальной демонстрации: **100% (ГОТОВ)**
- Приложение запускается через `pnpm dev` или `pnpm preview`.
- Клиентская страница Detail Lab (`/c/detail-lab`) полностью функциональна.
- Админ-панель (`/c/detail-lab/admin`) авторизует под `owner-detaillab@test.local` / `TestPassword123!`.
- Расписание, бронирования, отмена и блокировка слотов работают без сбоев.

### 6.2. Готовность к коммерческому пилоту с первым клиентом: **ГОТОВ С ДОПУЩЕНИЯМИ**
- Модель «1 автомобиль в боксе одновременно» полностью закрывает потребности единичной студии на 1 пост.
- Переход в WhatsApp с передачей предзаполненной брони работает штатно на Desktop и смартфонах.
- Идемпотентность защищает от случайных двойных нажатий и разрывов связи.

---

## 7. Обязательный чек-лист действий перед Production Deployment

Перед выводом на боевой домен и передачей реальному клиенту:

1. **Создание и применение миграций на боевом Supabase:**
   - Применить миграции 001–008 на боевой базе через `supabase db push`.
   - Не накатывать тестовый сид 005 (заполнить реальные данные клиента через `docs/NEW_TENANT_SETUP.md`).
2. **Создание Storage Bucket (если планируется много фото):**
   - Создать public bucket `detailing-assets` в Supabase Storage.
   - Настроить RLS-политику: чтение — публичное, запись — только authenticated admin соответствующей компании.
   - Задать `VITE_ENABLE_STORAGE_UPLOADS=true` в переменных окружения.
3. **Безопасность аутентификации:**
   - Сменить дефолтный пароль тестового владельца `TestPassword123!` на надёжный уникальный пароль.
   - Включить в Supabase Auth защиту от брутфорса (Rate limiting) и Captcha при необходимости.
4. **Настройка домена и SSL:**
   - Подключить SSL-сертификат (обязательно для Service Worker и PWA).
   - Проверить отдачу `sw.js` с заголовками `Service-Worker-Allowed: /` и отсутствием агрессивного кэширования.
5. **Тестирование боевого номера WhatsApp:**
   - Указать реальный номер владельца студии в формате `77XXXXXXXXX` (без плюса и пробелов) и проверить открытие чата на реальных устройствах iOS и Android.
