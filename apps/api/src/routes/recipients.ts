/**
 * 個案主檔與照顧計畫。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  calcMonthQuota,
  taipeiMonthOf,
  toTaipeiDate,
  type PaymentItemPricing,
} from '@ltc/shared';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { assertPermission, unitScope } from '../lib/rbac.js';
import { toRecipientDto, toRecipientPiiDto } from '../lib/dto.js';
import { blindIndex, encryptPii } from '../lib/crypto.js';
import { resolveCopayRate, resolveMonthlyQuota, resolveScheduleId } from '../lib/payment-resolve.js';

export const recipientRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/recipients',
    {
      preHandler: [app.requirePermission('recipient:read')],
      schema: {
        tags: ['recipient'],
        summary: '個案列表（一律遮罩顯示）',
        querystring: z.object({
          q: z.string().optional(),
          status: z.string().optional(),
          districtCode: z.string().optional(),
          unitId: z.string().optional(),
          supervisorId: z.string().optional(),
          cmsLevel: z.coerce.number().int().optional(),
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(200).default(50),
        }),
      },
    },
    async (req) => {
      const { page, pageSize } = req.query;
      const scope = unitScope(req.user!);
      const where = {
        orgId: req.user!.orgId,
        // 督導只看得到自己單位的個案；管理者不受限制
        ...(scope ? { primaryUnitId: scope } : {}),
        ...(req.query.status ? { status: req.query.status as never } : {}),
        ...(req.query.districtCode ? { districtCode: req.query.districtCode } : {}),
        ...(req.query.unitId ? { primaryUnitId: req.query.unitId } : {}),
        ...(req.query.supervisorId ? { supervisorId: req.query.supervisorId } : {}),
        ...(req.query.cmsLevel ? { cmsLevel: req.query.cmsLevel } : {}),
        ...(req.query.q
          ? {
              OR: [
                { caseNo: { contains: req.query.q, mode: 'insensitive' as const } },
                { name: { contains: req.query.q } },
                { ltcCaseNo: { contains: req.query.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [total, rows] = await Promise.all([
        app.prisma.careRecipient.count({ where }),
        app.prisma.careRecipient.findMany({
          where,
          orderBy: { caseNo: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      return {
        data: rows.map(toRecipientDto),
        meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    },
  );

  app.get(
    '/recipients/:id',
    {
      preHandler: [app.requirePermission('recipient:read')],
      schema: {
        tags: ['recipient'],
        summary: '個案詳情（遮罩）',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const row = await app.prisma.careRecipient.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
        include: {
          contacts: true,
          unavailability: true,
          carePlans: {
            orderBy: { effectiveFrom: 'desc' },
            include: { items: { include: { paymentItem: { select: { name: true, price: true } } } } },
          },
        },
      });
      if (!row) throw new NotFoundError('個案');

      // 開啟個案詳情頁即記錄讀取軌跡（個資法要求的存取軌跡三類之一）
      await app.prisma.auditLog.create({
        data: {
          orgId: req.user!.orgId,
          actorUserId: req.user!.id,
          actorRole: req.user!.roles.map((r) => r.role).join(','),
          action: 'READ',
          entityType: 'CareRecipient',
          entityId: row.id,
          subjectRecipientId: row.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          requestId: req.id,
        },
      });

      return {
        data: {
          ...toRecipientDto(row),
          contacts: row.contacts,
          unavailability: row.unavailability,
          carePlans: row.carePlans,
        },
      };
    },
  );

  /**
   * 個資明文。
   * 需 pii:reveal 權限（AUDITOR 刻意不具此權限），且每次呼叫都寫稽核紀錄。
   */
  app.post(
    '/recipients/:id/reveal-pii',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['recipient'],
        summary: '顯示個案完整個資（寫入稽核紀錄）',
        params: z.object({ id: z.string() }),
        body: z.object({ reason: z.string().optional() }),
      },
    },
    async (req) => {
      assertPermission(req.user!, 'pii:reveal');

      const row = await app.prisma.careRecipient.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
      });
      if (!row) throw new NotFoundError('個案');

      await app.prisma.auditLog.create({
        data: {
          orgId: req.user!.orgId,
          actorUserId: req.user!.id,
          actorRole: req.user!.roles.map((r) => r.role).join(','),
          action: 'READ',
          entityType: 'CareRecipient.PII',
          entityId: row.id,
          subjectRecipientId: row.id,
          changes: { fields: ['name', 'nationalId', 'address', 'medicalNotes', 'careNotes'], reason: req.body.reason ?? null },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          requestId: req.id,
        },
      });

      return { data: toRecipientPiiDto(row, req.user!) };
    },
  );

  app.post(
    '/recipients',
    {
      preHandler: [app.requirePermission('recipient:write')],
      schema: {
        tags: ['recipient'],
        summary: '新增個案',
        body: z.object({
          caseNo: z.string().min(1),
          ltcCaseNo: z.string().optional(),
          name: z.string().min(1),
          nationalId: z.string().optional(),
          birthDate: z.string().optional(),
          gender: z.enum(['M', 'F', 'OTHER']).optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          districtCode: z.string().min(1),
          lat: z.number().optional(),
          lng: z.number().optional(),
          cmsLevel: z.number().int().min(1).max(8),
          copayCategory: z.enum(['GENERAL', 'LOW_MID_INCOME', 'LOW_INCOME']),
          remoteAreaTier: z.enum(['NONE', 'REMOTE', 'MOUNTAIN_ISLAND']).default('NONE'),
          serviceStartOn: z.string(),
          primaryUnitId: z.string().optional(),
          supervisorId: z.string().optional(),
          careNotes: z.string().optional(),
          medicalNotes: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const b = req.body;
      const created = await app.prisma.careRecipient.create({
        data: {
          orgId: req.user!.orgId,
          caseNo: b.caseNo,
          ltcCaseNo: b.ltcCaseNo ?? null,
          name: b.name,
          nationalIdEnc: encryptPii(b.nationalId),
          nationalIdBidx: blindIndex(b.nationalId),
          birthDate: b.birthDate ? new Date(b.birthDate) : null,
          gender: b.gender ?? null,
          phone: b.phone ?? null,
          addressEnc: encryptPii(b.address),
          districtCode: b.districtCode,
          lat: b.lat ?? null,
          lng: b.lng ?? null,
          geocodeQuality: b.lat != null && b.lng != null ? 'MANUAL' : 'NONE',
          cmsLevel: b.cmsLevel,
          copayCategory: b.copayCategory,
          remoteAreaTier: b.remoteAreaTier,
          serviceStartOn: new Date(b.serviceStartOn),
          primaryUnitId: b.primaryUnitId ?? null,
          supervisorId: b.supervisorId ?? null,
          careNotesEnc: encryptPii(b.careNotes),
          medicalNotesEnc: encryptPii(b.medicalNotes),
        },
      });
      return { data: toRecipientDto(created) };
    },
  );

  app.patch(
    '/recipients/:id',
    {
      preHandler: [app.requirePermission('recipient:write')],
      schema: {
        tags: ['recipient'],
        summary: '更新個案',
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().optional(),
          phone: z.string().nullable().optional(),
          address: z.string().optional(),
          districtCode: z.string().optional(),
          lat: z.number().nullable().optional(),
          lng: z.number().nullable().optional(),
          cmsLevel: z.number().int().min(1).max(8).optional(),
          copayCategory: z.enum(['GENERAL', 'LOW_MID_INCOME', 'LOW_INCOME']).optional(),
          remoteAreaTier: z.enum(['NONE', 'REMOTE', 'MOUNTAIN_ISLAND']).optional(),
          status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
          serviceEndOn: z.string().nullable().optional(),
          supervisorId: z.string().nullable().optional(),
          careNotes: z.string().optional(),
          medicalNotes: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const existing = await app.prisma.careRecipient.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
      });
      if (!existing) throw new NotFoundError('個案');

      const b = req.body;
      const updated = await app.prisma.careRecipient.update({
        where: { id: req.params.id },
        data: {
          ...(b.name !== undefined ? { name: b.name } : {}),
          ...(b.phone !== undefined ? { phone: b.phone } : {}),
          ...(b.address !== undefined ? { addressEnc: encryptPii(b.address) } : {}),
          ...(b.districtCode !== undefined ? { districtCode: b.districtCode } : {}),
          ...(b.lat !== undefined ? { lat: b.lat } : {}),
          ...(b.lng !== undefined ? { lng: b.lng } : {}),
          ...(b.lat != null && b.lng != null ? { geocodeQuality: 'MANUAL' as const } : {}),
          ...(b.cmsLevel !== undefined ? { cmsLevel: b.cmsLevel } : {}),
          ...(b.copayCategory !== undefined ? { copayCategory: b.copayCategory } : {}),
          ...(b.remoteAreaTier !== undefined ? { remoteAreaTier: b.remoteAreaTier } : {}),
          ...(b.status !== undefined ? { status: b.status } : {}),
          ...(b.serviceEndOn !== undefined
            ? { serviceEndOn: b.serviceEndOn ? new Date(b.serviceEndOn) : null }
            : {}),
          ...(b.supervisorId !== undefined ? { supervisorId: b.supervisorId } : {}),
          ...(b.careNotes !== undefined ? { careNotesEnc: encryptPii(b.careNotes) } : {}),
          ...(b.medicalNotes !== undefined ? { medicalNotesEnc: encryptPii(b.medicalNotes) } : {}),
        },
      });
      return { data: toRecipientDto(updated) };
    },
  );

  /**
   * 月額度使用與部分負擔試算。
   *
   * 金額一律以「該月已排班次的 VisitItem.unitPrice 快照」計算 ——
   * 不重新查價格，否則支付基準改版會追溯改動歷史金額。
   */
  app.get(
    '/recipients/:id/quota',
    {
      preHandler: [app.requirePermission('recipient:read')],
      schema: {
        tags: ['recipient'],
        summary: '月給付額度使用與部分負擔試算',
        params: z.object({ id: z.string() }),
        querystring: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
      },
    },
    async (req) => {
      const recipient = await app.prisma.careRecipient.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
      });
      if (!recipient) throw new NotFoundError('個案');

      const [y, m] = req.query.month.split('-').map(Number);
      const monthStart = new Date(Date.UTC(y!, m! - 1, 1));
      const monthEnd = new Date(Date.UTC(y!, m!, 0));

      const plan = await app.prisma.carePlan.findFirst({
        where: {
          recipientId: recipient.id,
          status: 'ACTIVE',
          effectiveFrom: { lte: monthEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      const visits = await app.prisma.serviceVisit.findMany({
        where: {
          recipientId: recipient.id,
          serviceDate: { gte: monthStart, lte: monthEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        include: { items: { include: { paymentItem: true } } },
      });

      const lines = visits.flatMap((v) =>
        v.items.map((it) => ({
          item: {
            code: it.code,
            category: it.paymentItem.category,
            // 使用排班當下的價格快照，而非現行價格
            price: it.unitPrice,
            priceRemote: it.unitPrice,
            isAddOn: it.paymentItem.isAddOn,
          } satisfies PaymentItemPricing,
          quantity: it.quantity,
        })),
      );

      const ratePermille = plan
        ? await resolveCopayRate(app.prisma, monthStart, plan.copayCategory)
        : await resolveCopayRate(app.prisma, monthStart, recipient.copayCategory);

      const approvedQuota =
        plan?.monthlyQuota ??
        (await resolveMonthlyQuota(app.prisma, monthStart, recipient.cmsLevel));

      const result = calcMonthQuota({
        approvedQuota,
        lines,
        // 單價已是快照，不再依 remoteAreaTier 重算
        remoteAreaTier: 'NONE',
        ratePermille,
        category: 'CARE_PROFESSIONAL',
      });

      return {
        data: {
          month: req.query.month,
          carePlanId: plan?.id ?? null,
          copayCategory: plan?.copayCategory ?? recipient.copayCategory,
          ratePermille,
          visitCount: visits.length,
          ...result,
        },
      };
    },
  );

  // ── 照顧計畫 ──────────────────────────────────────────────────
  app.post(
    '/recipients/:id/care-plans',
    {
      preHandler: [app.requirePermission('careplan:write')],
      schema: {
        tags: ['careplan'],
        summary: '建立照顧計畫（自動將舊版設為 SUPERSEDED）',
        params: z.object({ id: z.string() }),
        body: z.object({
          planNo: z.string().optional(),
          effectiveFrom: z.string(),
          effectiveTo: z.string().nullable().optional(),
          cmsLevel: z.number().int().min(1).max(8),
          copayCategory: z.enum(['GENERAL', 'LOW_MID_INCOME', 'LOW_INCOME']),
          monthlyQuota: z.number().int().optional(),
          items: z.array(
            z.object({
              code: z.string(),
              approvedPerMonth: z.number().int().min(0),
              approvedPerWeek: z.number().int().min(0).optional(),
              preferredMinutes: z.number().int().optional(),
              note: z.string().optional(),
            }),
          ),
        }),
      },
    },
    async (req) => {
      const recipient = await app.prisma.careRecipient.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
      });
      if (!recipient) throw new NotFoundError('個案');

      const effectiveFrom = new Date(req.body.effectiveFrom);
      const scheduleId = await resolveScheduleId(app.prisma, effectiveFrom);

      const paymentItems = await app.prisma.paymentItem.findMany({
        where: { scheduleId, code: { in: req.body.items.map((i) => i.code) } },
      });
      const byCode = new Map(paymentItems.map((p) => [p.code, p]));

      const missing = req.body.items.filter((i) => !byCode.has(i.code)).map((i) => i.code);
      if (missing.length > 0) {
        throw new ValidationError(
          `以下支付代碼不存在於 ${req.body.effectiveFrom} 生效的支付基準版本：${missing.join('、')}`,
        );
      }

      const monthlyQuota =
        req.body.monthlyQuota ??
        (await resolveMonthlyQuota(app.prisma, effectiveFrom, req.body.cmsLevel));

      const latest = await app.prisma.carePlan.findFirst({
        where: { recipientId: recipient.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const created = await app.prisma.$transaction(async (tx) => {
        await tx.carePlan.updateMany({
          where: { recipientId: recipient.id, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED' },
        });
        return tx.carePlan.create({
          data: {
            recipientId: recipient.id,
            planNo: req.body.planNo ?? null,
            version: (latest?.version ?? 0) + 1,
            effectiveFrom,
            effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : null,
            cmsLevel: req.body.cmsLevel,
            copayCategory: req.body.copayCategory,
            scheduleId,
            monthlyQuota,
            status: 'ACTIVE',
            approvedBy: req.user!.id,
            items: {
              create: req.body.items.map((i) => ({
                paymentItemId: byCode.get(i.code)!.id,
                code: i.code,
                approvedPerMonth: i.approvedPerMonth,
                approvedPerWeek: i.approvedPerWeek ?? null,
                preferredMinutes: i.preferredMinutes ?? null,
                note: i.note ?? null,
              })),
            },
          },
          include: { items: true },
        });
      });

      return { data: created };
    },
  );

  app.get(
    '/care-plans/:id',
    {
      preHandler: [app.requirePermission('careplan:read')],
      schema: {
        tags: ['careplan'],
        summary: '照顧計畫詳情',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const plan = await app.prisma.carePlan.findFirst({
        where: { id: req.params.id, recipient: { orgId: req.user!.orgId } },
        include: { items: { include: { paymentItem: true } } },
      });
      if (!plan) throw new NotFoundError('照顧計畫');
      return { data: plan };
    },
  );

  void taipeiMonthOf;
  void toTaipeiDate;
};
