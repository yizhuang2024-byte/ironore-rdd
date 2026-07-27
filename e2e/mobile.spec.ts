import { expect, test } from '@playwright/test';

// storageState 由 playwright.config.ts 的 mobile project 指定（照服員身分）

test.describe('照服員行動端', () => {
  test('登入後顯示今日行程', async ({ page }) => {
    await page.goto('/m');
    await expect(page.getByRole('heading', { name: '今日行程' })).toBeVisible();
    await expect(page.locator('nav a[href="/m"]')).toBeVisible();
  });

  test('★ 班次詳情不含身分證字號', async ({ page }) => {
    await page.goto('/m');
    await expect(page.getByRole('heading', { name: '今日行程' })).toBeVisible();

    const card = page.locator('a.card').first();
    test.skip((await card.count()) === 0, '今日無排班');

    await card.click();
    await expect(page.getByText('服務對象')).toBeVisible();

    const body = (await page.locator('body').textContent()) ?? '';
    // 台灣身分證格式：1 個英文字母 + 9 位數字
    expect(body).not.toMatch(/[A-Z]\d{9}/);
  });

  test('班次詳情提供撥號與導航連結', async ({ page }) => {
    await page.goto('/m');
    await expect(page.getByRole('heading', { name: '今日行程' })).toBeVisible();

    const card = page.locator('a.card').first();
    test.skip((await card.count()) === 0, '今日無排班');

    await card.click();
    await expect(page.getByText('服務對象')).toBeVisible();
    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
    await expect(page.locator('a[href^="geo:"]').first()).toBeVisible();
  });

  test('★ 照服員無法進入管理端路由', async ({ page }) => {
    await page.goto('/attendants');
    // 應被導回行動端
    await expect(page).toHaveURL(/\/m$/);
  });

  test('週班表可切換上下週', async ({ page }) => {
    await page.goto('/m/schedule');
    await expect(page.getByRole('button', { name: /下週/ })).toBeVisible();
    await page.getByRole('button', { name: /下週/ }).click();
    await expect(page.getByRole('button', { name: '回到本週' })).toBeVisible();
  });

  test('可提交請假申請', async ({ page }) => {
    await page.goto('/m/leaves');
    await expect(page.getByRole('heading', { name: '請假', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '+ 申請請假' }).click();
    await page.selectOption('select >> nth=0', 'PERSONAL');
    await page.fill('textarea', 'E2E 測試申請');
    await page.getByRole('button', { name: '送出申請' }).click();

    await expect(page.getByText('待審核').first()).toBeVisible({ timeout: 20_000 });
  });

  test('★ 登出會清除班表快取', async ({ page }) => {
    await page.goto('/m/profile');
    await expect(page.getByRole('heading', { name: '我的證照' })).toBeVisible();

    await page.getByRole('button', { name: '登出' }).click();
    await expect(page.locator('#account')).toBeVisible();

    const remaining = await page.evaluate(async () => {
      if (!('caches' in window)) return 0;
      return (await caches.keys()).length;
    });
    expect(remaining).toBe(0);
  });
});
