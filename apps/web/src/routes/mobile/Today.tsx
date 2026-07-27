import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toTaipeiDate } from '@ltc/shared';
import { api, qs } from '../../lib/api.js';
import { ErrorBanner, Spinner } from '../../components/ui.js';
import { districtName, fmtTime } from '../../lib/format.js';

export interface MobileVisit {
  id: string;
  serviceDate: string;
  startAt: string;
  endAt: string;
  plannedMinutes: number;
  status: string;
  recipient: {
    id: string;
    nameMasked: string | null;
    phone: string | null;
    districtCode: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    careNotes: string | null;
  };
  items: { code: string; name: string; quantity: number }[];
}

export function VisitCard({ v }: { v: MobileVisit }) {
  return (
    <Link
      to={`/m/visits/${v.id}`}
      className="card block p-4 transition-colors active:bg-slate-50"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-lg font-semibold text-brand-800">
          {fmtTime(v.startAt)}
        </span>
        <span className="text-xs text-slate-400">
          {fmtTime(v.startAt)}–{fmtTime(v.endAt)}（{v.plannedMinutes} 分）
        </span>
      </div>
      <p className="mt-1 text-base font-medium text-slate-900">{v.recipient.nameMasked}</p>
      <p className="mt-0.5 text-xs text-slate-500">
        {districtName(v.recipient.districtCode)}
        {v.recipient.address ? ` ${v.recipient.address}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {v.items.map((i) => (
          <span
            key={i.code}
            className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-800"
          >
            {i.name}
          </span>
        ))}
      </div>
    </Link>
  );
}

export default function Today() {
  const today = toTaipeiDate(new Date());

  const visits = useQuery({
    queryKey: ['m-visits', today],
    queryFn: async () =>
      await api.get<MobileVisit[]>(`/m/visits${qs({ from: today, to: today })}`),
  });

  const syncedAt = (visits.data?.meta as { syncedAt?: string } | undefined)?.syncedAt;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-900">今日行程</h2>
        <span className="text-xs text-slate-400">{today}</span>
      </div>

      {visits.isError && <ErrorBanner error={visits.error} />}

      {visits.isLoading ? (
        <Spinner label="載入班表…" />
      ) : visits.data && visits.data.data.length > 0 ? (
        <>
          <p className="mb-3 text-xs text-slate-500">共 {visits.data.data.length} 趟服務</p>
          <div className="space-y-3">
            {visits.data.data.map((v) => (
              <VisitCard key={v.id} v={v} />
            ))}
          </div>
        </>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-sm text-slate-500">今日沒有排定的服務</p>
        </div>
      )}

      {syncedAt && (
        <p className="mt-4 text-center text-[11px] text-slate-400">
          資料同步於 {fmtTime(syncedAt)}
        </p>
      )}
    </div>
  );
}
