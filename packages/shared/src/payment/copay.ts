/**
 * 長照給付額度與部分負擔計算。
 *
 * ⚠️ 本模組**不含任何支付代碼、價格、額度或比率的常數**。
 *    所有數值都從 DB 傳入，而 DB 的資料來自機構匯入的官方公告 CSV。
 *    理由見 docs/04-ltc-payment-codes.md —— 憑記憶寫死金額會產生
 *    看似正確卻錯誤的申報資料。
 *
 * 全部採整數（元）運算，比率以千分比整數表示（160 = 16%），避免浮點誤差。
 */

import type { RoundingMode } from '../domain/enums.js';

export interface CopayInput {
  /** 本月已排（或已執行）之服務總金額，元 */
  scheduledAmount: number;
  /** 核定月給付額度，元 */
  approvedQuota: number;
  /** 部分負擔比率，千分比整數（例：一般戶 160 = 16%）。來自 CopayRate 表。 */
  ratePermille: number;
  roundingMode?: RoundingMode;
}

export interface CopayResult {
  /** 額度內金額 = min(已排金額, 核定額度) */
  withinQuotaAmount: number;
  /** 額度內的部分負擔（民眾自付） */
  copayWithinQuota: number;
  /** 額度內的政府補助 */
  govSubsidy: number;
  /** 超出額度部分 —— 100% 自費，不因身分別而減免 */
  overQuotaSelfPay: number;
  /** 民眾實際應付總額 */
  totalSelfPay: number;
}

export function roundAmount(value: number, mode: RoundingMode = 'HALF_UP'): number {
  switch (mode) {
    case 'FLOOR':
      return Math.floor(value);
    case 'CEIL':
      return Math.ceil(value);
    case 'HALF_UP':
    default:
      // Math.round 對負值的行為不是「四捨五入遠離零」，但金額恆為非負，故安全
      return Math.round(value);
  }
}

/**
 * 計算部分負擔。
 *
 * 規則：
 *  - 額度內：依身分別比率負擔
 *  - 超出額度：**100% 自費**，低收入戶亦然
 *
 * 最後這點是實務上最常算錯的地方 —— 低收入戶的部分負擔為 0，
 * 但一旦服務超出核定額度，超額部分仍須全額自付。
 */
export function calcCopay(input: CopayInput): CopayResult {
  const { scheduledAmount, approvedQuota, ratePermille, roundingMode = 'HALF_UP' } = input;

  if (ratePermille < 0 || ratePermille > 1000) {
    throw new Error(`部分負擔比率超出範圍（0–1000 千分比）：${ratePermille}`);
  }

  const safeScheduled = Math.max(0, scheduledAmount);
  const safeQuota = Math.max(0, approvedQuota);

  const withinQuotaAmount = Math.min(safeScheduled, safeQuota);
  const copayWithinQuota = roundAmount((withinQuotaAmount * ratePermille) / 1000, roundingMode);
  const govSubsidy = withinQuotaAmount - copayWithinQuota;
  const overQuotaSelfPay = Math.max(0, safeScheduled - safeQuota);

  return {
    withinQuotaAmount,
    copayWithinQuota,
    govSubsidy,
    overQuotaSelfPay,
    totalSelfPay: copayWithinQuota + overQuotaSelfPay,
  };
}
