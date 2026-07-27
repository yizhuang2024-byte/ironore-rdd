/**
 * 最小 bootstrap 資料 —— 供 M4 階段驗證認證流程使用。
 * 完整的 300 照服員 / 1,800 個案示範資料見 index.ts。
 */

import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { config } from '../../src/config.js';

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function bootstrap(prisma: PrismaClient) {
  const org = await prisma.organization.upsert({
    where: { taxId: '12345678' },
    update: {},
    create: {
      name: '示範長照日照單位',
      taxId: '12345678',
      ltcCode: 'DEMO-LTC-001',
      policy: { create: {} },
    },
  });

  const units = [];
  for (const name of ['文山組', '信義組', '大安組']) {
    const existing = await prisma.serviceUnit.findFirst({ where: { orgId: org.id, name } });
    units.push(
      existing ??
        (await prisma.serviceUnit.create({
          data: { orgId: org.id, name, unitType: 'HOME_CARE', serviceAreas: [] },
        })),
    );
  }

  const passwordHash = await hash('Demo@1234', ARGON2_OPTIONS);

  const admin = await prisma.user.upsert({
    where: { orgId_account: { orgId: org.id, account: 'admin' } },
    update: {},
    create: {
      orgId: org.id,
      account: 'admin',
      passwordHash,
      displayName: '系統管理者',
      mustChangePw: false,
      roles: { create: [{ role: 'ORG_ADMIN', unitId: null }] },
    },
  });

  return { org, units, admin };
}

// 直接執行時的進入點
if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
  });
  const { org, admin } = await bootstrap(prisma);
  console.log(`✓ 機構：${org.name}`);
  console.log(`✓ 管理者帳號：${admin.account} / Demo@1234（僅供開發，正式環境務必變更）`);
  await prisma.$disconnect();
}
