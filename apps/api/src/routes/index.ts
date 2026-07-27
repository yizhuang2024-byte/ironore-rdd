import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authRoutes } from './auth.js';
import { healthRoutes } from './health.js';
import { orgRoutes } from './org.js';
import { attendantRoutes } from './attendants.js';
import { recipientRoutes } from './recipients.js';
import { paymentCodeRoutes } from './payment-codes.js';
import { auditRoutes } from './audit.js';

export const registerRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(orgRoutes);
  await app.register(attendantRoutes);
  await app.register(recipientRoutes);
  await app.register(paymentCodeRoutes);
  await app.register(auditRoutes);
};
