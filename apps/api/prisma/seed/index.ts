/**
 * 示範資料產生器。
 *
 * 規模依居服實務比例推算：
 *   300 位照服員 × 約 4 趟/日 × 22 日 ≈ 26,000 趟/月
 *   若每案每週 3 趟（每月約 13 趟），對應約 1,800 位個案
 * 600 個案只會產生每人每日 1.5 趟，遠低於實務，排班畫面也測不出真實壓力。
 *
 * 用法：
 *   pnpm --filter @ltc/api db:seed              # demo 規模（預設）
 *   pnpm --filter @ltc/api db:seed -- --scale=e2e   # CI 用小規模
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '@node-rs/argon2';
import { fakerZH_TW as faker } from '@faker-js/faker';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  addTaipeiDays,
  fromTaipeiDateMinute,
  toTaipeiDate,
  type TaipeiDate,
} from '@ltc/shared';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { config } from '../../src/config.js';
import {
  parseCmsQuotas,
  parseCopayRates,
  parsePaymentItems,
} from '../../src/lib/payment-import.js';
import { blindIndex, encryptPii } from '../../src/lib/crypto.js';

const here = dirname(fileURLToPath(import.meta.url));
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const BATCH = 5_000;

// 固定亂數種子 —— 每次 seed 結果相同，E2E 測試可以依賴具體資料
faker.seed(20260727);

type Scale = 'demo' | 'small' | 'e2e';

const SCALES: Record<Scale, { attendants: number; recipients: number; monthsBack: number; monthsForward: number }> = {
  demo: { attendants: 300, recipients: 1800, monthsBack: 1, monthsForward: 1 },
  small: { attendants: 40, recipients: 200, monthsBack: 0, monthsForward: 1 },
  e2e: { attendants: 20, recipients: 40, monthsBack: 0, monthsForward: 0 },
};

interface District {
  code: string;
  name: string;
  centroid: { lat: number; lng: number };
  adjacent: string[];
  speedTier: string;
}

const districts: District[] = JSON.parse(
  readFileSync(resolve(here, 'taipei-districts.json'), 'utf8'),
).districts;

const pick = <T>(arr: readonly T[]): T => arr[faker.number.int({ min: 0, max: arr.length - 1 })]!;

/** 依權重挑選 */
function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = faker.number.float({ min: 0, max: total });
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

/** 產生格式合法的身分證字號（僅供測試，不對應真實個人） */
function fakeNationalId(): string {
  const letter = 'ABCDEFGHJKLMNPQRSTUVXYWZIO'[faker.number.int({ min: 0, max: 25 })]!;
  const gender = faker.number.int({ min: 1, max: 2 });
  const rest = faker.string.numeric(8);
  return `${letter}${gender}${rest}`;
}

