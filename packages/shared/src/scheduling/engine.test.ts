import { describe, expect, it } from 'vitest';
import { canProceed, runConflictChecks, summarize } from './engine.js';
import { ALL_RULES, LIGHTWEIGHT_RULES, RULE_CATALOG } from './rules/index.js';
import { at, makeAttendant, makeCandidate, makeContext, makeVisit } from './testing.js';
import type { ConflictRule } from './types.js';

const D = '2026-08-03';

describe('規則註冊表', () => {
  it('涵蓋 R01–R22 全部 22 條規則', () => {
    // 部分規則檔會發出多個 ruleId（如 R08/R09、R10/R22 同檔），
    // 故以 catalog + 實際可能產出的 ruleId 一併確認。
    const registeredIds = new Set(ALL_RULES.map((r) => r.id));
    for (const id of ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R10', 'R11',
      'R12', 'R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20', 'R21']) {
      expect(registeredIds.has(id), `缺少規則 ${id}`).toBe(true);
    }
  });

  it('輕量規則為完整規則的子集', () => {
    expect(LIGHTWEIGHT_RULES.length).toBeGreaterThan(0);
    expect(LIGHTWEIGHT_RULES.length).toBeLessThan(ALL_RULES.length);
    for (const r of LIGHTWEIGHT_RULES) expect(ALL_RULES).toContain(r);
  });

  it('每條規則都有中文標題', () => {
    for (const r of RULE_CATALOG) expect(r.titleZh.length).toBeGreaterThan(0);
  });
});

describe('runConflictChecks', () => {
  it('無問題時回傳空陣列', () => {
    expect(runConflictChecks(makeContext())).toHaveLength(0);
  });

  it('BLOCK 排在 WARN 之前', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00'),
      // 時間重疊(BLOCK) + 服務區域不符(WARN)
      attendant: makeAttendant({ serviceAreas: ['OTHER'] }),
      attendantVisitsInWindow: [makeVisit('v1', D, '10:00', '12:00')],
    });
    const findings = runConflictChecks(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]!.severity).toBe('BLOCK');
    expect(findings.at(-1)!.severity).toBe('WARN');
  });

  it('lightweightOnly 只跑輕量規則', () => {
    const ctx = makeContext({
      attendant: makeAttendant({ serviceAreas: ['OTHER'] }), // R06 非輕量
      attendantVisitsInWindow: [makeVisit('v1', D, '10:00', '12:00')], // R01 輕量
    });
    const light = runConflictChecks(ctx, { lightweightOnly: true });
    expect(light.some((f) => f.ruleId === 'R01')).toBe(true);
    expect(light.some((f) => f.ruleId === 'R06')).toBe(false);
  });

  it('單一規則拋錯時不中斷其他規則，並回報為 BLOCK', () => {
    const boom: ConflictRule = {
      id: 'RXX',
      titleZh: '故障規則',
      lightweight: false,
      evaluate() {
        throw new Error('模擬故障');
      },
    };
    const findings = runConflictChecks(makeContext(), { rules: [boom] });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('BLOCK');
    expect(findings[0]!.overridable).toBe(false);
    expect(findings[0]!.messageZh).toContain('模擬故障');
  });

  it('未指派照服員時，與人員相關的規則自動略過', () => {
    const ctx = makeContext({
      candidate: makeCandidate(D, '09:00', '11:00', { attendantId: null }),
      attendant: null,
      attendantVisitsInWindow: [makeVisit('v1', D, '10:00', '12:00')],
      approvedLeaves: [{ id: 'l1', ...at(D, '08:00', '18:00'), approved: true }],
    });
    const findings = runConflictChecks(ctx);
    expect(findings.some((f) => f.ruleId === 'R01')).toBe(false);
    expect(findings.some((f) => f.ruleId === 'R02')).toBe(false);
  });
});

describe('summarize', () => {
  it('無 finding → CLEAR', () => {
    expect(summarize([]).level).toBe('CLEAR');
  });

  it('僅 WARN → WARNING', () => {
    const s = summarize([
      { ruleId: 'R06', severity: 'WARN', titleZh: 'x', messageZh: 'y', overridable: true },
    ]);
    expect(s.level).toBe('WARNING');
    expect(s.hasBlock).toBe(false);
  });

  it('含 BLOCK → BLOCKED', () => {
    const s = summarize([
      { ruleId: 'R01', severity: 'BLOCK', titleZh: 'x', messageZh: 'y', overridable: false },
      { ruleId: 'R06', severity: 'WARN', titleZh: 'x', messageZh: 'y', overridable: true },
    ]);
    expect(s.level).toBe('BLOCKED');
    expect(s.blocks).toHaveLength(1);
    expect(s.warns).toHaveLength(1);
    expect(s.allBlocksOverridable).toBe(false);
  });

  it('全部 BLOCK 皆可覆寫時標示 allBlocksOverridable', () => {
    const s = summarize([
      { ruleId: 'R18', severity: 'BLOCK', titleZh: 'x', messageZh: 'y', overridable: true },
    ]);
    expect(s.allBlocksOverridable).toBe(true);
  });
});

describe('canProceed —— 後端強制點的放行判斷', () => {
  const overridableBlock = {
    ruleId: 'R18',
    severity: 'BLOCK' as const,
    titleZh: 'x',
    messageZh: 'y',
    overridable: true,
  };
  const hardBlock = {
    ruleId: 'R01',
    severity: 'BLOCK' as const,
    titleZh: 'x',
    messageZh: 'y',
    overridable: false,
  };
  const warn = {
    ruleId: 'R06',
    severity: 'WARN' as const,
    titleZh: 'x',
    messageZh: 'y',
    overridable: true,
  };

  it('無 BLOCK 時放行', () => {
    expect(canProceed([warn]).ok).toBe(true);
  });

  it('有可覆寫 BLOCK 但未覆寫 → 擋下', () => {
    const r = canProceed([overridableBlock]);
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toHaveLength(1);
  });

  it('可覆寫 BLOCK 已明確覆寫 → 放行', () => {
    expect(canProceed([overridableBlock], ['R18']).ok).toBe(true);
  });

  it('★ 不可覆寫的 BLOCK 即使列入覆寫清單仍擋下', () => {
    const r = canProceed([hardBlock], ['R01']);
    expect(r.ok).toBe(false);
    expect(r.blockedBy[0]!.ruleId).toBe('R01');
  });

  it('混合情形：覆寫可覆寫者，硬性 BLOCK 仍擋下', () => {
    const r = canProceed([overridableBlock, hardBlock], ['R18', 'R01']);
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toHaveLength(1);
    expect(r.blockedBy[0]!.ruleId).toBe('R01');
  });

  it('WARN 不需覆寫也能放行', () => {
    expect(canProceed([warn, overridableBlock], ['R18']).ok).toBe(true);
  });
});
