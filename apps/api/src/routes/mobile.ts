/**
 * 照服員行動端（PWA）專用端點。
 *
 * 個資最小化在此強制執行：回傳的個案資訊只含「去哪裡、找誰、做什麼、要注意什麼」，
 * 絕不含身分證字號、完整病史或其他個案。這是獨立的 serializer，
 * 不是把管理端 DTO 拿來刪欄位 —— 後者遲早會在某次改動中漏掉一個欄位。
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { calcWorkMinutes, diffTaipeiDays, toTaipeiDate, type TaipeiDate } from '@ltc/shared';
import { NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { toMobileRecipientDto } from '../lib/dto.js';

export const mobileRoutes: FastifyPluginAsyncZod = async (app) => {
  /** 取得目前登入者的照服員 id；非照服員則拒絕 */
  function requireAttendantId(req: { user?: { attendantId: string | null } }): string {
    const id = req.user?.attendantId;
    if (!id) throw new UnauthorizedError('此端點僅供照服員使用');
    return id;
  }

  app.get(
    '/m/visits',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['mobile'],
        summary: '我的班表',
        querystring: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const attendantId = requireAttendantId(req);
      const today = toTaipeiDate(new Date());
      const from = (req.query.from ?? today) as TaipeiDate;
      const to = (req.query.to ?? today) as TaipeiDate;

      if (diffTaipeiDays(from, to) > 62) {
        throw new Error('查詢區間上限為 62 天');
      }

      const visits = await app.prisma.serviceVisit.findMany({
        where: {
          attendantId,
          serviceDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
          status: { notIn: ['CANCELLED'] },
        },
        orderBy: { startAt: 'asc' },
        include: {
          recipient: true,
          items: { include: { paymentItem: { select: { name: true, standardMinutes: true } } } },
        },
      });

      return {
        data: visits.map((v) => ({
          id: v.id,
          serviceDate: toTaipeiDate(v.startAt),
          startAt: v.startAt,
          endAt: v.endAt,
          plannedMinutes: v.plannedMinutes,
          status: v.status,
          recipient: toMobileRecipientDto(v.recipient),
          items: v.items.map((i) => ({
            code: i.code,
            name: i.paymentItem.name,
            quantity: i.quantity,
            standardMinutes: i.paymentItem.standardMinutes,
          })),
        })),
        meta: { from, to, count: visits.length, syncedAt: new Date().toISOString() },
      };
    },
  );

  app.get(
    '/m/visits/:id',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['mobile'],
        summary: '單趟詳情',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const attendantId = requireAttendantId(req);
      const v = await app.prisma.serviceVisit.findFirst({
        // 只能看指派給自己的班次
        where: { id: req.params.id, attendantId },
        include: {
          recipient: { include: { contacts: { where: { isPrimary: true } } } },
          items: { include: { paymentItem: true } },
        },
      });
      if (!v) throw new NotFoundError('班次');

      return {
        data: {
          id: v.id,
          serviceDate: toTaipeiDate(v.startAt),
          startAt: v.startAt,
          endAt: v.endAt,
          plannedMinutes: v.plannedMinutes,
          status: v.status,
          recipient: {
            ...toMobileRecipientDto(v.recipient),
            emergencyContact: v.recipient.contacts[0]
              ? {
                  name: v.recipient.contacts[0].name,
                  relation: v.recipient.contacts[0].relation,
                  phone: v.recipient.contacts[0].phone,
                }
              : null,
          },
          items: v.items.map((i) => ({
            code: i.code,
            name: i.paymentItem.name,
            description: i.paymentItem.description,
            quantity: i.quantity,
          })),
        },
      };
    },
  );

  app.get(
    '/m/profile',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['mobile'], summary: '我的資料與證照到期提醒' },
    },
    async (req) => {
      const attendantId = requireAttendantId(req);
      const att = await app.prisma.attendant.findUniqueOrThrow({
        where: { id: attendantId },
        include: {
          certifications: { orderBy: { expiresOn: 'asc' } },
          serviceAreas: true,
          availabilities: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
        },
      });

      const now = new Date();
      const soon = new Date(Date.now() + 60 * 86_400_000);

      return {
        data: {
          id: att.id,
          employeeNo: att.employeeNo,
          name: att.name,
          phone: att.phone,
          employmentType: att.employmentType,
          hiredOn: att.hiredOn,
          serviceAreas: att.serviceAreas.map((a) => a.districtCode),
          availabilities: att.availabilities,
          certifications: att.certifications.map((c) => ({
            certType: c.certType,
            certNo: c.certNo,
            expiresOn: c.expiresOn,
            expired: c.expiresOn != null && c.expiresOn < now,
            expiringSoon: c.expiresOn != null && c.expiresOn >= now && c.expiresOn <= soon,
          })),
        },
      };
    },
  );

  app.get(
    '/m/workload',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['mobile'],
        summary: '我的本月工時',
        querystring: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
      },
    },
    async (req) => {
      const attendantId = requireAttendantId(req);
      const month = req.query.month ?? toTaipeiDate(new Date()).slice(0, 7);
      const [y, m] = month.split('-').map(Number);

      const policy = await app.prisma.orgPolicy.findUnique({ where: { orgId: req.user!.orgId } });
      const visits = await app.prisma.serviceVisit.findMany({
        where: {
          attendantId,
          serviceDate: { gte: new Date(Date.UTC(y!, m! - 1, 1)), lte: new Date(Date.UTC(y!, m!, 0)) },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: { startAt: true, endAt: true },
      });

      const byDate = new Map<string, { startAt: Date; endAt: Date }[]>();
      for (const v of visits) {
        const d = toTaipeiDate(v.startAt);
        byDate.set(d, [...(byDate.get(d) ?? []), v]);
      }
      const threshold = policy?.idleGapCountsAsWorkThresholdMinutes ?? 60;
      const total = [...byDate.values()].reduce(
        (acc, list) => {
          const w = calcWorkMinutes(list, threshold);
          return {
            loose: acc.loose + w.loose,
            strict: acc.strict + w.strict,
            policy: acc.policy + w.policy,
          };
        },
        { loose: 0, strict: 0, policy: 0 },
      );

      return {
        data: { month, visitCount: visits.length, workDays: byDate.size, ...total },
      };
    },
  );

  app.get(
    '/m/leaves',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['mobile'], summary: '我的請假紀錄' },
    },
    async (req) => {
      const attendantId = requireAttendantId(req);
      return {
        data: await app.prisma.leaveRequest.findMany({
          where: { attendantId },
          orderBy: { startAt: 'desc' },
          take: 50,
        }),
      };
    },
  );

  /**
   * 增量同步端點。
   * Phase 1 只讀；Phase 2 的打卡回報會沿用同樣的形狀加上寫入佇列。
   */
  app.get(
    '/m/sync',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['mobile'],
        summary: '增量同步（Phase 2 打卡沿用）',
        querystring: z.object({ since: z.string().optional() }),
      },
    },
    async (req) => {
      const attendantId = requireAttendantId(req);
      const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 7 * 86_400_000);

      const visits = await app.prisma.serviceVisit.findMany({
        where: { attendantId, updatedAt: { gt: since } },
        orderBy: { updatedAt: 'asc' },
        take: 500,
        include: { recipient: true, items: { select: { code: true, quantity: true } } },
      });

      return {
        data: {
          syncedAt: new Date().toISOString(),
          visits: visits.map((v) => ({
            id: v.id,
            serviceDate: toTaipeiDate(v.startAt),
            startAt: v.startAt,
            endAt: v.endAt,
            status: v.status,
            updatedAt: v.updatedAt,
            recipient: toMobileRecipientDto(v.recipient),
            items: v.items,
          })),
        },
      };
    },
  );
};
