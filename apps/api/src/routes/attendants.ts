/**
 * 照服員主檔。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { calcWorkMinutes, toTaipeiDate, type TaipeiDate } from '@ltc/shared';
import { NotFoundError } from '../lib/errors.js';
import { unitScope } from '../lib/rbac.js';
import { toAttendantDto } from '../lib/dto.js';
import { blindIndex, encryptPii } from '../lib/crypto.js';

const certTypeEnum = z.enum([
  'CARE_ATTENDANT_TRAINING', 'CARE_ATTENDANT_LICENSE', 'IN_SERVICE_TRAINING',
  'HEALTH_CHECK', 'CPR_FIRST_AID', 'BATH_VEHICLE', 'DEMENTIA_CARE',
  'FOOT_CARE', 'DRIVER_LICENSE',
]);

export const attendantRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/attendants',
    {
      preHandler: [app.requirePermission('attendant:read')],
      schema: {
        tags: ['attendant'],
        summary: '照服員列表',
        querystring: z.object({
          q: z.string().optional(),
          status: z.string().optional(),
          districtCode: z.string().optional(),
          unitId: z.string().optional(),
          employmentType: z.string().optional(),
          certType: certTypeEnum.optional(),
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
        // 督導只看得到自己單位的照服員
        ...(scope ? { primaryUnitId: scope } : {}),
        ...(req.query.status ? { status: req.query.status as never } : {}),
        ...(req.query.unitId ? { primaryUnitId: req.query.unitId } : {}),
        ...(req.query.employmentType ? { employmentType: req.query.employmentType as never } : {}),
        ...(req.query.q
          ? {
              OR: [
                { name: { contains: req.query.q } },
                { employeeNo: { contains: req.query.q, mode: 'insensitive' as const } },
                { phone: { contains: req.query.q } },
              ],
            }
          : {}),
        ...(req.query.districtCode
          ? { serviceAreas: { some: { districtCode: req.query.districtCode } } }
          : {}),
        ...(req.query.certType
          ? { certifications: { some: { certType: req.query.certType } } }
          : {}),
      };

      const [total, rows] = await Promise.all([
        app.prisma.attendant.count({ where }),
        app.prisma.attendant.findMany({
          where,
          orderBy: { employeeNo: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            serviceAreas: { select: { districtCode: true, priority: true } },
            _count: { select: { certifications: true } },
          },
        }),
      ]);

      return {
        data: rows.map((r) => ({
          ...toAttendantDto(r),
          serviceAreas: r.serviceAreas,
          certificationCount: r._count.certifications,
        })),
        meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
      };
    },
  );

  app.get(
    '/attendants/:id',
    {
      preHandler: [app.requirePermission('attendant:read')],
      schema: {
        tags: ['attendant'],
        summary: '照服員詳情',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const row = await app.prisma.attendant.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
        include: {
          serviceAreas: true,
          availabilities: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
          certifications: { orderBy: { certType: 'asc' } },
        },
      });
      if (!row) throw new NotFoundError('照服員');

      return {
        data: {
          ...toAttendantDto(row),
          serviceAreas: row.serviceAreas,
          availabilities: row.availabilities,
          certifications: row.certifications,
        },
      };
    },
  );

  app.post(
    '/attendants',
    {
      preHandler: [app.requirePermission('attendant:write')],
      schema: {
        tags: ['attendant'],
        summary: '新增照服員',
        body: z.object({
          employeeNo: z.string().min(1),
          name: z.string().min(1),
          nationalId: z.string().optional(),
          phone: z.string().min(1),
          address: z.string().optional(),
          birthDate: z.string().optional(),
          gender: z.enum(['M', 'F', 'OTHER']).optional(),
          employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'HOURLY', 'DISPATCH']),
          hiredOn: z.string(),
          homeDistrict: z.string().optional(),
          primaryUnitId: z.string().optional(),
          maxDailyMinutes: z.number().int().optional(),
          maxWeeklyMinutes: z.number().int().optional(),
        }),
      },
    },
    async (req) => {
      const b = req.body;
      const created = await app.prisma.attendant.create({
        data: {
          orgId: req.user!.orgId,
          employeeNo: b.employeeNo,
          name: b.name,
          nationalIdEnc: encryptPii(b.nationalId),
          nationalIdBidx: blindIndex(b.nationalId),
          phone: b.phone,
          addressEnc: encryptPii(b.address),
          birthDate: b.birthDate ? new Date(b.birthDate) : null,
          gender: b.gender ?? null,
          employmentType: b.employmentType,
          hiredOn: new Date(b.hiredOn),
          homeDistrict: b.homeDistrict ?? null,
          primaryUnitId: b.primaryUnitId ?? null,
          ...(b.maxDailyMinutes ? { maxDailyMinutes: b.maxDailyMinutes } : {}),
          ...(b.maxWeeklyMinutes ? { maxWeeklyMinutes: b.maxWeeklyMinutes } : {}),
        },
      });
      return { data: toAttendantDto(created) };
    },
  );

  app.patch(
    '/attendants/:id',
    {
      preHandler: [app.requirePermission('attendant:write')],
      schema: {
        tags: ['attendant'],
        summary: '更新照服員',
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          status: z.enum(['ACTIVE', 'ON_LEAVE', 'RESIGNED']).optional(),
          resignedOn: z.string().nullable().optional(),
          employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'HOURLY', 'DISPATCH']).optional(),
          primaryUnitId: z.string().nullable().optional(),
          maxDailyMinutes: z.number().int().optional(),
          maxWeeklyMinutes: z.number().int().optional(),
          maxMonthlyOtMinutes: z.number().int().optional(),
        }),
      },
    },
    async (req) => {
      const existing = await app.prisma.attendant.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
      });
      if (!existing) throw new NotFoundError('照服員');

      const b = req.body;
      const updated = await app.prisma.attendant.update({
        where: { id: req.params.id },
        data: {
          ...(b.name !== undefined ? { name: b.name } : {}),
          ...(b.phone !== undefined ? { phone: b.phone } : {}),
          ...(b.address !== undefined ? { addressEnc: encryptPii(b.address) } : {}),
          ...(b.status !== undefined ? { status: b.status } : {}),
          ...(b.resignedOn !== undefined
            ? { resignedOn: b.resignedOn ? new Date(b.resignedOn) : null }
            : {}),
          ...(b.employmentType !== undefined ? { employmentType: b.employmentType } : {}),
          ...(b.primaryUnitId !== undefined ? { primaryUnitId: b.primaryUnitId } : {}),
          ...(b.maxDailyMinutes !== undefined ? { maxDailyMinutes: b.maxDailyMinutes } : {}),
          ...(b.maxWeeklyMinutes !== undefined ? { maxWeeklyMinutes: b.maxWeeklyMinutes } : {}),
          ...(b.maxMonthlyOtMinutes !== undefined
            ? { maxMonthlyOtMinutes: b.maxMonthlyOtMinutes }
            : {}),
        },
      });
      return { data: toAttendantDto(updated) };
    },
  );

  // ── 證照 ──────────────────────────────────────────────────────
  app.post(
    '/attendants/:id/certifications',
    {
      preHandler: [app.requirePermission('attendant:write')],
      schema: {
        tags: ['attendant'],
        summary: '新增證照',
        params: z.object({ id: z.string() }),
        body: z.object({
          certType: certTypeEnum,
          certNo: z.string().optional(),
          issuedOn: z.string().optional(),
          expiresOn: z.string().nullable().optional(),
        }),
      },
    },
    async (req) => {
      const created = await app.prisma.certification.create({
        data: {
          attendantId: req.params.id,
          certType: req.body.certType,
          certNo: req.body.certNo ?? null,
          issuedOn: req.body.issuedOn ? new Date(req.body.issuedOn) : null,
          expiresOn: req.body.expiresOn ? new Date(req.body.expiresOn) : null,
        },
      });
      return { data: created };
    },
  );

  app.delete(
    '/attendants/:id/certifications/:certId',
    {
      preHandler: [app.requirePermission('attendant:write')],
      schema: {
        tags: ['attendant'],
        summary: '刪除證照',
        params: z.object({ id: z.string(), certId: z.string() }),
      },
    },
    async (req) => {
      await app.prisma.certification.deleteMany({
        where: { id: req.params.certId, attendantId: req.params.id },
      });
      return { data: { ok: true } };
    },
  );

  /** 證照到期提醒 —— 儀表板使用 */
  app.get(
    '/attendants/expiring-certifications',
    {
      preHandler: [app.requirePermission('attendant:read')],
      schema: {
        tags: ['attendant'],
        summary: '即將到期或已到期的證照',
        querystring: z.object({ withinDays: z.coerce.number().int().default(60) }),
      },
    },
    async (req) => {
      const until = new Date(Date.now() + req.query.withinDays * 86_400_000);
      const rows = await app.prisma.certification.findMany({
        where: {
          expiresOn: { not: null, lte: until },
          attendant: { orgId: req.user!.orgId, status: { not: 'RESIGNED' } },
        },
        orderBy: { expiresOn: 'asc' },
        include: { attendant: { select: { id: true, name: true, employeeNo: true } } },
      });
      const now = new Date();
      return {
        data: rows.map((r) => ({
          ...r,
          expired: r.expiresOn != null && r.expiresOn < now,
        })),
      };
    },
  );

  // ── 服務區域與可服務時段（整批取代）────────────────────────────
  app.put(
    '/attendants/:id/service-areas',
    {
      preHandler: [app.requirePermission('attendant:write')],
      schema: {
        tags: ['attendant'],
        summary: '設定可服務區域',
        params: z.object({ id: z.string() }),
        body: z.object({
          areas: z.array(z.object({ districtCode: z.string(), priority: z.number().int().default(1) })),
        }),
      },
    },
    async (req) => {
      await app.prisma.$transaction([
        app.prisma.attendantServiceArea.deleteMany({ where: { attendantId: req.params.id } }),
        app.prisma.attendantServiceArea.createMany({
          data: req.body.areas.map((a) => ({ ...a, attendantId: req.params.id })),
        }),
      ]);
      return { data: { count: req.body.areas.length } };
    },
  );

  app.put(
    '/attendants/:id/availability',
    {
      preHandler: [app.requirePermission('attendant:write')],
      schema: {
        tags: ['attendant'],
        summary: '設定可服務時段',
        params: z.object({ id: z.string() }),
        body: z.object({
          windows: z.array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              startMinute: z.number().int().min(0).max(1440),
              endMinute: z.number().int().min(0).max(1440),
            }),
          ),
        }),
      },
    },
    async (req) => {
      for (const w of req.body.windows) {
        if (w.endMinute <= w.startMinute) {
          throw new Error(`結束時間必須晚於開始時間（週${w.weekday}）`);
        }
      }
      await app.prisma.$transaction([
        app.prisma.attendantAvailability.deleteMany({ where: { attendantId: req.params.id } }),
        app.prisma.attendantAvailability.createMany({
          data: req.body.windows.map((w) => ({ ...w, attendantId: req.params.id })),
        }),
      ]);
      return { data: { count: req.body.windows.length } };
    },
  );

  /**
   * 工時統計。
   * strict / loose / policy 三種算法並陳 —— 反映居服員趟間空檔是否計入工時的爭議。
   */
  app.get(
    '/attendants/:id/workload',
    {
      preHandler: [app.requirePermission('attendant:read')],
      schema: {
        tags: ['attendant'],
        summary: '工時統計（三種算法並陳）',
        params: z.object({ id: z.string() }),
        querystring: z.object({ from: z.string(), to: z.string() }),
      },
    },
    async (req) => {
      const policy = await app.prisma.orgPolicy.findUnique({
        where: { orgId: req.user!.orgId },
      });
      const threshold = policy?.idleGapCountsAsWorkThresholdMinutes ?? 60;

      const visits = await app.prisma.serviceVisit.findMany({
        where: {
          attendantId: req.params.id,
          serviceDate: { gte: new Date(req.query.from), lte: new Date(req.query.to) },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: { serviceDate: true, startAt: true, endAt: true },
        orderBy: { startAt: 'asc' },
      });

      const byDate = new Map<TaipeiDate, { startAt: Date; endAt: Date }[]>();
      for (const v of visits) {
        const d = toTaipeiDate(v.startAt);
        const arr = byDate.get(d) ?? [];
        arr.push({ startAt: v.startAt, endAt: v.endAt });
        byDate.set(d, arr);
      }

      const daily = [...byDate.entries()]
        .map(([date, list]) => ({
          date,
          visitCount: list.length,
          ...calcWorkMinutes(list, threshold),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const total = daily.reduce(
        (acc, d) => ({
          loose: acc.loose + d.loose,
          strict: acc.strict + d.strict,
          policy: acc.policy + d.policy,
        }),
        { loose: 0, strict: 0, policy: 0 },
      );

      return {
        data: {
          daily,
          total,
          visitCount: visits.length,
          note: 'loose = 僅服務時數；strict = 含所有趟間空檔；policy = 依機構設定門檻採計。三者並陳係因居服員趟間空檔是否為工時在實務上仍有爭議。',
        },
      };
    },
  );
};
