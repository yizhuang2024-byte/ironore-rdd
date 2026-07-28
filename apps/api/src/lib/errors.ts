/**
 * 應用層錯誤型別與 PostgreSQL 錯誤轉譯。
 */

import type { ConflictFinding } from '@ltc/shared';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(what = '資源') {
    super(404, 'NOT_FOUND', `找不到${what}`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '尚未登入或工作階段已失效') {
    super(401, 'UNAUTHORIZED', message);
  }
}

/** 排班檢核未通過。回傳 422 並附上完整 findings 供前端顯示。 */
export class ConflictCheckError extends AppError {
  constructor(readonly findings: ConflictFinding[]) {
    super(422, 'SCHEDULE_CONFLICT', '排班檢核未通過', { findings });
  }
}

/**
 * PostgreSQL 錯誤碼轉譯。
 *
 * 23P01 = exclusion_violation。這是 ServiceVisit 的 EXCLUDE 約束在
 * 並行寫入時擋下重疊班次的情形 —— 必須轉成人類可讀的訊息，
 * 而不是讓督導撞上一個 500。
 */
/** 唯一鍵欄位的中文名。沒列到的欄位會原樣顯示，總比顯示「未知欄位」有用。 */
const DUPLICATE_FIELD_LABELS: Record<string, string> = {
  caseNo: '機構案號',
  ltcCaseNo: '照管中心個案編號',
  employeeNo: '員工編號',
  account: '帳號',
  nationalIdBidx: '身分證字號',
  taxId: '統一編號',
  code: '支付代碼',
  planNo: '照顧計畫編號',
};

/**
 * 由 P2002 的 meta 取出違反唯一鍵的欄位名。
 *
 * Prisma 7 搭配 driver adapter 時「不會」填 `meta.target`，欄位改放在
 * `meta.driverAdapterError.cause.constraint.fields`，且每個名稱都自帶雙引號。
 * 只讀 `meta.target` 會讓使用者看到「資料重複：未知欄位」這種等於沒講的訊息。
 * 兩種形狀都讀，才不會在升級或換 engine 時又退回無用訊息。
 */
function duplicateFields(meta: Record<string, unknown> | undefined): string[] {
  const adapterCause = (
    meta?.['driverAdapterError'] as { cause?: { constraint?: { fields?: unknown } } } | undefined
  )?.cause;
  const adapterFields = adapterCause?.constraint?.fields;
  if (Array.isArray(adapterFields)) {
    return adapterFields.map((f) => String(f).replace(/"/g, ''));
  }

  const target = meta?.['target'];
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

function duplicateMessage(meta: Record<string, unknown> | undefined): string {
  // orgId 幾乎都是複合唯一鍵的一員，但對使用者毫無意義，講了只會混淆
  const fields = duplicateFields(meta).filter((f) => f !== 'orgId' && f !== 'scheduleId');
  if (fields.length === 0) return '資料重複，已有相同內容的紀錄';

  const labels = fields.map((f) => DUPLICATE_FIELD_LABELS[f] ?? f);
  return `${labels.join('、')}已存在，請改用其他值`;
}

export function translatePgError(err: unknown): AppError | null {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : undefined;

  const meta =
    typeof err === 'object' && err !== null && 'meta' in err
      ? (err as { meta?: Record<string, unknown> }).meta
      : undefined;
  const constraint = meta?.['constraint'] ?? meta?.['constraint_name'];
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';

  const isExclusion =
    code === '23P01' ||
    message.includes('service_visit_attendant_no_overlap') ||
    String(constraint ?? '').includes('service_visit_attendant_no_overlap');

  if (isExclusion) {
    return new AppError(
      409,
      'VISIT_TIME_OVERLAP',
      '該照服員在此時段已有其他班次，請重新整理後確認最新班表',
      {
        hint: '此為資料庫層的排他約束攔截，通常發生在兩位督導同時排入同一位照服員時',
      },
    );
  }

  // Prisma 唯一鍵衝突
  if (code === 'P2002') {
    return new AppError(409, 'DUPLICATE', duplicateMessage(meta));
  }
  // Prisma 找不到記錄
  if (code === 'P2025') {
    return new NotFoundError();
  }
  // 外鍵約束
  if (code === 'P2003') {
    return new AppError(400, 'FOREIGN_KEY', '關聯資料不存在或已被刪除');
  }
  // CHECK 約束
  if (code === '23514') {
    return new AppError(400, 'CHECK_VIOLATION', `資料未通過資料庫檢查約束：${constraint ?? ''}`);
  }

  return null;
}
