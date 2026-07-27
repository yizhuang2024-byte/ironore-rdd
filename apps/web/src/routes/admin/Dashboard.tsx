import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, qs } from '../../lib/api.js';
import { toTaipeiDate, addTaipeiDays } from '@ltc/shared';
import { Badge, ErrorBanner, PageHeader, Spinner } from '../../components/ui.js';
import { CERT_LABELS, fmtDate } from '../../lib/format.js';

interface Coverage {
  total: number;
  unassigned: number;
  coverageRate: number;
  unassignedByDate: { date: string; count: number }[];
}

interface ExpiringCert {
  id: string;
  certType: string;
  expiresOn: string | null;
  expired: boolean;
  attendant: { id: string; name: string; employeeNo: string };
}

function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'warn' | 'danger';
}) {
  const toneCls =
    tone === 'danger' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default function Dashboard() {
  const today = toTaipeiDate(new Date());
  const weekEnd = addTaipeiDays(today, 6);

  const coverage = useQuery({
    queryKey: ['coverage', today, weekEnd],
    queryFn: async () =>
      (await api.get<Coverage>(`/schedules/coverage${qs({ from: today, to: weekEnd })}`)).data,
  });

  const certs = useQuery({
    queryKey: ['expiring-certs'],
    queryFn: async () =>
      (await api.get<ExpiringCert[]>('/attendants/expiring-certifications?withinDays=60')).data,
  });

  const pendingLeaves = useQuery({
    queryKey: ['leaves', 'PENDING'],
    queryFn: async () => (await api.get<unknown[]>('/leaves?status=PENDING')).data,
  });

  const todayVisits = useQuery({
    queryKey: ['coverage-today', today],
    queryFn: async () =>
      (await api.get<Coverage>(`/schedules/coverage${qs({ from: today, to: today })}`)).data,
  });

  const expired = certs.data?.filter((c) => c.expired) ?? [];
  const expiringSoon = certs.data?.filter((c) => !c.expired) ?? [];

  return (
    <div>
      <PageHeader title="儀表板" subtitle={`${today}（台北時間）`} />

      {coverage.isError && <ErrorBanner error={coverage.error} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="今日班次"
          value={todayVisits.data?.total ?? '—'}
          hint={`未指派 ${todayVisits.data?.unassigned ?? 0} 筆`}
          tone={(todayVisits.data?.unassigned ?? 0) > 0 ? 'warn' : 'neutral'}
        />
        <StatCard
          label="本週未指派"
          value={coverage.data?.unassigned ?? '—'}
          hint={
            coverage.data
              ? `覆蓋率 ${(coverage.data.coverageRate * 100).toFixed(1)}%`
              : undefined
          }
          tone={(coverage.data?.unassigned ?? 0) > 0 ? 'warn' : 'neutral'}
        />
        <StatCard
          label="證照已到期"
          value={expired.length}
          hint="無法排入需該證照的服務"
          tone={expired.length > 0 ? 'danger' : 'neutral'}
        />
        <StatCard
          label="請假待審"
          value={pendingLeaves.data?.length ?? '—'}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">未來 7 天未指派班次</h2>
          {coverage.isLoading ? (
            <Spinner />
          ) : coverage.data && coverage.data.unassignedByDate.length > 0 ? (
            <ul className="space-y-1.5">
              {coverage.data.unassignedByDate.map((d) => (
                <li key={d.date} className="flex items-center justify-between text-sm">
                  <Link
                    to={`/schedule?date=${d.date}&unassignedOnly=1`}
                    className="text-brand-700 hover:underline"
                  >
                    {d.date}
                  </Link>
                  <Badge tone="amber">{d.count} 筆待派</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">本週班次皆已指派</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            證照到期提醒
            <span className="ml-1.5 text-xs font-normal text-slate-400">（60 天內）</span>
          </h2>
          {certs.isLoading ? (
            <Spinner />
          ) : certs.data && certs.data.length > 0 ? (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {[...expired, ...expiringSoon].slice(0, 30).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    to={`/attendants/${c.attendant.id}`}
                    className="truncate text-brand-700 hover:underline"
                  >
                    {c.attendant.name}
                    <span className="ml-1 text-xs text-slate-400">{c.attendant.employeeNo}</span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {CERT_LABELS[c.certType] ?? c.certType}
                    </span>
                    <Badge tone={c.expired ? 'red' : 'amber'}>
                      {c.expired ? '已到期' : fmtDate(c.expiresOn)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">近期無證照到期</p>
          )}
        </section>
      </div>
    </div>
  );
}
