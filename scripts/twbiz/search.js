#!/usr/bin/env node
// 台灣中小企業黃頁搜尋 CLI：擷取工商登記公示資料，篩出仍在營業的公司，輸出客戶名單。
//
// 用法範例：
//   node scripts/twbiz/search.js --probe
//   node scripts/twbiz/search.js --keyword 鋼鐵,金屬 --city 臺中市,高雄市
//   node scripts/twbiz/search.js --all-cities --min-capital 5000000 --limit 2000
//   node scripts/twbiz/search.js --input downloads/company.csv --city 臺南市

import { readFileSync } from 'node:fs';
import { CITIES } from './config.js';
import { fetchAll, probe, resolveDataset } from './gcis.js';
import { buildFilter, dedupe, normalizeRecord, EXPORT_COLUMNS } from './normalize.js';
import { parseCSV, writeCSV, writeJSON, writeXLSX } from './export.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const [flag, inlineValue] = token.slice(2).split('=');
    const next = argv[i + 1];
    if (inlineValue !== undefined) {
      args[flag] = inlineValue;
    } else if (next && !next.startsWith('--')) {
      args[flag] = next; i += 1;
    } else {
      args[flag] = true;
    }
  }
  return args;
}

const list = (value) => (typeof value === 'string'
  ? value.split(',').map((item) => item.trim()).filter(Boolean)
  : []);

const num = (value) => {
  if (value === undefined) return 0;
  const parsed = Number(String(value).replace(/[_,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const HELP = `
台灣中小企業黃頁搜尋 — 產出「仍在營業」的客戶名單

  --keyword <字串>       名稱/營業項目關鍵字，逗號分隔可多組
  --all-cities           不指定關鍵字，改以 22 縣市所在地逐一擷取（全台掃描）
  --dataset <key>        companyByName（預設）| companyByLocation | companyByItem | businessByName
  --dataset-id <UUID>    覆寫資料集 id（平臺調整時使用）
  --city <縣市>          僅保留指定縣市，逗號分隔（台/臺通用）
  --min-capital <數字>   資本額下限（元）
  --max-capital <數字>   資本額上限（元）
  --include <字串>       名稱/營業項目/地址須含任一關鍵字
  --exclude <字串>       名稱/營業項目/地址含任一關鍵字即排除
  --setup-after <日期>   核准設立日期不早於（YYYY-MM-DD）
  --setup-before <日期>  核准設立日期不晚於（YYYY-MM-DD）
  --all-status           不過濾營業狀態（預設只輸出仍在營業者）
  --limit <數字>         每組關鍵字最多擷取筆數（預設 1000）
  --input <檔案>         離線模式：改讀本機 CSV/JSON 批次檔，不呼叫 API
  --out <路徑前綴>       輸出檔名前綴（預設 data/customers-YYYY-MM-DD）
  --format <清單>        csv,xlsx,json（預設 csv,xlsx）
  --probe                只測試資料集與網路是否可用，並列出實際欄位
  --help                 顯示此說明
`;

function summarize(records) {
  const byCity = new Map();
  const byKind = new Map();
  for (const record of records) {
    const city = record.縣市 || '（地址無縣市）';
    byCity.set(city, (byCity.get(city) || 0) + 1);
    byKind.set(record.登記種類, (byKind.get(record.登記種類) || 0) + 1);
  }
  return { byCity: [...byCity].sort((a, b) => b[1] - a[1]), byKind: [...byKind] };
}

async function collectFromApi(args, dataset) {
  const limit = args.limit ? num(args.limit) : 1000;
  const activeOnly = !args['all-status'];
  const keywords = args['all-cities']
    ? CITIES
    : list(args.keyword);

  if (!keywords.length) {
    throw new Error('請提供 --keyword，或改用 --all-cities / --input');
  }
  const target = args['all-cities'] ? resolveDataset('companyByLocation', args['dataset-id']) : dataset;

  const rows = [];
  for (const keyword of keywords) {
    process.stderr.write(`→ 擷取「${keyword}」…\n`);
    const page = await fetchAll({
      dataset: target,
      keyword,
      activeOnly,
      limit,
      onProgress: ({ fetched }) => process.stderr.write(`   已取得 ${fetched} 筆\r`),
    });
    process.stderr.write(`   完成，${page.length} 筆\n`);
    rows.push(...page);
  }
  return rows;
}

function collectFromFile(path) {
  const text = readFileSync(path, 'utf8');
  if (path.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : data.data || [];
  }
  return parseCSV(text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(HELP); return; }

  const dataset = resolveDataset(args.dataset || 'companyByName', args['dataset-id']);

  if (args.probe) {
    process.stderr.write(`測試資料集：${dataset.label}（${dataset.id}）\n`);
    const result = await probe(dataset);
    process.stdout.write(`可用。實際欄位：\n${result.fields.join(', ') || '（無資料）'}\n`);
    return;
  }

  const raw = args.input ? collectFromFile(String(args.input)) : await collectFromApi(args, dataset);

  const filter = buildFilter({
    activeOnly: !args['all-status'],
    cities: list(args.city),
    minCapital: num(args['min-capital']),
    maxCapital: num(args['max-capital']),
    includes: list(args.include),
    excludes: list(args.exclude),
    setupAfter: args['setup-after'] ? String(args['setup-after']) : '',
    setupBefore: args['setup-before'] ? String(args['setup-before']) : '',
  });

  const records = dedupe(raw.map(normalizeRecord).filter(filter))
    .sort((a, b) => b.資本額 - a.資本額)
    .map((record) => Object.fromEntries(EXPORT_COLUMNS.map((col) => [col, record[col]])));

  const today = new Date().toISOString().slice(0, 10);
  const prefix = String(args.out || `data/customers-${today}`);
  const formats = list(args.format).length ? list(args.format) : ['csv', 'xlsx'];
  const written = [];
  if (formats.includes('csv')) written.push(writeCSV(`${prefix}.csv`, EXPORT_COLUMNS, records));
  if (formats.includes('xlsx')) written.push(writeXLSX(`${prefix}.xlsx`, EXPORT_COLUMNS, records));
  if (formats.includes('json')) written.push(writeJSON(`${prefix}.json`, records));

  const { byCity, byKind } = summarize(records);
  process.stdout.write(`\n原始擷取 ${raw.length} 筆 → 篩選後 ${records.length} 筆（去重、${args['all-status'] ? '不限狀態' : '僅營業中'}）\n`);
  process.stdout.write(`登記種類：${byKind.map(([k, v]) => `${k} ${v}`).join('、') || '—'}\n`);
  process.stdout.write(`縣市分布：${byCity.slice(0, 10).map(([k, v]) => `${k} ${v}`).join('、') || '—'}\n`);
  process.stdout.write(`輸出檔案：\n${written.map((f) => `  ${f}`).join('\n')}\n`);
}

main().catch((error) => {
  process.stderr.write(`\n錯誤：${error.message}\n`);
  process.exitCode = 1;
});
