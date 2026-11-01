# Резервное копирование и аварийное восстановление (BACKUP_AND_RECOVERY.md)

В данном документе регламентированы процедуры резервного копирования (Backup) и аварийного восстановления (Disaster Recovery) для промышленной эксплуатации базы данных Supabase / PostgreSQL.

---

## 1. Стратегия резервного копирования

### 1.1. Автоматические бэкапы Supabase Cloud
- **Supabase Free Tier (Бесплатный тариф)**:
  - ⚠️ **Внимание:** Автоматические бэкапы и Point-In-Time Recovery (PITR) на бесплатном тарифе Supabase **не поддерживаются**.
  - Проекты на Free Tier приостанавливаются при отсутствии активности в течение недели.
  - Для пилотного запуска на бесплатном тарифе **обязателен** регулярный ручной дамп схемы и данных через `pg_dump` или Supabase CLI по расписанию (cron).
- **Supabase Pro / Team / Enterprise**:
  - Ежедневные полные бэкапы с хранением от 7 до 30 дней.
  - Опциональная поддержка Point-In-Time Recovery (PITR) с гранулярностью восстановления до секунд (WAL-логирование).
- **Локальное / Self-Hosted окружение**:
  - Регулярные дампы схемы и данных через `pg_dump` или Supabase CLI.

### 1.2. Регулярный логический дамп (Команды CLI)

#### Дамп всей схемы и данных:
```bash
# Создание полного дампа базы данных (структура + данные)
pnpm dlx supabase db dump --local -f backups/backup_full_$(date +%Y%m%d_%H%M%S).sql

# Дамп только структуры данных (схемы)
pnpm dlx supabase db dump --local --schema-only -f backups/schema_only_$(date +%Y%m%d).sql

# Дамп только пользовательских данных (data only)
pnpm dlx supabase db dump --local --data-only -f backups/data_only_$(date +%Y%m%d).sql
```

#### Экспорт конкретных критических таблиц:
```bash
# Дамп таблиц компаний, графика и бронирований
pg_dump -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -t companies \
  -t weekly_schedule \
  -t schedule_breaks \
  -t services \
  -t bookings \
  -t booking_idempotency_records \
  -f backups/critical_tables_backup.sql
```

---

## 2. Процедура восстановления (Disaster Recovery)

### Сценарий А. Восстановление из дампа на чистую базу
Если база данных была повреждена или требуется миграция на новый инстанс:

1. Разверните чистый инстанс PostgreSQL / Supabase.
2. Примените миграции 001–008:
   ```bash
   pnpm dlx supabase db push
   ```
3. Восстановите пользовательские данные из дампа:
   ```bash
   psql -h <HOST> -p <PORT> -U postgres -d postgres -f backups/data_only_YYYYMMDD.sql
   ```

### Сценарий Б. Сброс и восстановление локальной среды разработки
```bash
# Полный сброс локальной базы данных Supabase и перенакатывание всех миграций
pnpm dlx supabase db reset

# Проверка статуса миграций
pnpm dlx supabase migration list --local
```

---

## 3. Мониторинг целостности данных

Периодически выполняйте проверку целостности данных:

```sql
-- 1. Проверка бронирований с отсутствующими компаниями (должно быть 0)
SELECT count(*) FROM bookings b LEFT JOIN companies c ON b.company_id = c.id WHERE c.id IS NULL;

-- 2. Проверка бронирований с пустым снимком услуг (должно быть 0)
SELECT count(*) FROM bookings WHERE services_snapshot IS NULL OR jsonb_array_length(services_snapshot) = 0;

-- 3. Проверка записей идемпотентности, ссылающихся на несуществующую бронь (должно быть 0)
SELECT count(*) FROM booking_idempotency_records r 
LEFT JOIN bookings b ON r.booking_id = b.id 
WHERE r.booking_id IS NOT NULL AND b.id IS NULL;
```

---

## 4. Регламент действий при сбое
1. Зафиксировать инцидент и время начала сбоя.
2. При падении фронтенда: переключить DNS/CDN на резервный хостинг (Vercel / Cloudflare).
3. При сбое базы данных:
   - Проверить статус инстанса в Supabase Dashboard;
   - При аппаратном сбое: восстановить последний PITR-снапшот;
   - Запустить скрипт проверки целостности таблиц;
   - Уведомить владельцев детейлинг-центров о восстановлении нормальной работы.
