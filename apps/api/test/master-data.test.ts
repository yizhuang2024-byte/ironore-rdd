/**
 * 主檔建檔流程的整合測試。
 *
 * 涵蓋新補的端點：個案／照服員建檔、子資源整批取代、排班樣板、使用者管理。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, login, seedFixture, truncateAll, type Fixture } from './helpers.js';

let app: FastifyInstance;
let fx: Fixture;
let admin: string;
let staff: string;

beforeAll(async () => {
  app = await createTestApp();
  await truncateAll(app);
  fx = await seedFixture(app);
  admin = await login(app, 'admin');

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

const req = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, cookie: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, payload: payload as never });

describe('個案建檔', () => {
  let newRecipientId: string;

  it('可新增個案，且回應為遮罩後的資料', async () => {
    const res = await req('POST', '/api/v1/recipients', admin, {
      caseNo: 'C-NEW-001',
      name: '林大明',
      nationalId: 'A123456789',
      phone: '0912345678',
      address: '臺北市文山區測試路 1 號',
      districtCode: '63000120',
      cmsLevel: 5,
      copayCategory: 'LOW_MID_INCOME',
      serviceStartOn: '2026-09-01',
      careNotes: '行動需助行器',
    });
    expect(res.statusCode).toBe(200);

    const d = res.json().data;
    newRecipientId = d.id;
    expect(d.nameMasked).toBe('林○明');
    expect(d.nationalIdMasked).toBe('A12****789');
    // 明文絕不出現在建檔回應中
    expect(res.body).not.toContain('A123456789');
    expect(res.body).not.toContain('林大明');
  });

  it('身分證字號經加密儲存且可用 blind index 查得', async () => {
    const row = await app.prisma.careRecipient.findUniqueOrThrow({
      where: { id: newRecipientId },
    });
    expect(row.nationalIdEnc).toBeTruthy();
    expect(row.nationalIdBidx).toBeTruthy();
    // 密文不得等於明文
    expect(Buffer.from(row.nationalIdEnc!).toString('utf8')).not.toContain('A123456789');
  });

  it('案號重複會被拒絕', async () => {
    const res = await req('POST', '/api/v1/recipients', admin, {
      caseNo: 'C-NEW-001',
      name: '重複案號',
      districtCode: '63000120',
      cmsLevel: 4,
      copayCategory: 'GENERAL',
      serviceStartOn: '2026-09-01',
    });
    expect(res.statusCode).toBe(409);
    // 訊息必須指出是哪個欄位重複。Prisma 7 的 driver adapter 不填 meta.target，
    // 若只讀 target 這裡會退化成「未知欄位」，督導看了不知道要改什麼
    expect(res.json().error.message).toContain('機構案號');
    expect(res.json().error.message).not.toContain('未知欄位');
  });

  it('可整批設定緊急聯絡人', async () => {
    const res = await req('PUT', `/api/v1/recipients/${newRecipientId}/contacts`, admin, {
      contacts: [
        { name: '林小華', relation: '子', phone: '0922222222', isPrimary: true },
        { name: '林小美', relation: '女', phone: '0933333333', isPrimary: false },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBe(2);

    const list = await req('GET', `/api/v1/recipients/${newRecipientId}/contacts`, admin);
    expect(list.json().data).toHaveLength(2);
    expect(list.json().data[0].isPrimary).toBe(true);
  });

  it('多位主要聯絡人會被拒絕', async () => {
    const res = await req('PUT', `/api/v1/recipients/${newRecipientId}/contacts`, admin, {
      contacts: [
        { name: 'A', relation: '子', phone: '09', isPrimary: true },
        { name: 'B', relation: '女', phone: '09', isPrimary: true },
      ],
    });
    expect(res.statusCode).toBe(400);
  });

  it('可設定不可服務時段', async () => {
    const res = await req('PUT', `/api/v1/recipients/${newRecipientId}/unavailability`, admin, {
      windows: [{ weekday: 3, startMinute: 480, endMinute: 720, reason: '固定回診' }],
    });
    expect(res.statusCode).toBe(200);

    const list = await req('GET', `/api/v1/recipients/${newRecipientId}/unavailability`, admin);
    expect(list.json().data[0].reason).toBe('固定回診');
  });

  it('結束時間早於開始時間會被拒絕', async () => {
    const res = await req('PUT', `/api/v1/recipients/${newRecipientId}/unavailability`, admin, {
      windows: [{ weekday: 3, startMinute: 720, endMinute: 480 }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('未指定星期也未指定日期會被拒絕', async () => {
    const res = await req('PUT', `/api/v1/recipients/${newRecipientId}/unavailability`, admin, {
      windows: [{ startMinute: 480, endMinute: 720 }],
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('照服員建檔', () => {
  let newAttendantId: string;

  it('可新增照服員', async () => {
    const res = await req('POST', '/api/v1/attendants', admin, {
      employeeNo: 'E-NEW-001',
      name: '陳照服',
      nationalId: 'B234567890',
      phone: '0955555555',
      employmentType: 'PART_TIME',
      hiredOn: '2026-09-01',
      maxWeeklyMinutes: 1800,
    });
    expect(res.statusCode).toBe(200);
    newAttendantId = res.json().data.id;
    expect(res.json().data.nationalIdMasked).toBe('B23****890');
  });

  it('可整批設定服務區域與可服務時段', async () => {
    const areas = await req('PUT', `/api/v1/attendants/${newAttendantId}/service-areas`, admin, {
      areas: [
        { districtCode: '63000120', priority: 1 },
        { districtCode: '63000110', priority: 2 },
      ],
    });
    expect(areas.statusCode).toBe(200);

    const avail = await req('PUT', `/api/v1/attendants/${newAttendantId}/availability`, admin, {
      windows: [
        { weekday: 1, startMinute: 480, endMinute: 720 },
        { weekday: 3, startMinute: 480, endMinute: 720 },
      ],
    });
    expect(avail.statusCode).toBe(200);

    const detail = await req('GET', `/api/v1/attendants/${newAttendantId}`, admin);
    expect(detail.json().data.serviceAreas).toHaveLength(2);
    expect(detail.json().data.availabilities).toHaveLength(2);
  });

  it('整批取代會清掉舊資料而非累加', async () => {
    await req('PUT', `/api/v1/attendants/${newAttendantId}/service-areas`, admin, {
      areas: [{ districtCode: '63000010', priority: 1 }],
    });
    const detail = await req('GET', `/api/v1/attendants/${newAttendantId}`, admin);
    expect(detail.json().data.serviceAreas).toHaveLength(1);
    expect(detail.json().data.serviceAreas[0].districtCode).toBe('63000010');
  });
});

describe('排班樣板', () => {
  let patternId: string;

  it('可新增樣板', async () => {
    const res = await req('POST', '/api/v1/schedules/patterns', admin, {
      recipientId: fx.recipientA,
      attendantId: fx.attendantA,
      weekday: 2,
      startMinute: 9 * 60,
      durationMinutes: 60,
      itemCodes: ['BA01'],
      effectiveFrom: '2026-09-01',
    });
    expect(res.statusCode).toBe(200);
    patternId = res.json().data.id;
  });

  it('★ 未經照顧計畫核定的項目會在建立樣板時就被擋下', async () => {
    // 否則依此樣板產生的班次會全數卡在 R10，督導要到排班時才發現
    const res = await req('POST', '/api/v1/schedules/patterns', admin, {
      recipientId: fx.recipientA,
      weekday: 4,
      startMinute: 9 * 60,
      durationMinutes: 60,
      itemCodes: ['BA01', 'NOT-APPROVED'],
      effectiveFrom: '2026-09-01',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('NOT-APPROVED');
  });

  it('樣板清單回傳遮罩後的個案姓名', async () => {
    const res = await req('GET', '/api/v1/schedules/patterns', admin);
    expect(res.statusCode).toBe(200);
    const p = res.json().data.find((x: { id: string }) => x.id === patternId);
    expect(p.recipient.nameMasked).toBe('王○明');
    expect(res.body).not.toContain('"name":"王小明"');
  });

  it('停用為軟刪除，仍可查得但不列於啟用清單', async () => {
    const del = await req('DELETE', `/api/v1/schedules/patterns/${patternId}`, admin);
    expect(del.statusCode).toBe(200);

    const active = await req('GET', '/api/v1/schedules/patterns?activeOnly=true', admin);
    expect(active.json().data.some((x: { id: string }) => x.id === patternId)).toBe(false);

    const all = await req('GET', '/api/v1/schedules/patterns?activeOnly=false', admin);
    expect(all.json().data.some((x: { id: string }) => x.id === patternId)).toBe(true);
  });
});

describe('使用者管理', () => {
  let newUserId: string;

  it('★ 僅管理者可新增使用者', async () => {
    const denied = await req('POST', '/api/v1/users', staff, {
      account: 'nope',
      displayName: '不該成功',
      roles: [{ role: 'ADMIN_STAFF' }],
    });
    expect(denied.statusCode).toBe(403);
  });

  it('新增使用者會回傳一次性初始密碼', async () => {
    const res = await req('POST', '/api/v1/users', admin, {
      account: 'newsup',
      displayName: '新督導',
      roles: [{ role: 'SUPERVISOR', unitId: fx.unitA }],
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    newUserId = d.id;
    expect(d.initialPassword).toMatch(/^Ltc-/);

    const row = await app.prisma.user.findUniqueOrThrow({ where: { id: newUserId } });
    // 必須強制首次變更密碼
    expect(row.mustChangePw).toBe(true);
  });

  it('帳號重複會被拒絕', async () => {
    const res = await req('POST', '/api/v1/users', admin, {
      account: 'newsup',
      displayName: '重複',
      roles: [{ role: 'ADMIN_STAFF' }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('★ 停用帳號會一併撤銷其所有工作階段', async () => {
    // 先讓該使用者登入，取得有效 session
    await app.prisma.user.update({
      where: { id: newUserId },
      data: {
        passwordHash: await (
          await import('@node-rs/argon2')
        ).hash('Test@12345', { memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        mustChangePw: false,
      },
    });
    const cookie = await login(app, 'newsup');
    expect((await req('GET', '/api/v1/auth/me', cookie)).statusCode).toBe(200);

    await req('PATCH', `/api/v1/users/${newUserId}`, admin, { status: 'SUSPENDED' });

    // 手上的 cookie 必須立即失效，否則停用形同虛設
    expect((await req('GET', '/api/v1/auth/me', cookie)).statusCode).toBe(401);
  });

  it('★ 重設密碼會撤銷所有工作階段', async () => {
    await req('PATCH', `/api/v1/users/${newUserId}`, admin, { status: 'ACTIVE' });
    const cookie = await login(app, 'newsup');
    expect((await req('GET', '/api/v1/auth/me', cookie)).statusCode).toBe(200);

    const res = await req('POST', `/api/v1/users/${newUserId}/reset-password`, admin);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.newPassword).toMatch(/^Ltc-/);

    expect((await req('GET', '/api/v1/auth/me', cookie)).statusCode).toBe(401);
  });

  it('★ 不可移除自己的管理者角色', async () => {
    const me = await req('GET', '/api/v1/auth/me', admin);
    const myId = me.json().data.id;

    const res = await req('PUT', `/api/v1/users/${myId}/roles`, admin, {
      roles: [{ role: 'ADMIN_STAFF' }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('自己');
  });

  it('可變更他人角色', async () => {
    const res = await req('PUT', `/api/v1/users/${newUserId}/roles`, admin, {
      roles: [{ role: 'AUDITOR', unitId: null }],
    });
    expect(res.statusCode).toBe(200);

    const detail = await req('GET', `/api/v1/users/${newUserId}`, admin);
    expect(detail.json().data.roles).toHaveLength(1);
    expect(detail.json().data.roles[0].role).toBe('AUDITOR');
  });
});
