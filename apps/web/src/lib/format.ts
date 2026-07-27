/**
 * 顯示格式化工具。時間一律轉台北時區顯示。
 */

import { formatTaipeiTime, toTaipeiDate } from '@ltc/shared';

export { formatTaipeiTime, toTaipeiDate };

export function fmtTime(iso: string | Date): string {
  return formatTaipeiTime(typeof iso === 'string' ? new Date(iso) : iso);
}

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return toTaipeiDate(typeof iso === 'string' ? new Date(iso) : iso);
}

export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${toTaipeiDate(d)} ${formatTaipeiTime(d)}`;
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('zh-TW');
}

export function fmtHours(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  return `${(minutes / 60).toFixed(1)} 小時`;
}

export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export function fmtMinuteOfDay(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export const DISTRICT_NAMES: Record<string, string> = {
  '63000010': '中正區',
  '63000020': '大同區',
  '63000030': '中山區',
  '63000040': '松山區',
  '63000050': '大安區',
  '63000060': '萬華區',
  '63000070': '信義區',
  '63000080': '士林區',
  '63000090': '北投區',
  '63000100': '內湖區',
  '63000110': '南港區',
  '63000120': '文山區',
};

export const districtName = (code: string | null | undefined): string =>
  code ? (DISTRICT_NAMES[code] ?? code) : '—';

export const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: '正職',
  PART_TIME: '兼職',
  HOURLY: '時薪',
  DISPATCH: '派遣',
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '服務中',
  ON_LEAVE: '請假中',
  RESIGNED: '已離職',
  PENDING: '待啟案',
  SUSPENDED: '暫停服務',
  CLOSED: '已結案',
};

export const VISIT_STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: '未指派',
  SCHEDULED: '已排班',
  CONFIRMED: '已確認',
  IN_PROGRESS: '服務中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  NO_SHOW: '未到',
};

export const COPAY_LABELS: Record<string, string> = {
  GENERAL: '一般戶',
  LOW_MID_INCOME: '中低收入戶',
  LOW_INCOME: '低收入戶',
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: '特休',
  PERSONAL: '事假',
  SICK: '病假',
  MENSTRUAL: '生理假',
  OFFICIAL: '公假',
  BEREAVEMENT: '喪假',
  MARRIAGE: '婚假',
  MATERNITY: '產假',
  OTHER: '其他',
};

export const CERT_LABELS: Record<string, string> = {
  CARE_ATTENDANT_TRAINING: '照服員訓練結業',
  CARE_ATTENDANT_LICENSE: '照服員技術士',
  IN_SERVICE_TRAINING: '在職訓練',
  HEALTH_CHECK: '體檢',
  CPR_FIRST_AID: 'CPR／急救',
  BATH_VEHICLE: '到宅沐浴車',
  DEMENTIA_CARE: '失智照護',
  FOOT_CARE: '足部照護',
  DRIVER_LICENSE: '駕照',
};
