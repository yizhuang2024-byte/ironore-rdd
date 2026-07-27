/**
 * R15–R20：勞動基準法相關規則
 *
 * ⚠️ 所有門檻值皆取自 OrgPolicy（機構政策設定），程式不寫死。
 *    這些預設值需由機構人資／法務書面確認後才可上線。
 *    尤其「趟間空檔是否為工時」是長年爭議 —— 引擎輸出 strict/loose/policy 三種工時，
 *    警示以 policy 值判定，但訊息中同時附上另外兩種供督導判斷。
 *    詳見 docs/03-conflict-rules.md。
 */

import {
  addTaipeiDays,
  diffTaipeiDays,
  startOfTaipeiWeek,
  taipeiMonthOf,
  type TaipeiDate,
} from '../../domain/time.js';
import type { ConflictFinding, ConflictRule } from '../types.js';
import {
  calcWorkMinutes,
  groupWorkBlocks,
  isActiveVisit,
  mergeCandidate,
  sortByStart,
  visitsInMonth,
  visitsInWeek,
  visitsOnDate,
} from '../workload.js';

const fmtHours = (minutes: number): string => (minutes / 60).toFixed(1);

/** R15 日工時：超過正常工時 WARN，超過法定上限 BLOCK */
export const R15_DAILY_HOURS: ConflictRule = {
  id: 'R15',
  titleZh: '日工時',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, attendantVisitsInWindow, orgPolicy } = ctx;
    if (!attendant || !candidate.attendantId) return [];

    const sameDay = visitsOnDate(attendantVisitsInWindow, candidate.serviceDate, candidate.id);
    const merged = mergeCandidate(sameDay, candidate);
    const work = calcWorkMinutes(merged, orgPolicy.idleGapCountsAsWorkThresholdMinutes);

    const normalCap = Math.min(attendant.maxDailyMinutes, orgPolicy.normalDailyMinutes);
    const legalCap = orgPolicy.maxDailyMinutes;
    const detail = `（服務時數 ${fmtHours(work.loose)}h／含空檔 ${fmtHours(work.strict)}h／政策採計 ${fmtHours(work.policy)}h）`;

    if (work.policy > legalCap) {
      return [
        {
          ruleId: 'R15',
          severity: 'BLOCK',
          titleZh: '日工時超過法定上限',
          // 可覆寫但需理由：勞基法 §32 的 12 小時上限沒有例外，
          // 但排班系統不該讓督導完全無法處理緊急代班；覆寫會留下稽核軌跡供勞檢說明。
          overridable: true,
          messageZh: `當日工時將達 ${fmtHours(work.policy)} 小時，超過法定上限 ${fmtHours(legalCap)} 小時 ${detail}`,
          legalRef: '勞動基準法 §32',
          data: { work, legalCap, normalCap },
        },
      ];
    }

    if (work.policy > normalCap) {
      return [
        {
          ruleId: 'R15',
          severity: 'WARN',
          titleZh: '日工時進入延長工時',
          overridable: true,
          messageZh: `當日工時將達 ${fmtHours(work.policy)} 小時，超過正常工時 ${fmtHours(normalCap)} 小時，屬延長工時 ${detail}`,
          legalRef: '勞動基準法 §30、§32',
          data: { work, legalCap, normalCap },
        },
      ];
    }

    return [];
  },
};

/** R16 週正常工時 */
export const R16_WEEKLY_HOURS: ConflictRule = {
  id: 'R16',
  titleZh: '週工時',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, attendantVisitsInWindow, orgPolicy } = ctx;
    if (!attendant || !candidate.attendantId) return [];

    const week = visitsInWeek(attendantVisitsInWindow, candidate.serviceDate, candidate.id);
    const merged = mergeCandidate(week, candidate);
    const work = calcWorkMinutes(merged, orgPolicy.idleGapCountsAsWorkThresholdMinutes);

    // 部分工時者以契約值為準，正職以法定 40h 為準，取較小者
    const cap = Math.min(attendant.maxWeeklyMinutes, orgPolicy.normalWeeklyMinutes);
    if (work.policy <= cap) return [];

    return [
      {
        ruleId: 'R16',
        severity: 'WARN',
        titleZh: '週工時超過上限',
        overridable: true,
        messageZh: `本週（${startOfTaipeiWeek(candidate.serviceDate)} 起）工時將達 ${fmtHours(work.policy)} 小時，超過上限 ${fmtHours(cap)} 小時`,
        legalRef: '勞動基準法 §30',
        data: { work, cap, weekOf: startOfTaipeiWeek(candidate.serviceDate) },
      },
    ];
  },
};

