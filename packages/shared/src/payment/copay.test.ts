import { describe, expect, it } from 'vitest';
import { calcCopay, roundAmount } from './copay.js';

// 常用比率（千分比）。實際值來自 DB 的 CopayRate 表，此處僅為測試夾具。
const GENERAL = 160; // 一般戶 16%
const LOW_MID = 50; // 中低收入戶 5%
const LOW = 0; // 低收入戶 0%

describe('calcCopay — 額度內', () => {
  it('一般戶 16%', () => {
    const r = calcCopay({ scheduledAmount: 10_000, approvedQuota: 20_000, ratePermille: GENERAL });
    expect(r.withinQuotaAmount).toBe(10_000);
    expect(r.copayWithinQuota).toBe(1_600);
    expect(r.govSubsidy).toBe(8_400);
    expect(r.overQuotaSelfPay).toBe(0);
    expect(r.totalSelfPay).toBe(1_600);
  });

  it('中低收入戶 5%', () => {
    const r = calcCopay({ scheduledAmount: 10_000, approvedQuota: 20_000, ratePermille: LOW_MID });
    expect(r.copayWithinQuota).toBe(500);
    expect(r.govSubsidy).toBe(9_500);
    expect(r.totalSelfPay).toBe(500);
  });

  it('低收入戶 0% —— 額度內完全不需自付', () => {
    const r = calcCopay({ scheduledAmount: 10_000, approvedQuota: 20_000, ratePermille: LOW });
    expect(r.copayWithinQuota).toBe(0);
    expect(r.govSubsidy).toBe(10_000);
    expect(r.totalSelfPay).toBe(0);
  });

  it('金額剛好等於額度 —— 邊界值', () => {
    const r = calcCopay({ scheduledAmount: 20_000, approvedQuota: 20_000, ratePermille: GENERAL });
    expect(r.withinQuotaAmount).toBe(20_000);
    expect(r.overQuotaSelfPay).toBe(0);
    expect(r.totalSelfPay).toBe(3_200);
  });
});

describe('calcCopay — 超出額度', () => {
  it('一般戶超額：額度內 16% + 超額 100%', () => {
    const r = calcCopay({ scheduledAmount: 25_000, approvedQuota: 20_000, ratePermille: GENERAL });
    expect(r.withinQuotaAmount).toBe(20_000);
    expect(r.copayWithinQuota).toBe(3_200);
    expect(r.govSubsidy).toBe(16_800);
    expect(r.overQuotaSelfPay).toBe(5_000);
    expect(r.totalSelfPay).toBe(8_200);
  });

  it('★ 低收入戶超額：部分負擔為 0，但超額仍須全額自付', () => {
    // 這是實務上最常算錯的地方 —— 低收入戶不是「完全免費」，
    // 一旦服務超出核定額度，超額部分仍須 100% 自費。
    const r = calcCopay({ scheduledAmount: 25_000, approvedQuota: 20_000, ratePermille: LOW });
    expect(r.copayWithinQuota).toBe(0);
    expect(r.govSubsidy).toBe(20_000);
    expect(r.overQuotaSelfPay).toBe(5_000);
    expect(r.totalSelfPay).toBe(5_000);
  });

  it('中低收入戶超額', () => {
    const r = calcCopay({ scheduledAmount: 25_000, approvedQuota: 20_000, ratePermille: LOW_MID });
    expect(r.copayWithinQuota).toBe(1_000);
    expect(r.overQuotaSelfPay).toBe(5_000);
    expect(r.totalSelfPay).toBe(6_000);
  });
});

describe('calcCopay — 邊界與防呆', () => {
  it('額度為 0 時全部自費', () => {
    const r = calcCopay({ scheduledAmount: 5_000, approvedQuota: 0, ratePermille: GENERAL });
    expect(r.withinQuotaAmount).toBe(0);
    expect(r.copayWithinQuota).toBe(0);
    expect(r.overQuotaSelfPay).toBe(5_000);
    expect(r.totalSelfPay).toBe(5_000);
  });

  it('未排任何服務時全為 0', () => {
    const r = calcCopay({ scheduledAmount: 0, approvedQuota: 20_000, ratePermille: GENERAL });
    expect(r.totalSelfPay).toBe(0);
    expect(r.govSubsidy).toBe(0);
  });

  it('負數金額視為 0，不產生負的自付額', () => {
    const r = calcCopay({ scheduledAmount: -100, approvedQuota: 20_000, ratePermille: GENERAL });
    expect(r.totalSelfPay).toBe(0);
    expect(r.overQuotaSelfPay).toBe(0);
  });

  it('比率超出 0–1000 範圍時拋錯', () => {
    expect(() =>
      calcCopay({ scheduledAmount: 100, approvedQuota: 100, ratePermille: 1001 }),
    ).toThrow(/超出範圍/);
    expect(() => calcCopay({ scheduledAmount: 100, approvedQuota: 100, ratePermille: -1 })).toThrow(
      /超出範圍/,
    );
  });

  it('政府補助 + 民眾自付（額度內）恆等於額度內金額', () => {
    for (const amount of [1, 999, 10_001, 19_999]) {
      const r = calcCopay({ scheduledAmount: amount, approvedQuota: 20_000, ratePermille: GENERAL });
      expect(r.govSubsidy + r.copayWithinQuota).toBe(r.withinQuotaAmount);
    }
  });
});

describe('進位模式', () => {
  // 260 元 × 16% = 41.6 元
  it('HALF_UP（預設）四捨五入', () => {
    const r = calcCopay({ scheduledAmount: 260, approvedQuota: 10_000, ratePermille: GENERAL });
    expect(r.copayWithinQuota).toBe(42);
  });

  it('FLOOR 無條件捨去', () => {
    const r = calcCopay({
      scheduledAmount: 260,
      approvedQuota: 10_000,
      ratePermille: GENERAL,
      roundingMode: 'FLOOR',
    });
    expect(r.copayWithinQuota).toBe(41);
  });

  it('CEIL 無條件進位', () => {
    const r = calcCopay({
      scheduledAmount: 260,
      approvedQuota: 10_000,
      ratePermille: GENERAL,
      roundingMode: 'CEIL',
    });
    expect(r.copayWithinQuota).toBe(42);
  });

  it('roundAmount 各模式行為', () => {
    expect(roundAmount(41.5, 'HALF_UP')).toBe(42);
    expect(roundAmount(41.5, 'FLOOR')).toBe(41);
    expect(roundAmount(41.4, 'CEIL')).toBe(42);
    expect(roundAmount(41, 'HALF_UP')).toBe(41);
  });
});
