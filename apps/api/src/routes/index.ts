import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authRoutes } from './auth.js';
import { healthRoutes } from './health.js';

export const registerRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(healthRoutes);
  await app.register(authRoutes);
};
