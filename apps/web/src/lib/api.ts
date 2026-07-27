/**
 * API client。
 *
 * 使用 cookie 認證（credentials: 'include'），不在 localStorage 存 token ——
 * localStorage 可被 XSS 讀取，而 httpOnly cookie 不行。
 */

const BASE = import.meta.env['VITE_API_BASE_URL'] ?? '/api/v1';

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 401 時通知 app 導向登入頁 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn;
}

async function request<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...init } = options;
  const headers = new Headers(init.headers);
  // CSRF 防護：SameSite=Lax 之外再要求自訂標頭，跨站表單送不出這個 header
  headers.set('X-Requested-With', 'ltc');
  if (json !== undefined) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, 'UNAUTHORIZED', '尚未登入或工作階段已失效');
  }

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = (body?.error ?? {}) as ApiErrorShape;
    throw new ApiError(
      res.status,
      err.code ?? 'UNKNOWN',
      err.message ?? `請求失敗（${res.status}）`,
      err.details,
    );
  }

  return body as T;
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export const api = {
  get: <T>(path: string) => request<Envelope<T>>(path),
  post: <T>(path: string, json?: unknown) => request<Envelope<T>>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<Envelope<T>>(path, { method: 'PATCH', json }),
  put: <T>(path: string, json?: unknown) => request<Envelope<T>>(path, { method: 'PUT', json }),
  delete: <T>(path: string) => request<Envelope<T>>(path, { method: 'DELETE' }),
};

/** 建立 query string，略過 undefined 與空字串 */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
