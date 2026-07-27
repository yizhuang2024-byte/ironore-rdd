/**
 * R04、R05、R10–R14：與個案、照顧計畫、支付項目相關的規則
 */

import { calcLineAmount, type PaymentItemPricing } from '../../payment/quota.js';
import { calcCopay } from '../../payment/copay.js';
import {
  formatTaipeiRange,
  rangesOverlap,
  toTaipeiMinuteOfDay,
  toTaipeiWeekday,
} from '../../domain/time.js';
import type {
  CarePlanSnapshot,
  ConflictContext,
  ConflictFinding,
  ConflictRule,
} from '../types.js';
import { isActiveVisit } from '../workload.js';

/** 找出服務日當時生效的照顧計畫 */
export function activeCarePlanOn(
  plans: readonly CarePlanSnapshot[],
  date: string,
): CarePlanSnapshot | undefined {
  return plans.find(
    (p) =>
      p.status === 'ACTIVE' &&
      p.effectiveFrom <= date &&
      (!p.effectiveTo || date <= p.effectiveTo),
  );
}

/** R04 個案同時段已有其他照服員服務 */
export const R04_RECIPIENT_DOUBLE_BOOKED: ConflictRule = {
  id: 'R04',
  titleZh: '個案時段重複',
  lightweight: true,
  evaluate(ctx) {
    const { candidate, recipient, recipientVisitsOnDate } = ctx;
    const cand = { start: candidate.startAt, end: candidate.endAt };

    const clashes = recipientVisitsOnDate
      .filter(isActiveVisit)
      .filter((v) => v.id !== candidate.id)
      .filter((v) => rangesOverlap(cand, { start: v.startAt, end: v.endAt }));

    if (clashes.length === 0) return [];

    return [
      {
        ruleId: 'R04',
        severity: 'BLOCK',
        titleZh: '個案時段重複',
        // 可覆寫：雙人服務（如兩人協助移位、沐浴車服務）在實務上是合法且必要的情形。
        overridable: true,
        messageZh: `個案 ${recipient.name} 在 ${clashes
          .map((c) => formatTaipeiRange({ start: c.startAt, end: c.endAt }))
          .join('、')} 已有其他服務安排`,
        relatedVisitIds: clashes.map((c) => c.id),
      },
    ];
  },
};

/** R05 個案不可服務時段 */
export const R05_RECIPIENT_UNAVAILABLE: ConflictRule = {
  id: 'R05',
  titleZh: '個案不可服務時段',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, recipient } = ctx;
    if (recipient.unavailability.length === 0) return [];

    const weekday = toTaipeiWeekday(candidate.startAt);
    const startMin = toTaipeiMinuteOfDay(candidate.startAt);
    const rawEnd = toTaipeiMinuteOfDay(candidate.endAt);
    const endMin = rawEnd <= startMin ? rawEnd + 1440 : rawEnd;

    const hits = recipient.unavailability.filter((u) => {
      const applies =
        u.specificDate === candidate.serviceDate ||
        (u.specificDate == null && u.weekday === weekday);
      if (!applies) return false;
      return startMin < u.endMinute && u.startMinute < endMin;
    });

    if (hits.length === 0) return [];

    return [
      {
        ruleId: 'R05',
        severity: 'WARN',
        titleZh: '個案不可服務時段',
        overridable: true,
        messageZh: `該時段為個案不可服務時段${
          hits[0]?.reason ? `（${hits.map((h) => h.reason).filter(Boolean).join('、')}）` : ''
        }`,
        data: { hits: hits.length },
      },
    ];
  },
};

