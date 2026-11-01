# Инструкция по резервному копированию и восстановлению данных

Поскольку все детейлинг-центры работают в единой универсальной базе данных PostgreSQL в Supabase, резервное копирование обеспечивает сохранность информации всех клиентов одновременно.

---

## Способ 1. Автоматические бэкапы Supabase (Рекомендуемый)

На платформе Supabase включено автоматическое резервное копирование:
1. Перейдите в **Project Settings** -> **Database** -> **Backups**.
2. В разделе **Daily backups** отображаются ежедневные снимки базы данных.
3. В любой момент можно восстановить состояние базы (Point-in-Time Recovery / Snapshot) одним кликом.

---

## Способ 2. Ручной экспорт через утилиту `pg_dump`

Для создания локальной независимой резервной копии базы данных на вашем компьютере:

1. В панели Supabase перейдите в **Project Settings** -> **Database** -> **Connection string** -> **URI**.
2. Скопируйте строку подключения вида:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
3. Выполните команду в терминале:

```bash
# Экспорт всей структуры и данных в файл backup_detailing_YYYY_MM_DD.sql
pg_dump "postgresql://postgres:[ВАШ_ПАРОЛЬ]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --format=plain \
  --no-owner \
  --no-acl \
  > backup_detailing_$(date +%Y%m%d).sql
```

Или в сжатом бинарном формате:

```bash
pg_dump "postgresql://postgres:[ВАШ_ПАРОЛЬ]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --format=custom \
  --file=backup_detailing.dump
```

---

## Способ 3. Экспорт отдельных таблиц в CSV (через интерфейс Supabase)

Если требуется выгрузить историю записей или список услуг конкретной компании:
1. Перейдите в **Table Editor** -> выберите таблицу (например, `bookings`).
2. В правом верхнем углу нажмите кнопку **«Export»** -> **«Export to CSV»**.
3. Файл сохранится с полным снимком заказов, контактами клиентов и датами.

---

## Восстановление базы данных из резервной копии

Для восстановления из файла дампа:

```bash
psql "postgresql://postgres:[ВАШ_ПАРОЛЬ]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  < backup_detailing_20261031.sql
```
