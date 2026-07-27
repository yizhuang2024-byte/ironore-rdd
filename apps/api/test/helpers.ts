/**
 * 整合測試共用工具。
 *
 * 使用真實 PostgreSQL（ltc_test），透過 app.inject() 打 API 而不需開 port。
 */

import { hash } from '@node-rs/argon2';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const TEST_PASSWORD = 'Test@12345';

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildServer();
  await app.ready();
  return app;
}

/** 清空所有資料表 */
export async function truncateAll(app: FastifyInstance) {
  await app.prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "AuditLog", "ServiceRecord", "VisitItem", "ServiceVisit",
      "RecurringPattern", "LeaveRequest", "CarePlanItem", "CarePlan",
      "RecipientUnavailability", "RecipientContact", "CareRecipient",
      "Certification", "AttendantAvailability", "AttendantServiceArea", "Attendant",
      "Session", "UserRole", "User", "CopayRate", "CmsQuota", "PaymentItem",
      "PaymentSchedule", "OrgPolicy", "ServiceUnit", "Organization"
    RESTART IDENTITY CASCADE
  `);
}

export interface Fixture {
  orgId: string;
  unitA: string;
  unitB: string;
  scheduleId: string;
  paymentItemBA01: string;
  paymentItemBA09: string;
  adminId: string;
  supAId: string;
  supBId: string;
  attendantA: string;
  attendantA2: string;
  attendantB: string;
  /** 無沐浴車證照 */
  attendantNoCert: string;
  recipientA: string;
  recipientB: string;
}

/**
 * 建立最小但完整的測試資料：
 * 兩個服務單位、各一位督導、各自的照服員與個案。
 * 用來驗證跨單位資料隔離。
 */
export async function seedFixture(app: FastifyInstance): Promise<Fixture> {
  const pw = await hash(TEST_PASSWORD, ARGON2);

  const org = await app.prisma.organization.create({
    data: { name: '測試機構', taxId: '99999999', policy: { create: {} } },
  });

  const unitA = await app.prisma.serviceUnit.create({
    data: { orgId: org.id, name: 'A組', serviceAreas: ['63000120'] },
  });
  const unitB = await app.prisma.serviceUnit.create({
    data: { orgId: org.id, name: 'B組', serviceAreas: ['63000010'] },
  });

  const schedule = await app.prisma.paymentSchedule.create({
    data: {
      name: '測試支付基準',
      effectiveFrom: new Date('2020-01-01'),
      isActive: true,
    },
  });

  const ba01 = await app.prisma.paymentItem.create({
    data: {
      scheduleId: schedule.id,
      code: 'BA01',
      category: 'CARE_PROFESSIONAL',
      name: '基本身體清潔',
      price: 260,
      priceRemote: 312,
      unitType: 'PER_TIME',
      standardMinutes: 60,
      maxPerDay: 1,
      isAddOn: false,
      requiredCerts: ['CARE_ATTENDANT_TRAINING'],
    },
  });
  // 刻意不設 maxPerDay —— 用來測試「同日多趟」的正常情形，
  // 與 BA01（maxPerDay=1）形成對照
  const ba02 = await app.prisma.paymentItem.create({
    data: {
      scheduleId: schedule.id,
      code: 'BA02',
      category: 'CARE_PROFESSIONAL',
      name: '基本日常照顧',
      price: 195,
      unitType: 'PER_TIME',
      standardMinutes: 45,
      isAddOn: false,
      requiredCerts: ['CARE_ATTENDANT_TRAINING'],
    },
  });

  const ba09 = await app.prisma.paymentItem.create({
    data: {
      scheduleId: schedule.id,
      code: 'BA09',
      category: 'CARE_PROFESSIONAL',
      name: '到宅沐浴車服務',
      price: 2500,
      unitType: 'PER_TIME',
      isAddOn: false,
      requiredCerts: ['CARE_ATTENDANT_TRAINING', 'BATH_VEHICLE'],
    },
  });

  await app.prisma.cmsQuota.createMany({
    data: [4, 6, 8].map((lvl) => ({
      scheduleId: schedule.id,
      cmsLevel: lvl,
      category: 'CARE_PROFESSIONAL' as const,
      monthlyAmount: lvl * 4000,
    })),
  });
  await app.prisma.copayRate.createMany({
    data: [
      { scheduleId: schedule.id, copayCategory: 'GENERAL' as const, category: 'CARE_PROFESSIONAL' as const, ratePermille: 160 },
      { scheduleId: schedule.id, copayCategory: 'LOW_MID_INCOME' as const, category: 'CARE_PROFESSIONAL' as const, ratePermille: 50 },
      { scheduleId: schedule.id, copayCategory: 'LOW_INCOME' as const, category: 'CARE_PROFESSIONAL' as const, ratePermille: 0 },
    ],
  });

  const admin = await app.prisma.user.create({
    data: {
      orgId: org.id, account: 'admin', passwordHash: pw, displayName: '管理者',
      mustChangePw: false, roles: { create: [{ role: 'ORG_ADMIN', unitId: null }] },
    },
  });
  const supA = await app.prisma.user.create({
    data: {
      orgId: org.id, account: 'supA', passwordHash: pw, displayName: 'A組督導',
      mustChangePw: false, roles: { create: [{ role: 'SUPERVISOR', unitId: unitA.id }] },
    },
  });
  const supB = await app.prisma.user.create({
    data: {
      orgId: org.id, account: 'supB', passwordHash: pw, displayName: 'B組督導',
      mustChangePw: false, roles: { create: [{ role: 'SUPERVISOR', unitId: unitB.id }] },
    },
  });
  await app.prisma.user.create({
    data: {
      orgId: org.id, account: 'auditor', passwordHash: pw, displayName: '稽核',
      mustChangePw: false, roles: { create: [{ role: 'AUDITOR', unitId: null }] },
    },
  });

  const mkAttendant = async (
    no: string,
    unitId: string,
    district: string,
    certs: ('CARE_ATTENDANT_TRAINING' | 'BATH_VEHICLE')[],
    account?: string,
  ) => {
    const user = account
      ? await app.prisma.user.create({
          data: {
            orgId: org.id, account, passwordHash: pw, displayName: `照服員${no}`,
            mustChangePw: false, roles: { create: [{ role: 'ATTENDANT', unitId }] },
          },
        })
      : null;
    return app.prisma.attendant.create({
      data: {
        orgId: org.id,
        userId: user?.id ?? null,
        employeeNo: no,
        name: `照服員${no}`,
        phone: '0900000000',
        employmentType: 'FULL_TIME',
        hiredOn: new Date('2020-01-01'),
        primaryUnitId: unitId,
        serviceAreas: { create: [{ districtCode: district, priority: 1 }] },
        certifications: { create: certs.map((c) => ({ certType: c, expiresOn: null })) },
      },
    });
  };

  const attA = await mkAttendant('A001', unitA.id, '63000120', ['CARE_ATTENDANT_TRAINING'], 'attA');
  const attA2 = await mkAttendant('A002', unitA.id, '63000120', ['CARE_ATTENDANT_TRAINING', 'BATH_VEHICLE']);
  const attB = await mkAttendant('B001', unitB.id, '63000010', ['CARE_ATTENDANT_TRAINING']);
  const attNoCert = await mkAttendant('A003', unitA.id, '63000120', ['CARE_ATTENDANT_TRAINING']);

  const mkRecipient = async (caseNo: string, unitId: string, district: string, supervisorId: string) => {
    const rec = await app.prisma.careRecipient.create({
      data: {
        orgId: org.id,
        caseNo,
        name: '王小明',
        districtCode: district,
        cmsLevel: 6,
        copayCategory: 'GENERAL',
        serviceStartOn: new Date('2020-01-01'),
        status: 'ACTIVE',
        primaryUnitId: unitId,
        supervisorId,
      },
    });
    const plan = await app.prisma.carePlan.create({
      data: {
        recipientId: rec.id,
        version: 1,
        effectiveFrom: new Date('2020-01-01'),
        cmsLevel: 6,
        copayCategory: 'GENERAL',
        scheduleId: schedule.id,
        monthlyQuota: 24000,
        status: 'ACTIVE',
      },
    });
    await app.prisma.carePlanItem.createMany({
      data: [
        { carePlanId: plan.id, paymentItemId: ba01.id, code: 'BA01', approvedPerMonth: 30, approvedPerWeek: 7 },
        { carePlanId: plan.id, paymentItemId: ba02.id, code: 'BA02', approvedPerMonth: 60, approvedPerWeek: 14 },
        { carePlanId: plan.id, paymentItemId: ba09.id, code: 'BA09', approvedPerMonth: 4, approvedPerWeek: 1 },
      ],
    });
    return rec;
  };

  const recA = await mkRecipient('CA001', unitA.id, '63000120', supA.id);
  const recB = await mkRecipient('CB001', unitB.id, '63000010', supB.id);

  return {
    orgId: org.id,
    unitA: unitA.id,
    unitB: unitB.id,
    scheduleId: schedule.id,
    paymentItemBA01: ba01.id,
    paymentItemBA09: ba09.id,
    adminId: admin.id,
    supAId: supA.id,
    supBId: supB.id,
    attendantA: attA.id,
    attendantA2: attA2.id,
    attendantB: attB.id,
    attendantNoCert: attNoCert.id,
    recipientA: recA.id,
    recipientB: recB.id,
  };
}

/** 登入並回傳 cookie header */
export async function login(app: FastifyInstance, account: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { account, password: TEST_PASSWORD },
  });
  if (res.statusCode !== 200) {
    throw new Error(`登入失敗 ${account}: ${res.statusCode} ${res.body}`);
  }
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0]! : String(setCookie);
  return raw.split(';')[0]!;
}
