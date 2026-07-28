import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { addTaipeiDays, toTaipeiDate } from '@ltc/shared';
import { api, qs } from '../../lib/api.js';
import { Badge, ErrorBanner, Modal, PageHeader, Spinner } from '../../components/ui.js';
import {
  CERT_LABELS,
  EMPLOYMENT_LABELS,
  STATUS_LABELS,
  WEEKDAY_LABELS,
  districtName,
  fmtDate,
  fmtMinuteOfDay,
} from '../../lib/format.js';

interface Detail {
  id: string;
  employeeNo: string;
  name: string;
  nationalIdMasked: string | null;
  phone: string;
  birthDate: string | null;
  employmentType: string;
  hiredOn: string;
  resignedOn: string | null;
  status: string;
  maxDailyMinutes: number;
  maxWeeklyMinutes: number;
  serviceAreas: { id: string; districtCode: string; priority: number }[];
  availabilities: { id: string; weekday: number; startMinute: number; endMinute: number }[];
  certifications: {
    id: string;
    certType: string;
    certNo: string | null;
    issuedOn: string | null;
    expiresOn: string | null;
  }[];
}

interface Workload {
  daily: { date: string; visitCount: number; loose: number; strict: number; policy: number }[];
  total: { loose: number; strict: number; policy: number };
  visitCount: number;
  note: string;
}