async function main() {
  const scaleArg = process.argv.find((a) => a.startsWith('--scale='))?.split('=')[1] as Scale;
  const scale: Scale = scaleArg && scaleArg in SCALES ? scaleArg : 'demo';
  const cfg = SCALES[scale];

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
  });

  console.log(`\n▶ 產生 ${scale} 規模示範資料…\n`);
  const t0 = Date.now();

  // ── 清空（僅開發用；正式環境絕不執行 seed）────────────────────
  console.log('  清空既有資料…');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditLog", "ServiceRecord", "VisitItem", "ServiceVisit",
      "RecurringPattern", "LeaveRequest", "CarePlanItem", "CarePlan",
      "RecipientUnavailability", "RecipientContact", "CareRecipient",
      "Certification", "AttendantAvailability", "AttendantServiceArea", "Attendant",
      "Session", "UserRole", "User", "CopayRate", "CmsQuota", "PaymentItem",
      "PaymentSchedule", "OrgPolicy", "ServiceUnit", "Organization"
    RESTART IDENTITY CASCADE
  `);

  // ── 機構與單位 ────────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      name: '示範長照日照單位',
      taxId: '12345678',
      ltcCode: 'DEMO-LTC-001',
      policy: { create: {} },
    },
  });

  const unitDefs = [
    { name: '文山組', areas: ['63000120', '63000110', '63000070'] },
    { name: '信義組', areas: ['63000070', '63000050', '63000040'] },
    { name: '大安組', areas: ['63000050', '63000010', '63000060'] },
  ];
  const units = await Promise.all(
    unitDefs.map((u) =>
      prisma.serviceUnit.create({
        data: { orgId: org.id, name: u.name, unitType: 'HOME_CARE', serviceAreas: u.areas },
      }),
    ),
  );

  // ── 支付基準（由 CSV 匯入，程式零寫死）─────────────────────────
  console.log('  匯入支付基準（範例版，不可用於申報）…');
  const schedule = await prisma.paymentSchedule.create({
    data: {
      name: '長照給付及支付基準（範例版 — 不可用於申報）',
      effectiveFrom: new Date('2020-01-01'),
      effectiveTo: null,
      sourceRef: '開發測試用範例資料，非衛福部公告內容',
      isActive: true,
    },
  });

  const items = parsePaymentItems(readFileSync(resolve(here, 'payment-codes.csv'), 'utf8'));
  await prisma.paymentItem.createMany({
    data: items.map((i) => ({ ...i, scheduleId: schedule.id })),
  });
  await prisma.cmsQuota.createMany({
    data: parseCmsQuotas(readFileSync(resolve(here, 'cms-quota.csv'), 'utf8')).map((q) => ({
      ...q,
      scheduleId: schedule.id,
    })),
  });
  await prisma.copayRate.createMany({
    data: parseCopayRates(readFileSync(resolve(here, 'copay-rates.csv'), 'utf8')).map((c) => ({
      ...c,
      scheduleId: schedule.id,
    })),
  });

  const paymentItems = await prisma.paymentItem.findMany({ where: { scheduleId: schedule.id } });
  const itemByCode = new Map(paymentItems.map((i) => [i.code, i]));
  const quotas = await prisma.cmsQuota.findMany({ where: { scheduleId: schedule.id } });
  const quotaByCms = new Map(quotas.map((q) => [q.cmsLevel, q.monthlyAmount]));

  // 一般排班可用的主要項目（排除加計項目與需特殊證照者）
  const commonCodes = ['BA01', 'BA02', 'BA03', 'BA05', 'BA07', 'BA12', 'BA14', 'BA15', 'BA16'];

  // ── 使用者 ────────────────────────────────────────────────────
  console.log('  建立使用者帳號…');
  const pw = await hash('Demo@1234', ARGON2);

  await prisma.user.create({
    data: {
      orgId: org.id, account: 'admin', passwordHash: pw, displayName: '系統管理者',
      mustChangePw: false, roles: { create: [{ role: 'ORG_ADMIN', unitId: null }] },
    },
  });
  await prisma.user.create({
    data: {
      orgId: org.id, account: 'staff01', passwordHash: pw, displayName: '行政助理',
      mustChangePw: false, roles: { create: [{ role: 'ADMIN_STAFF', unitId: null }] },
    },
  });
  await prisma.user.create({
    data: {
      orgId: org.id, account: 'auditor01', passwordHash: pw, displayName: '品管稽核',
      mustChangePw: false, roles: { create: [{ role: 'AUDITOR', unitId: null }] },
    },
  });

  const supervisors: { id: string; unitId: string }[] = [];
  for (let i = 0; i < units.length * 2; i += 1) {
    const unit = units[i % units.length]!;
    const u = await prisma.user.create({
      data: {
        orgId: org.id,
        account: `sup${String(i + 1).padStart(2, '0')}`,
        passwordHash: pw,
        displayName: `${unit.name}督導${(Math.floor(i / units.length) + 1)}`,
        mustChangePw: false,
        roles: { create: [{ role: 'SUPERVISOR', unitId: unit.id }] },
      },
    });
    supervisors.push({ id: u.id, unitId: unit.id });
  }

  // ── 照服員 ────────────────────────────────────────────────────
  console.log(`  建立 ${cfg.attendants} 位照服員…`);
  const today = toTaipeiDate(new Date());

  const attendants: {
    id: string; unitId: string; districts: string[]; employmentType: string;
  }[] = [];

  for (let i = 0; i < cfg.attendants; i += 1) {
    const unit = units[i % units.length]!;
    const employmentType = weighted([
      ['FULL_TIME', 40], ['PART_TIME', 35], ['HOURLY', 25],
    ] as const);

    const primary = pick(unit.serviceAreas);
    const primaryDistrict = districts.find((d) => d.code === primary)!;
    const supportCount = faker.number.int({ min: 0, max: 2 });
    const supports = faker.helpers
      .shuffle([...primaryDistrict.adjacent])
      .slice(0, supportCount);
    const areas = [...new Set([primary, ...supports])];

    // 可服務時段：正職週一至五全日、兼職隨機半日、時薪零碎
    const availabilities: { weekday: number; startMinute: number; endMinute: number }[] = [];
    if (employmentType === 'FULL_TIME') {
      for (let wd = 1; wd <= 5; wd += 1) {
        availabilities.push({ weekday: wd, startMinute: 8 * 60, endMinute: 17 * 60 });
      }
    } else if (employmentType === 'PART_TIME') {
      const days = faker.helpers.shuffle([1, 2, 3, 4, 5, 6]).slice(0, faker.number.int({ min: 3, max: 4 }));
      const morning = faker.datatype.boolean();
      for (const wd of days) {
        availabilities.push({
          weekday: wd,
          startMinute: morning ? 8 * 60 : 13 * 60,
          endMinute: morning ? 12 * 60 : 18 * 60,
        });
      }
    } else {
      const days = faker.helpers.shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, faker.number.int({ min: 2, max: 4 }));
      for (const wd of days) {
        const start = faker.number.int({ min: 7, max: 15 });
        availabilities.push({ weekday: wd, startMinute: start * 60, endMinute: (start + 4) * 60 });
      }
    }

    // 證照：全員有基礎訓練；刻意讓 8% 在 60 天內到期、2% 已到期（測 R09 與到期提醒）
    const certs: { certType: string; expiresOn: Date | null; certNo: string }[] = [
      { certType: 'CARE_ATTENDANT_TRAINING', expiresOn: null, certNo: faker.string.alphanumeric(10).toUpperCase() },
    ];
    const roll = faker.number.float({ min: 0, max: 1 });
    if (roll < 0.02) {
      certs.push({ certType: 'HEALTH_CHECK', expiresOn: new Date(addTaipeiDays(today, -faker.number.int({ min: 1, max: 90 }))), certNo: faker.string.alphanumeric(8) });
    } else if (roll < 0.1) {
      certs.push({ certType: 'HEALTH_CHECK', expiresOn: new Date(addTaipeiDays(today, faker.number.int({ min: 1, max: 60 }))), certNo: faker.string.alphanumeric(8) });
    } else {
      certs.push({ certType: 'HEALTH_CHECK', expiresOn: new Date(addTaipeiDays(today, faker.number.int({ min: 180, max: 700 }))), certNo: faker.string.alphanumeric(8) });
    }
    if (faker.number.float({ min: 0, max: 1 }) < 0.15) {
      certs.push({ certType: 'DEMENTIA_CARE', expiresOn: null, certNo: faker.string.alphanumeric(8) });
    }
    if (faker.number.float({ min: 0, max: 1 }) < 0.05) {
      certs.push({ certType: 'BATH_VEHICLE', expiresOn: null, certNo: faker.string.alphanumeric(8) });
    }
    if (faker.number.float({ min: 0, max: 1 }) < 0.05) {
      certs.push({ certType: 'FOOT_CARE', expiresOn: null, certNo: faker.string.alphanumeric(8) });
    }

    const name = faker.person.fullName();
    const nid = fakeNationalId();
    const account = `att${String(i + 1).padStart(4, '0')}`;

    const user = await prisma.user.create({
      data: {
        orgId: org.id, account, passwordHash: pw, displayName: name, mustChangePw: false,
        roles: { create: [{ role: 'ATTENDANT', unitId: unit.id }] },
      },
    });

    const att = await prisma.attendant.create({
      data: {
        orgId: org.id,
        userId: user.id,
        employeeNo: `E${String(i + 1).padStart(4, '0')}`,
        name,
        nationalIdEnc: encryptPii(nid),
        nationalIdBidx: blindIndex(nid),
        birthDate: faker.date.birthdate({ min: 25, max: 62, mode: 'age' }),
        gender: faker.helpers.arrayElement(['M', 'F']),
        phone: `09${faker.string.numeric(8)}`,
        addressEnc: encryptPii(`臺北市${primaryDistrict.name}${faker.location.street()}${faker.number.int({ min: 1, max: 200 })}號`),
        homeDistrict: primary,
        homeLat: primaryDistrict.centroid.lat + faker.number.float({ min: -0.015, max: 0.015 }),
        homeLng: primaryDistrict.centroid.lng + faker.number.float({ min: -0.015, max: 0.015 }),
        employmentType,
        hiredOn: faker.date.past({ years: 6 }),
        status: 'ACTIVE',
        primaryUnitId: unit.id,
        maxDailyMinutes: employmentType === 'FULL_TIME' ? 480 : 300,
        maxWeeklyMinutes: employmentType === 'FULL_TIME' ? 2400 : employmentType === 'PART_TIME' ? 1800 : 1200,
        serviceAreas: { create: areas.map((code, ai) => ({ districtCode: code, priority: ai === 0 ? 1 : 2 })) },
        availabilities: { create: availabilities },
        certifications: { create: certs.map((c) => ({ ...c, certType: c.certType as never })) },
      },
    });

    attendants.push({ id: att.id, unitId: unit.id, districts: areas, employmentType });

    if ((i + 1) % 50 === 0) console.log(`    …${i + 1}/${cfg.attendants}`);
  }

  // ── 個案 ──────────────────────────────────────────────────────
  console.log(`  建立 ${cfg.recipients} 位個案…`);
  const recipients: {
    id: string; unitId: string; districtCode: string; cmsLevel: number;
    lat: number | null; lng: number | null; codes: string[];
  }[] = [];

  for (let i = 0; i < cfg.recipients; i += 1) {
    const unit = units[i % units.length]!;
    const districtCode = pick(unit.serviceAreas);
    const district = districts.find((d) => d.code === districtCode)!;

    // CMS 分布貼近實務金字塔（中度失能居多）
    const cmsLevel = weighted([
      [2, 8], [3, 20], [4, 24], [5, 20], [6, 15], [7, 9], [8, 4],
    ] as const);
    const copayCategory = weighted([
      ['GENERAL', 78], ['LOW_MID_INCOME', 14], ['LOW_INCOME', 8],
    ] as const);

    // 刻意讓 5% 個案無座標，用來測 R07 的行政區鄰接退回路徑
    const hasCoords = faker.number.float({ min: 0, max: 1 }) > 0.05;
    const lat = hasCoords ? district.centroid.lat + faker.number.float({ min: -0.018, max: 0.018 }) : null;
    const lng = hasCoords ? district.centroid.lng + faker.number.float({ min: -0.018, max: 0.018 }) : null;

    const name = faker.person.fullName();
    const nid = fakeNationalId();
    const supervisor = supervisors.find((s) => s.unitId === unit.id)!;

    // 核定項目數與次數依 CMS 遞增
    const itemCount = Math.min(5, Math.max(2, Math.round(cmsLevel / 2) + 1));
    const codes = faker.helpers.shuffle([...commonCodes]).slice(0, itemCount);
    const perWeekBase = Math.max(2, Math.round(cmsLevel * 1.3));

    const rec = await prisma.careRecipient.create({
      data: {
        orgId: org.id,
        caseNo: `C${String(i + 1).padStart(5, '0')}`,
        ltcCaseNo: `TP${faker.string.numeric(9)}`,
        name,
        nationalIdEnc: encryptPii(nid),
        nationalIdBidx: blindIndex(nid),
        birthDate: faker.date.birthdate({ min: 65, max: 96, mode: 'age' }),
        gender: faker.helpers.arrayElement(['M', 'F']),
        phone: `0${faker.string.numeric(9)}`,
        addressEnc: encryptPii(`臺北市${district.name}${faker.location.street()}${faker.number.int({ min: 1, max: 300 })}號`),
        districtCode,
        lat, lng,
        geocodeQuality: hasCoords ? 'DISTRICT_CENTROID' : 'NONE',
        cmsLevel,
        copayCategory,
        disabilityCert: faker.datatype.boolean({ probability: 0.35 }),
        serviceStartOn: faker.date.past({ years: 3 }),
        status: 'ACTIVE',
        primaryUnitId: unit.id,
        supervisorId: supervisor.id,
        careNotesEnc: encryptPii(
          faker.helpers.arrayElement([
            '行動需助行器，移位時請留意左側肢體無力',
            '有輕度失智，服務前請先自我介紹',
            '對海鮮過敏，備餐請避免',
            '聽力退化，說話請放慢並提高音量',
            '家中有階梯，進出請攙扶',
          ]),
        ),
        contacts: {
          create: [{
            name: faker.person.fullName(),
            relation: faker.helpers.arrayElement(['子', '女', '配偶', '媳', '婿', '孫']),
            phone: `09${faker.string.numeric(8)}`,
            isPrimary: true,
          }],
        },
      },
    });

    // 5% 個案刻意排到接近額度上限，用來測 R14
    const nearLimit = faker.number.float({ min: 0, max: 1 }) < 0.05;
    const plan = await prisma.carePlan.create({
      data: {
        recipientId: rec.id,
        planNo: `P${faker.string.numeric(8)}`,
        version: 1,
        effectiveFrom: new Date(addTaipeiDays(today, -180)),
        effectiveTo: null,
        cmsLevel,
        copayCategory,
        scheduleId: schedule.id,
        monthlyQuota: nearLimit
          ? Math.round((quotaByCms.get(cmsLevel) ?? 20000) * 0.3)
          : (quotaByCms.get(cmsLevel) ?? 20000),
        status: 'ACTIVE',
      },
    });

    await prisma.carePlanItem.createMany({
      data: codes.map((code) => ({
        carePlanId: plan.id,
        paymentItemId: itemByCode.get(code)!.id,
        code,
        approvedPerMonth: perWeekBase * 5,
        approvedPerWeek: perWeekBase,
      })),
    });

    recipients.push({ id: rec.id, unitId: unit.id, districtCode, cmsLevel, lat, lng, codes });

    if ((i + 1) % 200 === 0) console.log(`    …${i + 1}/${cfg.recipients}`);
  }

  // ── 排班樣板與實體化班次 ──────────────────────────────────────
  console.log('  產生排班樣板與班次…');

  const startDate = addTaipeiDays(today, -cfg.monthsBack * 30);
  const endDate = addTaipeiDays(today, cfg.monthsForward * 30 + 30);

  const patternRows: {
    recipientId: string; attendantId: string | null; weekday: number;
    startMinute: number; durationMinutes: number; itemCodes: string[];
    effectiveFrom: Date; effectiveTo: null; isActive: boolean;
  }[] = [];

  // 記錄每位照服員已佔用的時段，避免 seed 產出違反 DB EXCLUDE 約束的資料
  const attendantBusy = new Map<string, { start: number; end: number }[]>();

  const visitRows: {
    id: string; orgId: string; unitId: string; recipientId: string;
    attendantId: string | null; serviceDate: Date; startAt: Date; endAt: Date;
    plannedMinutes: number; status: string; createdBy: string;
  }[] = [];
  const visitItemRows: {
    visitId: string; paymentItemId: string; code: string;
    quantity: number; unitPrice: number; amount: number;
  }[] = [];

  const deliberateConflicts: string[] = [];

  for (const rec of recipients) {
    const perWeek = Math.min(6, Math.max(2, Math.round(rec.cmsLevel * 0.8)));
    const weekdays = faker.helpers.shuffle([1, 2, 3, 4, 5]).slice(0, Math.min(5, perWeek));

    // 同區域可服務的照服員
    const pool = attendants.filter(
      (a) => a.unitId === rec.unitId && a.districts.includes(rec.districtCode),
    );
    const candidates = pool.length > 0 ? pool : attendants.filter((a) => a.unitId === rec.unitId);

    for (const weekday of weekdays) {
      const startMinute = faker.number.int({ min: 8, max: 15 }) * 60;
      const duration = faker.helpers.arrayElement([45, 60, 90]);
      const code = pick(rec.codes);

      // 3% 刻意不指派，填滿未排班佇列
      const unassigned = faker.number.float({ min: 0, max: 1 }) < 0.03;
      const attendant = unassigned ? null : pick(candidates);

      patternRows.push({
        recipientId: rec.id,
        attendantId: attendant?.id ?? null,
        weekday,
        startMinute,
        durationMinutes: duration,
        itemCodes: [code],
        effectiveFrom: new Date(startDate),
        effectiveTo: null,
        isActive: true,
      });

      // 實體化該樣板在期間內的所有班次
      for (let d = startDate; d <= endDate; d = addTaipeiDays(d, 1)) {
        const dt = new Date(`${d}T00:00:00Z`);
        if (dt.getUTCDay() !== weekday) continue;

        const startAt = fromTaipeiDateMinute(d as TaipeiDate, startMinute);
        const endAt = fromTaipeiDateMinute(d as TaipeiDate, startMinute + duration);

        // DB 有 EXCLUDE 約束擋重疊班次，seed 必須自行避開。
        // 首選是樣板指定的照服員；若該時段已被佔用，依序嘗試同區其他候選人，
        // 全部都忙才留為未指派 —— 直接放棄會讓未指派率高得不像真實班表。
        const s = startAt.getTime();
        const e = endAt.getTime();
        const isFree = (id: string) =>
          !(attendantBusy.get(id) ?? []).some((b) => s < b.end && b.start < e);

        let assignedId: string | null = null;
        if (attendant) {
          const order = attendant && isFree(attendant.id)
            ? [attendant]
            : [attendant, ...faker.helpers.shuffle([...candidates])];
          for (const cand of order) {
            if (cand && isFree(cand.id)) {
              assignedId = cand.id;
              break;
            }
          }
        }

        if (assignedId) {
          const busy = attendantBusy.get(assignedId) ?? [];
          busy.push({ start: s, end: e });
          attendantBusy.set(assignedId, busy);
        }

        const item = itemByCode.get(code)!;
        const visitId = faker.string.uuid();
        visitRows.push({
          id: visitId,
          orgId: org.id,
          unitId: rec.unitId,
          recipientId: rec.id,
          attendantId: assignedId,
          serviceDate: new Date(`${d}T00:00:00Z`),
          startAt,
          endAt,
          plannedMinutes: duration,
          status: assignedId ? 'SCHEDULED' : 'UNASSIGNED',
          createdBy: 'seed',
        });
        visitItemRows.push({
          visitId,
          paymentItemId: item.id,
          code,
          quantity: 1,
          unitPrice: item.price,
          amount: item.price,
        });
      }
    }
  }

  await prisma.recurringPattern.createMany({ data: patternRows as never });

  console.log(`  寫入 ${visitRows.length.toLocaleString('zh-TW')} 筆班次…`);
  for (let i = 0; i < visitRows.length; i += BATCH) {
    await prisma.serviceVisit.createMany({ data: visitRows.slice(i, i + BATCH) as never });
  }
  for (let i = 0; i < visitItemRows.length; i += BATCH) {
    await prisma.visitItem.createMany({ data: visitItemRows.slice(i, i + BATCH) });
  }

  // ── 請假 ──────────────────────────────────────────────────────
  console.log('  建立請假申請…');
  const leaveCount = Math.min(30, Math.round(cfg.attendants / 10));
  for (let i = 0; i < leaveCount; i += 1) {
    const att = pick(attendants);
    const day = addTaipeiDays(today, faker.number.int({ min: 1, max: 25 }));
    await prisma.leaveRequest.create({
      data: {
        attendantId: att.id,
        leaveType: faker.helpers.arrayElement(['ANNUAL', 'PERSONAL', 'SICK']),
        startAt: fromTaipeiDateMinute(day as TaipeiDate, 0),
        endAt: fromTaipeiDateMinute(day as TaipeiDate, 24 * 60 - 1),
        reason: faker.helpers.arrayElement(['家中有事', '身體不適', '例行回診', '家庭旅遊']),
        status: i < leaveCount / 3 ? 'PENDING' : 'APPROVED',
        approvedAt: i < leaveCount / 3 ? null : new Date(),
      },
    });
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const unassignedCount = visitRows.filter((v) => v.attendantId === null).length;

  console.log(`
✓ 完成（${elapsed} 秒）

  機構        ${org.name}
  服務單位    ${units.length}
  照服員      ${attendants.length}
  個案        ${recipients.length}
  排班樣板    ${patternRows.length}
  班次        ${visitRows.length.toLocaleString('zh-TW')}（未指派 ${unassignedCount}）
  請假        ${leaveCount}

  測試帳號（密碼一律 Demo@1234，僅供開發環境）
    admin      系統管理者
    sup01–06   督導（各綁一個服務單位）
    staff01    行政
    auditor01  稽核（唯讀、無個資明文）
    att0001…   照服員

  ⚠️ 支付基準為範例資料，不可用於正式申報。
     上線前請依 docs/04-ltc-payment-codes.md 匯入衛福部公告之附表四。
`);

  if (deliberateConflicts.length > 0) {
    console.log(`  刻意製造的衝突班次 id：\n    ${deliberateConflicts.join('\n    ')}\n`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\n✗ Seed 失敗：', err);
  process.exit(1);
});
