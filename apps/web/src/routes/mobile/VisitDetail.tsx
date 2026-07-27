import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api } from '../../lib/api.js';
import { ErrorBanner, Spinner } from '../../components/ui.js';
import { districtName, fmtTime } from '../../lib/format.js';

interface Detail {
  id: string;
  serviceDate: string;
  startAt: string;
  endAt: string;
  plannedMinutes: number;
  status: string;
  recipient: {
    nameMasked: string | null;
    phone: string | null;
    districtCode: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    careNotes: string | null;
    emergencyContact: { name: string; relation: string; phone: string } | null;
  };
  items: { code: string; name: string; description: string | null; quantity: number }[];
}

export default function VisitDetail() {
  const { id } = useParams<{ id: string }>();

  const visit = useQuery({
    queryKey: ['m-visit', id],
    queryFn: async () => (await api.get<Detail>(`/m/visits/${id}`)).data,
    enabled: !!id,
  });

  if (visit.isLoading) return <Spinner label="載入中…" />;
  if (visit.isError) return <ErrorBanner error={visit.error} />;
  const v = visit.data!;

  // 導航連結：優先用座標，否則用地址
  const navUrl = v.recipient.lat != null && v.recipient.lng != null
    ? `geo:${v.recipient.lat},${v.recipient.lng}?q=${v.recipient.lat},${v.recipient.lng}`
    : v.recipient.address
      ? `geo:0,0?q=${encodeURIComponent(v.recipient.address)}`
      : null;

  return (
    <div className="space-y-4">
      <Link to="/m" className="inline-block text-sm text-brand-700">
        ← 返回
      </Link>

      <div className="card p-4">
        <p className="text-xs text-slate-400">{v.serviceDate}</p>
        <p className="mt-0.5 font-mono text-2xl font-semibold text-brand-800">
          {fmtTime(v.startAt)}–{fmtTime(v.endAt)}
        </p>
        <p className="mt-1 text-xs text-slate-500">預計 {v.plannedMinutes} 分鐘</p>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">服務對象</h2>
        <p className="text-lg font-medium text-slate-900">{v.recipient.nameMasked}</p>
        <p className="mt-1 text-sm text-slate-600">
          {districtName(v.recipient.districtCode)}
          {v.recipient.address ? ` ${v.recipient.address}` : ''}
        </p>

        <div className="mt-3 flex gap-2">
          {v.recipient.phone && (
            <a href={`tel:${v.recipient.phone}`} className="btn-secondary flex-1">
              📞 撥打 {v.recipient.phone}
            </a>
          )}
          {navUrl && (
            <a href={navUrl} className="btn-secondary flex-1">
              🧭 導航
            </a>
          )}
        </div>
      </div>

      {v.recipient.careNotes && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-1 text-sm font-semibold text-amber-900">照顧注意事項</h2>
          <p className="text-sm leading-relaxed text-amber-900">{v.recipient.careNotes}</p>
        </div>
      )}

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">服務項目</h2>
        <ul className="space-y-2">
          {v.items.map((i) => (
            <li key={i.code} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
              <p className="text-sm font-medium text-slate-800">
                {i.name}
                {i.quantity > 1 && <span className="ml-1 text-xs text-slate-500">×{i.quantity}</span>}
              </p>
              {i.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{i.description}</p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {v.recipient.emergencyContact && (
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">緊急聯絡人</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700">
              {v.recipient.emergencyContact.name}
              <span className="ml-1 text-xs text-slate-400">
                （{v.recipient.emergencyContact.relation}）
              </span>
            </span>
            <a
              href={`tel:${v.recipient.emergencyContact.phone}`}
              className="text-sm text-brand-700"
            >
              {v.recipient.emergencyContact.phone}
            </a>
          </div>
        </div>
      )}

      <p className="pb-4 text-center text-[11px] leading-relaxed text-slate-400">
        服務打卡與紀錄回報功能將於第二階段提供
      </p>
    </div>
  );
}
