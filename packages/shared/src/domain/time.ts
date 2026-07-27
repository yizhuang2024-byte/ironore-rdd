/**
 * 時間工具 —— 全系統以 UTC 儲存，僅在邊界轉換為台北時間。
 *
 * 台灣自 1980 年起未實施日光節約時間，`Asia/Taipei` 恆為 UTC+8。
 * 這消除了「不存在的時刻」與「重複的時刻」等時區地雷，因此固定偏移的算法是安全的。
 * 但仍不可在 DB 存 naive local time —— 若未來政策變更或出現跨境需求，
 * timestamptz 儲存的資料本身仍是正確的。
 */

/** 台北時區固定偏移（分鐘）。台灣自 1980 年起無 DST。 */
export const TAIPEI_OFFSET_MINUTES = 8 * 60;

export const MINUTES_PER_DAY = 1440;

/** `YYYY-MM-DD` 形式的台北日曆日 */
export type TaipeiDate = string;

/** 半開區間 `[start, end)`。所有重疊判斷一律使用半開區間。 */
export interface TimeRange {
  start: Date;
  end: Date;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/**
 * 取得某個時刻在台北時區的日曆日。
 *
 * 這對應 DB 中的 `serviceDate` 冗餘欄位 —— 月結、七休一、日工時全部以台北日曆日為單位。
 */
export function toTaipeiDate(instant: Date): TaipeiDate {
  const shifted = new Date(instant.getTime() + TAIPEI_OFFSET_MINUTES * 60_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 取得某個時刻在台北時區、自當日 00:00 起算的分鐘數。 */
export function toTaipeiMinuteOfDay(instant: Date): number {
  const shifted = new Date(instant.getTime() + TAIPEI_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** 台北時區的星期幾（0 = 週日 … 6 = 週六）。 */
export function toTaipeiWeekday(instant: Date): number {
  const shifted = new Date(instant.getTime() + TAIPEI_OFFSET_MINUTES * 60_000);
  return shifted.getUTCDay();
}

/**
 * 由台北日曆日 + 當日分鐘數組出 UTC 時刻。
 *
 * 分鐘數允許 ≥ 1440（跨日），供「23:00 起算 2 小時」這類班次使用。
 */
export function fromTaipeiDateMinute(date: TaipeiDate, minuteOfDay: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y)) {
    throw new Error(`無效的台北日期：${date}`);
  }
  const utcMidnight = Date.UTC(y, m - 1, d) - TAIPEI_OFFSET_MINUTES * 60_000;
  return new Date(utcMidnight + minuteOfDay * 60_000);
}

/** 台北日曆日加減天數。 */
export function addTaipeiDays(date: TaipeiDate, days: number): TaipeiDate {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y)) {
    throw new Error(`無效的台北日期：${date}`);
  }
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 兩個台北日曆日相差幾天（b - a）。 */
export function diffTaipeiDays(a: TaipeiDate, b: TaipeiDate): number {
  const parse = (s: TaipeiDate) => {
    const [y, m, d] = s.split('-').map(Number);
    if (y === undefined || m === undefined || d === undefined || Number.isNaN(y)) {
      throw new Error(`無效的台北日期：${s}`);
    }
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

/** 產生 [from, to] 之間（含頭含尾）的所有台北日曆日。 */
export function taipeiDateRange(from: TaipeiDate, to: TaipeiDate): TaipeiDate[] {
  const total = diffTaipeiDays(from, to);
  if (total < 0) return [];
  const out: TaipeiDate[] = [];
  for (let i = 0; i <= total; i += 1) out.push(addTaipeiDays(from, i));
  return out;
}

/** 該台北日曆日所屬週的週一（ISO 週，週一起算）。 */
export function startOfTaipeiWeek(date: TaipeiDate): TaipeiDate {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`無效的台北日期：${date}`);
  }
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = 週日
  const backoff = dow === 0 ? 6 : dow - 1;
  return addTaipeiDays(date, -backoff);
}

/** 該台北日曆日所屬月份，格式 `YYYY-MM`。 */
export function taipeiMonthOf(date: TaipeiDate): string {
  return date.slice(0, 7);
}

/**
 * 半開區間 `[start, end)` 是否相交。
 *
 * 半開區間是刻意的：09:00–10:00 與 10:00–11:00 兩個班次**不算**重疊，
 * 照服員做完一場接著做下一場是正常排班。這與 DB 層 EXCLUDE 約束使用的
 * `tstzrange(..., '[)')` 語意完全一致。
 */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** 兩區間重疊的分鐘數（不重疊時為 0）。 */
export function overlapMinutes(a: TimeRange, b: TimeRange): number {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return end <= start ? 0 : Math.round((end - start) / 60_000);
}

/** 區間長度（分鐘）。 */
export function rangeMinutes(r: TimeRange): number {
  return Math.round((r.end.getTime() - r.start.getTime()) / 60_000);
}

/** 兩個區間之間的空檔（分鐘）。若相交或順序顛倒則為 0。 */
export function gapMinutes(earlier: TimeRange, later: TimeRange): number {
  const gap = later.start.getTime() - earlier.end.getTime();
  return gap <= 0 ? 0 : Math.round(gap / 60_000);
}

/** 格式化為台北時間的 `HH:mm`，供訊息文字使用。 */
export function formatTaipeiTime(instant: Date): string {
  const minute = toTaipeiMinuteOfDay(instant);
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

/** 格式化為 `HH:mm–HH:mm`（台北時間）。 */
export function formatTaipeiRange(r: TimeRange): string {
  return `${formatTaipeiTime(r.start)}–${formatTaipeiTime(r.end)}`;
}
