import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// 環境變數統一放在 monorepo 根目錄 —— 個資金鑰只有一份，不散落各 app
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../../../.env'), quiet: true });

/** base64 編碼的 32 bytes 金鑰 */
const base64Key32 = z.string().refine(
  (v) => {
    try {
      return Buffer.from(v, 'base64').length === 32;
    } catch {
      return false;
    }
  },
  { message: '必須是 base64 編碼的 32 bytes 金鑰（可用 openssl rand -base64 32 產生）' },
);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  // 個資法要求：身分證、地址、病史等欄位以 AES-256-GCM 加密
  PII_ENCRYPTION_KEY: base64Key32,
  // blind index 用的 HMAC 金鑰，供加密欄位的唯一性檢查與精確查詢
  PII_INDEX_KEY: base64Key32,
  SESSION_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`環境變數設定錯誤：\n${issues}\n\n請參考 .env.example`);
  }
  return parsed.data;
}

export const config = loadConfig();
export const isProduction = config.NODE_ENV === 'production';
