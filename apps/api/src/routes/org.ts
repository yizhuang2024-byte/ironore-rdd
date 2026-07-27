/**
 * 機構設定與服務單位。
 *
 * OrgPolicy 承載所有勞基法門檻與路程估算參數 —— 這些是機構政策設定，
 * 不是系統認定的法律見解。詳見 docs/03-conflict-rules.md。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { NotFoundError } from '../lib/errors.js';

export const orgRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/org',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['org'], summary: '機構資訊與政策參數' },
    },
    async (req) => {
      const org = await app.prisma.organization.findUnique({
        where: { id: req.user!.orgId },
        include: { policy: true, units: { orderBy: { name: 'asc' } } },
      });
      if (!org) throw new NotFoundError('機構');
      return { data: org };
    },
  );

  app.patch(
    '/org/policy',
    {
      preHandler: [app.requirePermission('org:write')],
      schema: {
        tags: ['org'],
        summary: '更新機構政策參數',
        description:
          '⚠️ 工時相關參數的預設值需由機構人資／法務書面確認。尤其 idleGapCountsAsWorkThresholdMinutes 涉及居服員趟間空檔是否為工時的長年爭議，系統對此不表示法律見解。',
        body: z.object({
          normalDailyMinutes: z.number().int().optional(),
          maxDailyMinutes: z.number().int().optional(),
          normalWeeklyMinutes: z.number().int().optional(),
          monthlyOtMode: z.enum(['STANDARD_46', 'FLEX_54_138']).optional(),
          monthlyOtMinutes: z.number().int().optional(),
          restBreakAfterMinutes: z.number().int().optional(),
          restBreakMinutes: z.number().int().optional(),
          minShiftGapMinutes: z.number().int().optional(),
          enforceSevenDayRest: z.boolean().optional(),
          idleGapCountsAsWorkThresholdMinutes: z.number().int().min(0).optional(),
          detourFactor: z.number().optional(),
          speedKmhUrbanCore: z.number().optional(),
          speedKmhUrban: z.number().optional(),
          speedKmhSuburban: z.number().optional(),
          parkingBufferMinutes: z.number().int().optional(),
          sameDistrictMinutes: z.number().int().optional(),
          adjacentDistrictMinutes: z.number().int().optional(),
          farDistrictMinutes: z.number().int().optional(),
          roundingMode: z.enum(['HALF_UP', 'FLOOR', 'CEIL']).optional(),
        }),
      },
    },
    async (req) => {
      const updated = await app.prisma.orgPolicy.update({
        where: { orgId: req.user!.orgId },
        data: req.body,
      });
      return { data: updated };
    },
  );

  app.get(
    '/units',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['org'], summary: '服務單位清單' },
    },
    async (req) => ({
      data: await app.prisma.serviceUnit.findMany({
        where: { orgId: req.user!.orgId },
        orderBy: { name: 'asc' },
      }),
    }),
  );

  app.get(
    '/users',
    {
      preHandler: [app.requirePermission('user:read')],
      schema: {
        tags: ['org'],
        summary: '使用者清單',
        querystring: z.object({
          role: z.string().optional(),
          q: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const users = await app.prisma.user.findMany({
        where: {
          orgId: req.user!.orgId,
          ...(req.query.role ? { roles: { some: { role: req.query.role as never } } } : {}),
          ...(req.query.q
            ? {
                OR: [
                  { account: { contains: req.query.q, mode: 'insensitive' as const } },
                  { displayName: { contains: req.query.q } },
                ],
              }
            : {}),
        },
        orderBy: { account: 'asc' },
        select: {
          id: true, account: true, displayName: true, status: true,
          lastLoginAt: true, lockedUntil: true,
          roles: { select: { role: true, unitId: true } },
        },
        take: 500,
      });
      return { data: users };
    },
  );
};
