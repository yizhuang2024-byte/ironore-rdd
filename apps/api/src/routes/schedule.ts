/**
 * 排班 API —— 衝突檢核的伺服端強制點。
 *
 * 前端在拖曳時會跑同一份引擎做即時預覽，但那只是預覽。
 * 這裡在寫入交易內重跑完整規則集，前端結果永不被信任。
 * DB 層另有 EXCLUDE 約束擋並行寫入造成的重疊。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  addTaipeiDays,
  canProceed,
  diffTaipeiDays,
  fromTaipeiDateMinute,
  runConflictChecks,
  summarize,
  toTaipeiDate,
  type TaipeiDate,
  type VisitDraft,
} from '@ltc/shared';
import { buildConflictContext } from '../lib/conflict-context.js';
import { ConflictCheckError, NotFoundError, ValidationError } from '../lib/errors.js';
import { boolQuery } from '../lib/query.js';
import { hasPermission, unitScope } from '../lib/rbac.js';
import { loadPaymentItems, resolveScheduleId } from '../lib/payment-resolve.js';

/** 查詢區間上限。無上限會讓前端不小心拉出整年的班次而拖垮 API。 */
const MAX_RANGE_DAYS = 31;

const visitItemSchema = z.object({
  code: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
});

export const scheduleRoutes: FastifyPluginAsyncZod = async (app) => {
  // ── 班次查詢 ──────────────────────────────────────────────────
  app.get(
    '/schedules/visits',
    {
      preHandler: [app.requirePermission('schedule:read')],
      schema: {
        tags: ['schedule'],
        summary: '班次查詢（強制日期區間，上限 31 天）',
        querystring: z.object({
          from: z.string(),
          to: z.string(),
          unitId: z.string().optional(),
          districtCode: z.string().optional(),
          attendantId: z.string().optional(),
          recipientId: z.string().optional(),
          status: z.string().optional(),
          unassignedOnly: boolQuery.optional(),
          limit: z.coerce.number().int().min(1).max(2000).default(1000),
        }),
      },
    },
    async (req) => {
      const { from, to } = req.query;
      const span = diffTaipeiDays(from as TaipeiDate, to as TaipeiDate);
      if (span < 0) throw new ValidationError('結束日期不得早於開始日期');
      if (span > MAX_RANGE_DAYS) {
        throw new ValidationError(`查詢區間上限為 ${MAX_RANGE_DAYS} 天，目前為 ${span + 1} 天`);
      }

      const scope = unitScope(req.user!);
      const rows = await app.prisma.serviceVisit.findMany({
        where: {
          orgId: req.user!.orgId,
          serviceDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
          ...(scope ? { unitId: scope } : {}),
          ...(req.query.unitId ? { unitId: req.query.unitId } : {}),
          ...(req.query.attendantId ? { attendantId: req.query.attendantId } : {}),
          ...(req.query.recipientId ? { recipientId: req.query.recipientId } : {}),
          ...(req.query.status ? { status: req.query.status as never } : {}),
          ...(req.query.unassignedOnly ? { attendantId: null, status: { not: 'CANCELLED' } } : {}),
          ...(req.query.districtCode
            ? { recipient: { districtCode: req.query.districtCode } }
            : {}),
        },
        orderBy: [{ serviceDate: 'asc' }, { startAt: 'asc' }],
        take: req.query.limit,
        include: {
          items: { select: { code: true, quantity: true, unitPrice: true, amount: true } },
          attendant: { select: { id: true, name: true, employeeNo: true } },
          recipient: {
            select: { id: true, name: true, caseNo: true, districtCode: true, cmsLevel: true },
          },
        },
      });

      return {
        data: rows.map((v) => ({
          id: v.id,
          unitId: v.unitId,
          serviceDate: toTaipeiDate(v.startAt),
          startAt: v.startAt,
          endAt: v.endAt,
          plannedMinutes: v.plannedMinutes,
          status: v.status,
          overrideReason: v.overrideReason,
          conflictSummary: v.conflictSummary,
          attendant: v.attendant,
          recipient: v.recipient
            ? {
                id: v.recipient.id,
                caseNo: v.recipient.caseNo,
                // 排班畫面只需要遮罩姓名，不需要完整個資
                nameMasked: `${v.recipient.name[0]}${'○'.repeat(Math.max(0, [...v.recipient.name].length - 2))}${[...v.recipient.name].length > 1 ? [...v.recipient.name].at(-1) : ''}`,
                districtCode: v.recipient.districtCode,
                cmsLevel: v.recipient.cmsLevel,
              }
            : null,
          items: v.items,
        })),
        meta: { count: rows.length, from, to },
      };
    },
  );

  // ── 無副作用的衝突試算（供前端拖曳預覽）────────────────────────
  app.post(
    '/schedules/check-conflicts',
    {
      preHandler: [app.requirePermission('schedule:read')],
      schema: {
        tags: ['schedule'],
        summary: '衝突檢核試算（不寫入）',
        description: '供前端拖曳中即時預覽。實際寫入時後端會重跑同一份規則，前端結果不被信任。',
        body: z.object({
          drafts: z.array(
            z.object({
              id: z.string().optional(),
              recipientId: z.string(),
              attendantId: z.string().nullable().optional(),
              serviceDate: z.string(),
              startAt: z.string(),
              endAt: z.string(),
              items: z.array(visitItemSchema),
            }),
          ),
        }),
      },
    },
    async (req) => {
      const results = [];
      for (const d of req.body.drafts) {
        const draft: VisitDraft = {
          ...(d.id ? { id: d.id } : {}),
          recipientId: d.recipientId,
          attendantId: d.attendantId ?? null,
          serviceDate: d.serviceDate as TaipeiDate,
          startAt: new Date(d.startAt),
          endAt: new Date(d.endAt),
          items: d.items,
        };
        const ctx = await buildConflictContext(app.prisma, req.user!.orgId, draft);
        results.push(summarize(runConflictChecks(ctx)));
      }
      return { data: results };
    },
  );

  // ── 建立班次 ──────────────────────────────────────────────────
  app.post(
    '/schedules/visits',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '建立班次（伺服端強制檢核）',
        body: z.object({
          recipientId: z.string(),
          attendantId: z.string().nullable().optional(),
          serviceDate: z.string(),
          startMinute: z.number().int().min(0).max(2880),
          durationMinutes: z.number().int().min(5).max(720),
          items: z.array(visitItemSchema).min(1),
          overrideRuleIds: z.array(z.string()).default([]),
          overrideReason: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const b = req.body;
      const serviceDate = b.serviceDate as TaipeiDate;
      const startAt = fromTaipeiDateMinute(serviceDate, b.startMinute);
      const endAt = fromTaipeiDateMinute(serviceDate, b.startMinute + b.durationMinutes);

      const draft: VisitDraft = {
        recipientId: b.recipientId,
        attendantId: b.attendantId ?? null,
        serviceDate,
        startAt,
        endAt,
        items: b.items,
      };

      const findings = await enforceChecks(req, draft, b.overrideRuleIds);

      const recipient = await app.prisma.careRecipient.findFirstOrThrow({
        where: { id: b.recipientId, orgId: req.user!.orgId },
      });
      const dateObj = new Date(`${serviceDate}T00:00:00Z`);
      const paymentItems = await loadPaymentItems(app.prisma, dateObj);
      const scheduleId = await resolveScheduleId(app.prisma, dateObj);
      const dbItems = await app.prisma.paymentItem.findMany({
        where: { scheduleId, code: { in: b.items.map((i) => i.code) } },
      });
      const byCode = new Map(dbItems.map((i) => [i.code, i]));

      const created = await app.prisma.serviceVisit.create({
        data: {
          orgId: req.user!.orgId,
          unitId: recipient.primaryUnitId,
          recipientId: b.recipientId,
          attendantId: b.attendantId ?? null,
          serviceDate: dateObj,
          startAt,
          endAt,
          plannedMinutes: b.durationMinutes,
          status: b.attendantId ? 'SCHEDULED' : 'UNASSIGNED',
          conflictSummary: findings.length > 0 ? (findings as never) : undefined,
          overriddenBy: b.overrideRuleIds.length > 0 ? req.user!.id : null,
          overrideReason: b.overrideReason ?? null,
          createdBy: req.user!.id,
          items: {
            create: b.items.map((i) => {
              const item = byCode.get(i.code);
              if (!item) throw new ValidationError(`支付代碼不存在：${i.code}`);
              const snapshot = paymentItems.get(i.code)!;
              const unitPrice =
                recipient.remoteAreaTier === 'NONE'
                  ? snapshot.price
                  : (snapshot.priceRemote ?? snapshot.price);
              return {
                paymentItemId: item.id,
                code: i.code,
                quantity: i.quantity,
                // 排班當下的價格快照 —— 支付基準改版不得追溯改動歷史金額
                unitPrice,
                amount: unitPrice * i.quantity,
              };
            }),
          },
        },
        include: { items: true },
      });

      await logOverride(req, created.id, b.overrideRuleIds, b.overrideReason);
      return { data: created };
    },
  );

  // ── 指派／改派 ────────────────────────────────────────────────
  app.post(
    '/schedules/visits/:id/assign',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '指派或改派照服員',
        params: z.object({ id: z.string() }),
        body: z.object({
          attendantId: z.string().nullable(),
          overrideRuleIds: z.array(z.string()).default([]),
          overrideReason: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const visit = await app.prisma.serviceVisit.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
        include: { items: true },
      });
      if (!visit) throw new NotFoundError('班次');

      const draft: VisitDraft = {
        id: visit.id,
        recipientId: visit.recipientId,
        attendantId: req.body.attendantId,
        serviceDate: toTaipeiDate(visit.startAt),
        startAt: visit.startAt,
        endAt: visit.endAt,
        items: visit.items.map((i) => ({ code: i.code, quantity: i.quantity })),
      };

      const findings = await enforceChecks(req, draft, req.body.overrideRuleIds);

      const updated = await app.prisma.serviceVisit.update({
        where: { id: visit.id },
        data: {
          attendantId: req.body.attendantId,
          status: req.body.attendantId ? 'SCHEDULED' : 'UNASSIGNED',
          conflictSummary: findings.length > 0 ? (findings as never) : undefined,
          overriddenBy: req.body.overrideRuleIds.length > 0 ? req.user!.id : null,
          overrideReason: req.body.overrideReason ?? null,
        },
      });

      await logOverride(req, visit.id, req.body.overrideRuleIds, req.body.overrideReason);
      return { data: updated };
    },
  );

  app.patch(
    '/schedules/visits/:id',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '修改班次時間',
        params: z.object({ id: z.string() }),
        body: z.object({
          serviceDate: z.string().optional(),
          startMinute: z.number().int().min(0).max(2880).optional(),
          durationMinutes: z.number().int().min(5).max(720).optional(),
          overrideRuleIds: z.array(z.string()).default([]),
          overrideReason: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const visit = await app.prisma.serviceVisit.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
        include: { items: true },
      });
      if (!visit) throw new NotFoundError('班次');
      if (visit.lockedAt) throw new ValidationError('此班次已鎖定（已結算或申報），不可修改');

      const serviceDate = (req.body.serviceDate ?? toTaipeiDate(visit.startAt)) as TaipeiDate;
      const startMinute =
        req.body.startMinute ??
        Math.round(
          (visit.startAt.getTime() - new Date(`${serviceDate}T00:00:00Z`).getTime()) / 60_000,
        ) + 480;
      const duration = req.body.durationMinutes ?? visit.plannedMinutes;

      const startAt = fromTaipeiDateMinute(serviceDate, startMinute);
      const endAt = fromTaipeiDateMinute(serviceDate, startMinute + duration);

      const draft: VisitDraft = {
        id: visit.id,
        recipientId: visit.recipientId,
        attendantId: visit.attendantId,
        serviceDate,
        startAt,
        endAt,
        items: visit.items.map((i) => ({ code: i.code, quantity: i.quantity })),
      };

      const findings = await enforceChecks(req, draft, req.body.overrideRuleIds);

      const updated = await app.prisma.serviceVisit.update({
        where: { id: visit.id },
        data: {
          serviceDate: new Date(`${serviceDate}T00:00:00Z`),
          startAt,
          endAt,
          plannedMinutes: duration,
          conflictSummary: findings.length > 0 ? (findings as never) : undefined,
        },
      });
      await logOverride(req, visit.id, req.body.overrideRuleIds, req.body.overrideReason);
      return { data: updated };
    },
  );

  app.delete(
    '/schedules/visits/:id',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '取消班次（軟刪除，保留稽核軌跡）',
        params: z.object({ id: z.string() }),
        querystring: z.object({ reason: z.string().optional() }),
      },
    },
    async (req) => {
      const updated = await app.prisma.serviceVisit.updateMany({
        where: { id: req.params.id, orgId: req.user!.orgId },
        data: { status: 'CANCELLED', cancelReason: req.query.reason ?? null },
      });
      if (updated.count === 0) throw new NotFoundError('班次');
      return { data: { ok: true } };
    },
  );

  // ── 候選照服員 ────────────────────────────────────────────────
  app.get(
    '/schedules/visits/:id/candidates',
    {
      preHandler: [app.requirePermission('schedule:read')],
      schema: {
        tags: ['schedule'],
        summary: '列出可指派的照服員（依衝突嚴重度排序）',
        params: z.object({ id: z.string() }),
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(15) }),
      },
    },
    async (req) => {
      const visit = await app.prisma.serviceVisit.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
        include: { items: true, recipient: { select: { districtCode: true, primaryUnitId: true } } },
      });
      if (!visit) throw new NotFoundError('班次');

      // 先用便宜的條件縮小範圍：同單位、在職、服務區涵蓋該行政區
      const pool = await app.prisma.attendant.findMany({
        where: {
          orgId: req.user!.orgId,
          status: 'ACTIVE',
          ...(visit.recipient.primaryUnitId
            ? { primaryUnitId: visit.recipient.primaryUnitId }
            : {}),
        },
        select: { id: true, name: true, employeeNo: true, serviceAreas: { select: { districtCode: true } } },
        take: 120,
      });

      const sameArea = pool.filter((a) =>
        a.serviceAreas.some((s) => s.districtCode === visit.recipient.districtCode),
      );
      const shortlist = (sameArea.length > 0 ? sameArea : pool).slice(0, 40);

      const scored = [];
      for (const cand of shortlist) {
        const draft: VisitDraft = {
          id: visit.id,
          recipientId: visit.recipientId,
          attendantId: cand.id,
          serviceDate: toTaipeiDate(visit.startAt),
          startAt: visit.startAt,
          endAt: visit.endAt,
          items: visit.items.map((i) => ({ code: i.code, quantity: i.quantity })),
        };
        const ctx = await buildConflictContext(app.prisma, req.user!.orgId, draft);
        const summary = summarize(runConflictChecks(ctx));
        scored.push({
          attendant: { id: cand.id, name: cand.name, employeeNo: cand.employeeNo },
          level: summary.level,
          blockCount: summary.blocks.length,
          warnCount: summary.warns.length,
          allBlocksOverridable: summary.allBlocksOverridable,
          findings: summary.findings,
        });
      }

      // 無衝突者優先，其次警告少者
      scored.sort(
        (a, b) => a.blockCount - b.blockCount || a.warnCount - b.warnCount,
      );
      return { data: scored.slice(0, req.query.limit) };
    },
  );

  // ── 依樣板實體化班次（冪等）────────────────────────────────────
  app.post(
    '/schedules/generate',
    {
      preHandler: [app.requirePermission('schedule:write')],
      schema: {
        tags: ['schedule'],
        summary: '依排班樣板產生班次（冪等）',
        description: '同一樣板與期間重複執行不會產生重複班次。支援 dryRun 預覽。',
        body: z.object({
          from: z.string(),
          to: z.string(),
          recipientIds: z.array(z.string()).optional(),
          dryRun: z.boolean().default(false),
        }),
      },
    },
    async (req) => {
      const { from, to } = req.body;
      const span = diffTaipeiDays(from as TaipeiDate, to as TaipeiDate);
      if (span < 0) throw new ValidationError('結束日期不得早於開始日期');
      if (span > 92) throw new ValidationError('一次最多產生 92 天');

      const patterns = await app.prisma.recurringPattern.findMany({
        where: {
          isActive: true,
          recipient: {
            orgId: req.user!.orgId,
            ...(req.body.recipientIds ? { id: { in: req.body.recipientIds } } : {}),
          },
          effectiveFrom: { lte: new Date(`${to}T00:00:00Z`) },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${from}T00:00:00Z`) } }],
        },
        include: { recipient: { select: { id: true, primaryUnitId: true, remoteAreaTier: true } } },
      });

      // 冪等的關鍵：先撈出期間內已由樣板產生的班次，用 (patternId, date) 當去重鍵
      const existing = await app.prisma.serviceVisit.findMany({
        where: {
          orgId: req.user!.orgId,
          serviceDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
          sourcePatternId: { not: null },
        },
        select: { sourcePatternId: true, serviceDate: true },
      });
      const seen = new Set(
        existing.map((e) => `${e.sourcePatternId}|${toTaipeiDate(e.serviceDate)}`),
      );

      const toCreate: {
        pattern: (typeof patterns)[number];
        date: TaipeiDate;
      }[] = [];

      for (const p of patterns) {
        for (let i = 0; i <= span; i += 1) {
          const d = addTaipeiDays(from as TaipeiDate, i);
          if (new Date(`${d}T00:00:00Z`).getUTCDay() !== p.weekday) continue;
          if (seen.has(`${p.id}|${d}`)) continue;
          toCreate.push({ pattern: p, date: d });
        }
      }

      if (req.body.dryRun) {
        return {
          data: {
            wouldCreate: toCreate.length,
            patternCount: patterns.length,
            sample: toCreate.slice(0, 20).map((c) => ({
              recipientId: c.pattern.recipientId,
              date: c.date,
              startMinute: c.pattern.startMinute,
              itemCodes: c.pattern.itemCodes,
            })),
          },
        };
      }

      let created = 0;
      for (const c of toCreate) {
        const dateObj = new Date(`${c.date}T00:00:00Z`);
        const scheduleId = await resolveScheduleId(app.prisma, dateObj);
        const dbItems = await app.prisma.paymentItem.findMany({
          where: { scheduleId, code: { in: c.pattern.itemCodes } },
        });
        if (dbItems.length === 0) continue;

        const startAt = fromTaipeiDateMinute(c.date, c.pattern.startMinute);
        const endAt = fromTaipeiDateMinute(
          c.date,
          c.pattern.startMinute + c.pattern.durationMinutes,
        );

        try {
          await app.prisma.serviceVisit.create({
            data: {
              orgId: req.user!.orgId,
              unitId: c.pattern.recipient.primaryUnitId,
              recipientId: c.pattern.recipientId,
              // 樣板指定的照服員若當下已有衝突，DB EXCLUDE 會擋下 ——
              // 此時留為未指派而非讓整批失敗
              attendantId: c.pattern.attendantId,
              sourcePatternId: c.pattern.id,
              serviceDate: dateObj,
              startAt,
              endAt,
              plannedMinutes: c.pattern.durationMinutes,
              status: c.pattern.attendantId ? 'SCHEDULED' : 'UNASSIGNED',
              createdBy: req.user!.id,
              items: {
                create: dbItems.map((item) => {
                  const unitPrice =
                    c.pattern.recipient.remoteAreaTier === 'NONE'
                      ? item.price
                      : (item.priceRemote ?? item.price);
                  return {
                    paymentItemId: item.id,
                    code: item.code,
                    quantity: 1,
                    unitPrice,
                    amount: unitPrice,
                  };
                }),
              },
            },
          });
          created += 1;
        } catch (err) {
          // 23P01：該照服員時段已被佔用 → 改為未指派後重試一次
          const code = (err as { code?: string })?.code;
          if (code === '23P01' || String(err).includes('no_overlap')) {
            await app.prisma.serviceVisit.create({
              data: {
                orgId: req.user!.orgId,
                unitId: c.pattern.recipient.primaryUnitId,
                recipientId: c.pattern.recipientId,
                attendantId: null,
                sourcePatternId: c.pattern.id,
                serviceDate: dateObj,
                startAt,
                endAt,
                plannedMinutes: c.pattern.durationMinutes,
                status: 'UNASSIGNED',
                createdBy: req.user!.id,
                items: {
                  create: dbItems.map((item) => ({
                    paymentItemId: item.id,
                    code: item.code,
                    quantity: 1,
                    unitPrice: item.price,
                    amount: item.price,
                  })),
                },
              },
            });
            created += 1;
          } else {
            throw err;
          }
        }
      }

      return { data: { created, patternCount: patterns.length } };
    },
  );

  // ── 缺工統計 ──────────────────────────────────────────────────
  app.get(
    '/schedules/coverage',
    {
      preHandler: [app.requirePermission('schedule:read')],
      schema: {
        tags: ['schedule'],
        summary: '未排班／缺工統計',
        querystring: z.object({ from: z.string(), to: z.string() }),
      },
    },
    async (req) => {
      const scope = unitScope(req.user!);
      const where = {
        orgId: req.user!.orgId,
        serviceDate: {
          gte: new Date(`${req.query.from}T00:00:00Z`),
          lte: new Date(`${req.query.to}T00:00:00Z`),
        },
        ...(scope ? { unitId: scope } : {}),
      };

      const [total, unassigned, byDate] = await Promise.all([
        app.prisma.serviceVisit.count({ where: { ...where, status: { not: 'CANCELLED' } } }),
        app.prisma.serviceVisit.count({
          where: { ...where, attendantId: null, status: { not: 'CANCELLED' } },
        }),
        app.prisma.serviceVisit.groupBy({
          by: ['serviceDate'],
          where: { ...where, attendantId: null, status: { not: 'CANCELLED' } },
          _count: true,
          orderBy: { serviceDate: 'asc' },
        }),
      ]);

      return {
        data: {
          total,
          unassigned,
          coverageRate: total === 0 ? 1 : (total - unassigned) / total,
          unassignedByDate: byDate.map((b) => ({
            date: toTaipeiDate(b.serviceDate),
            count: b._count,
          })),
        },
      };
    },
  );

  // ── 共用：伺服端強制檢核 ──────────────────────────────────────
  async function enforceChecks(
    req: { user?: { orgId: string; id: string } | undefined },
    draft: VisitDraft,
    overrideRuleIds: string[],
  ) {
    const ctx = await buildConflictContext(app.prisma, req.user!.orgId, draft);
    const findings = runConflictChecks(ctx);

    // 只有具 schedule:override 權限者的覆寫才算數。
    // 行政人員即使在請求中塞了 overrideRuleIds 也不會生效。
    const effectiveOverrides = hasPermission(req.user as never, 'schedule:override')
      ? overrideRuleIds
      : [];

    const verdict = canProceed(findings, effectiveOverrides);
    if (!verdict.ok) throw new ConflictCheckError(verdict.blockedBy);
    return findings;
  }

  async function logOverride(
    req: { user?: { orgId: string; id: string } | undefined; ip?: string },
    visitId: string,
    ruleIds: string[],
    reason?: string,
  ) {
    if (ruleIds.length === 0) return;
    await app.prisma.auditLog.create({
      data: {
        orgId: req.user!.orgId,
        actorUserId: req.user!.id,
        action: 'OVERRIDE',
        entityType: 'ServiceVisit',
        entityId: visitId,
        changes: { overriddenRules: ruleIds, reason: reason ?? null },
        ipAddress: req.ip ?? null,
      },
    });
  }
};