export default function AttendantDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [addCertOpen, setAddCertOpen] = useState(false);
  const [certType, setCertType] = useState('DEMENTIA_CARE');
  const [expiresOn, setExpiresOn] = useState('');

  const today = toTaipeiDate(new Date());
  const monthAgo = addTaipeiDays(today, -30);

  const detail = useQuery({
    queryKey: ['attendant', id],
    queryFn: async () => (await api.get<Detail>(`/attendants/${id}`)).data,
    enabled: !!id,
  });

  const workload = useQuery({
    queryKey: ['attendant-workload', id, monthAgo, today],
    queryFn: async () =>
      (await api.get<Workload>(`/attendants/${id}/workload${qs({ from: monthAgo, to: today })}`)).data,
    enabled: !!id,
  });

  const addCert = useMutation({
    mutationFn: async () =>
      api.post(`/attendants/${id}/certifications`, {
        certType,
        expiresOn: expiresOn || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['attendant', id] });
      setAddCertOpen(false);
      setExpiresOn('');
    },
  });

  if (detail.isLoading) return <Spinner label="載入中…" />;
  if (detail.isError) return <ErrorBanner error={detail.error} />;
  const a = detail.data!;

  const now = toTaipeiDate(new Date());

  return (
    <div>
      <PageHeader
        title={a.name}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs">{a.employeeNo}</span>
            <Badge tone={a.status === 'ACTIVE' ? 'green' : 'neutral'}>
              {STATUS_LABELS[a.status] ?? a.status}
            </Badge>
            <Badge tone={a.employmentType === 'FULL_TIME' ? 'brand' : 'neutral'}>
              {EMPLOYMENT_LABELS[a.employmentType]}
            </Badge>
          </span>
        }
        actions={
          <>
            <Link to="/attendants" className="btn-secondary">
              ← 返回列表
            </Link>
            <Link to={`/attendants/${a.id}/edit`} className="btn-primary">
              編輯
            </Link>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">基本資料</h2>
          <dl className="space-y-2 text-sm">
            <Row label="身分證" value={<span className="font-mono">{a.nationalIdMasked}</span>} />
            <Row label="電話" value={a.phone} />
            <Row label="生日" value={fmtDate(a.birthDate)} />
            <Row label="到職日" value={fmtDate(a.hiredOn)} />
            {a.resignedOn && <Row label="離職日" value={fmtDate(a.resignedOn)} />}
            <Row label="日工時上限" value={`${(a.maxDailyMinutes / 60).toFixed(1)} 小時`} />
            <Row label="週工時上限" value={`${(a.maxWeeklyMinutes / 60).toFixed(0)} 小時`} />
          </dl>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">證照</h2>
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setAddCertOpen(true)}>
              + 新增
            </button>
          </div>
          <ul className="space-y-2">
            {a.certifications.map((c) => {
              const expired = c.expiresOn != null && c.expiresOn.slice(0, 10) < now;
              return (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{CERT_LABELS[c.certType] ?? c.certType}</span>
                  {c.expiresOn ? (
                    <Badge tone={expired ? 'red' : 'neutral'}>
                      {expired ? '已到期 ' : '至 '}
                      {fmtDate(c.expiresOn)}
                    </Badge>
                  ) : (
                    <Badge tone="green">無期限</Badge>
                  )}
                </li>
              );
            })}
            {a.certifications.length === 0 && (
              <li className="py-4 text-center text-xs text-slate-400">尚未登記證照</li>
            )}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">服務區域</h2>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {a.serviceAreas
              .sort((x, y) => x.priority - y.priority)
              .map((s) => (
                <Badge key={s.id} tone={s.priority === 1 ? 'brand' : 'neutral'}>
                  {districtName(s.districtCode)}
                  {s.priority === 1 ? '（主）' : '（支援）'}
                </Badge>
              ))}
            {a.serviceAreas.length === 0 && (
              <span className="text-xs text-slate-400">未設定（視為不限制）</span>
            )}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-800">可服務時段</h2>
          {a.availabilities.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {a.availabilities.map((w) => (
                <li key={w.id} className="flex justify-between text-slate-600">
                  <span>週{WEEKDAY_LABELS[w.weekday]}</span>
                  <span className="font-mono text-xs">
                    {fmtMinuteOfDay(w.startMinute)}–{fmtMinuteOfDay(w.endMinute)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">未設定（視為不限制）</p>
          )}
        </section>
      </div>

      <section className="card mt-5 p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">近 30 日工時</h2>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">{workload.data?.note}</p>
        {workload.isLoading ? (
          <Spinner />
        ) : workload.data ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <Stat label="服務趟次" value={String(workload.data.visitCount)} />
              <Stat label="服務時數 (loose)" value={`${(workload.data.total.loose / 60).toFixed(1)} h`} />
              <Stat label="含空檔 (strict)" value={`${(workload.data.total.strict / 60).toFixed(1)} h`} />
              <Stat
                label="政策採計 (policy)"
                value={`${(workload.data.total.policy / 60).toFixed(1)} h`}
                highlight
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="th">日期</th>
                    <th className="th">趟次</th>
                    <th className="th">服務時數</th>
                    <th className="th">含空檔</th>
                    <th className="th">政策採計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workload.data.daily.map((d) => (
                    <tr key={d.date}>
                      <td className="td font-mono text-xs">{d.date}</td>
                      <td className="td text-xs">{d.visitCount}</td>
                      <td className="td text-xs">{(d.loose / 60).toFixed(1)} h</td>
                      <td className="td text-xs">{(d.strict / 60).toFixed(1)} h</td>
                      <td
                        className={`td text-xs font-medium ${
                          d.policy > a.maxDailyMinutes ? 'text-rose-700' : ''
                        }`}
                      >
                        {(d.policy / 60).toFixed(1)} h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <Modal
        open={addCertOpen}
        onClose={() => setAddCertOpen(false)}
        title="新增證照"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddCertOpen(false)}>
              取消
            </button>
            <button
              className="btn-primary"
              disabled={addCert.isPending}
              onClick={() => addCert.mutate()}
            >
              儲存
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">證照類別</label>
            <select className="input" value={certType} onChange={(e) => setCertType(e.target.value)}>
              {Object.entries(CERT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">到期日（留空表示無期限）</label>
            <input
              type="date"
              className="input"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
          </div>
          {addCert.isError && <ErrorBanner error={addCert.error} />}
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-brand-50' : 'bg-slate-50'}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${highlight ? 'text-brand-800' : 'text-slate-800'}`}>
        {value}
      </p>
    </div>
  );
}
