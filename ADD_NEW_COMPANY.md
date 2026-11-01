# Инструкция по добавлению нового детейлинг-центра

Главное преимущество архитектуры: **подключение нового клиента выполняется без изменения кода приложения и без повторного развёртывания на Netlify!**

Все настройки, услуги, фотографии и график подгружаются динамически из общей базы данных Supabase.

---

## Пошаговый алгоритм подключения (за 2 минуты)

### Шаг 1. Создать учётную запись владельца в Supabase Auth

1. В панели Supabase перейдите в **Authentication** -> **Users**.
2. Нажмите **«Add user»** -> **«Create user»**.
3. Введите:
   - **Email**: email владельца студии (например, `owner@black-star-detailing.kz`)
   - **Password**: временный пароль для входа (например, `StudioPass2026!`)
   - Поставьте галочку **«Auto Confirm User»** (чтобы вход работал сразу без ожидания письма).
4. Скопируйте сгенерированный **User UID** (например, `9f8e7d6c-5b4a-3210-fedc-ba9876543210`).

---

### Шаг 2. Выполнить SQL-запрос на создание компании

Откройте **SQL Editor** в Supabase и выполните следующий готовый шаблон, подставив скопированный `User UID` и данные студии:

```sql
DO $$
DECLARE
    v_company_id uuid := gen_random_uuid();
    v_owner_user_id uuid := 'ВСТАВЬТЕ_USER_UID_СЮДА'::uuid;
BEGIN
    -- 1. Создание профиля компании
    INSERT INTO companies (
        id,
        slug,
        name,
        description,
        address,
        whatsapp_number,
        timezone,
        design_settings,
        active
    )
    VALUES (
        v_company_id,
        'black-star', -- Уникальный slug для ссылки /c/black-star
        'Black Star Detailing',
        'Профессиональный детейлинг автомобилей премиум-класса. Защитные плёнки, полировка и керамика.',
        'г. Алматы, ул. Достык, 180',
        '77079998877', -- Номер WhatsApp без знака плюс
        'Asia/Almaty',
        '{
            "theme_preset": "dark_studio",
            "primary_color": "#D4AF37",
            "accent_color": "#F59E0B",
            "background_color": "#09090B",
            "text_color": "#F4F4F6",
            "border_radius": "16px",
            "hero_image": "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1600&q=85"
        }'::jsonb,
        true
    );

    -- 2. Привязка владельца к студии
    INSERT INTO company_admins (company_id, user_id, role)
    VALUES (v_company_id, v_owner_user_id, 'owner');

    -- 3. Базовые услуги студии
    INSERT INTO services (company_id, name, description, price_from, duration_minutes, active, sort_order)
    VALUES
        (v_company_id, 'Детейлинг-мойка', 'Трехфазная деликатная мойка кузова и чистка дисков', 10000, 90, true, 1),
        (v_company_id, 'Химчистка салона', 'Глубокая химчистка всех поверхностей с озонацией', 40000, 300, true, 2),
        (v_company_id, 'Восстановительная полировка', 'Удаление царапин и финишный глянец', 55000, 240, true, 3),
        (v_company_id, 'Керамическое покрытие 9H', 'Два слоя нанокерамики с гарантией 2 года', 70000, 180, true, 4);

    -- 4. График работы: Пн–Сб с 09:00 до 19:00, Вс выходной
    INSERT INTO weekly_schedule (company_id, weekday, is_working, opening_time, closing_time)
    VALUES
        (v_company_id, 0, false, '09:00', '19:00'), -- Воскресенье
        (v_company_id, 1, true,  '09:00', '19:00'), -- Понедельник
        (v_company_id, 2, true,  '09:00', '19:00'), -- Вторник
        (v_company_id, 3, true,  '09:00', '19:00'), -- Среда
        (v_company_id, 4, true,  '09:00', '19:00'), -- Четверг
        (v_company_id, 5, true,  '09:00', '19:00'), -- Пятница
        (v_company_id, 6, true,  '09:00', '19:00'); -- Суббота

    -- 5. Обеденный перерыв (13:00 – 14:00)
    INSERT INTO schedule_breaks (company_id, weekday, start_time, end_time)
    VALUES
        (v_company_id, 1, '13:00', '14:00'),
        (v_company_id, 2, '13:00', '14:00'),
        (v_company_id, 3, '13:00', '14:00'),
        (v_company_id, 4, '13:00', '14:00'),
        (v_company_id, 5, '13:00', '14:00'),
        (v_company_id, 6, '13:00', '14:00');
END $$;
```

---

## Шаг 3. Передача доступа клиенту

Сразу после выполнения запроса:
1. **Публичная страница студии** мгновенно доступна по адресу:
   ```
   https://ваш-проект.netlify.app/c/black-star
   ```
2. **Панель управления владельца** доступна по адресу:
   ```
   https://ваш-проект.netlify.app/admin
   ```
   Владелец входит под своим логином и паролем, видит только свою студию и может самостоятельно редактировать услуги, цены, фотографии и расписание.
