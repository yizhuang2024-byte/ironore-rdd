import { describe, expect, it } from 'vitest';
import { calcLineAmount, calcMonthQuota, resolveUnitPrice, type PaymentItemPricing } from './quota.js';

// 測試夾具。價格數值僅供測試，正式資料由機構匯入官方公告 CSV。
const BA01: PaymentItemPricing = {
  code: 'BA01',
  category: 'CARE_PROFESSIONAL',
  price: 260,
  priceRemote: 312,
  maxPerDay: 1,
  isAddOn: false,
};
const BA02: PaymentItemPricing = {
  code: 'BA02',
  category: 'CARE_PROFESSIONAL',
  price: 195,
  priceRemote: null,
  isAddOn: false,
};
const TRANSPORT: PaymentItemPricing = {
  code: 'D01',
  category: 'TRANSPORT',
  price: 100,
  isAddOn: false,
};

describe('resolveUnitPrice — 原民區／離島雙價格', () => {
  it('一般地區採第一價格欄', () => {
    expect(resolveUnitPrice(BA01, 'NONE')).toBe(260);
  });

  it('偏遠地區採第二價格欄', () => {
    expect(resolveUnitPrice(BA01, 'REMOTE')).toBe(312);
    expect(resolveUnitPrice(BA01, 'MOUNTAIN_ISLAND')).toBe(312);
  });

  it('第二價格欄缺值時退回一般價格', () => {
    expect(resolveUnitPrice(BA02, 'MOUNTAIN_ISLAND')).toBe(195);
  });
});

describe('calcLineAmount', () => {
  it('單價 × 次數', () => {
    expect(calcLineAmount(BA01, 4, 'NONE')).toBe(1_040);
  });

  it('偏遠地區以第二價格計算', () => {
    expect(calcLineAmount(BA01, 4, 'REMOTE')).toBe(1_248);
  });

  it('負數次數視為 0', () => {
    expect(calcLineAmount(BA01, -3, 'NONE')).toBe(0);
  });
});

describe('calcMonthQuota', () => {
  it('彙總各代碼次數與金額', () => {
    const r = calcMonthQuota({
      approvedQuota: 20_000,
      remoteAreaTier: 'NONE',
      ratePermille: 160,
      lines: [
        { item: BA01, quantity: 10 }, // 2,600
        { item: BA02, quantity: 20 }, // 3,900
        { item: BA01, quantity: 5 }, // 1,300（同代碼應累加）
      ],
    });
    expect(r.byCode['BA01']).toEqual({ quantity: 15, amount: 3_900 });
    expect(r.byCode['BA02']).toEqual({ quantity: 20, amount: 3_900 });
    expect(r.scheduledAmount).toBe(7_800);
    expect(r.remainingQuota).toBe(12_200);
    expect(r.overQuotaAmount).toBe(0);
  });

  it('使用率計算', () => {
    const r = calcMonthQuota({
      approvedQuota: 10_000,
      remoteAreaTier: 'NONE',
      ratePermille: 160,
      lines: [{ item: BA02, quantity: 20 }], // 3,900
    });
    expect(r.utilizationRate).toBeCloseTo(0.39, 5);
  });

  it('額度為 0 時使用率為 0，不除以零', () => {
    const r = calcMonthQuota({
      approvedQuota: 0,
      remoteAreaTier: 'NONE',
      ratePermille: 160,
      lines: [{ item: BA02, quantity: 1 }],
    });
    expect(r.utilizationRate).toBe(0);
    expect(Number.isFinite(r.utilizationRate)).toBe(true);
    expect(r.overQuotaAmount).toBe(195);
  });

  it('超出額度時計算超額金額並串接部分負擔', () => {
    const r = calcMonthQuota({
      approvedQuota: 3_000,
      remoteAreaTier: 'NONE',
      ratePermille: 160,
      lines: [{ item: BA01, quantity: 20 }], // 5,200
    });
    expect(r.scheduledAmount).toBe(5_200);
    expect(r.overQuotaAmount).toBe(2_200);
    expect(r.remainingQuota).toBe(0);
    expect(r.copay.copayWithinQuota).toBe(480); // 3,000 × 16%
    expect(r.copay.overQuotaSelfPay).toBe(2_200);
    expect(r.copay.totalSelfPay).toBe(2_680);
  });

  it('★ 各給付類別額度池互不流用 —— category 篩選', () => {
    const lines = [
      { item: BA01, quantity: 10 }, // 照顧及專業服務 2,600
      { item: TRANSPORT, quantity: 10 }, // 交通接送 1,000
    ];
    const careOnly = calcMonthQuota({
      approvedQuota: 20_000,
      remoteAreaTier: 'NONE',
      ratePermille: 160,
      lines,
      category: 'CARE_PROFESSIONAL',
    });
    expect(careOnly.scheduledAmount).toBe(2_600);
    expect(careOnly.byCode['D01']).toBeUndefined();

    const transportOnly = calcMonthQuota({
      approvedQuota: 2_000,
      remoteAreaTier: 'NONE',
      ratePermille: 160,
      lines,
      category: 'TRANSPORT',
    });
    expect(transportOnly.scheduledAmount).toBe(1_000);
    expect(transportOnly.byCode['BA01']).toBeUndefined();
  });

  it('countsToQuota = false 的項目計金額但不佔額度', () => {
    const nonQuota: PaymentItemPricing = { ...BA02, code: 'X99', countsToQuota: false };
    const r = calcMonthQuota({
      approvedQuota: 10_000,
      remoteAreaTier: 'NONE',
      ratePermille: 160,
      lines: [
        { item: BA01, quantity: 10 }, // 2,600 計入
        { item: nonQuota, quantity: 10 }, // 1,950 不計入額度
      ],
    });
    expect(r.scheduledAmount).toBe(2_600);
    expect(r.byCode['X99']).toEqual({ quantity: 10, amount: 1_950 });
  });

  it('偏遠地區個案整體以第二價格結算', () => {
    const r = calcMonthQuota({
      approvedQuota: 20_000,
      remoteAreaTier: 'MOUNTAIN_ISLAND',
      ratePermille: 160,
      lines: [{ item: BA01, quantity: 10 }],
    });
    expect(r.scheduledAmount).toBe(3_120); // 312 × 10
  });

  it('無任何項目時回傳零值', () => {
    const r = calcMonthQuota({
      approvedQuota: 20_000,
      remoteAreaTier: 'NONE',
      ratePermille: 160,
      lines: [],
    });
    expect(r.scheduledAmount).toBe(0);
    expect(r.remainingQuota).toBe(20_000);
    expect(r.copay.totalSelfPay).toBe(0);
    expect(r.byCode).toEqual({});
  });
});
