// 商工登記公示資料開放平臺 API 用戶端：分頁擷取、失敗重試、流量節流。

import { API_BASE, DATASETS, PAGE_SIZE, REQUEST_INTERVAL_MS } from './config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function resolveDataset(key, override) {
  const preset = DATASETS[key];
  if (!preset) {
    throw new Error(`未知的資料集：${key}，可用值為 ${Object.keys(DATASETS).join(', ')}`);
  }
  const envId = process.env[`TWBIZ_DATASET_${key.toUpperCase()}`];
  return { ...preset, id: override || envId || preset.id };
}

// 平臺的 $filter 語法：Company_Name like 鋼鐵 and Company_Status eq 01
export function buildApiFilter(dataset, { keyword, activeOnly }) {
  const clauses = [];
  if (keyword) clauses.push(`${dataset.queryField} like ${keyword}`);
  if (activeOnly) clauses.push(`${dataset.statusField} eq 01`);
  return clauses.join(' and ');
}

async function fetchPage(url, { retries = 4, timeoutMs = 30000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      if (!text.trim()) return [];
      const data = JSON.parse(text);
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      throw new Error(`回傳格式非預期：${text.slice(0, 200)}`);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(2000 * 2 ** attempt); // 2s / 4s / 8s / 16s
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`擷取失敗（${url}）：${lastError?.message || lastError}`);
}

/**
 * 依關鍵字分頁擷取資料，直到沒有更多或達到 limit。
 * onProgress 會在每頁結束後被呼叫，方便 CLI 顯示進度。
 */
export async function fetchAll({ dataset, keyword, activeOnly = true, limit = Infinity, onProgress }) {
  const filter = buildApiFilter(dataset, { keyword, activeOnly });
  const rows = [];
  let skip = 0;

  while (rows.length < limit) {
    const params = new URLSearchParams({
      $format: 'json',
      $skip: String(skip),
      $top: String(PAGE_SIZE),
    });
    if (filter) params.set('$filter', filter);
    const url = `${API_BASE}/${dataset.id}?${params.toString()}`;

    const page = await fetchPage(url);
    rows.push(...page);
    onProgress?.({ keyword, fetched: rows.length, pageSize: page.length });

    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
    await sleep(REQUEST_INTERVAL_MS);
  }

  return rows.slice(0, limit === Infinity ? rows.length : limit);
}

// 只打一次 API，用來確認 dataset id 與網路是否可用
export async function probe(dataset) {
  const url = `${API_BASE}/${dataset.id}?$format=json&$skip=0&$top=1`;
  const page = await fetchPage(url, { retries: 1, timeoutMs: 15000 });
  return { url, sample: page[0] || null, fields: page[0] ? Object.keys(page[0]) : [] };
}
