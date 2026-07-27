/**
 * 認證端點。
 */

import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Role } from '@ltc/shared';
import { SESSION_COOKIE } from '../plugins/auth.js';
import { UnauthorizedError, ValidationError } from '../lib/errors.js';
import { permissionsOf } from '../lib/rbac.js';

/** 連續失敗達此次數即鎖定帳號 */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

/** Argon2id 參數。memoryCost 至少 19 MiB（OWASP 建議） */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/login',
    {
      // 登入端點單獨節流，避免帳密暴力嘗試
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: '登入',
        body: z.object({
          account: z.string().min(1),
          password: z.string().min(1),
          deviceLabel: z.string().optional(),
        }),
      },
    },
    async (req, reply) => {
      const { account, password, deviceLabel } = req.body;

      const user = await app.prisma.user.findFirst({
        where: { account },
        include: { roles: true, attendant: { select: { id: true } } },
      });

      // 帳號不存在時仍執行一次雜湊比對，讓回應時間一致，
      // 避免以回應時間差異推測帳號是否存在
      if (!user) {
        await verify(
          '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000',
          password,
        ).catch(() => false);
        throw new UnauthorizedError('帳號或密碼錯誤');
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await app.prisma.auditLog.create({
          data: {
            orgId: user.orgId,
            actorUserId: user.id,
            action: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: user.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] ?? null,
            changes: { reason: 'LOCKED' },
          },
        });
        throw new UnauthorizedError(
          `帳號因連續登入失敗已鎖定，請於 ${user.lockedUntil.toLocaleString('zh-TW')} 後再試`,
        );
      }

      if (user.status !== 'ACTIVE') {
        throw new UnauthorizedError('此帳號已停用');
      }

      const ok = await verify(user.passwordHash, password).catch(() => false);

      if (!ok) {
        const failed = user.failedLogins + 1;
        await app.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLogins: failed,
            lockedUntil:
              failed >= MAX_FAILED_LOGINS
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                : null,
          },
        });
        await app.prisma.auditLog.create({
          data: {
            orgId: user.orgId,
            actorUserId: user.id,
            action: 'LOGIN_FAILED',
            entityType: 'User',
            entityId: user.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'] ?? null,
            changes: { failedLogins: failed },
          },
        });
        throw new UnauthorizedError('帳號或密碼錯誤');
      }

      await app.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
      });

      await app.createSession(reply, user.id, user.roles, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        deviceLabel,
      });

      await app.prisma.auditLog.create({
        data: {
          orgId: user.orgId,
          actorUserId: user.id,
          actorRole: user.roles.map((r) => r.role).join(','),
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });

      const authUser = {
        id: user.id,
        orgId: user.orgId,
        account: user.account,
        displayName: user.displayName,
        roles: user.roles.map((r) => ({ role: r.role as Role, unitId: r.unitId })),
        attendantId: user.attendant?.id ?? null,
      };

      return {
        data: {
          id: user.id,
          account: user.account,
          displayName: user.displayName,
          mustChangePw: user.mustChangePw,
          roles: authUser.roles,
          permissions: [...permissionsOf(authUser)],
          attendantId: authUser.attendantId,
        },
      };
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], summary: '登出（撤銷此裝置的工作階段）' } },
    async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE];
      if (token) await app.revokeSession(token);
      if (req.user) {
        await app.prisma.auditLog.create({
          data: {
            orgId: req.user.orgId,
            actorUserId: req.user.id,
            action: 'LOGOUT',
            entityType: 'User',
            entityId: req.user.id,
            ipAddress: req.ip,
          },
        });
      }
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { data: { ok: true } };
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['auth'], summary: '取得目前登入者' },
    },
    async (req) => {
      const user = req.user!;
      return {
        data: {
          id: user.id,
          account: user.account,
          displayName: user.displayName,
          orgId: user.orgId,
          roles: user.roles,
          permissions: [...permissionsOf(user)],
          attendantId: user.attendantId,
        },
      };
    },
  );

  app.post(
    '/auth/change-password',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['auth'],
        summary: '變更密碼',
        body: z.object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(10, '密碼至少 10 個字元'),
        }),
      },
    },
    async (req) => {
      const user = req.user!;
      const record = await app.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

      const ok = await verify(record.passwordHash, req.body.currentPassword).catch(() => false);
      if (!ok) throw new ValidationError('目前密碼不正確');

      await app.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(req.body.newPassword),
          mustChangePw: false,
        },
      });

      // 變更密碼後撤銷其他所有裝置 —— 密碼外洩時這是唯一有效的補救
      const current = req.cookies[SESSION_COOKIE];
      await app.prisma.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(current ? { NOT: { tokenHash: undefined } } : {}),
        },
        data: { revokedAt: new Date() },
      });

      return { data: { ok: true, note: '已登出所有其他裝置，請重新登入' } };
    },
  );

  app.get(
    '/auth/sessions',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['auth'], summary: '我的登入裝置清單' },
    },
    async (req) => {
      const sessions = await app.prisma.session.findMany({
        where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: 'desc' },
        select: {
          id: true,
          deviceLabel: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
        },
      });
      return { data: sessions };
    },
  );

  app.delete(
    '/auth/sessions/:id',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['auth'],
        summary: '撤銷指定裝置（手機遺失時使用）',
        params: z.object({ id: z.string() }),
      },
    },
    async (req) => {
      await app.prisma.session.updateMany({
        where: { id: req.params.id, userId: req.user!.id },
        data: { revokedAt: new Date() },
      });
      return { data: { ok: true } };
    },
  );
};
