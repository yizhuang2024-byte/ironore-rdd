import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', { schema: { tags: ['health'], summary: '存活檢查' } }, async () => ({
    data: { status: 'ok', time: new Date().toISOString() },
  }));

  app.get(
    '/health/db',
    { schema: { tags: ['health'], summary: '資料庫連線檢查' } },
    async (_req, reply) => {
      try {
        await app.prisma.$queryRaw`SELECT 1`;
        return { data: { status: 'ok' } };
      } catch (err) {
        return reply.status(503).send({
          error: {
            code: 'DB_UNAVAILABLE',
            message: '資料庫連線失敗',
            details: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
  );
};
