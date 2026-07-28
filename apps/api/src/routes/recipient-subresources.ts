/**
 * 個案的子資源：緊急聯絡人、不可服務時段。
 *
 * 兩者都採「整批取代」而非逐筆增刪 —— 這類設定在 UI 上是一張表格
 * 一次編輯完送出，逐筆 API 會讓前端得處理部分成功的中間狀態。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { NotFoundError, ValidationError } from '../lib/errors.js';

export const recipientSubresourceRoutes: FastifyPluginAsyncZod = async (app) => {
  async function assertRecipient(id: string, orgId: string) {
    const rec = await app.prisma.careRecipient.findFirst({ where: { id, orgId } });
    if (!rec) throw new NotFoundError('個案');
    return rec;
  }

  // ── 緊急聯絡人 ────────────────────────────────────────────────
  app.get(
    '/recipients/:id/contacts',
    {
      preHandler: [app.requirePermission('recipient:read')],
      schema: {
        tags: ['recipient'],
        summary: '緊急聯絡人清單',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      await assertRecipient(req.params.id, req.user!.orgId);
      return {
        data: await app.prisma.recipientContact.findMany({
          where: { recipientId: req.params.id },
          orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
        }),
      };
    },
  );

  app.put(
    '/recipients/:id/contacts',
    {
      preHandler: [app.requirePermission('recipient:write')],
      schema: {
        tags: ['recipient'],
        summary: '設定緊急聯絡人（整批取代）',
        params: z.object({ id: z.string() }),
        body: z.object({
          contacts: z
            .array(
              z.object({
                name: z.string().min(1),
                relation: z.string().min(1),
                phone: z.string().min(1),
                isPrimary: z.boolean().default(false),
              }),
            )
            .max(10),
        }),
      },
    },
    async (req) => {
      await assertRecipient(req.params.id, req.user!.orgId);

      const primaries = req.body.contacts.filter((c) => c.isPrimary);
      if (primaries.length > 1) throw new ValidationError('主要聯絡人只能有一位');

      await app.prisma.$transaction([
        app.prisma.recipientContact.deleteMany({ where: { recipientId: req.params.id } }),
        app.prisma.recipientContact.createMany({
          data: req.body.contacts.map((c) => ({ ...c, recipientId: req.params.id })),
        }),
      ]);
      return { data: { count: req.body.contacts.length } };
    },
  );

  // ── 不可服務時段 ──────────────────────────────────────────────
  app.get(
    '/recipients/:id/unavailability',
    {
      preHandler: [app.requirePermission('recipient:read')],
      schema: {
        tags: ['recipient'],
        summary: '不可服務時段',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      await assertRecipient(req.params.id, req.user!.orgId);
      return {
        data: await app.prisma.recipientUnavailability.findMany({
          where: { recipientId: req.params.id },
          orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        }),
      };
    },
  );

  app.put(
    '/recipients/:id/unavailability',
    {
      preHandler: [app.requirePermission('recipient:write')],
      schema: {
        tags: ['recipient'],
        summary: '設定不可服務時段（整批取代）',
        description: '就醫日、家屬在家日等。排班時觸發 R05 警示。',
        params: z.object({ id: z.string() }),
        body: z.object({
          windows: z
            .array(
              z.object({
                weekday: z.number().int().min(0).max(6).nullable().optional(),
                specificDate: z.string().nullable().optional(),
                startMinute: z.number().int().min(0).max(1440),
                endMinute: z.number().int().min(0).max(1440),
                reason: z.string().optional(),
              }),
            )
            .max(50),
        }),
      },
    },
    async (req) => {
      await assertRecipient(req.params.id, req.user!.orgId);

      for (const w of req.body.windows) {
        if (w.endMinute <= w.startMinute) {
          throw new ValidationError('結束時間必須晚於開始時間');
        }
        if (w.weekday == null && !w.specificDate) {
          throw new ValidationError('每筆時段須指定星期（週期性）或特定日期');
        }
      }

      await app.prisma.$transaction([
        app.prisma.recipientUnavailability.deleteMany({ where: { recipientId: req.params.id } }),
        app.prisma.recipientUnavailability.createMany({
          data: req.body.windows.map((w) => ({
            recipientId: req.params.id,
            weekday: w.specificDate ? null : (w.weekday ?? null),
            specificDate: w.specificDate ? new Date(w.specificDate) : null,
            startMinute: w.startMinute,
            endMinute: w.endMinute,
            reason: w.reason ?? null,
          })),
        }),
      ]);
      return { data: { count: req.body.windows.length } };
    },
  );
};
