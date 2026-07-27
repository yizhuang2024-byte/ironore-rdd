/**
 * 排班衝突檢核引擎 —— 型別定義。
 *
 * 引擎是**純函式**：不碰 DB、不碰網路、不讀時鐘（now 由呼叫端傳入）。
 * 呼叫端各自負責把資料組裝成 ConflictContext：
 *   - 後端用 Prisma 查詢
 *   - 前端用 React Query 快取
 * 這個切法讓 shared package 得以零依賴，也讓前端拖拉時能在 <5ms 內即時預覽。
 *
 * ⚠️ 前端的檢核結果永遠只是預覽。後端在寫入交易內必須重跑同一份程式碼，
 *    且 DB 層另有 EXCLUDE 約束兜底時間重疊。
 */

import type {
  AttendantStatus,
  CarePlanStatus,
  CertType,
  MonthlyOtMode,
  PaymentCategory,
  RecipientStatus,
  RemoteAreaTier,
  RoundingMode,
  VisitStatus,
} from '../domain/enums.js';
import type { DistrictInfo, LatLng, TravelPolicy } from '../domain/geo.js';
import type { TaipeiDate } from '../domain/time.js';

/** BLOCK 需覆寫或阻擋；WARN 僅提示；INFO 供顯示參考。 */
export type Severity = 'BLOCK' | 'WARN' | 'INFO';

export interface ConflictFinding {
  /** 規則代號，如 'R01' */
  ruleId: string;
  severity: Severity;
  /** 簡短標題，如 '時間重疊' */
  titleZh: string;
  /** 完整說明，含具體數值 */
  messageZh: string;
  /** 法規出處，如 '勞基法 §32'。無法源者留空。 */
  legalRef?: string;
  relatedVisitIds?: string[];
  /** 供 UI 進一步呈現的結構化資料 */
  data?: Record<string, unknown>;
  /**
   * 是否可由督導覆寫。
   * 不可覆寫者為「覆寫即違法或必然出錯」的情形（時間重疊、證照不符、未經核定項目）。
   */
  overridable: boolean;
}

// ─────────────────────────────────────────────────────────────
// 輸入快照
// ─────────────────────────────────────────────────────────────

export interface VisitItemDraft {
  code: string;
  quantity: number;
}

/** 待檢核的班次（可為新增或修改後的樣貌） */
export interface VisitDraft {
  /** 修改既有班次時帶入，供排除自身比對 */
  id?: string;
  recipientId: string;
  attendantId?: string | null;
  serviceDate: TaipeiDate;
  startAt: Date;
  endAt: Date;
  items: VisitItemDraft[];
}

/** 既有班次的精簡快照 */
export interface VisitSnapshot {
  id: string;
  recipientId: string;
  attendantId?: string | null;
  serviceDate: TaipeiDate;
  startAt: Date;
  endAt: Date;
  status: VisitStatus;
  /** 個案所在行政區與座標，供路程估算 */
  districtCode?: string | null;
  coords?: LatLng | null;
  items?: VisitItemDraft[];
}

export interface CertificationSnapshot {
  certType: CertType;
  /** null = 無期限 */
  expiresOn?: TaipeiDate | null;
}

