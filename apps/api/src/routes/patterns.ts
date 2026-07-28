/**
 * 排班樣板維護。
 *
 * 樣板只是 ServiceVisit 的產生器，不是真相來源 —— 修改樣板不會動到
 * 已產生的班次。要讓變更生效需再跑一次 /schedules/generate，
 * 而 generate 是冪等的，只會補上缺少的日期。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { toTaipeiDate } from '@ltc/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { boolQuery } from '../lib/query.js';
import { unitScope } from '../lib/rbac.js';
import { resolveScheduleId } from '../lib/payment-resolve.js';

const patternBody = z.object({
  recipientId: z.string(),
  attendantId: z.string().nullable().optional(),
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(5).max(720),
  itemCodes: z.array(z.string().min(1)).min(1),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
});

export const patternRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/schedules/patterns',
    {
      preHandler: [app.requirePermission('schedule:read')],
      schema: {
        tags: ['schedule'],
        summary: '排班樣板清單',
        querystring: z.object({
          recipientId: z.string().optional(),
          attendantId: z.string().optional(),
          unitId: z.string().optional(),
          activeOnly: boolQuery.default(true),
        }),
      },
    },
    async (req) => {
      const scope = unitScope(req.user!);
      const rows = await app.prisma.recurringPattern.findMany({
        where: {
          recipient: {
            orgId: req.user!.orgId,
            ...(scope ? { primaryUnitId: scope } : {}),
            ...(req.query.unitId ? { primaryUnitId: req.query.unitId } : {}),
          },
          ...(req.query.recipientId ? { recipientId: req.query.recipientId } : {}),
          ...(req.query.attendantId ? { attendantId: req.query.attendantId } : {}),
          ...(req.query.activeOnly ? { isActive: true } : {}),
        },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        take: 500,
        include: {
          recipient: {
            select: { id: true, caseNo: true, name: true, districtCode: true },
          },
        },
      });

      // 樣板可指定固定照服員，但該欄位無關聯，需另外撈名稱
      const attendantIds = [...new Set(rows.map((r) => r.attendantId).filter((x): x is string => !!x))];
      const attendants = attendantIds.length
        ? await app.prisma.attendant.findMany({
            where: { id: { in: attendantIds } },
            select: { id: true, name: true, employeeNo: true },
          })
        : [];
      const byId = new Map(attendants.map((a) => [a.id, a]));

      return {
        data: rows.map((r) => ({
          id: r.id,
          recipientId: r.recipientId,
          recipient: {
            id: r.recipient.id,
            caseNo: r.recipient.caseNo,
            nameMasked: maskName(r.recipient.name),
            districtCode: r.recipient.districtCode,
          },
          attendantId: r.attendantId,
          attendant: r.attendantId ? (byId.get(r.attendantId) ?? null) : null,
          weekday: r.weekday,
          startMinute: r.startMinute,
          durationMinutes: r.durationMinutes,
          itemCodes: r.itemCodes,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          isActive: r.isActive,
        })),
      };
    },
  );

  app.post(
    '/schedules/patterns',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '新增排班樣板',
        description: '新增後需執行 /schedules/generate 才會產生實際班次。',
        body: patternBody,
      },
    },
    async (req) => {
      const b = req.body;
      const recipient = await app.prisma.careRecipient.findFirst({
        where: { id: b.recipientId, orgId: req.user!.orgId },
      });
      if (!recipient) throw new NotFoundError('個案');

      await assertCodesApproved(b.recipientId, b.itemCodes, b.effectiveFrom);

      const created = await app.prisma.recurringPattern.create({
        data: {
          recipientId: b.recipientId,
          attendantId: b.attendantId ?? null,
          weekday: b.weekday,
          startMinute: b.startMinute,
          durationMinutes: b.durationMinutes,
          itemCodes: b.itemCodes,
          effectiveFrom: new Date(b.effectiveFrom),
          effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null,
          isActive: true,
        },
      });
      return { data: created };
    },
  );

  app.patch(
    '/schedules/patterns/:id',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '修改排班樣板（不影響已產生的班次）',
        params: z.object({ id: z.string() }),
        body: patternBody.partial().omit({ recipientId: true }),
      },
    },
    async (req) => {
      const existing = await app.prisma.recurringPattern.findFirst({
        where: { id: req.params.id, recipient: { orgId: req.user!.orgId } },
      });
      if (!existing) throw new NotFoundError('排班樣板');

      const b = req.body;
      if (b.itemCodes) {
        await assertCodesApproved(
          existing.recipientId,
          b.itemCodes,
          b.effectiveFrom ?? toTaipeiDate(existing.effectiveFrom),
        );
      }

      const updated = await app.prisma.recurringPattern.update({
        where: { id: existing.id },
        data: {
          ...(b.attendantId !== undefined ? { attendantId: b.attendantId } : {}),
          ...(b.weekday !== undefined ? { weekday: b.weekday } : {}),
          ...(b.startMinute !== undefined ? { startMinute: b.startMinute } : {}),
          ...(b.durationMinutes !== undefined ? { durationMinutes: b.durationMinutes } : {}),
          ...(b.itemCodes !== undefined ? { itemCodes: b.itemCodes } : {}),
          ...(b.effectiveFrom !== undefined ? { effectiveFrom: new Date(b.effectiveFrom) } : {}),
          ...(b.effectiveTo !== undefined
            ? { effectiveTo: b.effectiveTo ? new Date(b.effectiveTo) : null }
            : {}),
        },
      });
      return { data: updated };
    },
  );

  app.delete(
    '/schedules/patterns/:id',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '停用排班樣板',
        description: '停用而非刪除 —— 已產生的班次仍保留，且需追溯來源。',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const updated = await app.prisma.recurringPattern.updateMany({
        where: { id: req.params.id, recipient: { orgId: req.user!.orgId } },
        data: { isActive: false },
      });
      if (updated.count === 0) throw new NotFoundError('排班樣板');
      return { data: { ok: true } };
    },
  );

  /**
   * 樣板的支付代碼必須在該個案的照顧計畫核定範圍內，
   * 否則產生出來的班次會全數卡在 R10。與其讓督導稍後才發現，不如在此擋下。
   */
  async function assertCodesApproved(recipientId: string, codes: string[], onDate: string) {
    const date = new Date(`${onDate}T00:00:00Z`);
    await resolveScheduleId(app.prisma, date);

    const plan = await app.prisma.carePlan.findFirst({
      where: {
        recipientId,
        status: 'ACTIVE',
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      include: { items: { select: { code: true } } },
    });
    if (!plan) {
      throw new ValidationError(`個案在 ${onDate} 無生效中的照顧計畫，無法建立排班樣板`);
    }
    const approved = new Set(plan.items.map((i) => i.code));
    const missing = codes.filter((c) => !approved.has(c));
    if (missing.length > 0) {
      throw new ValidationError(
        `以下項目未列於照顧計畫核定範圍，依此樣板產生的班次會全數被檢核擋下：${missing.join('、')}`,
      );
    }
  }
};

function maskName(name: string): string {
  const chars = [...name];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}○`;
  return `${chars[0]}${'○'.repeat(chars.length - 2)}${chars.at(-1)}`;
}
