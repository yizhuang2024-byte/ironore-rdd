/**
 * 支付基準版本管理與匯入。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { NotFoundError } from '../lib/errors.js';
import {
  parseCmsQuotas,
  parseCopayRates,
  parsePaymentItems,
} from '../lib/payment-import.js';
import { resolveScheduleId } from '../lib/payment-resolve.js';

export const paymentCodeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/payment-schedules',
    {
      preHandler: [app.requirePermission('payment:read')],
      schema: { tags: ['payment'], summary: '支付基準版本清單' },
    },
    async () => {
      const schedules = await app.prisma.paymentSchedule.findMany({
        orderBy: { effectiveFrom: 'desc' },
        include: { _count: { select: { items: true, quotas: true, copayRates: true } } },
      });
      return { data: schedules };
    },
  );

  app.post(
    '/payment-schedules',
    {
      preHandler: [app.requirePermission('payment:write')],
      schema: {
        tags: ['payment'],
        summary: '建立支付基準版本',
        body: z.object({
          name: z.string().min(1),
          effectiveFrom: z.string(),
          effectiveTo: z.string().nullable().optional(),
          sourceRef: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const created = await app.prisma.paymentSchedule.create({
        data: {
          name: req.body.name,
          effectiveFrom: new Date(req.body.effectiveFrom),
          effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : null,
          sourceRef: req.body.sourceRef ?? null,
        },
      });
      return { data: created };
    },
  );

  app.get(
    '/payment-schedules/:id/items',
    {
      preHandler: [app.requirePermission('payment:read')],
      schema: {
        tags: ['payment'],
        summary: '支付項目清單',
        params: z.object({ id: z.string() }),
        querystring: z.object({
          category: z.string().optional(),
          q: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const items = await app.prisma.paymentItem.findMany({
        where: {
          scheduleId: req.params.id,
          ...(req.query.category ? { category: req.query.category as never } : {}),
          ...(req.query.q
            ? {
                OR: [
                  { code: { contains: req.query.q, mode: 'insensitive' as const } },
                  { name: { contains: req.query.q } },
                ],
              }
            : {}),
        },
        orderBy: { code: 'asc' },
      });
      return { data: items };
    },
  );

  app.put(
    '/payment-schedules/:id/items',
    {
      preHandler: [app.requirePermission('payment:write')],
      schema: {
        tags: ['payment'],
        summary: '整批匯入支付項目（CSV）',
        description:
          '以官方公告之附表四 CSV 整批取代該版本的所有項目。系統不含任何寫死的支付代碼或價格。',
        params: z.object({ id: z.string() }),
        body: z.object({ csv: z.string().min(1) }),
      },
    },
    async (req) => {
      const schedule = await app.prisma.paymentSchedule.findUnique({
        where: { id: req.params.id },
      });
      if (!schedule) throw new NotFoundError('支付基準版本');

      const parsed = parsePaymentItems(req.body.csv);
      await app.prisma.$transaction([
        app.prisma.paymentItem.deleteMany({ where: { scheduleId: schedule.id } }),
        app.prisma.paymentItem.createMany({
          data: parsed.map((p) => ({ ...p, scheduleId: schedule.id })),
        }),
      ]);
      return { data: { imported: parsed.length } };
    },
  );

  app.put(
    '/payment-schedules/:id/quotas',
    {
      preHandler: [app.requirePermission('payment:write')],
      schema: {
        tags: ['payment'],
        summary: '整批匯入 CMS 月給付額度（CSV）',
        params: z.object({ id: z.string() }),
        body: z.object({ csv: z.string().min(1) }),
      },
    },
    async (req) => {
      const parsed = parseCmsQuotas(req.body.csv);
      await app.prisma.$transaction([
        app.prisma.cmsQuota.deleteMany({ where: { scheduleId: req.params.id } }),
        app.prisma.cmsQuota.createMany({
          data: parsed.map((p) => ({ ...p, scheduleId: req.params.id })),
        }),
      ]);
      return { data: { imported: parsed.length } };
    },
  );

  app.put(
    '/payment-schedules/:id/copay-rates',
    {
      preHandler: [app.requirePermission('payment:write')],
      schema: {
        tags: ['payment'],
        summary: '整批匯入部分負擔比率（CSV）',
        params: z.object({ id: z.string() }),
        body: z.object({ csv: z.string().min(1) }),
      },
    },
    async (req) => {
      const parsed = parseCopayRates(req.body.csv);
      await app.prisma.$transaction([
        app.prisma.copayRate.deleteMany({ where: { scheduleId: req.params.id } }),
        app.prisma.copayRate.createMany({
          data: parsed.map((p) => ({ ...p, scheduleId: req.params.id })),
        }),
      ]);
      return { data: { imported: parsed.length } };
    },
  );

  app.get(
    '/payment-schedules/:id/quotas',
    {
      preHandler: [app.requirePermission('payment:read')],
      schema: {
        tags: ['payment'],
        summary: 'CMS 月給付額度',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => ({
      data: await app.prisma.cmsQuota.findMany({
        where: { scheduleId: req.params.id },
        orderBy: [{ category: 'asc' }, { cmsLevel: 'asc' }],
      }),
    }),
  );

  app.get(
    '/payment-schedules/:id/copay-rates',
    {
      preHandler: [app.requirePermission('payment:read')],
      schema: {
        tags: ['payment'],
        summary: '部分負擔比率',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => ({
      data: await app.prisma.copayRate.findMany({ where: { scheduleId: req.params.id } }),
    }),
  );

  app.get(
    '/payment-items/resolve',
    {
      preHandler: [app.requirePermission('payment:read')],
      schema: {
        tags: ['payment'],
        summary: '解析指定日期生效的支付項目',
        description:
          '所有金額查詢都必須經過此端點 —— 直接取「目前啟用版本」會在公告改版後把歷史班次算錯。',
        querystring: z.object({
          date: z.string(),
          codes: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const date = new Date(req.query.date);
      const scheduleId = await resolveScheduleId(app.prisma, date);
      const codes = req.query.codes?.split(',').map((s) => s.trim()).filter(Boolean);

      const items = await app.prisma.paymentItem.findMany({
        where: { scheduleId, isActive: true, ...(codes?.length ? { code: { in: codes } } : {}) },
        orderBy: { code: 'asc' },
      });
      return { data: { scheduleId, items } };
    },
  );
};
