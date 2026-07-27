/**
 * 權限與個資保護的整合測試。
 *
 * 這些是系統中最不能出錯的行為 —— 一旦破功就是跨單位個資外洩。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, login, seedFixture, truncateAll, type Fixture } from './helpers.js';

let app: FastifyInstance;
let fx: Fixture;
let adminCookie: string;
let supACookie: string;
let supBCookie: string;
let auditorCookie: string;
let attendantCookie: string;

beforeAll(async () => {
  app = await createTestApp();
  await truncateAll(app);
  fx = await seedFixture(app);
  adminCookie = await login(app, 'admin');
  supACookie = await login(app, 'supA');
  supBCookie = await login(app, 'supB');
  auditorCookie = await login(app, 'auditor');
  attendantCookie = await login(app, 'attA');
});

afterAll(async () => {
  await app.close();
});

const get = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url, headers: { cookie } });
const post = (url: string, cookie: string, payload?: unknown) =>
  app.inject({ method: 'POST', url, headers: { cookie }, payload: payload as never });

describe('認證', () => {
  it('未登入存取受保護端點回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/attendants' });
    expect(res.statusCode).toBe(401);
  });

  it('錯誤密碼回 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { account: 'admin', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('不存在的帳號也回 401（不洩漏帳號是否存在）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { account: 'nobody', password: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe('帳號或密碼錯誤');
  });

  it('登入後可取得自身資訊與權限清單', async () => {
    const res = await get('/api/v1/auth/me', adminCookie);
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.account).toBe('admin');
    expect(d.permissions).toContain('pii:reveal');
  });
});

describe('★ 跨單位資料隔離', () => {
  it('管理者看得到所有單位的個案', async () => {
    const res = await get('/api/v1/recipients?pageSize=100', adminCookie);
    expect(res.json().meta.total).toBe(2);
  });

  it('督導只看得到自己單位的個案', async () => {
    const a = await get('/api/v1/recipients?pageSize=100', supACookie);
    const b = await get('/api/v1/recipients?pageSize=100', supBCookie);
    expect(a.json().meta.total).toBe(1);
    expect(b.json().meta.total).toBe(1);
    expect(a.json().data[0].caseNo).toBe('CA001');
    expect(b.json().data[0].caseNo).toBe('CB001');
  });

  it('督導只看得到自己單位的照服員', async () => {
    const a = await get('/api/v1/attendants?pageSize=100', supACookie);
    expect(a.json().meta.total).toBe(3); // A001, A002, A003
    const nos = a.json().data.map((x: { employeeNo: string }) => x.employeeNo).sort();
    expect(nos).toEqual(['A001', 'A002', 'A003']);
  });

  it('督導只看得到自己單位的班次', async () => {
    await post('/api/v1/schedules/visits', adminCookie, {
      recipientId: fx.recipientB,
      attendantId: fx.attendantB,
      serviceDate: '2026-09-01',
      startMinute: 9 * 60,
      durationMinutes: 60,
      items: [{ code: 'BA01', quantity: 1 }],
    });

    const a = await get('/api/v1/schedules/visits?from=2026-09-01&to=2026-09-01', supACookie);
    const b = await get('/api/v1/schedules/visits?from=2026-09-01&to=2026-09-01', supBCookie);
    expect(a.json().data).toHaveLength(0);
    expect(b.json().data).toHaveLength(1);
  });
});

describe('★ 個資保護', () => {
  it('個案列表回傳遮罩後的姓名與身分證', async () => {
    const res = await get('/api/v1/recipients?pageSize=1', adminCookie);
    const r = res.json().data[0];
    expect(r.nameMasked).toBe('王○明');
    expect(r).not.toHaveProperty('name');
    expect(r).not.toHaveProperty('nationalIdEnc');
  });

  it('AUDITOR 可讀資料但無法解密個資', async () => {
    const list = await get('/api/v1/recipients?pageSize=1', auditorCookie);
    expect(list.statusCode).toBe(200);

    const reveal = await post(`/api/v1/recipients/${fx.recipientA}/reveal-pii`, auditorCookie, {});
    expect(reveal.statusCode).toBe(403);
    expect(reveal.json().error.message).toContain('pii:reveal');
  });

  it('照服員無法讀取個案主檔', async () => {
    const res = await get('/api/v1/recipients', attendantCookie);
    expect(res.statusCode).toBe(403);
  });

  it('照服員的行動端班表不含身分證字號', async () => {
    const res = await get('/api/v1/m/visits?from=2026-09-01&to=2026-09-01', attendantCookie);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/nationalId/);
  });

  it('解密個資會寫入稽核紀錄', async () => {
    const before = await get(
      `/api/v1/audit/logs?subjectRecipientId=${fx.recipientA}&action=READ`,
      adminCookie,
    );
    const beforeCount = before.json().meta.total;

    const reveal = await post(`/api/v1/recipients/${fx.recipientA}/reveal-pii`, adminCookie, {
      reason: '測試',
    });
    expect(reveal.statusCode).toBe(200);
    expect(reveal.json().data.name).toBe('王小明');

    const after = await get(
      `/api/v1/audit/logs?subjectRecipientId=${fx.recipientA}&action=READ`,
      adminCookie,
    );
    expect(after.json().meta.total).toBeGreaterThan(beforeCount);
    expect(
      after.json().data.some((l: { entityType: string }) => l.entityType === 'CareRecipient.PII'),
    ).toBe(true);
  });

  it('稽核紀錄不記錄加密欄位的值', async () => {
    const res = await get('/api/v1/audit/logs?entityType=CareRecipient&pageSize=50', adminCookie);
    const body = JSON.stringify(res.json());
    // 只會有 [REDACTED] 標記，不會有明文
    expect(body).not.toMatch(/王小明.*nationalIdEnc/);
  });
});
