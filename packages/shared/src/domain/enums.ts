/**
 * 領域列舉 —— 與 Prisma schema 的 enum 保持一致。
 *
 * shared package 刻意不依賴 @prisma/client：前端也要用這些型別，
 * 而前端不該把 Prisma runtime 拖進 bundle。API 層負責兩者的對應。
 */

export const ROLES = [
  'ORG_ADMIN',
  'SUPERVISOR',
  'ADMIN_STAFF',
  'ATTENDANT',
  'AUDITOR',
] as const;
export type Role = (typeof ROLES)[number];

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'HOURLY', 'DISPATCH'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const ATTENDANT_STATUSES = ['ACTIVE', 'ON_LEAVE', 'RESIGNED'] as const;
export type AttendantStatus = (typeof ATTENDANT_STATUSES)[number];

export const RECIPIENT_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export const CERT_TYPES = [
  'CARE_ATTENDANT_TRAINING',
  'CARE_ATTENDANT_LICENSE',
  'IN_SERVICE_TRAINING',
  'HEALTH_CHECK',
  'CPR_FIRST_AID',
  'BATH_VEHICLE',
  'DEMENTIA_CARE',
  'FOOT_CARE',
  'DRIVER_LICENSE',
] as const;
export type CertType = (typeof CERT_TYPES)[number];

export const CERT_TYPE_LABELS: Record<CertType, string> = {
  CARE_ATTENDANT_TRAINING: '照顧服務員訓練結業證明',
  CARE_ATTENDANT_LICENSE: '照顧服務員單一級技術士',
  IN_SERVICE_TRAINING: '在職訓練',
  HEALTH_CHECK: '體檢',
  CPR_FIRST_AID: 'CPR／急救',
  BATH_VEHICLE: '到宅沐浴車訓練',
  DEMENTIA_CARE: '失智照護訓練',
  FOOT_CARE: '足部照護訓練',
  DRIVER_LICENSE: '駕照',
};

/** 部分負擔身分別。實際比率依支付基準版本查 CopayRate，此處僅為分類。 */
export const COPAY_CATEGORIES = ['GENERAL', 'LOW_MID_INCOME', 'LOW_INCOME'] as const;
export type CopayCategory = (typeof COPAY_CATEGORIES)[number];

export const COPAY_CATEGORY_LABELS: Record<CopayCategory, string> = {
  GENERAL: '一般戶',
  LOW_MID_INCOME: '中低收入戶',
  LOW_INCOME: '低收入戶',
};

/** 給付類別。各類別各有獨立額度池，互不流用。 */
export const PAYMENT_CATEGORIES = [
  'CARE_PROFESSIONAL',
  'TRANSPORT',
  'ASSISTIVE_DEVICE',
  'RESPITE',
] as const;
export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

export const PAYMENT_CATEGORY_LABELS: Record<PaymentCategory, string> = {
  CARE_PROFESSIONAL: '照顧及專業服務',
  TRANSPORT: '交通接送',
  ASSISTIVE_DEVICE: '輔具及居家無障礙環境改善',
  RESPITE: '喘息服務',
};

export const PAYMENT_UNIT_TYPES = ['PER_TIME', 'PER_HOUR', 'PER_DAY', 'PER_ITEM'] as const;
export type PaymentUnitType = (typeof PAYMENT_UNIT_TYPES)[number];

export const REMOTE_AREA_TIERS = ['NONE', 'REMOTE', 'MOUNTAIN_ISLAND'] as const;
export type RemoteAreaTier = (typeof REMOTE_AREA_TIERS)[number];

export const VISIT_STATUSES = [
  'UNASSIGNED',
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** 不計入工時、不佔用額度、不參與衝突檢核的班次狀態。 */
export const INACTIVE_VISIT_STATUSES: readonly VisitStatus[] = ['CANCELLED', 'NO_SHOW'];

export const CARE_PLAN_STATUSES = ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'TERMINATED'] as const;
export type CarePlanStatus = (typeof CARE_PLAN_STATUSES)[number];

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_TYPES = [
  'ANNUAL',
  'PERSONAL',
  'SICK',
  'MENSTRUAL',
  'OFFICIAL',
  'BEREAVEMENT',
  'MARRIAGE',
  'MATERNITY',
  'OTHER',
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: '特別休假',
  PERSONAL: '事假',
  SICK: '病假',
  MENSTRUAL: '生理假',
  OFFICIAL: '公假',
  BEREAVEMENT: '喪假',
  MARRIAGE: '婚假',
  MATERNITY: '產假',
  OTHER: '其他',
};

export const ROUNDING_MODES = ['HALF_UP', 'FLOOR', 'CEIL'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export const MONTHLY_OT_MODES = ['STANDARD_46', 'FLEX_54_138'] as const;
export type MonthlyOtMode = (typeof MONTHLY_OT_MODES)[number];

/** CMS 失能等級。長照 2.0 給付對象為 2–8 級（1 級不提供給付）。 */
export const CMS_LEVELS = [2, 3, 4, 5, 6, 7, 8] as const;
export type CmsLevel = (typeof CMS_LEVELS)[number];
