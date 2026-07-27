/**
 * 個資加解密。
 *
 * 採**應用層加密**而非 pgcrypto：金鑰不進 DB、不進 SQL log，
 * 即使 DBA 取得資料庫 dump 也無法解密。
 *
 * 代價是無法用 SQL 做模糊搜尋 —— 由 blind index 解決精確查詢與唯一性檢查即可
 * （實務上沒有人需要模糊搜尋身分證字號）。
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 建議 96-bit IV
const TAG_LENGTH = 16;

const encryptionKey = Buffer.from(config.PII_ENCRYPTION_KEY, 'base64');
const indexKey = Buffer.from(config.PII_INDEX_KEY, 'base64');

/** 目前使用的金鑰版本。輪替時遞增，並在 DB 的 *KeyVersion 欄位記錄。 */
export const CURRENT_KEY_VERSION = 1;

/**
 * 加密。輸出格式：`[iv(12) | authTag(16) | ciphertext]`
 * 單一位元組陣列便於存入 Prisma 的 Bytes 欄位。
 *
 * 回傳 `Uint8Array<ArrayBuffer>` 而非 Node 的 Buffer —— Prisma 的 Bytes 欄位
 * 要求前者，而 Buffer 的型別參數是 ArrayBufferLike（可能是 SharedArrayBuffer）。
 */
export function encryptPii(
  plaintext: string | null | undefined,
): Uint8Array<ArrayBuffer> | null {
  if (plaintext == null || plaintext === '') return null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const combined = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  const out = new Uint8Array(new ArrayBuffer(combined.length));
  out.set(combined);
  return out;
}

/**
 * 解密。
 * 認證失敗會拋錯 —— 這代表資料被竄改或金鑰錯誤，不可靜默回傳空值。
 */
export function decryptPii(payload: Buffer | Uint8Array | null | undefined): string | null {
  if (payload == null) return null;
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('加密資料長度不足，可能已損毀');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Blind index —— 對正規化後的值取 HMAC，供唯一性檢查與精確查詢。
 *
 * 用 HMAC 而非單純雜湊：身分證字號的空間很小（約 2 億組），
 * 純 SHA-256 可被暴力枚舉還原，加了金鑰才有意義。
 */
export function blindIndex(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const normalized = value.trim().toUpperCase();
  return createHmac('sha256', indexKey).update(normalized).digest('hex');
}

/** 身分證字號遮罩顯示：A123456789 → A12****789 */
export function maskNationalId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 6) return '*'.repeat(id.length);
  return `${id.slice(0, 3)}${'*'.repeat(id.length - 6)}${id.slice(-3)}`;
}

/** 姓名遮罩：王小明 → 王○明；王明 → 王○ */
export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  const chars = [...name];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}○`;
  return `${chars[0]}${'○'.repeat(chars.length - 2)}${chars.at(-1)}`;
}

/** 地址遮罩：只保留到路名層級 */
export function maskAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const match = address.match(/^(.*?[路街道段])/u);
  return match ? `${match[1]}…` : `${address.slice(0, 6)}…`;
}

/** Session token 的雜湊。DB 只存雜湊，明文只在 cookie 中。 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 產生 session token（32 bytes 隨機值，base64url 編碼） */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 定時比較，避免時間差攻擊 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
