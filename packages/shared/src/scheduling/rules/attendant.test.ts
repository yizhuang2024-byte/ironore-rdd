import { describe, expect, it } from 'vitest';
import { runConflictChecks } from '../engine.js';
import {
  at,
  makeAttendant,
  makeCandidate,
  makeContext,
  makeRecipient,
  makeVisit,
} from '../testing.js';
import {
  R01_ATTENDANT_OVERLAP,
  R02_ON_LEAVE,
  R03_NOT_AVAILABLE,
  R06_AREA_MISMATCH,
  R07_TRAVEL_TIME,
  R08_R09_CERTIFICATION,
  R21_STATUS_AND_PERIOD,
} from './attendant.js';

const only = (rule: Parameters<typeof runConflictChecks>[1] extends never ? never : unknown) => rule;
void only;

const D = '2026-08-03'; // 週一

describe('R01 照服員時段重疊', () => {
  it('與既有班次相交 → BLOCK 且不可覆寫', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      attendantVisitsInWindow: [makeVisit('v1', D, '10:00', '12:00')],
    });
    const f = R01_ATTENDANT_OVERLAP.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.overridable).toBe(false);
    expect(f[0]!.relatedVisitIds).toEqual(['v1']);
  });

  it('剛好相接不算重疊 —— 與 DB 的半開區間語意一致', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      attendantVisitsInWindow: [makeVisit('v1', D, '11:00', '13:00')],
    });
    expect(R01_ATTENDANT_OVERLAP.evaluate(ctx)).toHaveLength(0);
  });

  it('已取消的班次不參與比對', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      attendantVisitsInWindow: [makeVisit('v1', D, '10:00', '12:00', { status: 'CANCELLED' })],
    });
    expect(R01_ATTENDANT_OVERLAP.evaluate(ctx)).toHaveLength(0);
  });

  it('修改既有班次時不與自己比對', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { id: 'v1' }),
      attendantVisitsInWindow: [makeVisit('v1', D, '09:00', '11:00')],
    });
    expect(R01_ATTENDANT_OVERLAP.evaluate(ctx)).toHaveLength(0);
  });

  it('未指派照服員時略過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { attendantId: null }),
      attendant: null,
      attendantVisitsInWindow: [makeVisit('v1', D, '10:00', '12:00')],
    });
    expect(R01_ATTENDANT_OVERLAP.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R02 請假衝突', () => {
  it('與已核准的假重疊 → BLOCK 但可覆寫', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      approvedLeaves: [{ id: 'l1', ...at(D, '08:00', '18:00'), approved: true }],
    });
    const f = R02_ON_LEAVE.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.overridable).toBe(true);
  });

  it('未核准的假不擋排班', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      approvedLeaves: [{ id: 'l1', ...at(D, '08:00', '18:00'), approved: false }],
    });
    expect(R02_ON_LEAVE.evaluate(ctx)).toHaveLength(0);
  });

  it('假期不重疊時通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      approvedLeaves: [{ id: 'l1', ...at(D, '13:00', '18:00'), approved: true }],
    });
    expect(R02_ON_LEAVE.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R03 非可服務時段', () => {
  it('落在登記時段外 → WARN', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '19:00', '21:00'),
      attendant: makeAttendant({
        availabilities: [{ weekday: 1, startMinute: 8 * 60, endMinute: 17 * 60 }],
      }),
    });
    const f = R03_NOT_AVAILABLE.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
  });

  it('完全落在登記時段內 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      attendant: makeAttendant({
        availabilities: [{ weekday: 1, startMinute: 8 * 60, endMinute: 17 * 60 }],
      }),
    });
    expect(R03_NOT_AVAILABLE.evaluate(ctx)).toHaveLength(0);
  });

  it('部分超出登記時段 → WARN', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '16:00', '18:00'),
      attendant: makeAttendant({
        availabilities: [{ weekday: 1, startMinute: 8 * 60, endMinute: 17 * 60 }],
      }),
    });
    expect(R03_NOT_AVAILABLE.evaluate(ctx)).toHaveLength(1);
  });

  it('未設定可服務時段視為不限制', () => {
    const ctx = makeContext({ attendant: makeAttendant({ availabilities: [] }) });
    expect(R03_NOT_AVAILABLE.evaluate(ctx)).toHaveLength(0);
  });

  it('該日無登記時段 → WARN 並說明未登記', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      attendant: makeAttendant({
        availabilities: [{ weekday: 3, startMinute: 8 * 60, endMinute: 17 * 60 }],
      }),
    });
    const f = R03_NOT_AVAILABLE.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.messageZh).toContain('未登記');
  });
});

