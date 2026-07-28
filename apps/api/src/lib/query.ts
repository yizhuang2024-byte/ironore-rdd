/**
 * 查詢字串的共用 zod 片段。
 */

import { z } from 'zod';

/**
 * 布林查詢參數。
 *
 * 不可用 `z.coerce.boolean()` —— 它等同 `Boolean(value)`，而查詢字串的值恆為
 * 字串，`"false"` 是非空字串故會被判成 `true`。結果是參數只能開不能關，
 * 呼叫端寫 `?activeOnly=false` 反而得到 `activeOnly=true`。
 */
export const boolQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'));
