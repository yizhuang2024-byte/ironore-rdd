import { describe, expect, it } from 'vitest';
import { addTaipeiDays, type TaipeiDate } from '../../domain/time.js';
import {
  DEFAULT_ORG_POLICY,
  makeAttendant,
  makeCandidate,
  makeContext,
  makeDailyVisits,
  makeVisit,
} from '../testing.js';
import {
  R15_DAILY_HOURS,
  R16_WEEKLY_HOURS,
  R17_MONTHLY_OVERTIME,
  R18_SEVEN_DAY_REST,
  R19_SHIFT_GAP,
  R20_REST_BREAK,
} from './labour.js';

const D = '2026-08-03'; // 週一

describe('R15 日工時', () => {
  it('未超過正常工時 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      attendantVisitsInWindow: [makeVisit('v1', D, '13:00', '16:00')],
    });
    expect(R15_DAILY_HOURS.evaluate(ctx)).toHaveLength(0);
  });

  it('超過 8 小時但未超過 12 小時 → WARN（延長工時）', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '17:00', '19:00'),
      attendantVisitsInWindow: [
        makeVisit('v1', D, '08:00', '12:00'),
        makeVisit('v2', D, '13:00', '16:00'),
      ],
    });
    const f = R15_DAILY_HOURS.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
    expect(f[0]!.legalRef).toContain('§30');
  });

  it('超過 12 小時 → BLOCK', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '19:00', '23:00'),
      attendantVisitsInWindow: [
        makeVisit('v1', D, '06:00', '12:00'),
        makeVisit('v2', D, '13:00', '18:00'),
      ],
    });
    const f = R15_DAILY_HOURS.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.legalRef).toContain('§32');
  });

  it('訊息同時呈現三種工時算法 —— 反映趟間空檔的法律爭議', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '17:00', '19:00'),
      attendantVisitsInWindow: [
        makeVisit('v1', D, '08:00', '12:00'),
        makeVisit('v2', D, '13:00', '16:00'),
      ],
    });
    const f = R15_DAILY_HOURS.evaluate(ctx);
    expect(f[0]!.messageZh).toContain('服務時數');
    expect(f[0]!.messageZh).toContain('含空檔');
    expect(f[0]!.messageZh).toContain('政策採計');
  });

  it('短空檔（≤ 門檻）計入政策工時', () => {
    // 09:00-11:00 + 11:30-13:30 = 服務 4h，空檔 30 分鐘（≤60）→ policy 4.5h
    const ctx = makeContext({
      candidate: makeCandidate(D, '11:30', '13:30'),
      attendantVisitsInWindow: [makeVisit('v1', D, '09:00', '11:00')],
    });
    const f = R15_DAILY_HOURS.evaluate(ctx);
    expect(f).toHaveLength(0); // 4.5h 未超過 8h
  });

  it('已取消的班次不計工時', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '17:00', '19:00'),
      attendantVisitsInWindow: [
        makeVisit('v1', D, '06:00', '12:00', { status: 'CANCELLED' }),
        makeVisit('v2', D, '13:00', '16:00'),
      ],
    });
    expect(R15_DAILY_HOURS.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R16 週工時', () => {
  it('週工時未超過 40 小時 → 通過', () => {
    const dates = [0, 1, 2, 3].map((i) => addTaipeiDays(D, i));
    const ctx = makeContext({
      candidate: makeCandidate(addTaipeiDays(D, 4), '09:00', '17:00'),
      attendantVisitsInWindow: makeDailyVisits(dates, '09:00', '17:00'),
    });
    expect(R16_WEEKLY_HOURS.evaluate(ctx)).toHaveLength(0);
  });

  it('週工時超過 40 小時 → WARN', () => {
    const dates = [0, 1, 2, 3, 4].map((i) => addTaipeiDays(D, i));
    const ctx = makeContext({
      candidate: makeCandidate(addTaipeiDays(D, 5), '09:00', '17:00'),
      attendantVisitsInWindow: makeDailyVisits(dates, '09:00', '17:00'),
    });
    const f = R16_WEEKLY_HOURS.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
  });

  it('部分工時者以契約上限判定', () => {
    // 兼職週上限 20h
    const dates = [0, 1].map((i) => addTaipeiDays(D, i));
    const ctx = makeContext({
      candidate: makeCandidate(addTaipeiDays(D, 2), '09:00', '17:00'),
      attendant: makeAttendant({ maxWeeklyMinutes: 20 * 60 }),
      attendantVisitsInWindow: makeDailyVisits(dates, '09:00', '17:00'),
    });
    const f = R16_WEEKLY_HOURS.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.messageZh).toContain('20.0');
  });

  it('上一週的班次不計入本週', () => {
    const lastWeek = [-7, -6, -5, -4, -3].map((i) => addTaipeiDays(D, i));
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '17:00'),
      attendantVisitsInWindow: makeDailyVisits(lastWeek, '09:00', '17:00'),
    });
    expect(R16_WEEKLY_HOURS.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R17 月延長工時', () => {
  it('延長工時未超過 46 小時 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '18:00'), // 9h → 延長 1h
      attendantVisitsInWindow: [],
    });
    expect(R17_MONTHLY_OVERTIME.evaluate(ctx)).toHaveLength(0);
  });

  it('累計延長工時超過 46 小時 → WARN', () => {
    // 全月每天 10 小時 → 每天延長 2h，24 天 = 48h
    const dates: TaipeiDate[] = [];
    for (let i = 0; i < 24; i += 1) dates.push(addTaipeiDays('2026-08-01', i));
    const ctx = makeContext({
      candidate: makeCandidate('2026-08-25', '08:00', '18:00'),
      attendantVisitsInWindow: makeDailyVisits(dates, '08:00', '18:00'),
    });
    const f = R17_MONTHLY_OVERTIME.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
    expect(f[0]!.legalRef).toContain('§32');
  });

  it('彈性制採用較高的 54 小時上限', () => {
    const dates: TaipeiDate[] = [];
    for (let i = 0; i < 24; i += 1) dates.push(addTaipeiDays('2026-08-01', i));
    const ctx = makeContext({
      candidate: makeCandidate('2026-08-25', '08:00', '18:00'),
      attendantVisitsInWindow: makeDailyVisits(dates, '08:00', '18:00'),
      orgPolicy: { ...DEFAULT_ORG_POLICY, monthlyOtMode: 'FLEX_54_138' },
    });
    // 50h 延長工時 < 54h → 不觸發
    expect(R17_MONTHLY_OVERTIME.evaluate(ctx)).toHaveLength(0);
  });

  it('上個月的班次不計入本月', () => {
    const lastMonth: TaipeiDate[] = [];
    for (let i = 0; i < 24; i += 1) lastMonth.push(addTaipeiDays('2026-07-01', i));
    const ctx = makeContext({
      candidate: makeCandidate('2026-08-03', '08:00', '18:00'),
      attendantVisitsInWindow: makeDailyVisits(lastMonth, '08:00', '18:00'),
    });
    expect(R17_MONTHLY_OVERTIME.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R18 七休一', () => {
  // 法條是「每七日中應有二日之休息」，關鍵在「每七日中」而非「連續上班天數」
  it('連續 6 天有班，第 7 天排班（前面有休假）→ 通過', () => {
    // 8/03–8/08 有班（6天），8/02 休假，候選 8/09
    const worked = [0, 1, 2, 3, 4, 5].map((i) => addTaipeiDays(D, i));
    const ctx = makeContext({
      candidate: makeCandidate(addTaipeiDays(D, 6), '09:00', '11:00'),
      attendantVisitsInWindow: makeDailyVisits(worked),
    });
    // 8/03–8/09 是連續 7 天全有班 → 應 BLOCK
    const f = R18_SEVEN_DAY_REST.evaluate(ctx);
    expect(f).toHaveLength(1);
  });

  it('連續 6 天有班、第 7 天休息 → 通過', () => {
    const worked = [0, 1, 2, 3, 4].map((i) => addTaipeiDays(D, i));
    const ctx = makeContext({
      candidate: makeCandidate(addTaipeiDays(D, 5), '09:00', '11:00'),
      attendantVisitsInWindow: makeDailyVisits(worked),
    });
    expect(R18_SEVEN_DAY_REST.evaluate(ctx)).toHaveLength(0);
  });

  it('候選日補滿連續 7 天 → BLOCK 但可覆寫', () => {
    const worked = [0, 1, 2, 3, 4, 5].map((i) => addTaipeiDays(D, i));
    const ctx = makeContext({
      candidate: makeCandidate(addTaipeiDays(D, 6), '09:00', '11:00'),
      attendantVisitsInWindow: makeDailyVisits(worked),
    });
    const f = R18_SEVEN_DAY_REST.evaluate(ctx);
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.overridable).toBe(true);
    expect(f[0]!.legalRef).toContain('§36');
  });

  it('★ 候選日插在中間補滿 7 連 → BLOCK（「每七日中」而非「連續上班」）', () => {
    // 8/01,8/02,8/03 有班，8/04 空（候選日），8/05,8/06,8/07 有班
    const worked = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-05', '2026-08-06', '2026-08-07'];
    const ctx = makeContext({
      candidate: makeCandidate('2026-08-04', '09:00', '11:00'),
      attendantVisitsInWindow: makeDailyVisits(worked),
    });
    const f = R18_SEVEN_DAY_REST.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.data?.['windowStart']).toBe('2026-08-01');
  });

  it('跨月邊界仍正確判定', () => {
    const worked = ['2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03'];
    const ctx = makeContext({
      candidate: makeCandidate('2026-08-04', '09:00', '11:00'),
      attendantVisitsInWindow: makeDailyVisits(worked),
    });
    expect(R18_SEVEN_DAY_REST.evaluate(ctx)).toHaveLength(1);
  });

  it('已取消的班次不算「有班」', () => {
    const worked = [0, 1, 2, 3, 4, 5].map((i) => addTaipeiDays(D, i));
    const visits = makeDailyVisits(worked);
    visits[2]!.status = 'CANCELLED';
    const ctx = makeContext({
      candidate: makeCandidate(addTaipeiDays(D, 6), '09:00', '11:00'),
      attendantVisitsInWindow: visits,
    });
    expect(R18_SEVEN_DAY_REST.evaluate(ctx)).toHaveLength(0);
  });

  it('機構關閉七休一檢核時不觸發', () => {
    const worked = [0, 1, 2, 3, 4, 5].map((i) => addTaipeiDays(D, i));
    const ctx = makeContext({
      candidate: makeCandidate(addTaipeiDays(D, 6), '09:00', '11:00'),
      attendantVisitsInWindow: makeDailyVisits(worked),
      orgPolicy: { ...DEFAULT_ORG_POLICY, enforceSevenDayRest: false },
    });
    expect(R18_SEVEN_DAY_REST.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R19 班距不足', () => {
  it('與前一日末班間隔不足 11 小時 → WARN', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '06:00', '08:00'),
      attendantVisitsInWindow: [makeVisit('v1', addTaipeiDays(D, -1), '18:00', '22:00')],
    });
    const f = R19_SHIFT_GAP.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
    expect(f[0]!.legalRef).toContain('有爭議');
  });

  it('間隔充足 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      attendantVisitsInWindow: [makeVisit('v1', addTaipeiDays(D, -1), '14:00', '17:00')],
    });
    expect(R19_SHIFT_GAP.evaluate(ctx)).toHaveLength(0);
  });

  it('同日的班次不納入班距判斷', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '14:00', '16:00'),
      attendantVisitsInWindow: [makeVisit('v1', D, '09:00', '11:00')],
    });
    expect(R19_SHIFT_GAP.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R20 休息時間不足', () => {
  it('連續工作超過 4 小時無足夠休息 → WARN', () => {
    // 09:00-12:00 + 12:10-14:00，間隔僅 10 分鐘 → 合併為 5 小時區塊
    const ctx = makeContext({
      candidate: makeCandidate(D, '12:10', '14:00'),
      attendantVisitsInWindow: [makeVisit('v1', D, '09:00', '12:00')],
    });
    const f = R20_REST_BREAK.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
    expect(f[0]!.legalRef).toContain('§35');
  });

  it('中間有 30 分鐘以上休息 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '12:30', '14:00'),
      attendantVisitsInWindow: [makeVisit('v1', D, '09:00', '12:00')],
    });
    expect(R20_REST_BREAK.evaluate(ctx)).toHaveLength(0);
  });

  it('單一班次未超過 4 小時 → 通過', () => {
    const ctx = makeContext({ candidate: makeCandidate(D, '09:00', '12:00') });
    expect(R20_REST_BREAK.evaluate(ctx)).toHaveLength(0);
  });

  it('★ 短暫休息不重置連續工作時間（間隔本身計入區塊）', () => {
    // 09:00-11:00 休5分 11:05-13:00 → 合併為 09:00-13:00 共 4 小時
    // 再加 13:05-14:00 → 共 5 小時 → 應 WARN
    const ctx = makeContext({
      candidate: makeCandidate(D, '13:05', '14:00'),
      attendantVisitsInWindow: [
        makeVisit('v1', D, '09:00', '11:00'),
        makeVisit('v2', D, '11:05', '13:00'),
      ],
    });
    const f = R20_REST_BREAK.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.data?.['blockMinutes']).toBe(300);
  });
});
