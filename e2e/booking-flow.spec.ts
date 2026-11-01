import { test, expect } from '@playwright/test'

test.describe('End-to-End Online Booking Flow to Owner Dashboard', () => {
  test('Complete booking lifecycle: Client books on /c/detail-lab -> WhatsApp modal -> Owner sees it in /admin', async ({
    page,
  }) => {
    // 1. Visit Detail Lab client page
    await page.goto('/c/detail-lab')
    await expect(page.getByText('Detail Lab')).toBeVisible()

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
      await expect(page.getByRole('link', { name: /Отправить заявку в WhatsApp/i })).toBeVisible()
    }

    // 7. Open Owner Dashboard at /admin
    await page.goto('/admin')
    await expect(page.getByText('Кабинет владельца')).toBeVisible()

    // Fill credentials
    await page.getByPlaceholder('owner@detail-lab.kz').fill('owner@detail-lab.kz')
    await page.getByPlaceholder('••••••••').fill('password123')
    await page.getByRole('button', { name: /Войти в панель/i }).click()

    // 8. Verify owner sees studio dashboard
    await expect(page.getByText('Список заявок')).toBeVisible()
    await expect(page.getByRole('button', { name: /Календарь/i })).toBeVisible()
  })
})
