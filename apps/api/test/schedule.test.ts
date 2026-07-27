/**
 * 排班衝突檢核的伺服端強制點整合測試。
 *
 * 重點是驗證「前端結果不被信任」與「不可覆寫的 BLOCK 真的擋得住」。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, login, seedFixture, truncateAll, type Fixture } from './helpers.js';

let app: FastifyInstance;
let fx: Fixture;
let admin: string;
let staff: string;

const D = '2026-09-15'; // 週二

beforeAll(async () => {
  app = await createTestApp();
  await truncateAll(app);
  fx = await seedFixture(app);
  admin = await login(app, 'admin');

  // 建立一位只有 schedule:write 但無 schedule:override 的行政人員
  const { hash } = await import('@node-rs/argon2');
  await app.prisma.user.create({
    data: {
      orgId: fx.orgId,
      account: 'staff',
      passwordHash: await hash('Test@12345', { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      displayName: '行政',
      mustChangePw: false,
      roles: { create: [{ role: 'ADMIN_STAFF', unitId: null }] },
    },
  });
  staff = await login(app, 'staff');
});

afterAll(async () => {
  await app.close();
});

const post = (url: string, cookie: string, payload?: unknown) =>
  app.inject({ method: 'POST', url, headers: { cookie }, payload: payload as never });

function createVisit(cookie: string, overrides: Record<string, unknown> = {}) {
  return post('/api/v1/schedules/visits', cookie, {
    recipientId: fx.recipientA,
    attendantId: fx.attendantA,
    serviceDate: D,
    startMinute: 9 * 60,
    durationMinutes: 60,
    items: [{ code: 'BA01', quantity: 1 }],
    ...overrides,
  });
}

describe('班次建立', () => {
  it('無衝突時建立成功，並記錄價格快照', async () => {
    const res = await createVisit(admin);
    expect(res.statusCode).toBe(200);
    const v = res.json().data;
    expect(v.status).toBe('SCHEDULED');
    expect(v.items[0].unitPrice).toBe(260);
    expect(v.items[0].amount).toBe(260);
  });

  it('★ R01 時間重疊 → 422，且不可覆寫', async () => {
    // 同一位照服員、同日 09:30 起（與既有 09:00–10:00 重疊）
    const res = await createVisit(admin, { startMinute: 9 * 60 + 30 });
    expect(res.statusCode).toBe(422);

    const findings = res.json().error.details.findings;
    const r01 = findings.find((f: { ruleId: string }) => f.ruleId === 'R01');
    expect(r01).toBeDefined();
    expect(r01.severity).toBe('BLOCK');
    expect(r01.overridable).toBe(false);
  });

  it('★ 覆寫不可覆寫的 R01 仍被擋下', async () => {
    const res = await createVisit(admin, {
      startMinute: 9 * 60 + 30,
      overrideRuleIds: ['R01'],
      overrideReason: '硬要排',
    });
    expect(res.statusCode).toBe(422);
    expect(
      res.json().error.details.findings.some((f: { ruleId: string }) => f.ruleId === 'R01'),
    ).toBe(true);
  });

  it('剛好相接的班次可以排入（半開區間）', async () => {
    // 改用 BA02（無 maxPerDay 限制）—— BA01 的支付基準限制每日 1 次，
    // 同日第二趟會被 R12 正確擋下，那是另一條規則的行為
    const res = await createVisit(admin, {
      startMinute: 10 * 60,
      items: [{ code: 'BA02', quantity: 1 }],
    });
    expect(res.statusCode).toBe(200);
  });

  it('★ R12 同日超過支付基準次數上限 → 422，且不可覆寫', async () => {
    // BA01 的 maxPerDay = 1，該個案當日已有一筆 BA01
    const res = await createVisit(admin, {
      startMinute: 11 * 60,
      items: [{ code: 'BA01', quantity: 1 }],
    });
    expect(res.statusCode).toBe(422);
    const r12 = res
      .json()
      .error.details.findings.find((f: { ruleId: string }) => f.ruleId === 'R12');
    expect(r12).toBeDefined();
    expect(r12.overridable).toBe(false);
  });

  it('★ R08 證照不符 → 422，且不可覆寫', async () => {
    const res = await createVisit(admin, {
      attendantId: fx.attendantNoCert,
      startMinute: 14 * 60,
      items: [{ code: 'BA09', quantity: 1 }],
    });
    expect(res.statusCode).toBe(422);
    const r08 = res
      .json()
      .error.details.findings.find((f: { ruleId: string }) => f.ruleId === 'R08');
    expect(r08).toBeDefined();
    expect(r08.overridable).toBe(false);
    expect(r08.messageZh).toContain('到宅沐浴車');
  });

  it('持有證照者可排該項目', async () => {
    const res = await createVisit(admin, {
      attendantId: fx.attendantA2,
      startMinute: 14 * 60,
      items: [{ code: 'BA09', quantity: 1 }],
    });
    expect(res.statusCode).toBe(200);
  });

  it('R10 項目未經照顧計畫核定 → 422', async () => {
    // 建立一個計畫外的代碼
    await app.prisma.paymentItem.create({
      data: {
        scheduleId: fx.scheduleId,
        code: 'BA99',
        category: 'CARE_PROFESSIONAL',
        name: '未核定項目',
        price: 100,
        isAddOn: false,
        requiredCerts: [],
      },
    });
    const res = await createVisit(admin, {
      startMinute: 16 * 60,
      items: [{ code: 'BA99', quantity: 1 }],
    });
    expect(res.statusCode).toBe(422);
    expect(
      res.json().error.details.findings.some((f: { ruleId: string }) => f.ruleId === 'R10'),
    ).toBe(true);
  });
});

describe('★ 覆寫權限', () => {
  // R04（個案同時段已有他人服務）是可覆寫的 BLOCK —— 雙人協助移位是合法情境。
  // 用 BA02 避免同時觸發不可覆寫的 R12。
  const doubleBookingPayload = {
    recipientId: fx?.recipientA,
    attendantId: fx?.attendantA2,
    serviceDate: D,
    startMinute: 9 * 60 + 15, // 與 attendantA 的 09:00–10:00 重疊
    durationMinutes: 30,
    items: [{ code: 'BA02', quantity: 1 }],
  };

  it('行政人員的 overrideRuleIds 不生效', async () => {
    const res = await post('/api/v1/schedules/visits', staff, {
      ...doubleBookingPayload,
      recipientId: fx.recipientA,
      attendantId: fx.attendantA2,
      overrideRuleIds: ['R04'],
      overrideReason: '行政嘗試覆寫',
    });
    expect(res.statusCode).toBe(422);
    expect(
      res.json().error.details.findings.some((f: { ruleId: string }) => f.ruleId === 'R04'),
    ).toBe(true);
  });

  it('督導可覆寫可覆寫的 BLOCK，並留下稽核軌跡', async () => {
    const res = await post('/api/v1/schedules/visits', admin, {
      ...doubleBookingPayload,
      recipientId: fx.recipientA,
      attendantId: fx.attendantA2,
      overrideRuleIds: ['R04'],
      overrideReason: '雙人協助移位',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.overrideReason).toBe('雙人協助移位');

    const audit = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/logs?action=OVERRIDE',
      headers: { cookie: admin },
    });
    expect(audit.json().meta.total).toBeGreaterThan(0);
  });
});

describe('check-conflicts 試算不寫入', () => {
  it('回傳 findings 但不建立班次', async () => {
    const before = await app.prisma.serviceVisit.count();
    const res = await post('/api/v1/schedules/check-conflicts', admin, {
      drafts: [
        {
          recipientId: fx.recipientA,
          attendantId: fx.attendantA,
          serviceDate: D,
          startAt: `${D}T01:15:00Z`, // 09:15 台北
          endAt: `${D}T01:45:00Z`,
          items: [{ code: 'BA01', quantity: 1 }],
        },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].level).toBe('BLOCKED');
    expect(await app.prisma.serviceVisit.count()).toBe(before);
  });
});

describe('查詢限制', () => {
  it('超過 31 天的區間被拒絕', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/schedules/visits?from=2026-01-01&to=2026-12-31',
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('31 天');
  });

  it('結束日早於開始日被拒絕', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/schedules/visits?from=2026-09-10&to=2026-09-01',
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('★ DB 層排他約束', () => {
  it('繞過應用層直接寫入重疊班次會被 PostgreSQL 拒絕', async () => {
    // 模擬並行寫入的情境：兩位督導同時排同一人，應用層檢核會雙雙通過
    const rec = await app.prisma.careRecipient.findUniqueOrThrow({ where: { id: fx.recipientA } });
    const base = {
      orgId: fx.orgId,
      recipientId: rec.id,
      attendantId: fx.attendantB,
      serviceDate: new Date('2026-10-01T00:00:00Z'),
      plannedMinutes: 120,
      status: 'SCHEDULED' as const,
      createdBy: 'test',
    };

    await app.prisma.serviceVisit.create({
      data: {
        ...base,
        startAt: new Date('2026-10-01T01:00:00Z'),
        endAt: new Date('2026-10-01T03:00:00Z'),
      },
    });

    await expect(
      app.prisma.serviceVisit.create({
        data: {
          ...base,
          startAt: new Date('2026-10-01T02:00:00Z'),
          endAt: new Date('2026-10-01T04:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('已取消的班次不受排他約束限制', async () => {
    const rec = await app.prisma.careRecipient.findUniqueOrThrow({ where: { id: fx.recipientA } });
    await expect(
      app.prisma.serviceVisit.create({
        data: {
          orgId: fx.orgId,
          recipientId: rec.id,
          attendantId: fx.attendantB,
          serviceDate: new Date('2026-10-01T00:00:00Z'),
          startAt: new Date('2026-10-01T01:30:00Z'),
          endAt: new Date('2026-10-01T02:30:00Z'),
          plannedMinutes: 60,
          status: 'CANCELLED',
          createdBy: 'test',
        },
      }),
    ).resolves.toBeTruthy();
  });
});
