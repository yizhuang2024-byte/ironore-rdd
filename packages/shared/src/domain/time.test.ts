import { describe, expect, it } from 'vitest';
import {
  addTaipeiDays,
  diffTaipeiDays,
  formatTaipeiRange,
  formatTaipeiTime,
  fromTaipeiDateMinute,
  gapMinutes,
  overlapMinutes,
  rangeMinutes,
  rangesOverlap,
  startOfTaipeiWeek,
  taipeiDateRange,
  taipeiMonthOf,
  toTaipeiDate,
  toTaipeiMinuteOfDay,
  toTaipeiWeekday,
} from './time.js';

describe('台北時區轉換', () => {
  it('UTC 00:00 對應台北同日 08:00', () => {
    const d = new Date('2026-08-03T00:00:00Z');
    expect(toTaipeiDate(d)).toBe('2026-08-03');
    expect(toTaipeiMinuteOfDay(d)).toBe(8 * 60);
  });

  it('UTC 前一日 16:00 已是台北隔日 00:00 —— 跨日邊界', () => {
    const d = new Date('2026-08-02T16:00:00Z');
    expect(toTaipeiDate(d)).toBe('2026-08-03');
    expect(toTaipeiMinuteOfDay(d)).toBe(0);
  });

  it('UTC 15:59 仍是台北當日 23:59', () => {
    const d = new Date('2026-08-02T15:59:00Z');
    expect(toTaipeiDate(d)).toBe('2026-08-02');
    expect(toTaipeiMinuteOfDay(d)).toBe(23 * 60 + 59);
  });

  it('星期幾以台北時區計算', () => {
    // 2026-08-03 為週一
    expect(toTaipeiWeekday(new Date('2026-08-03T00:00:00Z'))).toBe(1);
    // UTC 週日 16:00 = 台北週一 00:00
    expect(toTaipeiWeekday(new Date('2026-08-02T16:00:00Z'))).toBe(1);
  });

  it('fromTaipeiDateMinute 與 toTaipei* 互為反函式', () => {
    const instant = fromTaipeiDateMinute('2026-08-03', 9 * 60 + 30);
    expect(instant.toISOString()).toBe('2026-08-03T01:30:00.000Z');
    expect(toTaipeiDate(instant)).toBe('2026-08-03');
    expect(toTaipeiMinuteOfDay(instant)).toBe(9 * 60 + 30);
  });

  it('分鐘數可超過 1440 表示跨日班次', () => {
    const instant = fromTaipeiDateMinute('2026-08-03', 25 * 60); // 隔日 01:00
    expect(toTaipeiDate(instant)).toBe('2026-08-04');
    expect(toTaipeiMinuteOfDay(instant)).toBe(60);
  });

  it('無效日期字串拋錯', () => {
    expect(() => fromTaipeiDateMinute('not-a-date', 0)).toThrow();
  });
});

describe('台北日曆日運算', () => {
  it('跨月加減正確', () => {
    expect(addTaipeiDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addTaipeiDays('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('跨年加減正確', () => {
    expect(addTaipeiDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('閏年二月正確', () => {
    expect(addTaipeiDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addTaipeiDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('diffTaipeiDays 計算天數差', () => {
    expect(diffTaipeiDays('2026-08-01', '2026-08-08')).toBe(7);
    expect(diffTaipeiDays('2026-08-08', '2026-08-01')).toBe(-7);
    expect(diffTaipeiDays('2026-08-01', '2026-08-01')).toBe(0);
  });

  it('taipeiDateRange 含頭含尾', () => {
    expect(taipeiDateRange('2026-08-01', '2026-08-03')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
    expect(taipeiDateRange('2026-08-03', '2026-08-01')).toEqual([]);
  });

  it('startOfTaipeiWeek 以週一為起點', () => {
    expect(startOfTaipeiWeek('2026-08-03')).toBe('2026-08-03'); // 週一
    expect(startOfTaipeiWeek('2026-08-09')).toBe('2026-08-03'); // 週日回推至週一
    expect(startOfTaipeiWeek('2026-08-05')).toBe('2026-08-03'); // 週三
  });

  it('taipeiMonthOf 取出 YYYY-MM', () => {
    expect(taipeiMonthOf('2026-08-03')).toBe('2026-08');
  });
});

describe('半開區間重疊判斷', () => {
  const r = (startIso: string, endIso: string) => ({
    start: new Date(startIso),
    end: new Date(endIso),
  });

  it('相交的區間視為重疊', () => {
    expect(
      rangesOverlap(r('2026-08-03T00:00Z', '2026-08-03T02:00Z'), r('2026-08-03T01:00Z', '2026-08-03T03:00Z')),
    ).toBe(true);
  });

  it('剛好相接的區間不算重疊 —— 做完一場接下一場是正常排班', () => {
    expect(
      rangesOverlap(r('2026-08-03T00:00Z', '2026-08-03T02:00Z'), r('2026-08-03T02:00Z', '2026-08-03T04:00Z')),
    ).toBe(false);
  });

  it('完全包含視為重疊', () => {
    expect(
      rangesOverlap(r('2026-08-03T00:00Z', '2026-08-03T05:00Z'), r('2026-08-03T01:00Z', '2026-08-03T02:00Z')),
    ).toBe(true);
  });

  it('完全分離不算重疊', () => {
    expect(
      rangesOverlap(r('2026-08-03T00:00Z', '2026-08-03T01:00Z'), r('2026-08-03T03:00Z', '2026-08-03T04:00Z')),
    ).toBe(false);
  });

  it('overlapMinutes 計算重疊分鐘數', () => {
    expect(
      overlapMinutes(r('2026-08-03T00:00Z', '2026-08-03T02:00Z'), r('2026-08-03T01:00Z', '2026-08-03T03:00Z')),
    ).toBe(60);
    expect(
      overlapMinutes(r('2026-08-03T00:00Z', '2026-08-03T02:00Z'), r('2026-08-03T02:00Z', '2026-08-03T03:00Z')),
    ).toBe(0);
  });

  it('rangeMinutes 計算區間長度', () => {
    expect(rangeMinutes(r('2026-08-03T00:00Z', '2026-08-03T01:30Z'))).toBe(90);
  });

  it('gapMinutes 計算兩區間空檔', () => {
    expect(
      gapMinutes(r('2026-08-03T00:00Z', '2026-08-03T01:00Z'), r('2026-08-03T01:30Z', '2026-08-03T02:00Z')),
    ).toBe(30);
    // 相接無空檔
    expect(
      gapMinutes(r('2026-08-03T00:00Z', '2026-08-03T01:00Z'), r('2026-08-03T01:00Z', '2026-08-03T02:00Z')),
    ).toBe(0);
    // 重疊時為 0
    expect(
      gapMinutes(r('2026-08-03T00:00Z', '2026-08-03T02:00Z'), r('2026-08-03T01:00Z', '2026-08-03T03:00Z')),
    ).toBe(0);
  });
});

describe('顯示格式', () => {
  it('formatTaipeiTime 輸出台北時間 HH:mm', () => {
    expect(formatTaipeiTime(new Date('2026-08-03T00:00:00Z'))).toBe('08:00');
    expect(formatTaipeiTime(new Date('2026-08-02T16:05:00Z'))).toBe('00:05');
  });

  it('formatTaipeiRange 輸出區間', () => {
    expect(
      formatTaipeiRange({
        start: new Date('2026-08-03T00:00:00Z'),
        end: new Date('2026-08-03T02:00:00Z'),
      }),
    ).toBe('08:00–10:00');
  });
});
