/**
 * 稽核紀錄查詢。
 *
 * AuditLog 在 migration 中已 REVOKE UPDATE/DELETE —— 應用程式帳號只能 INSERT 與 SELECT，
 * 即使應用層被攻破也無法抹除軌跡。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const auditRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/audit/logs',
    {
      preHandler: [app.requirePermission('audit:read')],
      schema: {
        tags: ['audit'],
        summary: '稽核紀錄查詢',
        querystring: z.object({
          actorUserId: z.string().optional(),
          entityType: z.string().optional(),
          entityId: z.string().optional(),
          subjectRecipientId: z.string().optional(),
          action: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(50),
        }),
      },
    },
    async (req) => {
      const { page, pageSize } = req.query;
      const where = {
        orgId: req.user!.orgId,
        ...(req.query.actorUserId ? { actorUserId: req.query.actorUserId } : {}),
        ...(req.query.entityType ? { entityType: req.query.entityType } : {}),
        ...(req.query.entityId ? { entityId: req.query.entityId } : {}),
        ...(req.query.subjectRecipientId
          ? { subjectRecipientId: req.query.subjectRecipientId }
          : {}),
        ...(req.query.action ? { action: req.query.action as never } : {}),
        ...(req.query.from || req.query.to
          ? {
              createdAt: {
                ...(req.query.from ? { gte: new Date(req.query.from) } : {}),
                ...(req.query.to ? { lte: new Date(req.query.to) } : {}),
              },
            }
          : {}),
      };

      const [total, rows] = await Promise.all([
        app.prisma.auditLog.count({ where }),
        app.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      // BigInt 無法直接 JSON 序列化
      return {
        data: rows.map((r) => ({ ...r, id: String(r.id) })),
        meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    },
  );
};
