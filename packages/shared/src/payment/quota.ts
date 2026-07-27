/**
 * 月給付額度使用計算。
 *
 * 各給付類別（照顧及專業服務／交通接送／輔具／喘息）各有獨立額度池，互不流用，
 * 因此用量統計必須 by category。Phase 1 只實作 CARE_PROFESSIONAL。
 */

import type { PaymentCategory, RemoteAreaTier, RoundingMode } from '../domain/enums.js';
import { calcCopay, type CopayResult } from './copay.js';

/** 支付項目的計價相關欄位（來自 PaymentItem，依服務日期解析出的版本） */
export interface PaymentItemPricing {
  code: string;
  category: PaymentCategory;
  price: number;
  /** 原民區或離島支付價格（附表四第二價格欄）。缺值時退回 price。 */
  priceRemote?: number | null;
  maxPerDay?: number | null;
  maxPerMonth?: number | null;
  isAddOn: boolean;
  /** 是否計入額度。預設所有項目皆計入。 */
  countsToQuota?: boolean;
}

/**
 * 取得某個案適用的單價。
 *
 * 個案位於原住民地區或離島時採第二價格欄；該欄缺值則退回一般價格。
 */
export function resolveUnitPrice(item: PaymentItemPricing, tier: RemoteAreaTier): number {
  if (tier === 'NONE') return item.price;
  return item.priceRemote ?? item.price;
}

export interface QuotaLineInput {
  item: PaymentItemPricing;
  quantity: number;
}

export interface MonthQuotaInput {
  /** 核定月額度，元（CarePlan.monthlyQuota 快照） */
  approvedQuota: number;
  /** 本月已排班的項目（不含 CANCELLED / NO_SHOW 的班次） */
  lines: readonly QuotaLineInput[];
  remoteAreaTier: RemoteAreaTier;
  ratePermille: number;
  roundingMode?: RoundingMode;
  /** 僅統計此類別。省略則統計全部。 */
  category?: PaymentCategory;
}

export interface MonthQuotaResult {
  approvedQuota: number;
  scheduledAmount: number;
  remainingQuota: number;
  overQuotaAmount: number;
  /** 使用率。approvedQuota 為 0 時回傳 0，避免除以零。 */
  utilizationRate: number;
  copay: CopayResult;
  /** 各支付代碼的次數與金額小計 */
  byCode: Record<string, { quantity: number; amount: number }>;
}

/** 計算單一項目的金額。 */
export function calcLineAmount(
  item: PaymentItemPricing,
  quantity: number,
  tier: RemoteAreaTier,
): number {
  return resolveUnitPrice(item, tier) * Math.max(0, quantity);
}

/**
 * 計算某個案某月的額度使用情形與部分負擔試算。
 */
export function calcMonthQuota(input: MonthQuotaInput): MonthQuotaResult {
  const {
    approvedQuota,
    lines,
    remoteAreaTier,
    ratePermille,
    roundingMode = 'HALF_UP',
    category,
  } = input;

  const byCode: Record<string, { quantity: number; amount: number }> = {};
  let scheduledAmount = 0;

  for (const line of lines) {
    if (category && line.item.category !== category) continue;

    const amount = calcLineAmount(line.item, line.quantity, remoteAreaTier);
    const bucket = (byCode[line.item.code] ??= { quantity: 0, amount: 0 });
    bucket.quantity += line.quantity;
    bucket.amount += amount;

    // countsToQuota 未指定時預設計入
    if (line.item.countsToQuota !== false) scheduledAmount += amount;
  }

  const safeQuota = Math.max(0, approvedQuota);

  return {
    approvedQuota: safeQuota,
    scheduledAmount,
    remainingQuota: Math.max(0, safeQuota - scheduledAmount),
    overQuotaAmount: Math.max(0, scheduledAmount - safeQuota),
    utilizationRate: safeQuota === 0 ? 0 : scheduledAmount / safeQuota,
    copay: calcCopay({ scheduledAmount, approvedQuota: safeQuota, ratePermille, roundingMode }),
    byCode,
  };
}