/** R17 月延長工時 */
export const R17_MONTHLY_OVERTIME: ConflictRule = {
  id: 'R17',
  titleZh: '月延長工時',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, attendantVisitsInWindow, orgPolicy } = ctx;
    if (!attendant || !candidate.attendantId) return [];

    const month = visitsInMonth(attendantVisitsInWindow, candidate.serviceDate, candidate.id);
    const byDate = new Map<TaipeiDate, { startAt: Date; endAt: Date }[]>();
    for (const v of month) {
      const arr = byDate.get(v.serviceDate) ?? [];
      arr.push({ startAt: v.startAt, endAt: v.endAt });
      byDate.set(v.serviceDate, arr);
    }
    const candArr = byDate.get(candidate.serviceDate) ?? [];
    byDate.set(candidate.serviceDate, [
      ...candArr,
      { startAt: candidate.startAt, endAt: candidate.endAt },
    ]);

    // 延長工時 = 每日超過正常工時的部分加總
    let overtimeMinutes = 0;
    for (const [, visits] of byDate) {
      const work = calcWorkMinutes(visits, orgPolicy.idleGapCountsAsWorkThresholdMinutes);
      overtimeMinutes += Math.max(0, work.policy - orgPolicy.normalDailyMinutes);
    }

    const cap =
      orgPolicy.monthlyOtMode === 'FLEX_54_138'
        ? orgPolicy.flexOtMonthMinutes
        : Math.min(attendant.maxMonthlyOtMinutes, orgPolicy.monthlyOtMinutes);

    if (overtimeMinutes <= cap) return [];

    const modeLabel =
      orgPolicy.monthlyOtMode === 'FLEX_54_138'
        ? '彈性制（經勞資會議同意，單月 54 小時）'
        : '一般制（每月 46 小時）';

    return [
      {
        ruleId: 'R17',
        severity: 'WARN',
        titleZh: '月延長工時超過上限',
        overridable: true,
        messageZh: `${taipeiMonthOf(candidate.serviceDate)} 延長工時將達 ${fmtHours(overtimeMinutes)} 小時，超過 ${modeLabel} 上限 ${fmtHours(cap)} 小時`,
        legalRef: '勞動基準法 §32 II',
        data: { overtimeMinutes, cap, mode: orgPolicy.monthlyOtMode },
      },
    ];
  },
};

/**
 * R18 七休一
 *
 * 法條是「每七日中應有二日之休息，其中一日為例假、一日為休息日」，
 * 關鍵在「每七日中」而非「連續上班天數」。
 *
 * 正確算法：取候選日前後各 6 天（共 13 天）的排班狀況，
 * 檢查**任一個長度為 7 的滑動視窗**是否 7 天全部有班。
 * 只數「連續上班天數」會漏掉「休假日落在視窗外」的違規情形。
 */
export const R18_SEVEN_DAY_REST: ConflictRule = {
  id: 'R18',
  titleZh: '違反七休一',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, attendantVisitsInWindow, orgPolicy } = ctx;
    if (!attendant || !candidate.attendantId) return [];
    if (!orgPolicy.enforceSevenDayRest) return [];

    // 有班的日子集合（含候選日）
    const workDays = new Set<TaipeiDate>(
      attendantVisitsInWindow
        .filter(isActiveVisit)
        .filter((v) => v.id !== candidate.id)
        .map((v) => v.serviceDate),
    );
    workDays.add(candidate.serviceDate);

    // 以候選日為中心，檢查所有包含候選日的 7 天視窗
    for (let offset = -6; offset <= 0; offset += 1) {
      const windowStart = addTaipeiDays(candidate.serviceDate, offset);
      let allWorked = true;
      const days: TaipeiDate[] = [];
      for (let i = 0; i < 7; i += 1) {
        const d = addTaipeiDays(windowStart, i);
        days.push(d);
        if (!workDays.has(d)) {
          allWorked = false;
          break;
        }
      }
      if (allWorked) {
        return [
          {
            ruleId: 'R18',
            severity: 'BLOCK',
            titleZh: '違反七休一',
            // 可覆寫：勞基法 §36 有經勞資會議同意的例外情形（如天災、突發事件）。
            // 覆寫需填理由並留下稽核軌跡。
            overridable: true,
            messageZh: `排入後，${days[0]} 至 ${days[6]} 連續 7 日皆有班，未有例假日`,
            legalRef: '勞動基準法 §36',
            data: { windowStart: days[0], windowEnd: days[6], days },
          },
        ];
      }
    }

    return [];
  },
};

