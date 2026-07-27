import { describe, expect, it } from 'vitest';
import { makeCandidate, makeContext, makeRecipient, makeVisit } from '../testing.js';
import {
  activeCarePlanOn,
  R04_RECIPIENT_DOUBLE_BOOKED,
  R05_RECIPIENT_UNAVAILABLE,
  R10_R22_CARE_PLAN,
  R11_APPROVED_COUNT,
  R12_MAX_PER_DAY,
  R13_ADDON_ALONE,
  R14_QUOTA_EXCEEDED,
} from './recipient.js';

const D = '2026-08-03'; // 週一

describe('activeCarePlanOn', () => {
  const plans = [
    {
      id: 'p1',
      status: 'ACTIVE' as const,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-06-30',
      monthlyQuota: 10_000,
      items: [],
    },
    {
      id: 'p2',
      status: 'ACTIVE' as const,
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
      monthlyQuota: 20_000,
      items: [],
    },
    {
      id: 'p0',
      status: 'SUPERSEDED' as const,
      effectiveFrom: '2020-01-01',
      effectiveTo: null,
      monthlyQuota: 5_000,
      items: [],
    },
  ];

  it('取出服務日當時生效的版本', () => {
    expect(activeCarePlanOn(plans, '2026-08-03')?.id).toBe('p2');
    expect(activeCarePlanOn(plans, '2026-03-01')?.id).toBe('p1');
  });

  it('非 ACTIVE 的計畫不採用', () => {
    expect(activeCarePlanOn([plans[2]!], '2026-08-03')).toBeUndefined();
  });

  it('日期落在所有計畫之外時回傳 undefined', () => {
    expect(activeCarePlanOn(plans, '2019-01-01')).toBeUndefined();
  });
});

describe('R04 個案時段重複', () => {
  it('個案同時段已有其他服務 → BLOCK 但可覆寫（雙人服務是合法情境）', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      recipientVisitsOnDate: [makeVisit('v1', D, '10:00', '12:00', { attendantId: 'att-2' })],
    });
    const f = R04_RECIPIENT_DOUBLE_BOOKED.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.overridable).toBe(true);
  });

  it('不重疊 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      recipientVisitsOnDate: [makeVisit('v1', D, '14:00', '16:00', { attendantId: 'att-2' })],
    });
    expect(R04_RECIPIENT_DOUBLE_BOOKED.evaluate(ctx)).toHaveLength(0);
  });

  it('已取消的班次不比對', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      recipientVisitsOnDate: [makeVisit('v1', D, '10:00', '12:00', { status: 'CANCELLED' })],
    });
    expect(R04_RECIPIENT_DOUBLE_BOOKED.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R05 個案不可服務時段', () => {
  it('落在週期性不可服務時段 → WARN', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      recipient: makeRecipient({
        unavailability: [
          { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60, reason: '固定回診' },
        ],
      }),
    });
    const f = R05_RECIPIENT_UNAVAILABLE.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
    expect(f[0]!.messageZh).toContain('固定回診');
  });

  it('落在特定日期的不可服務時段 → WARN', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      recipient: makeRecipient({
        unavailability: [
          { specificDate: D, startMinute: 8 * 60, endMinute: 12 * 60, reason: '家屬在家' },
        ],
      }),
    });
    expect(R05_RECIPIENT_UNAVAILABLE.evaluate(ctx)).toHaveLength(1);
  });

  it('不同星期的設定不影響', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      recipient: makeRecipient({
        unavailability: [{ weekday: 3, startMinute: 8 * 60, endMinute: 12 * 60 }],
      }),
    });
    expect(R05_RECIPIENT_UNAVAILABLE.evaluate(ctx)).toHaveLength(0);
  });

  it('時段不重疊 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '14:00', '16:00'),
      recipient: makeRecipient({
        unavailability: [{ weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 }],
      }),
    });
    expect(R05_RECIPIENT_UNAVAILABLE.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R10/R22 照顧計畫', () => {
  it('無生效計畫 → R22 BLOCK 且不可覆寫', () => {
    const ctx = makeContext({ recipient: makeRecipient({ carePlans: [] }) });
    const f = R10_R22_CARE_PLAN.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('R22');
    expect(f[0]!.overridable).toBe(false);
  });

  it('項目未經核定 → R10 BLOCK 且不可覆寫', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA99', quantity: 1 }] }),
    });
    const f = R10_R22_CARE_PLAN.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('R10');
    expect(f[0]!.overridable).toBe(false);
    expect(f[0]!.messageZh).toContain('BA99');
  });

  it('項目皆已核定 → 通過', () => {
    expect(R10_R22_CARE_PLAN.evaluate(makeContext())).toHaveLength(0);
  });

  it('計畫已失效（服務日晚於 effectiveTo）→ R22 BLOCK', () => {
    const ctx = makeContext({
      recipient: makeRecipient({
        carePlans: [
          {
            id: 'p1',
            status: 'ACTIVE',
            effectiveFrom: '2026-01-01',
            effectiveTo: '2026-07-31',
            monthlyQuota: 20_000,
            items: [{ code: 'BA02', approvedPerMonth: 30, approvedPerWeek: 7 }],
          },
        ],
      }),
    });
    const f = R10_R22_CARE_PLAN.evaluate(ctx);
    expect(f[0]!.ruleId).toBe('R22');
  });
});

