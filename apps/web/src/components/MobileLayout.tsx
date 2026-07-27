import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';

const TABS = [
  { to: '/m', label: '今日', icon: '📋', end: true },
  { to: '/m/schedule', label: '班表', icon: '🗓' },
  { to: '/m/leaves', label: '請假', icon: '📝' },
  { to: '/m/profile', label: '我的', icon: '👤' },
] as const;

/**
 * 離線指示條。
 * 外勤在收訊不良處是常態，必須明確告知目前看到的是快取資料而非最新班表。
 */
function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;
  return (
    <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
      離線模式 — 顯示的是最近同步的班表
    </div>
  );
}

export function MobileLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="safe-top sticky top-0 z-20 bg-brand-700 text-white">
        <OfflineBanner />
        <div className="px-4 py-3">
          <h1 className="text-base font-semibold">長照居家服務</h1>
        </div>
      </div>

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white">
        <div className="grid grid-cols-4">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={'end' in t ? t.end : false}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
                  isActive ? 'font-medium text-brand-700' : 'text-slate-500'
                }`
              }
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
