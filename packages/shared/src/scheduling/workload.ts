/**
 * 工時計算。
 *
 * ⚠️ 居家服務照服員「趟與趟之間的空檔是否為工時」是長照產業長年未定的爭議
 *    （涉及待命時間 vs 自由運用時間、交通時間是否為工時）。
 *
 *    本模組刻意**同時輸出三種算法**，由 UI 並陳、由機構政策決定採用哪一種：
 *      - loose  ：僅服務時數加總（對機構最有利的解讀）
 *      - strict ：首班到末班的完整跨度，所有空檔都算工時（對勞工最有利的解讀）
 *      - policy ：空檔 ≤ 門檻者計入，> 門檻者不計（機構設定的折衷值）
 *
 *    系統不對此表示法律見解。詳見 docs/03-conflict-rules.md。
 */

import { INACTIVE_VISIT_STATUSES } from '../domain/enums.js';
import { startOfTaipeiWeek, taipeiMonthOf, type TaipeiDate } from '../domain/time.js';
import type { VisitDraft, VisitSnapshot, WorkMinutes } from './types.js';

/**
 * 具備時間區間的最小介面，讓 draft 與 snapshot 共用計算。
 * 注意欄位名為 startAt/endAt（與 DB 一致），而非 domain/time.ts 的 TimeRange（start/end）。
 */
interface Interval {
  startAt: Date;
  endAt: Date;
}

const intervalMinutes = (i: Interval): number =>
  Math.round((i.endAt.getTime() - i.startAt.getTime()) / 60_000);

/** 過濾掉已取消／未到的班次 —— 這些不計工時、不佔額度、不參與衝突判斷。 */
export function isActiveVisit(v: VisitSnapshot): boolean {
  return !INACTIVE_VISIT_STATUSES.includes(v.status);
}

/** 依開始時間排序（不改動原陣列） */
export function sortByStart<T extends Interval>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * 計算一組班次的工時（三種算法）。
 * 傳入的班次應為同一天、同一位照服員。
 */
export function calcWorkMinutes(
  visits: readonly Interval[],
  idleGapThresholdMinutes: number,
): WorkMinutes {
  if (visits.length === 0) return { loose: 0, strict: 0, policy: 0 };

  const sorted = sortByStart(visits);
  const loose = sorted.reduce((sum, v) => sum + intervalMinutes(v), 0);

  const first = sorted[0]!;
  const last = sorted.reduce((acc, v) => (v.endAt > acc.endAt ? v : acc), first);
  const strict = Math.round((last.endAt.getTime() - first.startAt.getTime()) / 60_000);

  let policy = loose;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const gap = Math.round((cur.startAt.getTime() - prev.endAt.getTime()) / 60_000);
    if (gap > 0 && gap <= idleGapThresholdMinutes) policy += gap;
  }

  return { loose, strict, policy };
}

/**
 * 把候選班次併入既有班次清單。
 * 若候選班次是既有班次的修改（帶 id），先移除同 id 的舊版本，避免自己跟自己比。
 */
export function mergeCandidate(
  existing: readonly VisitSnapshot[],
  candidate: VisitDraft,
): Interval[] {
  const others = existing
    .filter(isActiveVisit)
    .filter((v) => v.id !== candidate.id)
    .map<Interval>((v) => ({ startAt: v.startAt, endAt: v.endAt }));
  return [...others, { startAt: candidate.startAt, endAt: candidate.endAt }];
}

/** 取出某位照服員在指定台北日曆日的有效班次（不含候選） */
export function visitsOnDate(
  visits: readonly VisitSnapshot[],
  date: TaipeiDate,
  excludeId?: string,
): VisitSnapshot[] {
  return visits.filter(
    (v) => v.serviceDate === date && v.id !== excludeId && isActiveVisit(v),
  );
}

/** 取出某週（週一起算）的有效班次 */
export function visitsInWeek(
  visits: readonly VisitSnapshot[],
  weekOf: TaipeiDate,
  excludeId?: string,
): VisitSnapshot[] {
  const monday = startOfTaipeiWeek(weekOf);
  return visits.filter(
    (v) => startOfTaipeiWeek(v.serviceDate) === monday && v.id !== excludeId && isActiveVisit(v),
  );
}

/** 取出某月的有效班次 */
export function visitsInMonth(
  visits: readonly VisitSnapshot[],
  monthOf: TaipeiDate,
  excludeId?: string,
): VisitSnapshot[] {
  const month = taipeiMonthOf(monthOf);
  return visits.filter(
    (v) => taipeiMonthOf(v.serviceDate) === month && v.id !== excludeId && isActiveVisit(v),
  );
}

/**
 * 依「連續工作區塊」分組。
 *
 * 勞基法 §35 規定連續工作 4 小時應有 30 分鐘休息。判定時，
 * 間隔 < 法定休息時間的相鄰班次視為同一個連續工作區塊，且**間隔本身計入區塊長度**
 * —— 否則「做 2 小時、休 5 分鐘、再做 2 小時」會被誤判為兩段各 2 小時的獨立工作。
 */
export function groupWorkBlocks(
  visits: readonly Interval[],
  restBreakMinutes: number,
): { start: Date; end: Date; minutes: number }[] {
  if (visits.length === 0) return [];
  const sorted = sortByStart(visits);

  const blocks: { start: Date; end: Date; minutes: number }[] = [];
  let start = sorted[0]!.startAt;
  let end = sorted[0]!.endAt;

  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const gap = Math.round((cur.startAt.getTime() - end.getTime()) / 60_000);
    if (gap < restBreakMinutes) {
      // 休息不足，視為同一連續工作區塊
      if (cur.endAt > end) end = cur.endAt;
    } else {
      blocks.push({ start, end, minutes: Math.round((end.getTime() - start.getTime()) / 60_000) });
      start = cur.startAt;
      end = cur.endAt;
    }
  }
  blocks.push({ start, end, minutes: Math.round((end.getTime() - start.getTime()) / 60_000) });
  return blocks;
}
