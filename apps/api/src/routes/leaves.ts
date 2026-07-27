/**
 * 請假與代班。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { toTaipeiDate } from '@ltc/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';

export const leaveRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/leaves',
    {
      preHandler: [app.requirePermission('leave:read')],
      schema: {
        tags: ['leave'],
        summary: '請假清單',
        querystring: z.object({
          attendantId: z.string().optional(),
          status: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const rows = await app.prisma.leaveRequest.findMany({
        where: {
          attendant: { orgId: req.user!.orgId },
          ...(req.query.attendantId ? { attendantId: req.query.attendantId } : {}),
          ...(req.query.status ? { status: req.query.status as never } : {}),
          ...(req.query.from ? { endAt: { gte: new Date(req.query.from) } } : {}),
          ...(req.query.to ? { startAt: { lte: new Date(req.query.to) } } : {}),
        },
        orderBy: [{ status: 'asc' }, { startAt: 'asc' }],
        include: { attendant: { select: { id: true, name: true, employeeNo: true } } },
        take: 300,
      });
      return { data: rows };
    },
  );

  app.post(
    '/leaves',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['leave'],
        summary: '申請請假',
        body: z.object({
          attendantId: z.string().optional(),
          leaveType: z.enum([
            'ANNUAL', 'PERSONAL', 'SICK', 'MENSTRUAL', 'OFFICIAL',
            'BEREAVEMENT', 'MARRIAGE', 'MATERNITY', 'OTHER',
          ]),
          startAt: z.string(),
          endAt: z.string(),
          reason: z.string().optional(),
        }),
      },
    },
    async (req) => {
      // 照服員只能為自己請假
      const attendantId = req.user!.attendantId ?? req.body.attendantId;
      if (!attendantId) throw new ValidationError('缺少照服員 id');
      if (req.user!.attendantId && req.body.attendantId && req.body.attendantId !== req.user!.attendantId) {
        throw new ValidationError('不可代他人申請請假');
      }

      const startAt = new Date(req.body.startAt);
      const endAt = new Date(req.body.endAt);
      if (endAt <= startAt) throw new ValidationError('結束時間必須晚於開始時間');

      const created = await app.prisma.leaveRequest.create({
        data: {
          attendantId,
          leaveType: req.body.leaveType,
          startAt,
          endAt,
          reason: req.body.reason ?? null,
          status: 'PENDING',
        },
      });
      return { data: created };
    },
  );

  /** 核准前先看看會影響哪些已排班次 */
  app.get(
    '/leaves/:id/affected-visits',
    {
      preHandler: [app.requirePermission('leave:read')],
      schema: {
        tags: ['leave'],
        summary: '該請假影響的已排班次',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const leave = await app.prisma.leaveRequest.findFirst({
        where: { id: req.params.id, attendant: { orgId: req.user!.orgId } },
      });
      if (!leave) throw new NotFoundError('請假申請');

      const visits = await app.prisma.serviceVisit.findMany({
        where: {
          attendantId: leave.attendantId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startAt: { lt: leave.endAt },
          endAt: { gt: leave.startAt },
        },
        orderBy: { startAt: 'asc' },
        include: {
          recipient: { select: { id: true, caseNo: true, name: true, districtCode: true } },
          items: { select: { code: true, quantity: true } },
        },
      });

      return {
        data: visits.map((v) => ({
          id: v.id,
          serviceDate: toTaipeiDate(v.startAt),
          startAt: v.startAt,
          endAt: v.endAt,
          recipient: {
            id: v.recipient.id,
            caseNo: v.recipient.caseNo,
            nameMasked: `${v.recipient.name[0]}○`,
            districtCode: v.recipient.districtCode,
          },
          items: v.items,
        })),
      };
    },
  );

  app.post(
    '/leaves/:id/approve',
    {
      preHandler: [app.requirePermission('leave:approve')],
      schema: {
        tags: ['leave'],
        summary: '核准請假（回傳受影響班次供立即改派）',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const leave = await app.prisma.leaveRequest.findFirst({
        where: { id: req.params.id, attendant: { orgId: req.user!.orgId } },
      });
      if (!leave) throw new NotFoundError('請假申請');

      const updated = await app.prisma.leaveRequest.update({
        where: { id: leave.id },
        data: { status: 'APPROVED', approvedBy: req.user!.id, approvedAt: new Date() },
      });

      const affected = await app.prisma.serviceVisit.findMany({
        where: {
          attendantId: leave.attendantId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startAt: { lt: leave.endAt },
          endAt: { gt: leave.startAt },
        },
        select: { id: true, startAt: true, endAt: true, recipientId: true },
      });

      return {
        data: {
          leave: updated,
          affectedVisitCount: affected.length,
          affectedVisits: affected,
          note:
            affected.length > 0
              ? '這些班次仍指派給請假中的照服員，請逐一改派或取消'
              : '無受影響的已排班次',
        },
      };
    },
  );

  app.post(
    '/leaves/:id/reject',
    {
      preHandler: [app.requirePermission('leave:approve')],
      schema: {
        tags: ['leave'],
        summary: '駁回請假',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const updated = await app.prisma.leaveRequest.updateMany({
        where: { id: req.params.id, attendant: { orgId: req.user!.orgId } },
        data: { status: 'REJECTED', approvedBy: req.user!.id, approvedAt: new Date() },
      });
      if (updated.count === 0) throw new NotFoundError('請假申請');
      return { data: { ok: true } };
    },
  );

  /** 代班：原班取消、新班指向原班 */
  app.post(
    '/schedules/visits/:id/substitute',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '建立代班',
        params: z.object({ id: z.string() }),
        body: z.object({
          attendantId: z.string(),
          reason: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const original = await app.prisma.serviceVisit.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
        include: { items: true },
      });
      if (!original) throw new NotFoundError('班次');

      const result = await app.prisma.$transaction(async (tx) => {
        // 先取消原班，否則新班會撞到 EXCLUDE 約束（若同一位照服員）
        await tx.serviceVisit.update({
          where: { id: original.id },
          data: { status: 'CANCELLED', cancelReason: req.body.reason ?? '改由他人代班' },
        });

        return tx.serviceVisit.create({
          data: {
            orgId: original.orgId,
            unitId: original.unitId,
            recipientId: original.recipientId,
            attendantId: req.body.attendantId,
            substituteForId: original.id,
            serviceDate: original.serviceDate,
            startAt: original.startAt,
            endAt: original.endAt,
            plannedMinutes: original.plannedMinutes,
            status: 'SCHEDULED',
            createdBy: req.user!.id,
            items: {
              create: original.items.map((i) => ({
                paymentItemId: i.paymentItemId,
                code: i.code,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                amount: i.amount,
              })),
            },
          },
          include: { items: true },
        });
      });

      return { data: result };
    },
  );
};
