/**
 * 把 DB 資料組裝成衝突檢核引擎所需的 ConflictContext。
 *
 * 引擎本身是純函式（packages/shared），組裝資料是呼叫端的責任 ——
 * 後端用 Prisma、前端用 React Query 快取，兩邊組出同樣形狀的輸入，
 * 跑同一份規則實作。這是前後端檢核結果不會漂移的關鍵。
 */

import {
  addTaipeiDays,
  buildDistrictIndex,
  taipeiMonthOf,
  toTaipeiDate,
  startOfTaipeiWeek,
  type ConflictContext,
  type DistrictInfo,
  type OrgPolicy,
  type VisitDraft,
} from '@ltc/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { NotFoundError } from './errors.js';
import { loadPaymentItems, resolveCopayRate } from './payment-resolve.js';
import districtsJson from '../../prisma/seed/taipei-districts.json' with { type: 'json' };

const DISTRICT_INDEX = buildDistrictIndex(districtsJson.districts as DistrictInfo[]);

/** 衝突檢核需要往前後各看 10 日，才足以判斷週工時與七休一 */
const WINDOW_DAYS = 10;

export async function buildConflictContext(
  prisma: PrismaClient,
  orgId: string,
  candidate: VisitDraft,
  now = new Date(),
): Promise<ConflictContext> {
  const policyRow = await prisma.orgPolicy.findUnique({ where: { orgId } });
  if (!policyRow) throw new NotFoundError('機構政策設定');

  const orgPolicy: OrgPolicy = {
    normalDailyMinutes: policyRow.normalDailyMinutes,
    maxDailyMinutes: policyRow.maxDailyMinutes,
    normalWeeklyMinutes: policyRow.normalWeeklyMinutes,
    monthlyOtMode: policyRow.monthlyOtMode,
    monthlyOtMinutes: policyRow.monthlyOtMinutes,
    flexOtMonthMinutes: policyRow.flexOtMonthMinutes,
    flexOtQuarterMinutes: policyRow.flexOtQuarterMinutes,
    restBreakAfterMinutes: policyRow.restBreakAfterMinutes,
    restBreakMinutes: policyRow.restBreakMinutes,
    minShiftGapMinutes: policyRow.minShiftGapMinutes,
    enforceSevenDayRest: policyRow.enforceSevenDayRest,
    idleGapCountsAsWorkThresholdMinutes: policyRow.idleGapCountsAsWorkThresholdMinutes,
    travel: {
      detourFactor: policyRow.detourFactor,
      speedKmhUrbanCore: policyRow.speedKmhUrbanCore,
      speedKmhUrban: policyRow.speedKmhUrban,
      speedKmhSuburban: policyRow.speedKmhSuburban,
      parkingBufferMinutes: policyRow.parkingBufferMinutes,
      sameDistrictMinutes: policyRow.sameDistrictMinutes,
      adjacentDistrictMinutes: policyRow.adjacentDistrictMinutes,
      farDistrictMinutes: policyRow.farDistrictMinutes,
    },
    roundingMode: policyRow.roundingMode,
  };

  const serviceDate = candidate.serviceDate;
  const windowFrom = new Date(`${addTaipeiDays(serviceDate, -WINDOW_DAYS)}T00:00:00Z`);
  const windowTo = new Date(`${addTaipeiDays(serviceDate, WINDOW_DAYS)}T00:00:00Z`);
  const dateObj = new Date(`${serviceDate}T00:00:00Z`);

  const recipientRow = await prisma.careRecipient.findFirst({
    where: { id: candidate.recipientId, orgId },
    include: {
      unavailability: true,
      carePlans: { include: { items: true }, orderBy: { effectiveFrom: 'desc' } },
    },
  });
  if (!recipientRow) throw new NotFoundError('個案');

  const attendantRow = candidate.attendantId
    ? await prisma.attendant.findFirst({
        where: { id: candidate.attendantId, orgId },
        include: { certifications: true, serviceAreas: true, availabilities: true },
      })
    : null;
  if (candidate.attendantId && !attendantRow) throw new NotFoundError('照服員');

  const [attendantVisits, recipientVisitsOnDate, recipientVisitsInMonth, leaves] =
    await Promise.all([
      candidate.attendantId
        ? prisma.serviceVisit.findMany({
            where: {
              attendantId: candidate.attendantId,
              serviceDate: { gte: windowFrom, lte: windowTo },
            },
            include: {
              items: { select: { code: true, quantity: true } },
              recipient: { select: { districtCode: true, lat: true, lng: true } },
            },
          })
        : Promise.resolve([]),
      prisma.serviceVisit.findMany({
        where: { recipientId: candidate.recipientId, serviceDate: dateObj },
        include: {
          items: { select: { code: true, quantity: true } },
          recipient: { select: { districtCode: true, lat: true, lng: true } },
        },
      }),
      prisma.serviceVisit.findMany({
        where: {
          recipientId: candidate.recipientId,
          serviceDate: {
            gte: new Date(`${taipeiMonthOf(serviceDate)}-01T00:00:00Z`),
            lte: new Date(`${addTaipeiDays(`${taipeiMonthOf(serviceDate)}-01`, 31)}T00:00:00Z`),
          },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        include: { items: { select: { code: true, quantity: true } } },
      }),
      candidate.attendantId
        ? prisma.leaveRequest.findMany({
            where: {
              attendantId: candidate.attendantId,
              status: 'APPROVED',
              startAt: { lte: candidate.endAt },
              endAt: { gte: candidate.startAt },
            },
          })
        : Promise.resolve([]),
    ]);

  const paymentItems = await loadPaymentItems(prisma, dateObj);

  // 本月用量（排除候選班次自身）
  const weekStart = startOfTaipeiWeek(serviceDate);
  const weekEnd = addTaipeiDays(weekStart, 6);
  const countByCode: Record<string, number> = {};
  const weekCountByCode: Record<string, number> = {};
  let scheduledAmount = 0;

  const monthVisitsWithItems = await prisma.serviceVisit.findMany({
    where: {
      recipientId: candidate.recipientId,
      serviceDate: {
        gte: new Date(`${taipeiMonthOf(serviceDate)}-01T00:00:00Z`),
        lte: new Date(`${addTaipeiDays(`${taipeiMonthOf(serviceDate)}-01`, 31)}T00:00:00Z`),
      },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      ...(candidate.id ? { NOT: { id: candidate.id } } : {}),
    },
    include: { items: true },
  });

  for (const v of monthVisitsWithItems) {
    const vDate = toTaipeiDate(v.startAt);
    for (const it of v.items) {
      countByCode[it.code] = (countByCode[it.code] ?? 0) + it.quantity;
      if (vDate >= weekStart && vDate <= weekEnd) {
        weekCountByCode[it.code] = (weekCountByCode[it.code] ?? 0) + it.quantity;
      }
      scheduledAmount += it.amount;
    }
  }

  const activePlan = recipientRow.carePlans.find((p) => p.status === 'ACTIVE');
  const ratePermille = await resolveCopayRate(
    prisma,
    dateObj,
    activePlan?.copayCategory ?? recipientRow.copayCategory,
  );

  return {
    candidate,
    attendant: attendantRow
      ? {
          id: attendantRow.id,
          name: attendantRow.name,
          status: attendantRow.status,
          hiredOn: toTaipeiDate(attendantRow.hiredOn),
          resignedOn: attendantRow.resignedOn ? toTaipeiDate(attendantRow.resignedOn) : null,
          certifications: attendantRow.certifications.map((c) => ({
            certType: c.certType,
            expiresOn: c.expiresOn ? toTaipeiDate(c.expiresOn) : null,
          })),
          serviceAreas: attendantRow.serviceAreas.map((a) => a.districtCode),
          availabilities: attendantRow.availabilities.map((a) => ({
            weekday: a.weekday,
            startMinute: a.startMinute,
            endMinute: a.endMinute,
          })),
          maxDailyMinutes: attendantRow.maxDailyMinutes,
          maxWeeklyMinutes: attendantRow.maxWeeklyMinutes,
          maxMonthlyOtMinutes: attendantRow.maxMonthlyOtMinutes,
          homeDistrict: attendantRow.homeDistrict,
          homeCoords:
            attendantRow.homeLat != null && attendantRow.homeLng != null
              ? { lat: attendantRow.homeLat, lng: attendantRow.homeLng }
              : null,
        }
      : null,
    recipient: {
      id: recipientRow.id,
      name: recipientRow.name,
      status: recipientRow.status,
      districtCode: recipientRow.districtCode,
      coords:
        recipientRow.lat != null && recipientRow.lng != null
          ? { lat: recipientRow.lat, lng: recipientRow.lng }
          : null,
      serviceStartOn: toTaipeiDate(recipientRow.serviceStartOn),
      serviceEndOn: recipientRow.serviceEndOn ? toTaipeiDate(recipientRow.serviceEndOn) : null,
      remoteAreaTier: recipientRow.remoteAreaTier,
      unavailability: recipientRow.unavailability.map((u) => ({
        weekday: u.weekday,
        specificDate: u.specificDate ? toTaipeiDate(u.specificDate) : null,
        startMinute: u.startMinute,
        endMinute: u.endMinute,
        reason: u.reason,
      })),
      carePlans: recipientRow.carePlans.map((p) => ({
        id: p.id,
        status: p.status,
        effectiveFrom: toTaipeiDate(p.effectiveFrom),
        effectiveTo: p.effectiveTo ? toTaipeiDate(p.effectiveTo) : null,
        monthlyQuota: p.monthlyQuota,
        items: p.items.map((i) => ({
          code: i.code,
          approvedPerMonth: i.approvedPerMonth,
          approvedPerWeek: i.approvedPerWeek,
        })),
      })),
    },
    attendantVisitsInWindow: attendantVisits.map((v) => ({
      id: v.id,
      recipientId: v.recipientId,
      attendantId: v.attendantId,
      serviceDate: toTaipeiDate(v.startAt),
      startAt: v.startAt,
      endAt: v.endAt,
      status: v.status,
      districtCode: v.recipient.districtCode,
      coords: v.recipient.lat != null && v.recipient.lng != null
        ? { lat: v.recipient.lat, lng: v.recipient.lng }
        : null,
      items: v.items,
    })),
    recipientVisitsOnDate: recipientVisitsOnDate.map((v) => ({
      id: v.id,
      recipientId: v.recipientId,
      attendantId: v.attendantId,
      serviceDate: toTaipeiDate(v.startAt),
      startAt: v.startAt,
      endAt: v.endAt,
      status: v.status,
      districtCode: v.recipient.districtCode,
      coords: null,
      items: v.items,
    })),
    recipientVisitsInMonth: recipientVisitsInMonth.map((v) => ({
      id: v.id,
      recipientId: v.recipientId,
      attendantId: v.attendantId,
      serviceDate: toTaipeiDate(v.startAt),
      startAt: v.startAt,
      endAt: v.endAt,
      status: v.status,
      items: v.items,
    })),
    approvedLeaves: leaves.map((l) => ({
      id: l.id,
      startAt: l.startAt,
      endAt: l.endAt,
      approved: l.status === 'APPROVED',
    })),
    monthUsage: { countByCode, weekCountByCode, scheduledAmount, ratePermille },
    paymentItems,
    districts: DISTRICT_INDEX,
    orgPolicy,
    now,
  };
}
