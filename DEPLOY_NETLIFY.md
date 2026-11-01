# Инструкция по развёртыванию на Netlify (Free Tier)

Приложение развёртывается на бесплатном тарифе Netlify Free как Single Page Application (PWA).

---

## 1. Подготовка репозитория

Убедитесь, что все изменения зафиксированы в Git и отправлены в ваш GitHub-репозиторий:

```bash
git add .
git commit -m "feat: complete detailing multi-tenant pwa"
git push origin main
```

---

## 2. Подключение проекта в Netlify

1. Зайдите на [netlify.com](https://www.netlify.com) и войдите через GitHub.
2. В панели управления нажмите **«Add new site»** -> **«Import an existing project»**.
3. Выберите провайдера **GitHub** и найдите ваш репозиторий.
4. В настройках сборки (**Build settings**) укажите:
   - **Branch to deploy**: `main`
   - **Base directory**: (оставьте пустым)
   - **Build command**: `pnpm build` (или `npm run build`)
   - **Publish directory**: `dist`
5. Нажмите **«Deploy site»**.

---

## 3. Настройка переменных окружения в Netlify

Для подключения к вашей базе данных Supabase:

1. Перейдите в раздел **Site configuration** -> **Environment variables**.
2. Нажмите **«Add variable»** и добавьте:
   - `VITE_SUPABASE_URL`: URL вашего проекта Supabase (например, `https://abcdefghijklm.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY`: публичный анонимный ключ (`anon` / `public`).
3. Перейдите во вкладку **Deploys** и нажмите **«Trigger deploy»** -> **«Deploy site»**, чтобы применить переменные.

---

## 4. Проверка Single Page App маршрутизации (SPA Rewrites)

В репозитории уже настроен файл `public/_redirects`:
```text
/* /index.html 200
```
При сборке Vite автоматически помещает его в корень директории `dist`. Это гарантирует, что Netlify перенаправляет любые прямые переходы по ссылкам:
- `https://ваш-сайт.netlify.app/c/detail-lab`
- `https://ваш-сайт.netlify.app/c/auto-studio`
- `https://ваш-сайт.netlify.app/admin`

на приложение React без ошибок 404 от веб-сервера.

---

## 5. Проверка установки PWA

После сборки сайт на Netlify работает по защищённому протоколу HTTPS. Откройте страницу студии на смартфоне в Google Chrome (Android) или Safari (iOS):
- Появится предложение добавить приложение на главный экран.
- Приложение запускается в полноэкранном режиме (standalone).