/** R19 班距不足（前一日末班至當日首班的間隔） */
export const R19_SHIFT_GAP: ConflictRule = {
  id: 'R19',
  titleZh: '班距不足',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, attendantVisitsInWindow, orgPolicy } = ctx;
    if (!attendant || !candidate.attendantId) return [];

    const active = attendantVisitsInWindow
      .filter(isActiveVisit)
      .filter((v) => v.id !== candidate.id);

    const findings: ConflictFinding[] = [];

    // 候選班次之前、且不同日的最後一班
    const before = active
      .filter((v) => v.endAt <= candidate.startAt && v.serviceDate !== candidate.serviceDate)
      .sort((a, b) => b.endAt.getTime() - a.endAt.getTime())[0];

    if (before) {
      const gap = Math.round((candidate.startAt.getTime() - before.endAt.getTime()) / 60_000);
      if (gap < orgPolicy.minShiftGapMinutes) {
        findings.push({
          ruleId: 'R19',
          severity: 'WARN',
          titleZh: '班距不足',
          overridable: true,
          messageZh: `距離前一日最後一班僅 ${fmtHours(gap)} 小時，低於建議的 ${fmtHours(orgPolicy.minShiftGapMinutes)} 小時`,
          // §34 是輪班制的規定，居家服務是否構成輪班制在實務上有爭議，
          // 因此僅列為 WARN 並標註爭議。
          legalRef: '勞動基準法 §34（居家服務是否適用有爭議）',
          relatedVisitIds: [before.id],
          data: { gapMinutes: gap, requiredMinutes: orgPolicy.minShiftGapMinutes },
        });
      }
    }

    return findings;
  },
};

/** R20 連續工作逾 4 小時未安排 30 分鐘休息 */
export const R20_REST_BREAK: ConflictRule = {
  id: 'R20',
  titleZh: '休息時間不足',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, attendantVisitsInWindow, orgPolicy } = ctx;
    if (!attendant || !candidate.attendantId) return [];

    const sameDay = visitsOnDate(attendantVisitsInWindow, candidate.serviceDate, candidate.id);
    const merged = mergeCandidate(sameDay, candidate);
    const blocks = groupWorkBlocks(sortByStart(merged), orgPolicy.restBreakMinutes);

    const violating = blocks.filter((b) => b.minutes > orgPolicy.restBreakAfterMinutes);
    if (violating.length === 0) return [];

    const longest = violating.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    return [
      {
        ruleId: 'R20',
        severity: 'WARN',
        titleZh: '休息時間不足',
        overridable: true,
        messageZh: `將形成連續 ${fmtHours(longest.minutes)} 小時未滿 ${orgPolicy.restBreakMinutes} 分鐘休息的工作區塊，超過 ${fmtHours(orgPolicy.restBreakAfterMinutes)} 小時`,
        legalRef: '勞動基準法 §35',
        data: {
          blockMinutes: longest.minutes,
          threshold: orgPolicy.restBreakAfterMinutes,
          blockCount: violating.length,
        },
      },
    ];
  },
};

export const LABOUR_RULES: ConflictRule[] = [
  R15_DAILY_HOURS,
  R16_WEEKLY_HOURS,
  R17_MONTHLY_OVERTIME,
  R18_SEVEN_DAY_REST,
  R19_SHIFT_GAP,
  R20_REST_BREAK,
];

export { diffTaipeiDays };
