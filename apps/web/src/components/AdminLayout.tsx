import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../lib/auth.js';

const NAV = [
  { to: '/', label: '儀表板', end: true, permission: null },
  { to: '/schedule', label: '排班', permission: 'schedule:read' },
  { to: '/schedule/patterns', label: '排班樣板', permission: 'schedule:read' },
  { to: '/recipients', label: '個案', permission: 'recipient:read' },
  { to: '/attendants', label: '照服員', permission: 'attendant:read' },
  { to: '/leaves', label: '請假審核', permission: 'leave:read' },
  { to: '/payment-codes', label: '支付基準', permission: 'payment:read' },
  { to: '/settings/policy', label: '機構設定', permission: 'org:write' },
  { to: '/settings/users', label: '使用者', permission: 'user:write' },
  { to: '/audit', label: '稽核紀錄', permission: 'audit:read' },
] as const;

export function AdminLayout() {
  const { user, logout, can } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-6 px-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              照
            </span>
            <span className="text-sm font-semibold text-slate-900">長照居家服務排班系統</span>
          </div>

          <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
            {NAV.filter((n) => !n.permission || can(n.permission)).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={'end' in n ? n.end : false}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-brand-50 font-medium text-brand-800'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{user?.displayName}</p>
              <p className="text-[11px] text-slate-500">
                {user?.roles.map((r) => ROLE_LABELS[r.role] ?? r.role).join('、')}
              </p>
            </div>
            <button onClick={() => void logout()} className="btn-secondary px-2.5 py-1.5 text-xs">
              登出
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: '管理者',
  SUPERVISOR: '督導',
  ADMIN_STAFF: '行政',
  ATTENDANT: '照服員',
  AUDITOR: '稽核',
};
