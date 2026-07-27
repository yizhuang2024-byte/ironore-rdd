/**
 * 排班衝突檢核引擎 —— 入口。
 *
 * 純函式：不碰 DB、不碰網路、不讀系統時鐘（now 由 ctx 傳入）。
 *
 * 使用方式：
 *   前端（拖曳中）  runConflictChecks(ctx, { lightweightOnly: true })
 *   前端（放開時）  runConflictChecks(ctx)
 *   後端（寫入前）  runConflictChecks(ctx)  ← 在交易內重跑，前端結果永不被信任
 */

import type { ConflictContext, ConflictFinding, ConflictRule, Severity } from './types.js';
import { ALL_RULES, LIGHTWEIGHT_RULES } from './rules/index.js';

export interface RunOptions {
  /** 只跑輕量規則（供拖曳過程即時預覽） */
  lightweightOnly?: boolean;
  /** 指定規則集，主要供測試使用 */
  rules?: readonly ConflictRule[];
}

const SEVERITY_ORDER: Record<Severity, number> = { BLOCK: 0, WARN: 1, INFO: 2 };

/**
 * 執行檢核，回傳所有 findings（依嚴重度排序，BLOCK 在前）。
 *
 * 單一規則拋錯時不會讓整個檢核失敗 —— 排班畫面必須維持可用，
 * 但會回報一個 BLOCK finding，避免錯誤被靜默吞掉而讓有問題的班次通過。
 */
export function runConflictChecks(
  ctx: ConflictContext,
  options: RunOptions = {},
): ConflictFinding[] {
  const rules =
    options.rules ?? (options.lightweightOnly ? LIGHTWEIGHT_RULES : ALL_RULES);

  const findings: ConflictFinding[] = [];
  for (const rule of rules) {
    try {
      findings.push(...rule.evaluate(ctx));
    } catch (err) {
      findings.push({
        ruleId: rule.id,
        severity: 'BLOCK',
        titleZh: '檢核規則執行失敗',
        overridable: false,
        messageZh: `規則 ${rule.id}（${rule.titleZh}）執行時發生錯誤，為安全起見阻擋此操作：${
          err instanceof Error ? err.message : String(err)
        }`,
        data: { ruleId: rule.id },
      });
    }
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** 檢核結果摘要，供 UI 上色與後端判斷是否放行 */
export interface ConflictSummary {
  findings: ConflictFinding[];
  blocks: ConflictFinding[];
  warns: ConflictFinding[];
  /** 有無任何 BLOCK */
  hasBlock: boolean;
  /** 是否所有 BLOCK 都可由督導覆寫 */
  allBlocksOverridable: boolean;
  /** UI 上色用：紅／黃／綠 */
  level: 'BLOCKED' | 'WARNING' | 'CLEAR';
}

export function summarize(findings: readonly ConflictFinding[]): ConflictSummary {
  const blocks = findings.filter((f) => f.severity === 'BLOCK');
  const warns = findings.filter((f) => f.severity === 'WARN');
  return {
    findings: [...findings],
    blocks,
    warns,
    hasBlock: blocks.length > 0,
    allBlocksOverridable: blocks.length > 0 && blocks.every((b) => b.overridable),
    level: blocks.length > 0 ? 'BLOCKED' : warns.length > 0 ? 'WARNING' : 'CLEAR',
  };
}

/**
 * 判斷在給定的覆寫清單下，此操作是否可以放行。
 *
 * 後端強制點使用此函式：只有「全部 BLOCK 都可覆寫，且都已被明確覆寫」才放行。
 * 不可覆寫的 BLOCK 永遠擋下，無論督導填了什麼理由。
 */
export function canProceed(
  findings: readonly ConflictFinding[],
  overriddenRuleIds: readonly string[] = [],
): { ok: boolean; blockedBy: ConflictFinding[] } {
  const overridden = new Set(overriddenRuleIds);
  const blockedBy = findings.filter(
    (f) => f.severity === 'BLOCK' && (!f.overridable || !overridden.has(f.ruleId)),
  );
  return { ok: blockedBy.length === 0, blockedBy };
}
