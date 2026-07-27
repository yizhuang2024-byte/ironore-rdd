/**
 * R01–R09、R21：與照服員本身相關的規則
 * （時間重疊、請假、可服務時段、區域、證照、任職狀態）
 */

import { CERT_TYPE_LABELS } from '../../domain/enums.js';
import { estimateTravelMinutes } from '../../domain/geo.js';
import {
  formatTaipeiRange,
  formatTaipeiTime,
  rangesOverlap,
  toTaipeiWeekday,
  toTaipeiMinuteOfDay,
} from '../../domain/time.js';
import type { ConflictFinding, ConflictRule, ConflictContext } from '../types.js';
import { isActiveVisit, sortByStart, visitsOnDate } from '../workload.js';

/** R01 照服員時段重疊 —— DB 層 EXCLUDE 約束會兜底，此處提供友善訊息 */
export const R01_ATTENDANT_OVERLAP: ConflictRule = {
  id: 'R01',
  titleZh: '時間重疊',
  lightweight: true,
  evaluate(ctx) {
    const { candidate, attendant, attendantVisitsInWindow } = ctx;
    if (!attendant || !candidate.attendantId) return [];

    const cand = { start: candidate.startAt, end: candidate.endAt };
    const clashes = attendantVisitsInWindow
      .filter(isActiveVisit)
      .filter((v) => v.id !== candidate.id)
      .filter((v) => rangesOverlap(cand, { start: v.startAt, end: v.endAt }));

    if (clashes.length === 0) return [];

    return [
      {
        ruleId: 'R01',
        severity: 'BLOCK',
        titleZh: '時間重疊',
        // 覆寫即等於讓一個人同時出現在兩個案家 —— 沒有任何合法情境，故不可覆寫。
        // DB 的 EXCLUDE 約束也會拒絕，覆寫按鈕只會讓督導撞上 500。
        overridable: false,
        messageZh: `與既有班次重疊：${clashes
          .map((c) => formatTaipeiRange({ start: c.startAt, end: c.endAt }))
          .join('、')}`,
        legalRef: undefined,
        relatedVisitIds: clashes.map((c) => c.id),
        data: { clashCount: clashes.length },
      },
    ];
  },
};

/** R02 照服員請假衝突 */
export const R02_ON_LEAVE: ConflictRule = {
  id: 'R02',
  titleZh: '請假衝突',
  lightweight: true,
  evaluate(ctx) {
    const { candidate, approvedLeaves } = ctx;
    if (!candidate.attendantId) return [];

    const cand = { start: candidate.startAt, end: candidate.endAt };
    const clashes = approvedLeaves
      .filter((l) => l.approved)
      .filter((l) => rangesOverlap(cand, { start: l.startAt, end: l.endAt }));

    if (clashes.length === 0) return [];

    return [
      {
        ruleId: 'R02',
        severity: 'BLOCK',
        titleZh: '請假衝突',
        // 可覆寫：實務上有「銷假上班」的情形，督導填理由後可強制排入。
        overridable: true,
        messageZh: `該時段照服員已請假（${clashes
          .map((l) => formatTaipeiRange({ start: l.startAt, end: l.endAt }))
          .join('、')}）`,
        data: { leaveIds: clashes.map((l) => l.id) },
      },
    ];
  },
};

/** R03 不在可服務時段 */
export const R03_NOT_AVAILABLE: ConflictRule = {
  id: 'R03',
  titleZh: '非可服務時段',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant } = ctx;
    if (!attendant || !candidate.attendantId) return [];
    if (attendant.availabilities.length === 0) return []; // 未設定視為不限制

    const weekday = toTaipeiWeekday(candidate.startAt);
    const startMin = toTaipeiMinuteOfDay(candidate.startAt);
    // 跨日班次的結束分鐘可能小於開始分鐘，換算為 >1440 以利比較
    const rawEndMin = toTaipeiMinuteOfDay(candidate.endAt);
    const endMin = rawEndMin <= startMin ? rawEndMin + 1440 : rawEndMin;

    const windows = attendant.availabilities.filter((a) => a.weekday === weekday);
    const covered = windows.some((w) => startMin >= w.startMinute && endMin <= w.endMinute);
    if (covered) return [];

    return [
      {
        ruleId: 'R03',
        severity: 'WARN',
        titleZh: '非可服務時段',
        overridable: true,
        messageZh:
          windows.length === 0
            ? `照服員 ${attendant.name} 該日未登記可服務時段`
            : `不在照服員登記的可服務時段內（該日可服務：${windows
                .map(
                  (w) =>
                    `${String(Math.floor(w.startMinute / 60)).padStart(2, '0')}:${String(
                      w.startMinute % 60,
                    ).padStart(2, '0')}–${String(Math.floor(w.endMinute / 60)).padStart(
                      2,
                      '0',
                    )}:${String(w.endMinute % 60).padStart(2, '0')}`,
                )
                .join('、')}）`,
        data: { weekday, startMin, endMin },
      },
    ];
  },
};

