import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './state-paths.js';

test.use({ storageState: ADMIN_STATE });

// 每次執行用不同案號／員編，避免與前次殘留資料撞唯一鍵
const stamp = Date.now().toString().slice(-8);

test.describe('主檔建檔', () => {
  test('★ 新增個案後列表查得到，且姓名一律遮罩', async ({ page }) => {
    const caseNo = `E2E${stamp}`;

    await page.goto('/recipients');
    await page.getByRole('link', { name: '+ 新增個案' }).click();
    await expect(page.getByRole('heading', { name: '新增個案' })).toBeVisible();

    await page.getByLabel('機構案號').fill(caseNo);
    await page.getByLabel('姓名').fill('測試個案');
    await page.getByLabel('行政區', { exact: false }).selectOption('63000050');
    await page.getByLabel('詳細地址').fill('大安路一段 1 號');
    await page.getByLabel('CMS 失能等級').selectOption('4');
    await page.getByLabel('服務起始日').fill('2026-08-01');

    await page.getByRole('button', { name: '儲存' }).first().click();

    // 存檔後導向詳情頁，姓名應為遮罩
    await expect(page.getByText('測○○案').first()).toBeVisible({ timeout: 30_000 });

    await page.goto(`/recipients?q=${caseNo}`);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('tbody tr').first()).toContainText(caseNo);
    // 明文姓名不得出現在列表回應中
    expect(await page.content()).not.toContain('測試個案');
  });

  test('★ 新增照服員後可在列表以員編找到', async ({ page }) => {
    const employeeNo = `E2E${stamp}`;

    await page.goto('/attendants');
    await page.getByRole('link', { name: '+ 新增照服員' }).click();
    await expect(page.getByRole('heading', { name: '新增照服員' })).toBeVisible();

    await page.getByLabel('員工編號').fill(employeeNo);
    await page.getByLabel('姓名').fill('測試照服員');
    await page.getByLabel('聯絡電話').fill('0912345678');
    await page.getByLabel('到職日').fill('2026-08-01');

    await page.getByRole('button', { name: '儲存' }).first().click();

    await expect(page.getByRole('heading', { name: '測試照服員' })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(`/attendants?q=${employeeNo}`);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('tbody tr').first()).toContainText(employeeNo);
  });

  test('★ 案號重複時顯示錯誤並保留輸入，而非靜默失敗', async ({ page }) => {
    await page.goto('/recipients');
    await expect(page.locator('tbody tr td').first()).toBeVisible({ timeout: 30_000 });
    const existing = (await page.locator('tbody tr td').first().textContent())!.trim();

    await page.getByRole('link', { name: '+ 新增個案' }).click();
    await page.getByLabel('機構案號').fill(existing);
    await page.getByLabel('姓名').fill('重複測試');
    await page.getByLabel('行政區', { exact: false }).selectOption('63000050');
    await page.getByLabel('服務起始日').fill('2026-08-01');
    await page.getByRole('button', { name: '儲存' }).first().click();

    await expect(page.getByText(/機構案號已存在/)).toBeVisible({ timeout: 30_000 });
    // 仍停留在表單頁，使用者輸入不應被丟棄
    await expect(page.getByRole('heading', { name: '新增個案' })).toBeVisible();
    await expect(page.getByLabel('機構案號')).toHaveValue(existing);
  });

  test('排班樣板畫面可進入並提供產生班表入口', async ({ page }) => {
    await page.goto('/schedule/patterns');
    await expect(page.getByRole('heading', { name: '排班樣板' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /產生班表/ })).toBeVisible();
  });

  test('使用者管理畫面可列出帳號', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page.getByRole('heading', { name: '使用者' })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  });
});
