/**
 * 工作階段保存路徑。
 *
 * 獨立於測試檔之外 —— Playwright 不允許測試檔互相 import。
 */

export const STATE_DIR = 'e2e/.auth';
export const ADMIN_STATE = `${STATE_DIR}/admin.json`;
export const SUPERVISOR_STATE = `${STATE_DIR}/supervisor.json`;
export const ATTENDANT_STATE = `${STATE_DIR}/attendant.json`;
