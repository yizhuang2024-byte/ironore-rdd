/**
 * 規則註冊表 —— R01–R22。
 *
 * 這是所有排班檢核規則的唯一入口。新增規則只需在此註冊。
 * 每條規則的法規出處與爭議說明見各規則檔的註解，以及 docs/03-conflict-rules.md。
 */

import type { ConflictRule } from '../types.js';
import { ATTENDANT_RULES } from './attendant.js';
import { LABOUR_RULES } from './labour.js';
import { RECIPIENT_RULES } from './recipient.js';

export * from './attendant.js';
export * from './labour.js';
export * from './recipient.js';

/** 全部規則 */
export const ALL_RULES: readonly ConflictRule[] = [
  ...ATTENDANT_RULES,
  ...RECIPIENT_RULES,
  ...LABOUR_RULES,
];

/**
 * 輕量規則 —— 前端拖曳過程中只跑這些，避免每次 mouse-move 都跑完整規則集而掉幀。
 * 放開滑鼠時才跑 ALL_RULES。
 */
export const LIGHTWEIGHT_RULES: readonly ConflictRule[] = ALL_RULES.filter((r) => r.lightweight);

/** 規則說明表，供 UI 顯示與文件產生 */
export const RULE_CATALOG: readonly { id: string; titleZh: string; lightweight: boolean }[] =
  ALL_RULES.map((r) => ({ id: r.id, titleZh: r.titleZh, lightweight: r.lightweight }));
