/**
 * 依服務日期解析當時生效的支付基準版本。
 *
 * 所有金額查詢都必須經過這裡 —— 直接抓「目前啟用的版本」會在
 * 公告改版後把歷史班次的金額算錯。
 */

import type { PaymentItemSnapshot } from '@ltc/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { NotFoundError } from './errors.js';

/** 取得指定日期生效的支付基準版本 id */
export async function resolveScheduleId(
  prisma: PrismaClient,
  serviceDate: Date,
): Promise<string> {
  const schedule = await prisma.paymentSchedule.findFirst({
    where: {
      effectiveFrom: { lte: serviceDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: serviceDate } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { id: true },
  });

  if (!schedule) {
    throw new NotFoundError(
      `${serviceDate.toISOString().slice(0, 10)} 生效的長照支付基準版本（請先匯入支付基準）`,
    );
  }
  return schedule.id;
}

/** 取得指定日期生效的支付項目對照表，供衝突檢核引擎使用 */
export async function loadPaymentItems(
  prisma: PrismaClient,
  serviceDate: Date,
): Promise<Map<string, PaymentItemSnapshot>> {
  const scheduleId = await resolveScheduleId(prisma, serviceDate);
  const items = await prisma.paymentItem.findMany({
    where: { scheduleId, isActive: true },
  });

  return new Map(
    items.map((i) => [
      i.code,
      {
        code: i.code,
        name: i.name,
        category: i.category,
        price: i.price,
        priceRemote: i.priceRemote,
        maxPerDay: i.maxPerDay,
        maxPerMonth: i.maxPerMonth,
        isAddOn: i.isAddOn,
        requiredCerts: i.requiredCerts,
      } satisfies PaymentItemSnapshot,
    ]),
  );
}

/** 取得某 CMS 等級在指定日期的月給付額度 */
export async function resolveMonthlyQuota(
  prisma: PrismaClient,
  serviceDate: Date,
  cmsLevel: number,
  category: 'CARE_PROFESSIONAL' | 'TRANSPORT' | 'ASSISTIVE_DEVICE' | 'RESPITE' = 'CARE_PROFESSIONAL',
): Promise<number> {
  const scheduleId = await resolveScheduleId(prisma, serviceDate);
  const quota = await prisma.cmsQuota.findUnique({
    where: { scheduleId_cmsLevel_category: { scheduleId, cmsLevel, category } },
  });
  if (!quota) throw new NotFoundError(`CMS ${cmsLevel} 級的${category}月給付額度設定`);
  return quota.monthlyAmount;
}

/** 取得某身分別在指定日期的部分負擔比率（千分比） */
export async function resolveCopayRate(
  prisma: PrismaClient,
  serviceDate: Date,
  copayCategory: 'GENERAL' | 'LOW_MID_INCOME' | 'LOW_INCOME',
  category: 'CARE_PROFESSIONAL' | 'TRANSPORT' | 'ASSISTIVE_DEVICE' | 'RESPITE' = 'CARE_PROFESSIONAL',
): Promise<number> {
  const scheduleId = await resolveScheduleId(prisma, serviceDate);
  const rate = await prisma.copayRate.findUnique({
    where: {
      scheduleId_copayCategory_category: { scheduleId, copayCategory, category },
    },
  });
  if (!rate) throw new NotFoundError(`${copayCategory} 的${category}部分負擔比率設定`);
  return rate.ratePermille;
}