export interface AvailabilityWindow {
  /** 0 = 週日 … 6 = 週六 */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface AttendantSnapshot {
  id: string;
  name: string;
  status: AttendantStatus;
  hiredOn: TaipeiDate;
  resignedOn?: TaipeiDate | null;
  certifications: CertificationSnapshot[];
  /** 可服務行政區代碼 */
  serviceAreas: string[];
  availabilities: AvailabilityWindow[];
  maxDailyMinutes: number;
  maxWeeklyMinutes: number;
  maxMonthlyOtMinutes: number;
  homeDistrict?: string | null;
  homeCoords?: LatLng | null;
}

export interface RecipientUnavailabilityWindow {
  /** 週期性；與 specificDate 二擇一 */
  weekday?: number | null;
  specificDate?: TaipeiDate | null;
  startMinute: number;
  endMinute: number;
  reason?: string | null;
}

export interface CarePlanItemSnapshot {
  code: string;
  approvedPerMonth: number;
  approvedPerWeek?: number | null;
}

export interface CarePlanSnapshot {
  id: string;
  status: CarePlanStatus;
  effectiveFrom: TaipeiDate;
  effectiveTo?: TaipeiDate | null;
  monthlyQuota: number;
  items: CarePlanItemSnapshot[];
}

export interface RecipientSnapshot {
  id: string;
  name: string;
  status: RecipientStatus;
  districtCode: string;
  coords?: LatLng | null;
  serviceStartOn: TaipeiDate;
  serviceEndOn?: TaipeiDate | null;
  remoteAreaTier: RemoteAreaTier;
  unavailability: RecipientUnavailabilityWindow[];
  carePlans: CarePlanSnapshot[];
}

export interface LeaveSnapshot {
  id: string;
  startAt: Date;
  endAt: Date;
  /** 只有已核准的假才會擋排班 */
  approved: boolean;
}

export interface PaymentItemSnapshot {
  code: string;
  name: string;
  category: PaymentCategory;
  price: number;
  priceRemote?: number | null;
  maxPerDay?: number | null;
  maxPerMonth?: number | null;
  isAddOn: boolean;
  requiredCerts: CertType[];
  countsToQuota?: boolean;
}

/** 該個案本月的已排用量（不含候選班次本身） */
export interface MonthUsageSnapshot {
  /** 各支付代碼本月已排次數 */
  countByCode: Record<string, number>;
  /** 各支付代碼本週已排次數 */
  weekCountByCode: Record<string, number>;
  /** 本月已排金額（計入額度者） */
  scheduledAmount: number;
  ratePermille: number;
}

/**
 * 機構政策參數。全部來自 DB 的 OrgPolicy，程式不寫死。
 *
 * ⚠️ 這些數值是「機構政策設定」，不是系統認定的法律見解。
 *    詳見 docs/03-conflict-rules.md。
 */
export interface OrgPolicy {
  normalDailyMinutes: number;
  maxDailyMinutes: number;
  normalWeeklyMinutes: number;
  monthlyOtMode: MonthlyOtMode;
  monthlyOtMinutes: number;
  flexOtMonthMinutes: number;
  flexOtQuarterMinutes: number;
  restBreakAfterMinutes: number;
  restBreakMinutes: number;
  minShiftGapMinutes: number;
  enforceSevenDayRest: boolean;
  /**
   * 趟間空檔 ≤ 此值者計入工時。
   * 居服員「趟與趟之間是否為工時」是長年法律爭議 —— 引擎同時輸出兩種算法供並陳。
   */
  idleGapCountsAsWorkThresholdMinutes: number;
  travel: TravelPolicy;
  roundingMode: RoundingMode;
}

export interface ConflictContext {
  candidate: VisitDraft;
  /** 未指派照服員時為 null —— 與人員相關的規則會自動略過 */
  attendant: AttendantSnapshot | null;
  recipient: RecipientSnapshot;
  /** 該照服員候選日前後 ±10 日的班次（涵蓋週工時與七休一判斷） */
  attendantVisitsInWindow: VisitSnapshot[];
  /** 該個案候選日當天的班次 */
  recipientVisitsOnDate: VisitSnapshot[];
  /** 該個案本月的班次（供 maxPerMonth 判斷） */
  recipientVisitsInMonth?: VisitSnapshot[];
  approvedLeaves: LeaveSnapshot[];
  monthUsage: MonthUsageSnapshot;
  paymentItems: ReadonlyMap<string, PaymentItemSnapshot>;
  districts?: ReadonlyMap<string, DistrictInfo>;
  orgPolicy: OrgPolicy;
  now: Date;
}

/** 單一規則的實作介面 */
export interface ConflictRule {
  id: string;
  titleZh: string;
  /** 是否為輕量規則 —— 前端拖曳過程中只跑這些，避免掉幀 */
  lightweight: boolean;
  evaluate(ctx: ConflictContext): ConflictFinding[];
}

/** 工時統計。strict 與 loose 並陳，反映「趟間空檔是否為工時」的爭議。 */
export interface WorkMinutes {
  /** 僅服務時數加總 */
  loose: number;
  /** 含所有趟間空檔（首班到末班的跨度） */
  strict: number;
  /** 依 orgPolicy.idleGapCountsAsWorkThresholdMinutes 計算的政策值 */
  policy: number;
}
