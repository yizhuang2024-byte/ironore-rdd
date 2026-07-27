/**
 * 測試夾具建構器。
 *
 * 衝突檢核的 ConflictContext 欄位很多，若每個測試都手寫完整物件，
 * 測試會變得難讀且脆弱。這裡提供合理預設值，測試只需覆寫關心的欄位。
 *
 * 此檔亦供 API 層的整合測試使用，故放在 src 而非 __tests__。
 */

import { DEFAULT_TRAVEL_POLICY } from '../domain/geo.js';
import { fromTaipeiDateMinute, type TaipeiDate } from '../domain/time.js';
import type {
  AttendantSnapshot,
  ConflictContext,
  MonthUsageSnapshot,
  OrgPolicy,
  PaymentItemSnapshot,
  RecipientSnapshot,
  VisitDraft,
  VisitSnapshot,
} from './types.js';

export const DEFAULT_ORG_POLICY: OrgPolicy = {
  normalDailyMinutes: 480,
  maxDailyMinutes: 720,
  normalWeeklyMinutes: 2400,
  monthlyOtMode: 'STANDARD_46',
  monthlyOtMinutes: 2760,
  flexOtMonthMinutes: 3240,
  flexOtQuarterMinutes: 8280,
  restBreakAfterMinutes: 240,
  restBreakMinutes: 30,
  minShiftGapMinutes: 660,
  enforceSevenDayRest: true,
  idleGapCountsAsWorkThresholdMinutes: 60,
  travel: DEFAULT_TRAVEL_POLICY,
  roundingMode: 'HALF_UP',
};

export const TEST_PAYMENT_ITEMS: PaymentItemSnapshot[] = [
  {
    code: 'BA01',
    name: '基本身體清潔',
    category: 'CARE_PROFESSIONAL',
    price: 260,
    priceRemote: 312,
    maxPerDay: 1,
    isAddOn: false,
    requiredCerts: ['CARE_ATTENDANT_TRAINING'],
  },
  {
    code: 'BA02',
    name: '基本日常照顧',
    category: 'CARE_PROFESSIONAL',
    price: 195,
    isAddOn: false,
    requiredCerts: ['CARE_ATTENDANT_TRAINING'],
  },
  {
    code: 'BA09',
    name: '到宅沐浴車服務',
    category: 'CARE_PROFESSIONAL',
    price: 2500,
    isAddOn: false,
    requiredCerts: ['CARE_ATTENDANT_TRAINING', 'BATH_VEHICLE'],
  },
  {
    code: 'ZZ01',
    name: '夜間加計',
    category: 'CARE_PROFESSIONAL',
    price: 100,
    isAddOn: true,
    requiredCerts: [],
  },
];

export const TEST_PAYMENT_ITEM_MAP: ReadonlyMap<string, PaymentItemSnapshot> = new Map(
  TEST_PAYMENT_ITEMS.map((i) => [i.code, i]),
);

/** 建立台北時間的班次區間 */
export function at(date: TaipeiDate, startHHMM: string, endHHMM: string) {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  return {
    startAt: fromTaipeiDateMinute(date, toMin(startHHMM)),
    endAt: fromTaipeiDateMinute(date, toMin(endHHMM)),
  };
}

export function makeAttendant(overrides: Partial<AttendantSnapshot> = {}): AttendantSnapshot {
  return {
    id: 'att-1',
    name: '王○美',
    status: 'ACTIVE',
    hiredOn: '2020-01-01',
    resignedOn: null,
    certifications: [{ certType: 'CARE_ATTENDANT_TRAINING', expiresOn: null }],
    serviceAreas: ['63000090'],
    availabilities: [],
    maxDailyMinutes: 480,
    maxWeeklyMinutes: 2400,
    maxMonthlyOtMinutes: 2760,
    homeDistrict: '63000090',
    homeCoords: null,
    ...overrides,
  };
}

export function makeRecipient(overrides: Partial<RecipientSnapshot> = {}): RecipientSnapshot {
  return {
    id: 'rec-1',
    name: '陳○嬤',
    status: 'ACTIVE',
    districtCode: '63000090',
    coords: null,
    serviceStartOn: '2020-01-01',
    serviceEndOn: null,
    remoteAreaTier: 'NONE',
    unavailability: [],
    carePlans: [
      {
        id: 'plan-1',
        status: 'ACTIVE',
        effectiveFrom: '2020-01-01',
        effectiveTo: null,
        monthlyQuota: 20_000,
        items: [
          { code: 'BA01', approvedPerMonth: 30, approvedPerWeek: 7 },
          { code: 'BA02', approvedPerMonth: 30, approvedPerWeek: 7 },
          { code: 'BA09', approvedPerMonth: 4, approvedPerWeek: 1 },
          { code: 'ZZ01', approvedPerMonth: 30, approvedPerWeek: 7 },
        ],
      },
    ],
    ...overrides,
  };
}

export function makeVisit(
  id: string,
  date: TaipeiDate,
  start: string,
  end: string,
  overrides: Partial<VisitSnapshot> = {},
): VisitSnapshot {
  return {
    id,
    recipientId: 'rec-1',
    attendantId: 'att-1',
    serviceDate: date,
    status: 'SCHEDULED',
    districtCode: '63000090',
    coords: null,
    items: [{ code: 'BA02', quantity: 1 }],
    ...at(date, start, end),
    ...overrides,
  };
}

export function makeCandidate(
  date: TaipeiDate,
  start: string,
  end: string,
  overrides: Partial<VisitDraft> = {},
): VisitDraft {
  return {
    recipientId: 'rec-1',
    attendantId: 'att-1',
    serviceDate: date,
    items: [{ code: 'BA02', quantity: 1 }],
    ...at(date, start, end),
    ...overrides,
  };
}

export const EMPTY_MONTH_USAGE: MonthUsageSnapshot = {
  countByCode: {},
  weekCountByCode: {},
  scheduledAmount: 0,
  ratePermille: 160,
};

export function makeContext(overrides: Partial<ConflictContext> = {}): ConflictContext {
  return {
    candidate: makeCandidate('2026-08-03', '09:00', '11:00'),
    attendant: makeAttendant(),
    recipient: makeRecipient(),
    attendantVisitsInWindow: [],
    recipientVisitsOnDate: [],
    approvedLeaves: [],
    monthUsage: EMPTY_MONTH_USAGE,
    paymentItems: TEST_PAYMENT_ITEM_MAP,
    districts: undefined,
    orgPolicy: DEFAULT_ORG_POLICY,
    now: new Date('2026-07-27T00:00:00Z'),
    ...overrides,
  };
}

/** 產生某人連續多日、每日一班的排班資料，供七休一與工時測試使用 */
export function makeDailyVisits(
  dates: readonly TaipeiDate[],
  start = '09:00',
  end = '11:00',
): VisitSnapshot[] {
  return dates.map((d, i) => makeVisit(`v-${i}`, d, start, end));
}
