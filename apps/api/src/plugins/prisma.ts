/**
 * Prisma plugin —— 含自動稽核的 Client Extension。
 *
 * 所有 create / update / delete 自動寫入 AuditLog。
 * 敏感欄位（加密的 Bytes 欄位）只記錄欄位名稱，不記錄值 ——
 * 若把個資明文寫進稽核表，就等於自己開了一個沒有加密的副本。
 */

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { config } from '../config.js';
import { getAuditContext } from './audit-context.js';

/** 不得寫入稽核 changes 的欄位（加密個資與密碼） */
const SENSITIVE_FIELDS = new Set([
  'nationalIdEnc',
  'addressEnc',
  'medicalNotesEnc',
  'careNotesEnc',
  'passwordHash',
  'tokenHash',
]);

/** 不需要稽核的模型（稽核表本身、以及高頻但無個資意義的表） */
const SKIP_AUDIT_MODELS = new Set(['AuditLog', 'Session']);

function sanitizeChanges(data: unknown): Record<string, unknown> | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key)) {
      // 只記錄「這個敏感欄位被改過」，不記錄內容
      out[key] = '[REDACTED]';
    } else if (value instanceof Uint8Array) {
      out[key] = '[BINARY]';
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (typeof value === 'object' && value !== null) {
      // 巢狀 write（connect / create 等）僅記錄鍵名，避免無限展開
      out[key] = '[NESTED]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

const ACTION_BY_OPERATION: Record<string, 'CREATE' | 'UPDATE' | 'DELETE'> = {
  create: 'CREATE',
  createMany: 'CREATE',
  update: 'UPDATE',
  updateMany: 'UPDATE',
  upsert: 'UPDATE',
  delete: 'DELETE',
  deleteMany: 'DELETE',
};

export function createPrismaClient(databaseUrl = config.DATABASE_URL): PrismaClient {
  // Prisma 7 採 driver adapter 模式，連線字串在執行期傳入而非寫在 schema
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  return base.$extends({
    name: 'audit-log',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args as never);

          const action = ACTION_BY_OPERATION[operation];
          if (!action || !model || SKIP_AUDIT_MODELS.has(model)) return result;

          const ctx = getAuditContext();
          // 沒有上下文表示是 seed 或維運腳本，不強制寫稽核
          if (!ctx) return result;

          const entityId =
            result && typeof result === 'object' && 'id' in result
              ? String((result as { id: unknown }).id)
              : null;

          const payload = (args as { data?: unknown })?.data;

          try {
            await base.auditLog.create({
              data: {
                orgId: ctx.orgId,
                actorUserId: ctx.userId,
                actorRole: ctx.userRole,
                action,
                entityType: model,
                entityId,
                changes: (sanitizeChanges(payload) ?? undefined) as never,
                ipAddress: ctx.ipAddress,
                userAgent: ctx.userAgent,
                requestId: ctx.requestId,
              },
            });
          } catch {
            // 稽核寫入失敗不應讓業務操作失敗，但必須留下痕跡供維運排查。
            // 這裡刻意不 rethrow —— 讓督導因為稽核表滿了而無法排班是更糟的結果。
            // 正式環境應搭配稽核寫入失敗的告警。
          }

          return result;
        },
      },
    },
  }) as unknown as PrismaClient;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export default fp(async function prismaPlugin(app: FastifyInstance) {
  const prisma = createPrismaClient();
  await prisma.$connect();

  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