/** R22 照顧計畫未生效 / R10 項目未經核定 */
export const R10_R22_CARE_PLAN: ConflictRule = {
  id: 'R10',
  titleZh: '照顧計畫',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, recipient } = ctx;
    const plan = activeCarePlanOn(recipient.carePlans, candidate.serviceDate);

    if (!plan) {
      return [
        {
          ruleId: 'R22',
          severity: 'BLOCK',
          titleZh: '無生效中的照顧計畫',
          // 不可覆寫：沒有核定計畫就沒有給付依據，排了也無法申報。
          overridable: false,
          messageZh: `個案 ${recipient.name} 在 ${candidate.serviceDate} 無生效中的照顧計畫`,
        },
      ];
    }

    const approved = new Set(plan.items.map((i) => i.code));
    const notApproved = candidate.items.map((i) => i.code).filter((c) => !approved.has(c));
    if (notApproved.length === 0) return [];

    return [
      {
        ruleId: 'R10',
        severity: 'BLOCK',
        titleZh: '項目未經核定',
        // 不可覆寫：未經照管中心核定的項目無給付依據，申報必被核刪。
        overridable: false,
        messageZh: `以下項目未列於個案的照顧計畫核定範圍：${notApproved.join('、')}`,
        data: { notApproved, carePlanId: plan.id },
      },
    ];
  },
};

/** R11 核定次數超用（週/月） */
export const R11_APPROVED_COUNT: ConflictRule = {
  id: 'R11',
  titleZh: '核定次數超用',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, recipient, monthUsage } = ctx;
    const plan = activeCarePlanOn(recipient.carePlans, candidate.serviceDate);
    if (!plan) return []; // R22 已處理

    const findings: ConflictFinding[] = [];

    for (const line of candidate.items) {
      const approved = plan.items.find((i) => i.code === line.code);
      if (!approved) continue; // R10 已處理

      const usedMonth = monthUsage.countByCode[line.code] ?? 0;
      if (usedMonth + line.quantity > approved.approvedPerMonth) {
        findings.push({
          ruleId: 'R11',
          severity: 'BLOCK',
          titleZh: '超過核定月次數',
          // 可覆寫：實務上會有個案狀況變化、計畫變更前的過渡期。
          // 但超用部分申報可能被核刪，故需督導明確承擔。
          overridable: true,
          messageZh: `${line.code} 本月已排 ${usedMonth} 次，再排 ${line.quantity} 次將超過核定的每月 ${approved.approvedPerMonth} 次`,
          data: {
            code: line.code,
            used: usedMonth,
            adding: line.quantity,
            approvedPerMonth: approved.approvedPerMonth,
          },
        });
        continue;
      }

      if (approved.approvedPerWeek != null) {
        const usedWeek = monthUsage.weekCountByCode[line.code] ?? 0;
        if (usedWeek + line.quantity > approved.approvedPerWeek) {
          findings.push({
            ruleId: 'R11',
            severity: 'WARN',
            titleZh: '超過核定週次數',
            overridable: true,
            messageZh: `${line.code} 本週已排 ${usedWeek} 次，再排 ${line.quantity} 次將超過核定的每週 ${approved.approvedPerWeek} 次`,
            data: {
              code: line.code,
              used: usedWeek,
              adding: line.quantity,
              approvedPerWeek: approved.approvedPerWeek,
            },
          });
        }
      }
    }

    return findings;
  },
};

/** R12 同日不可重複之項目 */
export const R12_MAX_PER_DAY: ConflictRule = {
  id: 'R12',
  titleZh: '同日次數超限',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, recipientVisitsOnDate, paymentItems } = ctx;
    const findings: ConflictFinding[] = [];

    // 統計該個案當日（不含候選）各代碼已排次數
    const usedToday: Record<string, number> = {};
    for (const v of recipientVisitsOnDate) {
      if (!isActiveVisit(v) || v.id === candidate.id) continue;
      for (const it of v.items ?? []) {
        usedToday[it.code] = (usedToday[it.code] ?? 0) + it.quantity;
      }
    }

    for (const line of candidate.items) {
      const item = paymentItems.get(line.code);
      if (!item?.maxPerDay) continue;
      const used = usedToday[line.code] ?? 0;
      if (used + line.quantity > item.maxPerDay) {
        findings.push({
          ruleId: 'R12',
          severity: 'BLOCK',
          titleZh: '同日次數超限',
          // 不可覆寫：支付基準明定的同日上限，超過必被核刪。
          overridable: false,
          messageZh: `${line.code}（${item.name}）當日已排 ${used} 次，支付基準限制每日至多 ${item.maxPerDay} 次`,
          data: { code: line.code, used, adding: line.quantity, maxPerDay: item.maxPerDay },
        });
      }
    }

    return findings;
  },
};

