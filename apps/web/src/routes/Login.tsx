import { useState } from 'react';
import { useAuth } from '../lib/auth.js';

export function LoginPage({ mobile }: { mobile?: boolean }) {
  const { login } = useAuth();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(account.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-brand-700 text-lg font-bold text-white">
            照
          </span>
          <h1 className="text-lg font-semibold text-slate-900">長照居家服務排班系統</h1>
          <p className="mt-1 text-xs text-slate-500">
            {mobile ? '照服員行動端' : '督導與行政管理端'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="account">
              帳號
            </label>
            <input
              id="account"
              className="input"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              密碼
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? '登入中…' : '登入'}
          </button>
        </form>

        <p className="mt-5 border-t border-slate-100 pt-4 text-center text-[11px] leading-relaxed text-slate-400">
          本系統處理長照個案個人資料，
          <br />
          所有個資存取皆留有稽核軌跡。
        </p>
      </div>
    </div>
  );
}
