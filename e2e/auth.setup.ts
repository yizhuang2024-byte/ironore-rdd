/**
 * 一次性登入並保存工作階段。
 *
 * 每個測試都重新登入會撞上登入端點的節流（同 IP 10 次/分鐘）——
 * 那是防暴力破解的必要機制，不該為了測試放寬。
 * 改用 Playwright 的 storageState：登入一次、全部測試共用。
 */

import { expect, test as setup, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import {
  ADMIN_STATE,
  ATTENDANT_STATE,
  STATE_DIR,
  SUPERVISOR_STATE,
} from './state-paths.js';

const PASSWORD = 'Demo@1234';

async function authenticate(
  page: Page,
  account: string,
  loginPath: string,
  expectSelector: string,
  statePath: string,
) {
  mkdirSync(STATE_DIR, { recursive: true });
  await page.goto(loginPath);
  await page.fill('#account', account);
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await expect(page.locator(expectSelector)).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: statePath });
}

setup('管理者登入', async ({ page }) => {
  await authenticate(page, 'admin', '/login', 'header', ADMIN_STATE);
});

setup('督導登入', async ({ page }) => {
  await authenticate(page, 'sup01', '/login', 'header', SUPERVISOR_STATE);
});

setup('照服員登入', async ({ page }) => {
  await authenticate(page, 'att0001', '/m/login', 'nav a[href="/m"]', ATTENDANT_STATE);
});