/** R13 加計項目不可單獨排班 */
export const R13_ADDON_ALONE: ConflictRule = {
  id: 'R13',
  titleZh: '加計項目單獨排班',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, paymentItems } = ctx;
    if (candidate.items.length === 0) return [];

    const resolved = candidate.items.map((l) => paymentItems.get(l.code)).filter((i) => !!i);
    if (resolved.length === 0) return [];

    const hasBase = resolved.some((i) => !i.isAddOn);
    const addOns = resolved.filter((i) => i.isAddOn);
    if (hasBase || addOns.length === 0) return [];

    return [
      {
        ruleId: 'R13',
        severity: 'BLOCK',
        titleZh: '加計項目不可單獨排班',
        overridable: false,
        messageZh: `此班次僅含加計項目（${addOns.map((a) => a.code).join('、')}），必須搭配至少一個主要服務項目`,
        data: { addOnCodes: addOns.map((a) => a.code) },
      },
    ];
  },
};

/** R14 個案月給付額度超支 */
export const R14_QUOTA_EXCEEDED: ConflictRule = {
  id: 'R14',
  titleZh: '月額度超支',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, recipient, monthUsage, paymentItems, orgPolicy } = ctx;
    const plan = activeCarePlanOn(recipient.carePlans, candidate.serviceDate);
    if (!plan) return [];

    let addingAmount = 0;
    for (const line of candidate.items) {
      const item = paymentItems.get(line.code);
      if (!item) continue;
      if (item.countsToQuota === false) continue;
      const pricing: PaymentItemPricing = {
        code: item.code,
        category: item.category,
        price: item.price,
        priceRemote: item.priceRemote,
        isAddOn: item.isAddOn,
      };
      addingAmount += calcLineAmount(pricing, line.quantity, recipient.remoteAreaTier);
    }

    const projected = monthUsage.scheduledAmount + addingAmount;
    if (projected <= plan.monthlyQuota) return [];

    const copay = calcCopay({
      scheduledAmount: projected,
      approvedQuota: plan.monthlyQuota,
      ratePermille: monthUsage.ratePermille,
      roundingMode: orgPolicy.roundingMode,
    });

    return [
      {
        ruleId: 'R14',
        severity: 'WARN',
        titleZh: '月額度超支',
        overridable: true,
        messageZh: `排入後本月金額將達 ${projected.toLocaleString('zh-TW')} 元，超出核定額度 ${plan.monthlyQuota.toLocaleString('zh-TW')} 元共 ${copay.overQuotaSelfPay.toLocaleString('zh-TW')} 元；超額部分須由個案 100% 自費（預估自付總額 ${copay.totalSelfPay.toLocaleString('zh-TW')} 元）`,
        data: {
          projectedAmount: projected,
          monthlyQuota: plan.monthlyQuota,
          overQuotaSelfPay: copay.overQuotaSelfPay,
          totalSelfPay: copay.totalSelfPay,
        },
      },
    ];
  },
};

export const RECIPIENT_RULES: ConflictRule[] = [
  R04_RECIPIENT_DOUBLE_BOOKED,
  R05_RECIPIENT_UNAVAILABLE,
  R10_R22_CARE_PLAN,
  R11_APPROVED_COUNT,
  R12_MAX_PER_DAY,
  R13_ADDON_ALONE,
  R14_QUOTA_EXCEEDED,
];

export type { ConflictContext };
