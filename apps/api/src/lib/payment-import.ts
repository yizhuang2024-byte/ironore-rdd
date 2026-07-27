/**
 * 支付基準匯入。
 *
 * ⚠️ 系統中**沒有任何**寫死的支付代碼、價格、額度或部分負擔比率。
 *    全部由此模組從 CSV 匯入，資料來源是機構自衛福部公告取得的附表四。
 *
 *    這不是過度設計：《長期照顧服務申請及給付辦法》114.06.19 修正中，
 *    BA08/BA09/BA09a 等碼別自 115.01.01 施行，而該辦法最後施行日為 115.07.01——
 *    同一次修正的不同碼別施行日期並不相同。任何寫死的做法都必然算錯歷史金額。
 */

import type { CertType, PaymentCategory, PaymentUnitType } from '@ltc/shared';
import { ValidationError } from './errors.js';

/** 極簡 CSV 解析。支援雙引號包覆與 # 開頭的註解行。 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = parseLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? '';
    });
    return row;
  });
}

const optionalInt = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ValidationError(`欄位必須是整數：${v}`);
  return n;
};

const requiredInt = (v: string | undefined, field: string): number => {
  const n = optionalInt(v);
  if (n == null) throw new ValidationError(`缺少必要欄位 ${field}`);
  return n;
};

export interface ParsedPaymentItem {
  code: string;
  category: PaymentCategory;
  name: string;
  description: string | null;
  price: number;
  priceRemote: number | null;
  unitType: PaymentUnitType;
  standardMinutes: number | null;
  minMinutes: number | null;
  maxPerDay: number | null;
  maxPerMonth: number | null;
  isAddOn: boolean;
  addOnPercent: number | null;
  requiredCerts: CertType[];
}

export function parsePaymentItems(csv: string): ParsedPaymentItem[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new ValidationError('支付項目 CSV 沒有任何資料列');

  const seen = new Set<string>();
  return rows.map((r, idx) => {
    const code = r['code']?.trim();
    if (!code) throw new ValidationError(`第 ${idx + 1} 列缺少 code`);
    if (seen.has(code)) throw new ValidationError(`支付代碼重複：${code}`);
    seen.add(code);

    return {
      code,
      category: (r['category'] || 'CARE_PROFESSIONAL') as PaymentCategory,
      name: r['name'] ?? code,
      description: r['description'] || null,
      price: requiredInt(r['price'], `${code}.price`),
      priceRemote: optionalInt(r['priceRemote']),
      unitType: (r['unitType'] || 'PER_TIME') as PaymentUnitType,
      standardMinutes: optionalInt(r['standardMinutes']),
      minMinutes: optionalInt(r['minMinutes']),
      maxPerDay: optionalInt(r['maxPerDay']),
      maxPerMonth: optionalInt(r['maxPerMonth']),
      isAddOn: (r['isAddOn'] ?? '').toLowerCase() === 'true',
      addOnPercent: optionalInt(r['addOnPercent']),
      requiredCerts: (r['requiredCerts'] ?? '')
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean) as CertType[],
    };
  });
}

export interface ParsedCmsQuota {
  cmsLevel: number;
  category: PaymentCategory;
  monthlyAmount: number;
}

export function parseCmsQuotas(csv: string): ParsedCmsQuota[] {
  return parseCsv(csv).map((r, idx) => {
    const cmsLevel = requiredInt(r['cmsLevel'], `第 ${idx + 1} 列 cmsLevel`);
    if (cmsLevel < 1 || cmsLevel > 8) {
      throw new ValidationError(`CMS 等級必須在 1–8 之間：${cmsLevel}`);
    }
    return {
      cmsLevel,
      category: (r['category'] || 'CARE_PROFESSIONAL') as PaymentCategory,
      monthlyAmount: requiredInt(r['monthlyAmount'], `第 ${idx + 1} 列 monthlyAmount`),
    };
  });
}

export interface ParsedCopayRate {
  copayCategory: 'GENERAL' | 'LOW_MID_INCOME' | 'LOW_INCOME';
  category: PaymentCategory;
  ratePermille: number;
}

export function parseCopayRates(csv: string): ParsedCopayRate[] {
  return parseCsv(csv).map((r, idx) => {
    const rate = requiredInt(r['ratePermille'], `第 ${idx + 1} 列 ratePermille`);
    if (rate < 0 || rate > 1000) {
      throw new ValidationError(`部分負擔比率必須在 0–1000 千分比之間：${rate}`);
    }
    return {
      copayCategory: r['copayCategory'] as ParsedCopayRate['copayCategory'],
      category: (r['category'] || 'CARE_PROFESSIONAL') as PaymentCategory,
      ratePermille: rate,
    };
  });
}
