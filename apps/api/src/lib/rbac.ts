/**
 * 角色權限與資料範圍控制。
 *
 * 設計要點：資料範圍不是靠每個 handler 手寫 if 判斷，而是由 scopeFilter()
 * 產生 Prisma 的 where 片段並統一注入。手寫 if 遲早會漏掉一個端點，
 * 而漏掉的後果是跨單位的個資外洩。
 */

import type { Role } from '@ltc/shared';

/** 系統中所有權限的定義 */
export type Permission =
  | 'attendant:read'
  | 'attendant:write'
  | 'recipient:read'
  | 'recipient:write'
  | 'careplan:read'
  | 'careplan:write'
  | 'schedule:read'
  | 'schedule:write'
  | 'schedule:override' // 覆寫排班 BLOCK 檢核
  | 'leave:read'
  | 'leave:approve'
  | 'payment:read'
  | 'payment:write'
  | 'user:read'
  | 'user:write'
  | 'org:write'
  | 'audit:read'
  | 'pii:reveal' // 解密個資明文
  | 'self:read'; // 照服員讀自己的資料

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ORG_ADMIN: [
    'attendant:read', 'attendant:write',
    'recipient:read', 'recipient:write',
    'careplan:read', 'careplan:write',
    'schedule:read', 'schedule:write', 'schedule:override',
    'leave:read', 'leave:approve',
    'payment:read', 'payment:write',
    'user:read', 'user:write',
    'org:write',
    'audit:read',
    'pii:reveal',
    'self:read',
  ],
  SUPERVISOR: [
    'attendant:read', 'attendant:write',
    'recipient:read', 'recipient:write',
    'careplan:read', 'careplan:write',
    'schedule:read', 'schedule:write', 'schedule:override',
    'leave:read', 'leave:approve',
    'payment:read',
    'user:read',
    'pii:reveal',
    'self:read',
  ],
  ADMIN_STAFF: [
    'attendant:read', 'attendant:write',
    'recipient:read', 'recipient:write',
    'careplan:read', 'careplan:write',
    // 行政可排班但不可覆寫檢核 —— 覆寫是需要承擔責任的決定
    'schedule:read', 'schedule:write',
    'leave:read',
    'payment:read',
    'pii:reveal',
    'self:read',
  ],
  ATTENDANT: ['self:read'],
  // 稽核角色刻意不含 pii:reveal —— 稽核工作不需要看個資明文
  AUDITOR: [
    'attendant:read', 'recipient:read', 'careplan:read',
    'schedule:read', 'leave:read', 'payment:read', 'user:read',
    'audit:read',
    'self:read',
  ],
};

export interface AuthRole {
  role: Role;
  /** null = 全機構範圍 */
  unitId: string | null;
}

export interface AuthUser {
  id: string;
  orgId: string;
  account: string;
  displayName: string;
  roles: AuthRole[];
  /** role = ATTENDANT 時對應的照服員 id */
  attendantId: string | null;
}

export function permissionsOf(user: AuthUser): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of user.roles) {
    for (const p of ROLE_PERMISSIONS[r.role] ?? []) out.add(p);
  }
  return out;
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return permissionsOf(user).has(permission);
}

export function hasRole(user: AuthUser, role: Role): boolean {
  return user.roles.some((r) => r.role === role);
}

/**
 * 該使用者可存取的單位範圍。
 * 回傳 null 表示全機構（不限制單位）。
 */
export function accessibleUnitIds(user: AuthUser): string[] | null {
  // 任一角色具全機構範圍（unitId = null）即不限制
  if (user.roles.some((r) => r.unitId === null && r.role !== 'ATTENDANT')) return null;
  const ids = user.roles.map((r) => r.unitId).filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/**
 * 產生 Prisma where 片段，限制查詢範圍。
 *
 * 一律加上 orgId；督導再加上單位限制；照服員只能看到自己相關的資料。
 */
export function scopeFilter(
  user: AuthUser,
  options: { unitField?: string; attendantField?: string } = {},
): Record<string, unknown> {
  const { unitField = 'primaryUnitId', attendantField = 'attendantId' } = options;
  const where: Record<string, unknown> = { orgId: user.orgId };

  // 照服員只能看到指派給自己的資料
  if (hasRole(user, 'ATTENDANT') && user.roles.every((r) => r.role === 'ATTENDANT')) {
    where[attendantField] = user.attendantId;
    return where;
  }

  const units = accessibleUnitIds(user);
  if (units !== null && units.length > 0) {
    where[unitField] = { in: units };
  }
  return where;
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = '權限不足') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function assertPermission(user: AuthUser, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new ForbiddenError(`缺少權限：${permission}`);
  }
}
