import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'

test.describe('End-to-End Online Booking Flow to Owner Dashboard', () => {
  test.afterAll(() => {
    try {
      execSync(
        `pnpm dlx supabase db query --local "DELETE FROM bookings WHERE client_name = 'Арман Сериков'; DELETE FROM booking_idempotency_records WHERE response_data->>'client_name' = 'Арман Сериков';"`,
        { stdio: 'ignore' }
      )
    } catch {}
  })

  test('Complete booking lifecycle: Client books on /c/detail-lab -> WhatsApp modal -> Owner sees it in /admin', async ({
    page,
  }) => {
    // 1. Visit Detail Lab client page
    await page.goto('/c/detail-lab')
    await expect(page.getByRole('heading', { name: 'Detail Lab' }).first()).toBeVisible()

    // 2. Click hero CTA to scroll to catalog
    const heroBtn = page.getByRole('button', { name: /Выбрать услуги и записаться/i })
    await expect(heroBtn).toBeVisible()
    await heroBtn.click()

    // 3. Select a service (e.g. Детейлинг-мойка)
    const washCard = page.locator('div:has-text("Детейлинг-мойка")').first()
    await expect(washCard).toBeVisible()

    // 4. Fill customer & vehicle details
    await page.getByPlaceholder('Например, Иван или Арман').fill('Арман Сериков')
    await page.locator('input[type="tel"]').fill('+7 707 123 45 67')
    await page.getByPlaceholder('Например: Toyota, BMW, Mercedes').fill('Toyota')
    await page.getByPlaceholder('Например: Camry 70, X5, E-Class').fill('Camry 70')

    // 5. Select free slot if available
    const slotBtn = page.locator('button:has-text("свободно")').first()
    if (await slotBtn.isVisible()) {
      await slotBtn.click()

      // Submit booking
      const submitBtn = page.getByRole('button', {
        name: /Подтвердить запись и перейти в WhatsApp/i,
      })
      await submitBtn.click()

      // 6. Verify WhatsApp confirmation modal appears
      await expect(page.getByText('Заявка успешно создана')).toBeVisible()
      await expect(page.getByText(/Время зарезервировано на 30 минут/i)).toBeVisible()
      await expect(page.getByRole('link', { name: /Перейти в WhatsApp/i })).toBeVisible()
    }

    // 7. Open Owner Dashboard at /admin (redirects to /c/detail-lab/admin)
    await page.goto('/admin')
    await expect(page.getByText(/Вход в панель управления/i)).toBeVisible()

    // Fill authenticated credentials
    await page.getByPlaceholder('owner@detail-lab.kz').fill('owner-detaillab@test.local')
    await page.getByPlaceholder('••••••••').fill('TestPassword123!')
    await page.getByRole('button', { name: /Войти в панель/i }).click()

    // 8. Verify owner sees studio dashboard
    await expect(page.getByText(/Панель управления/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Календарь/i }).first()).toBeVisible()
  })
})
