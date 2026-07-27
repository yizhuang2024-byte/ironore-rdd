import { expect, test } from '@playwright/test';
import { ADMIN_STATE, SUPERVISOR_STATE } from './state-paths.js';

// 使用 setup 階段保存的工作階段，避免每個測試重新登入而撞上登入節流
test.use({ storageState: ADMIN_STATE });

test.describe('管理端', () => {
  test('登入後可見儀表板統計', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '儀表板', exact: true })).toBeVisible();
    // 四張統計卡
    await expect(page.locator('.card p.text-2xl')).toHaveCount(4);
  });

  test('★ 排班畫面在大量班次下仍只渲染可視區的列', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page.getByRole('heading', { name: '排班', exact: true })).toBeVisible();

    // 等時間軸的列真的渲染出來
    const rows = page.locator('.absolute.right-0.left-0.flex');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });

    // 虛擬捲動：即使資料有數百列，DOM 也應遠少於此
    const domRows = await rows.count();
    expect(domRows).toBeGreaterThan(0);
    expect(domRows).toBeLessThan(40);
  });

  test('★ 指派已有班次的照服員會被 R01 擋下且不可覆寫', async ({ page }) => {
    await page.goto('/schedule');

    const card = page.locator('aside button').first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();

    await expect(page.getByText(/指派照服員 —/)).toBeVisible();
    // 候選人清單需跑完整規則集，等它出現而非猜時間
    const candidates = page.locator('ul li button');
    await expect(candidates.first()).toBeVisible({ timeout: 30_000 });

    const blocked = candidates.filter({ hasText: '🔴' }).first();
    test.skip((await blocked.count()) === 0, '此時段所有候選人皆無衝突');

    await blocked.click();
    await expect(page.getByText(/將觸發以下檢核/)).toBeVisible();
    await expect(page.getByText('不可覆寫').first()).toBeVisible();
    await expect(page.getByText(/無法排入/)).toBeVisible();
    // 不可覆寫時不得出現覆寫按鈕
    await expect(page.getByRole('button', { name: '督導覆寫並指派' })).toHaveCount(0);
  });

  test('★ 個案列表一律遮罩顯示', async ({ page }) => {
    await page.goto('/recipients');
    await expect(page.getByRole('heading', { name: '個案', exact: true })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });

    const firstName = await page.locator('tbody tr td').nth(1).textContent();
    expect(firstName).toMatch(/○/);

    // 身分證欄應為遮罩格式
    const nid = await page.locator('tbody tr td').nth(2).textContent();
    expect(nid).toMatch(/\*{3,}/);
  });

  test('★ 解密個資後稽核紀錄立即可查', async ({ page }) => {
    await page.goto('/recipients');
    await expect(page.locator('tbody tr td a').first()).toBeVisible({ timeout: 30_000 });
    await page.locator('tbody tr td a').first().click();

    await page.getByRole('button', { name: '顯示完整資料' }).click();
    await expect(page.getByText(/已顯示個資明文.*稽核紀錄/)).toBeVisible();

    await page.goto('/audit');
    await expect(page.getByRole('heading', { name: '稽核紀錄' })).toBeVisible();
    await page.selectOption('select >> nth=1', 'CareRecipient.PII');
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  });

  test('支付基準畫面顯示範例資料警告', async ({ page }) => {
    await page.goto('/payment-codes');
    await expect(page.getByText(/不可用於正式申報/)).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('★ 資料範圍隔離', () => {
  test('督導只看得到自己單位的個案', async ({ browser }) => {
    const readTotal = async (state: string) => {
      const ctx = await browser.newContext({ storageState: state });
      const page = await ctx.newPage();
      await page.goto('/recipients');
      await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
      const text = await page.locator('text=/共 \\d+ 位/').textContent();
      await ctx.close();
      return Number(text?.match(/\d+/)?.[0] ?? 0);
    };

    const adminTotal = await readTotal(ADMIN_STATE);
    const supTotal = await readTotal(SUPERVISOR_STATE);

    expect(supTotal).toBeGreaterThan(0);
    expect(supTotal).toBeLessThan(adminTotal);
  });
});