describe('R11 核定次數超用', () => {
  it('超過核定月次數 → BLOCK 可覆寫', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA02', quantity: 1 }] }),
      monthUsage: {
        countByCode: { BA02: 30 },
        weekCountByCode: {},
        scheduledAmount: 0,
        ratePermille: 160,
      },
    });
    const f = R11_APPROVED_COUNT.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.overridable).toBe(true);
  });

  it('未超過核定次數 → 通過', () => {
    const ctx = makeContext({
      monthUsage: {
        countByCode: { BA02: 10 },
        weekCountByCode: { BA02: 2 },
        scheduledAmount: 0,
        ratePermille: 160,
      },
    });
    expect(R11_APPROVED_COUNT.evaluate(ctx)).toHaveLength(0);
  });

  it('超過核定週次數但未超月次數 → WARN', () => {
    const ctx = makeContext({
      monthUsage: {
        countByCode: { BA02: 10 },
        weekCountByCode: { BA02: 7 },
        scheduledAmount: 0,
        ratePermille: 160,
      },
    });
    const f = R11_APPROVED_COUNT.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
    expect(f[0]!.messageZh).toContain('每週');
  });

  it('剛好用滿核定次數 → 通過（邊界值）', () => {
    const ctx = makeContext({
      monthUsage: {
        countByCode: { BA02: 29 },
        weekCountByCode: { BA02: 6 },
        scheduledAmount: 0,
        ratePermille: 160,
      },
    });
    expect(R11_APPROVED_COUNT.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R12 同日次數超限', () => {
  it('超過支付基準的每日上限 → BLOCK 且不可覆寫', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '14:00', '15:00', { items: [{ code: 'BA01', quantity: 1 }] }),
      recipientVisitsOnDate: [
        makeVisit('v1', D, '09:00', '10:00', { items: [{ code: 'BA01', quantity: 1 }] }),
      ],
    });
    const f = R12_MAX_PER_DAY.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.overridable).toBe(false);
    expect(f[0]!.messageZh).toContain('基本身體清潔');
  });

  it('未超過上限 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '14:00', '15:00', { items: [{ code: 'BA01', quantity: 1 }] }),
      recipientVisitsOnDate: [],
    });
    expect(R12_MAX_PER_DAY.evaluate(ctx)).toHaveLength(0);
  });

  it('無 maxPerDay 限制的項目不檢查', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '14:00', '15:00', { items: [{ code: 'BA02', quantity: 5 }] }),
      recipientVisitsOnDate: [
        makeVisit('v1', D, '09:00', '10:00', { items: [{ code: 'BA02', quantity: 5 }] }),
      ],
    });
    expect(R12_MAX_PER_DAY.evaluate(ctx)).toHaveLength(0);
  });

  it('已取消的班次不計次', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '14:00', '15:00', { items: [{ code: 'BA01', quantity: 1 }] }),
      recipientVisitsOnDate: [
        makeVisit('v1', D, '09:00', '10:00', {
          items: [{ code: 'BA01', quantity: 1 }],
          status: 'CANCELLED',
        }),
      ],
    });
    expect(R12_MAX_PER_DAY.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R13 加計項目單獨排班', () => {
  it('僅含加計項目 → BLOCK 且不可覆寫', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '20:00', '21:00', { items: [{ code: 'ZZ01', quantity: 1 }] }),
    });
    const f = R13_ADDON_ALONE.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.overridable).toBe(false);
  });

  it('加計項目搭配主要項目 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '20:00', '21:00', {
        items: [
          { code: 'BA02', quantity: 1 },
          { code: 'ZZ01', quantity: 1 },
        ],
      }),
    });
    expect(R13_ADDON_ALONE.evaluate(ctx)).toHaveLength(0);
  });

  it('只有主要項目 → 通過', () => {
    expect(R13_ADDON_ALONE.evaluate(makeContext())).toHaveLength(0);
  });

  it('無任何項目 → 通過（由其他規則處理）', () => {
    const ctx = makeContext({ candidate: makeCandidate(D, '09:00', '11:00', { items: [] }) });
    expect(R13_ADDON_ALONE.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R14 月額度超支', () => {
  it('排入後超出額度 → WARN 並試算自付金額', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA02', quantity: 1 }] }),
      monthUsage: {
        countByCode: {},
        weekCountByCode: {},
        scheduledAmount: 19_900,
        ratePermille: 160,
      },
    });
    const f = R14_QUOTA_EXCEEDED.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
    // 19,900 + 195 = 20,095，超出 20,000 共 95 元
    expect(f[0]!.data?.['overQuotaSelfPay']).toBe(95);
    expect(f[0]!.messageZh).toContain('100% 自費');
  });

  it('未超出額度 → 通過', () => {
    const ctx = makeContext({
      monthUsage: {
        countByCode: {},
        weekCountByCode: {},
        scheduledAmount: 5_000,
        ratePermille: 160,
      },
    });
    expect(R14_QUOTA_EXCEEDED.evaluate(ctx)).toHaveLength(0);
  });

  it('偏遠地區個案以第二價格計算', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA01', quantity: 1 }] }),
      recipient: makeRecipient({ remoteAreaTier: 'MOUNTAIN_ISLAND' }),
      monthUsage: {
        countByCode: {},
        weekCountByCode: {},
        scheduledAmount: 19_800,
        ratePermille: 160,
      },
    });
    const f = R14_QUOTA_EXCEEDED.evaluate(ctx);
    // 19,800 + 312（第二價格）= 20,112，超出 112
    expect(f[0]!.data?.['overQuotaSelfPay']).toBe(112);
  });

  it('★ 低收入戶超額仍須全額自付', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA02', quantity: 1 }] }),
      monthUsage: {
        countByCode: {},
        weekCountByCode: {},
        scheduledAmount: 19_900,
        ratePermille: 0, // 低收入戶
      },
    });
    const f = R14_QUOTA_EXCEEDED.evaluate(ctx);
    expect(f[0]!.data?.['totalSelfPay']).toBe(95); // 額度內 0 + 超額 95
  });

  it('無生效計畫時不判定（由 R22 處理）', () => {
    const ctx = makeContext({ recipient: makeRecipient({ carePlans: [] }) });
    expect(R14_QUOTA_EXCEEDED.evaluate(ctx)).toHaveLength(0);
  });
});