describe('R06 服務區域不符', () => {
  it('個案不在可服務區 → WARN', () => {
    const ctx = makeContext({
      attendant: makeAttendant({ serviceAreas: ['63000010'] }),
      recipient: makeRecipient({ districtCode: '63000090' }),
    });
    const f = R06_AREA_MISMATCH.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe('WARN');
    expect(f[0]!.overridable).toBe(true);
  });

  it('個案在可服務區 → 通過', () => {
    const ctx = makeContext({
      attendant: makeAttendant({ serviceAreas: ['63000090', '63000010'] }),
      recipient: makeRecipient({ districtCode: '63000090' }),
    });
    expect(R06_AREA_MISMATCH.evaluate(ctx)).toHaveLength(0);
  });

  it('未設定服務區視為不限制', () => {
    const ctx = makeContext({ attendant: makeAttendant({ serviceAreas: [] }) });
    expect(R06_AREA_MISMATCH.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R07 路程來不及', () => {
  it('前一班結束後間隔不足 → WARN（永不 BLOCK）', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '11:05', '12:00'),
      recipient: makeRecipient({ districtCode: 'FAR' }),
      attendantVisitsInWindow: [makeVisit('v1', D, '09:00', '11:00', { districtCode: 'NEAR' })],
    });
    const f = R07_TRAVEL_TIME.evaluate(ctx);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.severity === 'WARN')).toBe(true);
    expect(f[0]!.messageZh).toContain('分鐘');
  });

  it('間隔充足 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '14:00', '15:00'),
      recipient: makeRecipient({ districtCode: 'FAR' }),
      attendantVisitsInWindow: [makeVisit('v1', D, '09:00', '11:00', { districtCode: 'NEAR' })],
    });
    expect(R07_TRAVEL_TIME.evaluate(ctx)).toHaveLength(0);
  });

  it('同日無其他班次 → 通過', () => {
    const ctx = makeContext({ candidate: makeCandidate(D, '09:00', '11:00') });
    expect(R07_TRAVEL_TIME.evaluate(ctx)).toHaveLength(0);
  });

  it('後一班也會被檢查', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      recipient: makeRecipient({ districtCode: 'FAR' }),
      attendantVisitsInWindow: [makeVisit('v2', D, '11:05', '12:00', { districtCode: 'NEAR' })],
    });
    const f = R07_TRAVEL_TIME.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.relatedVisitIds).toEqual(['v2']);
  });
});

describe('R08/R09 證照', () => {
  it('缺少所需證照 → BLOCK 且不可覆寫', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA09', quantity: 1 }] }),
      attendant: makeAttendant({
        certifications: [{ certType: 'CARE_ATTENDANT_TRAINING', expiresOn: null }],
      }),
    });
    const f = R08_R09_CERTIFICATION.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('R08');
    expect(f[0]!.severity).toBe('BLOCK');
    expect(f[0]!.overridable).toBe(false);
    expect(f[0]!.messageZh).toContain('到宅沐浴車');
  });

  it('持有所需證照且未到期 → 通過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA09', quantity: 1 }] }),
      attendant: makeAttendant({
        certifications: [
          { certType: 'CARE_ATTENDANT_TRAINING', expiresOn: null },
          { certType: 'BATH_VEHICLE', expiresOn: '2027-01-01' },
        ],
      }),
    });
    expect(R08_R09_CERTIFICATION.evaluate(ctx)).toHaveLength(0);
  });

  it('證照已於服務日前到期 → R09 BLOCK', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA09', quantity: 1 }] }),
      attendant: makeAttendant({
        certifications: [
          { certType: 'CARE_ATTENDANT_TRAINING', expiresOn: null },
          { certType: 'BATH_VEHICLE', expiresOn: '2026-08-02' },
        ],
      }),
    });
    const f = R08_R09_CERTIFICATION.evaluate(ctx);
    expect(f).toHaveLength(1);
    expect(f[0]!.ruleId).toBe('R09');
    expect(f[0]!.overridable).toBe(false);
  });

  it('證照到期日當天仍有效 —— 邊界值', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA09', quantity: 1 }] }),
      attendant: makeAttendant({
        certifications: [
          { certType: 'CARE_ATTENDANT_TRAINING', expiresOn: null },
          { certType: 'BATH_VEHICLE', expiresOn: D },
        ],
      }),
    });
    expect(R08_R09_CERTIFICATION.evaluate(ctx)).toHaveLength(0);
  });

  it('持有多張同類證照時，只要有一張有效即可', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'BA09', quantity: 1 }] }),
      attendant: makeAttendant({
        certifications: [
          { certType: 'CARE_ATTENDANT_TRAINING', expiresOn: null },
          { certType: 'BATH_VEHICLE', expiresOn: '2025-01-01' }, // 舊的已過期
          { certType: 'BATH_VEHICLE', expiresOn: '2027-01-01' }, // 新的有效
        ],
      }),
    });
    expect(R08_R09_CERTIFICATION.evaluate(ctx)).toHaveLength(0);
  });

  it('項目不需證照時略過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { items: [{ code: 'ZZ01', quantity: 1 }] }),
      attendant: makeAttendant({ certifications: [] }),
    });
    expect(R08_R09_CERTIFICATION.evaluate(ctx)).toHaveLength(0);
  });
});

describe('R21 狀態與服務期間', () => {
  it('個案已結案 → BLOCK', () => {
    const ctx = makeContext({ recipient: makeRecipient({ status: 'CLOSED' }) });
    const f = R21_STATUS_AND_PERIOD.evaluate(ctx);
    expect(f.some((x) => x.titleZh === '個案狀態不符')).toBe(true);
    expect(f[0]!.overridable).toBe(false);
  });

  it('照服員已離職 → BLOCK', () => {
    const ctx = makeContext({ attendant: makeAttendant({ status: 'RESIGNED' }) });
    const f = R21_STATUS_AND_PERIOD.evaluate(ctx);
    expect(f.some((x) => x.titleZh === '照服員已離職')).toBe(true);
  });

  it('服務日早於個案啟案日 → BLOCK', () => {
    const ctx = makeContext({ recipient: makeRecipient({ serviceStartOn: '2026-09-01' }) });
    const f = R21_STATUS_AND_PERIOD.evaluate(ctx);
    expect(f.some((x) => x.titleZh === '早於個案服務起始日')).toBe(true);
  });

  it('服務日晚於照服員離職日 → BLOCK', () => {
    const ctx = makeContext({
      attendant: makeAttendant({ resignedOn: '2026-07-31' }),
    });
    const f = R21_STATUS_AND_PERIOD.evaluate(ctx);
    expect(f.some((x) => x.titleZh === '晚於照服員離職日')).toBe(true);
  });

  it('一切正常 → 通過', () => {
    expect(R21_STATUS_AND_PERIOD.evaluate(makeContext())).toHaveLength(0);
  });
});