/** R06 服務區域不符 */
export const R06_AREA_MISMATCH: ConflictRule = {
  id: 'R06',
  titleZh: '服務區域不符',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, recipient } = ctx;
    if (!attendant || !candidate.attendantId) return [];
    if (attendant.serviceAreas.length === 0) return []; // 未設定視為不限制
    if (attendant.serviceAreas.includes(recipient.districtCode)) return [];

    return [
      {
        ruleId: 'R06',
        severity: 'WARN',
        titleZh: '服務區域不符',
        overridable: true,
        messageZh: `個案位於 ${recipient.districtCode}，不在照服員 ${attendant.name} 的可服務區域內`,
        data: {
          recipientDistrict: recipient.districtCode,
          attendantAreas: attendant.serviceAreas,
        },
      },
    ];
  },
};

/**
 * R07 路程來不及
 *
 * ⚠️ 恆為 WARN，永不 BLOCK。
 *    DB 的 EXCLUDE 約束以純時間區間判定重疊，不含路程緩衝；
 *    若此規則升級為 BLOCK，會與 DB 的允許狀態不一致，造成前後端行為矛盾。
 *    且路程本身只是估算值（見 domain/geo.ts），不足以作為硬性阻擋的依據。
 */
export const R07_TRAVEL_TIME: ConflictRule = {
  id: 'R07',
  titleZh: '路程可能來不及',
  lightweight: true,
  evaluate(ctx) {
    const { candidate, attendant, recipient, attendantVisitsInWindow, orgPolicy, districts } = ctx;
    if (!attendant || !candidate.attendantId) return [];

    const sameDay = visitsOnDate(attendantVisitsInWindow, candidate.serviceDate, candidate.id);
    if (sameDay.length === 0) return [];

    const sorted = sortByStart(sameDay);
    const findings: ConflictFinding[] = [];

    const prev = [...sorted].reverse().find((v) => v.endAt <= candidate.startAt);
    const next = sorted.find((v) => v.startAt >= candidate.endAt);

    const candidateEndpoint = { coords: recipient.coords, districtCode: recipient.districtCode };

    if (prev) {
      const est = estimateTravelMinutes(
        { coords: prev.coords, districtCode: prev.districtCode },
        candidateEndpoint,
        orgPolicy.travel,
        districts,
      );
      const availableMin = Math.round(
        (candidate.startAt.getTime() - prev.endAt.getTime()) / 60_000,
      );
      if (est.minutes > availableMin) {
        findings.push({
          ruleId: 'R07',
          severity: 'WARN',
          titleZh: '路程可能來不及',
          overridable: true,
          messageZh: `自前一趟（${formatTaipeiTime(prev.endAt)} 結束）移動至此需約 ${est.minutes} 分鐘，但僅有 ${availableMin} 分鐘（${confidenceLabel(est.confidence)}）`,
          relatedVisitIds: [prev.id],
          data: { neededMinutes: est.minutes, availableMinutes: availableMin, confidence: est.confidence },
        });
      }
    }

    if (next) {
      const est = estimateTravelMinutes(
        candidateEndpoint,
        { coords: next.coords, districtCode: next.districtCode },
        orgPolicy.travel,
        districts,
      );
      const availableMin = Math.round((next.startAt.getTime() - candidate.endAt.getTime()) / 60_000);
      if (est.minutes > availableMin) {
        findings.push({
          ruleId: 'R07',
          severity: 'WARN',
          titleZh: '路程可能來不及',
          overridable: true,
          messageZh: `移動至下一趟（${formatTaipeiTime(next.startAt)} 開始）需約 ${est.minutes} 分鐘，但僅有 ${availableMin} 分鐘（${confidenceLabel(est.confidence)}）`,
          relatedVisitIds: [next.id],
          data: { neededMinutes: est.minutes, availableMinutes: availableMin, confidence: est.confidence },
        });
      }
    }

    return findings;
  },
};

function confidenceLabel(c: string): string {
  switch (c) {
    case 'COORDINATES':
      return '依座標估算';
    case 'DISTRICT_ADJACENCY':
      return '依行政區粗估';
    default:
      return '粗估，資料不足';
  }
}

