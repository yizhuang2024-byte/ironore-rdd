/**
 * 使用者與角色管理。
 *
 * 角色決定資料可見範圍，因此這裡的每個操作都是高風險的 ——
 * 誤把某人設為 ORG_ADMIN 等於讓他看到全機構個資。
 * 全部限 user:write 權限（僅 ORG_ADMIN），且異動由 Prisma extension 自動寫稽核。
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { hashPassword } from './auth.js';

const roleEnum = z.enum(['ORG_ADMIN', 'SUPERVISOR', 'ADMIN_STAFF', 'ATTENDANT', 'AUDITOR']);

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/users/:id',
    {
      preHandler: [app.requirePermission('user:read')],
      schema: {
        tags: ['org'],
        summary: '使用者詳情',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const user = await app.prisma.user.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
        select: {
          id: true, account: true, displayName: true, phone: true, email: true,
          status: true, mustChangePw: true, lastLoginAt: true, lockedUntil: true,
          createdAt: true,
          roles: { select: { id: true, role: true, unitId: true } },
          attendant: { select: { id: true, employeeNo: true, name: true } },
        },
      });
      if (!user) throw new NotFoundError('使用者');
      return { data: user };
    },
  );

  app.post(
    '/users',
    {
      preHandler: [app.requirePermission('user:write')],
      schema: {
        tags: ['org'],
        summary: '新增使用者',
        description: '初始密碼由系統產生並僅在此次回應中出現，不會再次顯示。',
        body: z.object({
          account: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, '帳號僅能使用英數字與 . _ -'),
          displayName: z.string().min(1),
          phone: z.string().optional(),
          email: z.string().email().optional(),
          roles: z
            .array(z.object({ role: roleEnum, unitId: z.string().nullable().optional() }))
            .min(1, '至少需指定一個角色'),
          /** 綁定既有照服員（role 含 ATTENDANT 時） */
          attendantId: z.string().optional(),
        }),
      },
    },
    async (req) => {
      const b = req.body;

      const dup = await app.prisma.user.findFirst({
        where: { orgId: req.user!.orgId, account: b.account },
      });
      if (dup) throw new ValidationError(`帳號已存在：${b.account}`);

      if (b.attendantId) {
        const att = await app.prisma.attendant.findFirst({
          where: { id: b.attendantId, orgId: req.user!.orgId },
          select: { id: true, userId: true },
        });
        if (!att) throw new NotFoundError('照服員');
        if (att.userId) throw new ValidationError('該照服員已綁定其他帳號');
      }

      // 產生初始密碼；使用者首次登入必須變更
      const initialPassword = `Ltc-${randomBytes(6).toString('base64url')}`;

      const created = await app.prisma.user.create({
        data: {
          orgId: req.user!.orgId,
          account: b.account,
          passwordHash: await hashPassword(initialPassword),
          displayName: b.displayName,
          phone: b.phone ?? null,
          email: b.email ?? null,
          mustChangePw: true,
          roles: {
            create: b.roles.map((r) => ({ role: r.role, unitId: r.unitId ?? null })),
          },
        },
        select: { id: true, account: true, displayName: true },
      });

      if (b.attendantId) {
        await app.prisma.attendant.update({
          where: { id: b.attendantId },
          data: { userId: created.id },
        });
      }

      return {
        data: {
          ...created,
          initialPassword,
          note: '初始密碼僅顯示此一次，請立即交付使用者並要求首次登入變更',
        },
      };
    },
  );

  app.patch(
    '/users/:id',
    {
      preHandler: [app.requirePermission('user:write')],
      schema: {
        tags: ['org'],
        summary: '更新使用者',
        params: z.object({ id: z.string() }),
        body: z.object({
          displayName: z.string().min(1).optional(),
          phone: z.string().nullable().optional(),
          email: z.string().email().nullable().optional(),
          status: z.enum(['ACTIVE', 'SUSPENDED', 'RESIGNED']).optional(),
          /** 解除因連續登入失敗造成的鎖定 */
          unlock: z.boolean().optional(),
        }),
      },
    },
    async (req) => {
      const existing = await app.prisma.user.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
      });
      if (!existing) throw new NotFoundError('使用者');

      // 停用帳號時一併撤銷所有工作階段，否則對方手上的 cookie 仍然有效
      const suspending = req.body.status && req.body.status !== 'ACTIVE';

      const b = req.body;
      const updated = await app.prisma.$transaction(async (tx) => {
        if (suspending) {
          await tx.session.updateMany({
            where: { userId: existing.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return tx.user.update({
          where: { id: existing.id },
          data: {
            ...(b.displayName !== undefined ? { displayName: b.displayName } : {}),
            ...(b.phone !== undefined ? { phone: b.phone } : {}),
            ...(b.email !== undefined ? { email: b.email } : {}),
            ...(b.status !== undefined ? { status: b.status } : {}),
            ...(b.unlock ? { lockedUntil: null, failedLogins: 0 } : {}),
          },
          select: { id: true, account: true, displayName: true, status: true },
        });
      });

      return { data: updated };
    },
  );

  app.put(
    '/users/:id/roles',
    {
      preHandler: [app.requirePermission('user:write')],
      schema: {
        tags: ['org'],
        summary: '設定角色（整批取代）',
        params: z.object({ id: z.string() }),
        body: z.object({
          roles: z
            .array(z.object({ role: roleEnum, unitId: z.string().nullable().optional() }))
            .min(1, '至少需保留一個角色'),
        }),
      },
    },
    async (req) => {
      const existing = await app.prisma.user.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
        include: { roles: true },
      });
      if (!existing) throw new NotFoundError('使用者');

      // 防呆：不得移除自己的管理者角色，否則會把自己鎖在門外
      if (existing.id === req.user!.id) {
        const stillAdmin = req.body.roles.some((r) => r.role === 'ORG_ADMIN');
        const wasAdmin = existing.roles.some((r) => r.role === 'ORG_ADMIN');
        if (wasAdmin && !stillAdmin) {
          throw new ValidationError('不可移除自己的管理者角色');
        }
      }

      await app.prisma.$transaction([
        app.prisma.userRole.deleteMany({ where: { userId: existing.id } }),
        app.prisma.userRole.createMany({
          data: req.body.roles.map((r) => ({
            userId: existing.id,
            role: r.role,
            unitId: r.unitId ?? null,
          })),
        }),
      ]);

      return { data: { count: req.body.roles.length } };
    },
  );

  app.post(
    '/users/:id/reset-password',
    {
      preHandler: [app.requirePermission('user:write')],
      schema: {
        tags: ['org'],
        summary: '重設密碼',
        description: '產生新的臨時密碼並撤銷該使用者所有工作階段。',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      const existing = await app.prisma.user.findFirst({
        where: { id: req.params.id, orgId: req.user!.orgId },
      });
      if (!existing) throw new NotFoundError('使用者');

      const newPassword = `Ltc-${randomBytes(6).toString('base64url')}`;

      await app.prisma.$transaction([
        app.prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: await hashPassword(newPassword),
            mustChangePw: true,
            failedLogins: 0,
            lockedUntil: null,
          },
        }),
        // 密碼重設後舊 session 必須失效，否則重設形同虛設
        app.prisma.session.updateMany({
          where: { userId: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);

      return {
        data: {
          newPassword,
          note: '臨時密碼僅顯示此一次；該使用者所有裝置已登出',
        },
      };
    },
  );
};
