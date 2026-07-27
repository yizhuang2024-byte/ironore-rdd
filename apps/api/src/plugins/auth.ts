/**
 * 認證 plugin —— DB-backed opaque session cookie。
 *
 * 刻意不用無狀態 JWT：照服員手機遺失時，督導必須能立即撤銷該裝置的存取權。
 * 這是個資法「設備遺失之應變措施」的實質要求。無狀態 JWT 做不到 ——
 * 要做到就得另建 blocklist，那等於又回到有狀態，卻多了一層複雜度。
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@ltc/shared';
import { config, isProduction } from '../config.js';
import { generateSessionToken, hashSessionToken } from '../lib/crypto.js';
import { UnauthorizedError } from '../lib/errors.js';
import { assertPermission, type AuthUser, type Permission } from '../lib/rbac.js';
import { runWithAuditContext } from './audit-context.js';

export const SESSION_COOKIE = 'ltc_sid';

/** 督導／行政：8 小時滑動視窗 */
const DESK_SESSION_HOURS = 8;
/** 照服員：30 天滑動視窗。手機每天用，天天登入不可行。 */
const MOBILE_SESSION_DAYS = 30;

export function sessionTtlMs(roles: readonly { role: Role }[]): number {
  const onlyAttendant = roles.length > 0 && roles.every((r) => r.role === 'ATTENDANT');
  return onlyAttendant
    ? MOBILE_SESSION_DAYS * 24 * 60 * 60 * 1000
    : DESK_SESSION_HOURS * 60 * 60 * 1000;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
  interface FastifyInstance {
    /** 要求已登入 */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 要求已登入且具備指定權限 */
    requirePermission: (
      permission: Permission,
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 建立工作階段並設定 cookie */
    createSession: (
      reply: FastifyReply,
      userId: string,
      roles: readonly { role: Role }[],
      meta: { ip?: string; userAgent?: string; deviceLabel?: string },
    ) => Promise<string>;
    revokeSession: (token: string) => Promise<void>;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('user', undefined);

  /** 由 cookie 解析出使用者；失敗回傳 undefined 而不拋錯 */
  async function resolveUser(req: FastifyRequest): Promise<AuthUser | undefined> {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return undefined;

    const session = await app.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: {
          include: { roles: true, attendant: { select: { id: true } } },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) return undefined;
    if (session.user.status !== 'ACTIVE') return undefined;

    // 滑動視窗：每次使用都延展有效期
    const ttl = sessionTtlMs(session.user.roles);
    await app.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + ttl) },
    });

    return {
      id: session.user.id,
      orgId: session.user.orgId,
      account: session.user.account,
      displayName: session.user.displayName,
      roles: session.user.roles.map((r) => ({ role: r.role as Role, unitId: r.unitId })),
      attendantId: session.user.attendant?.id ?? null,
    };
  }

  // 所有請求都先嘗試解析使用者，並建立稽核上下文
  app.addHook('onRequest', async (req) => {
    req.user = await resolveUser(req);
  });

  // 在稽核上下文中執行 handler，讓 Prisma extension 取得操作者資訊
  app.addHook('preHandler', (req, _reply, done) => {
    runWithAuditContext(
      {
        orgId: req.user?.orgId ?? 'anonymous',
        userId: req.user?.id ?? null,
        userRole: req.user?.roles.map((r) => r.role).join(',') ?? null,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        requestId: req.id ?? null,
      },
      done,
    );
  });

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    if (!req.user) throw new UnauthorizedError();
  });

  app.decorate(
    'requirePermission',
    (permission: Permission) => async (req: FastifyRequest) => {
      if (!req.user) throw new UnauthorizedError();
      assertPermission(req.user, permission);
    },
  );

  app.decorate(
    'createSession',
    async (
      reply: FastifyReply,
      userId: string,
      roles: readonly { role: Role }[],
      meta: { ip?: string; userAgent?: string; deviceLabel?: string },
    ) => {
      const token = generateSessionToken();
      const ttl = sessionTtlMs(roles);
      await app.prisma.session.create({
        data: {
          userId,
          tokenHash: hashSessionToken(token),
          expiresAt: new Date(Date.now() + ttl),
          ipAddress: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
          deviceLabel: meta.deviceLabel ?? null,
        },
      });

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: Math.floor(ttl / 1000),
        signed: false,
      });
      return token;
    },
  );

  app.decorate('revokeSession', async (token: string) => {
    await app.prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token) },
      data: { revokedAt: new Date() },
    });
  });

  void config;
});