/** R08 證照不符 / R09 證照已到期 */
export const R08_R09_CERTIFICATION: ConflictRule = {
  id: 'R08',
  titleZh: '證照不符',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, paymentItems } = ctx;
    if (!attendant || !candidate.attendantId) return [];

    const required = new Set(
      candidate.items.flatMap((i) => paymentItems.get(i.code)?.requiredCerts ?? []),
    );
    if (required.size === 0) return [];

    const findings: ConflictFinding[] = [];
    const missing: string[] = [];
    const expired: { cert: string; on: string }[] = [];

    for (const certType of required) {
      const held = attendant.certifications.filter((c) => c.certType === certType);
      if (held.length === 0) {
        missing.push(CERT_TYPE_LABELS[certType] ?? certType);
        continue;
      }
      // 只要有任一張在服務日仍有效即通過
      const valid = held.some((c) => !c.expiresOn || c.expiresOn >= candidate.serviceDate);
      if (!valid) {
        const latest = held
          .map((c) => c.expiresOn)
          .filter((d): d is string => !!d)
          .sort()
          .pop()!;
        expired.push({ cert: CERT_TYPE_LABELS[certType] ?? certType, on: latest });
      }
    }

    if (missing.length > 0) {
      findings.push({
        ruleId: 'R08',
        severity: 'BLOCK',
        titleZh: '證照不符',
        // 不可覆寫：無資格者提供該服務，申報必被核刪，且涉及服務品質與法律責任。
        overridable: false,
        messageZh: `照服員 ${attendant.name} 缺少此班次所需證照：${missing.join('、')}`,
        data: { missing },
      });
    }

    if (expired.length > 0) {
      findings.push({
        ruleId: 'R09',
        severity: 'BLOCK',
        titleZh: '證照已到期',
        overridable: false,
        messageZh: expired
          .map((e) => `${e.cert} 已於 ${e.on} 到期（服務日 ${candidate.serviceDate}）`)
          .join('；'),
        data: { expired },
      });
    }

    return findings;
  },
};

/** R21 照服員／個案狀態或服務期間不符 */
export const R21_STATUS_AND_PERIOD: ConflictRule = {
  id: 'R21',
  titleZh: '狀態或服務期間不符',
  lightweight: false,
  evaluate(ctx) {
    const { candidate, attendant, recipient } = ctx;
    const date = candidate.serviceDate;
    const findings: ConflictFinding[] = [];

    if (recipient.status !== 'ACTIVE') {
      findings.push({
        ruleId: 'R21',
        severity: 'BLOCK',
        titleZh: '個案狀態不符',
        overridable: false,
        messageZh: `個案 ${recipient.name} 目前狀態為「${recipientStatusLabel(recipient.status)}」，不可排班`,
        data: { recipientStatus: recipient.status },
      });
    }

    if (date < recipient.serviceStartOn) {
      findings.push({
        ruleId: 'R21',
        severity: 'BLOCK',
        titleZh: '早於個案服務起始日',
        overridable: false,
        messageZh: `服務日 ${date} 早於個案服務起始日 ${recipient.serviceStartOn}`,
      });
    }
    if (recipient.serviceEndOn && date > recipient.serviceEndOn) {
      findings.push({
        ruleId: 'R21',
        severity: 'BLOCK',
        titleZh: '晚於個案服務結束日',
        overridable: false,
        messageZh: `服務日 ${date} 晚於個案服務結束日 ${recipient.serviceEndOn}`,
      });
    }

    if (attendant && candidate.attendantId) {
      if (attendant.status === 'RESIGNED') {
        findings.push({
          ruleId: 'R21',
          severity: 'BLOCK',
          titleZh: '照服員已離職',
          overridable: false,
          messageZh: `照服員 ${attendant.name} 已離職，不可排班`,
        });
      }
      if (date < attendant.hiredOn) {
        findings.push({
          ruleId: 'R21',
          severity: 'BLOCK',
          titleZh: '早於照服員到職日',
          overridable: false,
          messageZh: `服務日 ${date} 早於照服員到職日 ${attendant.hiredOn}`,
        });
      }
      if (attendant.resignedOn && date > attendant.resignedOn) {
        findings.push({
          ruleId: 'R21',
          severity: 'BLOCK',
          titleZh: '晚於照服員離職日',
          overridable: false,
          messageZh: `服務日 ${date} 晚於照服員離職日 ${attendant.resignedOn}`,
        });
      }
    }

    return findings;
  },
};

function recipientStatusLabel(s: string): string {
  const map: Record<string, string> = {
    PENDING: '待啟案',
    ACTIVE: '服務中',
    SUSPENDED: '暫停服務',
    CLOSED: '已結案',
  };
  return map[s] ?? s;
}

export const ATTENDANT_RULES: ConflictRule[] = [
  R01_ATTENDANT_OVERLAP,
  R02_ON_LEAVE,
  R03_NOT_AVAILABLE,
  R06_AREA_MISMATCH,
  R07_TRAVEL_TIME,
  R08_R09_CERTIFICATION,
  R21_STATUS_AND_PERIOD,
];

// 供 engine 匯出時使用的 helper
export type { ConflictContext };
