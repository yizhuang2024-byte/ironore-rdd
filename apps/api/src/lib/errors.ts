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
    const target = meta?.['target'];
    return new AppError(409, 'DUPLICATE', `資料重複：${JSON.stringify(target ?? '未知欄位')}`);
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
