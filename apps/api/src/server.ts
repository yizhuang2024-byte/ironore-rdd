/**
 * Fastify 應用組裝。
 *
 * buildServer() 與 main.ts 分離，讓整合測試可以用 app.inject() 而不需真的開 port。
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

import { config, isProduction } from './config.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import { AppError, translatePgError } from './lib/errors.js';
import { ForbiddenError } from './lib/rbac.js';
import { registerRoutes } from './routes/index.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : isProduction
          ? true
          : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
    // 反向代理後方需要取得真實 IP 才能寫進稽核紀錄
    trustProxy: true,
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: '長照居家服務 排班暨個案管理系統 API',
        version: '0.1.0',
        description:
          '⚠️ 本系統處理長照個案個資，所有端點皆需認證。個資明文存取會寫入稽核紀錄。',
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  // 統一錯誤處理
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: '請求資料格式錯誤',
          details: err.issues,
        },
      });
    }

    if (err instanceof ForbiddenError) {
      return reply.status(403).send({ error: { code: err.code, message: err.message } });
    }

    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }

    // Fastify 內建的驗證錯誤
    const fastifyErr = err as { statusCode?: number; code?: string; message?: string };
    if (typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode < 500) {
      return reply.status(fastifyErr.statusCode).send({
        error: {
          code: fastifyErr.code ?? 'BAD_REQUEST',
          message: fastifyErr.message ?? '請求錯誤',
        },
      });
    }

    // PostgreSQL / Prisma 錯誤轉譯 —— 尤其是 23P01 班次重疊
    const translated = translatePgError(err);
    if (translated) {
      return reply
        .status(translated.statusCode)
        .send({ error: { code: translated.code, message: translated.message, details: translated.details } });
    }

    req.log.error({ err }, '未預期的錯誤');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: '系統發生未預期的錯誤' },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `找不到端點 ${req.method} ${req.url}` },
    });
  });

  await app.register(registerRoutes, { prefix: '/api/v1' });

  return app;
}
