// 將公司登記／商業登記兩種格式的原始資料統一成同一份客戶名單欄位，
// 並提供「是否仍在營業」與各種篩選條件的判定。

import {
  ACTIVE_STATUS_CODES,
  ACTIVE_STATUS_TEXTS,
  INACTIVE_STATUS_TEXTS,
  CITIES,
  normalizeCity,
} from './config.js';

const pick = (row, keys) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
};

// 民國日期（1120315 或 {year, month, day}）轉西元 YYYY-MM-DD
function toISODate(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    const { year, month, day } = value;
    if (!year) return '';
    return toISODate(`${year}${String(month || 1).padStart(2, '0')}${String(day || 1).padStart(2, '0')}`);
  }
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 7) {
    const year = Number(digits.slice(0, 3)) + 1911;
    return `${year}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return String(value);
}

function extractCity(address) {
  const normalized = normalizeCity(address);
  return CITIES.find((city) => normalized.includes(city)) || '';
}

function toNumber(value) {
  const digits = String(value ?? '').replace(/[^\d.]/g, '');
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeRecord(row) {
  const address = pick(row, [
    'Company_Location', 'Business_Address', 'Business_Location', 'Address',
  ]);
  const statusCode = pick(row, [
    'Company_Status', 'Business_Current_Status', 'Status',
  ]);
  const statusText = pick(row, [
    'Company_Status_Desc', 'Business_Current_Status_Desc', 'Company_Status_Name', 'Status_Desc',
  ]);

  return {
    統一編號: pick(row, ['Business_Accounting_NO', 'President_No', 'Business_Accounting_No']),
    名稱: pick(row, ['Company_Name', 'Business_Name', 'Name']),
    登記種類: row.Business_Name && !row.Company_Name ? '商業登記（行號）' : '公司登記',
    營業狀態: statusText || statusCode,
    負責人: pick(row, ['Responsible_Name', 'Company_Responsible_Name', 'Business_Responsible_Name']),
    資本額: toNumber(pick(row, [
      'Capital_Stock_Amount', 'Paid_In_Capital_Amount', 'Business_Capital_Stock_Amount',
    ])),
    縣市: extractCity(address),
    地址: address,
    核准設立日期: toISODate(pick(row, [
      'Company_Setup_Date', 'Business_Setup_Date', 'Setup_Date',
    ])),
    最後核准變更日期: toISODate(pick(row, [
      'Change_Of_Approval_Data', 'Business_Last_Change_Date', 'Change_Of_Approval_Date',
    ])),
    主要營業項目: pick(row, ['Business_Item_Desc', 'Business_Item', 'Cmp_Business']),
    登記機關: pick(row, ['Register_Organization_Desc', 'Register_Organization']),
    _statusCode: statusCode,
    _statusText: statusText,
  };
}

// 仍在營業：狀態碼為核准設立，或狀態文字為營業中；出現解散／撤銷／廢止等字樣一律排除。
export function isActive(record) {
  const text = `${record._statusText || ''}${record.營業狀態 || ''}`;
  if (INACTIVE_STATUS_TEXTS.some((word) => text.includes(word))) return false;
  if (ACTIVE_STATUS_TEXTS.some((word) => text.includes(word))) return true;
  return ACTIVE_STATUS_CODES.includes(String(record._statusCode || '').trim());
}

export function buildFilter(options) {
  const cities = (options.cities || []).map(normalizeCity).filter(Boolean);
  const excludes = (options.excludes || []).filter(Boolean);
  const includes = (options.includes || []).filter(Boolean);

  return (record) => {
    if (options.activeOnly && !isActive(record)) return false;
    if (cities.length && !cities.includes(normalizeCity(record.縣市))) return false;
    if (options.minCapital && record.資本額 < options.minCapital) return false;
    if (options.maxCapital && record.資本額 > options.maxCapital) return false;
    if (options.setupBefore && record.核准設立日期 && record.核准設立日期 > options.setupBefore) return false;
    if (options.setupAfter && record.核准設立日期 && record.核准設立日期 < options.setupAfter) return false;

    const haystack = `${record.名稱} ${record.主要營業項目} ${record.地址}`;
    if (includes.length && !includes.some((word) => haystack.includes(word))) return false;
    if (excludes.length && excludes.some((word) => haystack.includes(word))) return false;
    return true;
  };
}

export function dedupe(records) {
  const seen = new Map();
  for (const record of records) {
    const key = record.統一編號 || `${record.名稱}@${record.地址}`;
    if (!seen.has(key)) seen.set(key, record);
  }
  return [...seen.values()];
}

export const EXPORT_COLUMNS = [
  '統一編號', '名稱', '登記種類', '營業狀態', '負責人', '資本額',
  '縣市', '地址', '核准設立日期', '最後核准變更日期', '主要營業項目', '登記機關',
];
