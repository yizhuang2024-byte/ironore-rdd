/**
 * 稽核上下文 —— 以 AsyncLocalStorage 傳遞操作者資訊。
 *
 * 若不用 ALS，每個 repository 方法都得多帶一個 actor 參數，
 * 而只要有人忘了傳，那條寫入就不會有稽核軌跡。個資法要求的軌跡不能靠自律。
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuditContext {
  orgId: string;
  userId: string | null;
  userRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

const storage = new AsyncLocalStorage<AuditContext>();

export function runWithAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}
