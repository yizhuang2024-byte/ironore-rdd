import { useQuery } from '@tanstack/react-query';
import { toTaipeiDate } from '@ltc/shared';
import { api } from '../../lib/api.js';
import { Badge, ErrorBanner, Spinner } from '../../components/ui.js';
import { useAuth } from '../../lib/auth.js';
import {
  CERT_LABELS,
  EMPLOYMENT_LABELS,
  WEEKDAY_LABELS,
  districtName,
  fmtDate,
  fmtMinuteOfDay,
} from '../../lib/format.js';

interface Profile {
  employeeNo: string;
  name: string;
  phone: string;
  employmentType: string;
  hiredOn: string;
  serviceAreas: string[];
  availabilities: { id: string; weekday: number; startMinute: number; endMinute: number }[];
  certifications: {
    certType: string;
    certNo: string | null;
    expiresOn: string | null;
    expired: boolean;
    expiringSoon: boolean;
  }[];
}

interface Workload {
  month: string;
  visitCount: number;
  workDays: number;
  loose: number;
  strict: number;
  policy: number;
}

export default function MobileProfile() {
  const { logout } = useAuth();
  const month = toTaipeiDate(new Date()).slice(0, 7);

  const profile = useQuery({
    queryKey: ['m-profile'],
    queryFn: async () => (await api.get<Profile>('/m/profile')).data,
  });

  const workload = useQuery({
    queryKey: ['m-workload', month],
    queryFn: async () => (await api.get<Workload>(`/m/workload?month=${month}`)).data,
  });

  if (profile.isLoading) return <Spinner label="載入中…" />;
  if (profile.isError) return <ErrorBanner error={profile.error} />;
  const p = profile.data!;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-lg font-semibold text-slate-900">{p.name}</p>
        <p className="mt-0.5 font-mono text-xs text-slate-400">{p.employeeNo}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="brand">{EMPLOYMENT_LABELS[p.employmentType] ?? p.employmentType}</Badge>
          <Badge>到職 {fmtDate(p.hiredOn)}</Badge>
        </div>
      </div>

      {workload.data && (
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            本月工時 <span className="text-xs font-normal text-slate-400">{month}</span>
          </h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-500">服務趟次</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-800">
                {workload.data.visitCount}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <p className="text-[11px] text-slate-500">上班天數</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-800">{workload.data.workDays}</p>
            </div>
            <div className="rounded-lg bg-brand-50 p-2.5">
              <p className="text-[11px] text-slate-500">服務時數</p>
              <p className="mt-0.5 text-lg font-semibold text-brand-800">
                {(workload.data.loose / 60).toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">我的證照</h2>
        <ul className="space-y-2">
          {p.certifications.map((c, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{CERT_LABELS[c.certType] ?? c.certType}</span>
              {c.expiresOn ? (
                <Badge tone={c.expired ? 'red' : c.expiringSoon ? 'amber' : 'neutral'}>
                  {c.expired ? '已到期' : c.expiringSoon ? `${fmtDate(c.expiresOn)} 到期` : fmtDate(c.expiresOn)}
                </Badge>
              ) : (
                <Badge tone="green">無期限</Badge>
              )}
            </li>
          ))}
        </ul>
        {p.certifications.some((c) => c.expired || c.expiringSoon) && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            有證照即將到期或已到期，請儘速向督導辦理換發。已到期的證照會讓您無法被排入需要該證照的服務。
          </p>
        )}
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">可服務區域</h2>
        <div className="flex flex-wrap gap-1.5">
          {p.serviceAreas.map((a) => (
            <Badge key={a}>{districtName(a)}</Badge>
          ))}
          {p.serviceAreas.length === 0 && <span className="text-xs text-slate-400">未設定</span>}
        </div>

        <h2 className="mt-4 mb-2 text-sm font-semibold text-slate-800">可服務時段</h2>
        {p.availabilities.length > 0 ? (
          <ul className="space-y-1 text-sm text-slate-600">
            {p.availabilities.map((w) => (
              <li key={w.id} className="flex justify-between">
                <span>週{WEEKDAY_LABELS[w.weekday]}</span>
                <span className="font-mono text-xs">
                  {fmtMinuteOfDay(w.startMinute)}–{fmtMinuteOfDay(w.endMinute)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">未設定</p>
        )}
      </div>

      <button onClick={() => void logout()} className="btn-secondary w-full">
        登出
      </button>
      <p className="pb-4 text-center text-[11px] leading-relaxed text-slate-400">
        登出會一併清除此裝置上的班表快取
      </p>
    </div>
  );
}
