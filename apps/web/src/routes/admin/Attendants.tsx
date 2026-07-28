import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, qs } from '../../lib/api.js';
import { Badge, ErrorBanner, PageHeader, Pagination, Spinner, EmptyState } from '../../components/ui.js';
import {
  CERT_LABELS,
  DISTRICT_NAMES,
  EMPLOYMENT_LABELS,
  STATUS_LABELS,
  districtName,
} from '../../lib/format.js';

interface AttendantRow {
  id: string;
  employeeNo: string;
  name: string;
  nationalIdMasked: string | null;
  phone: string;
  employmentType: string;
  status: string;
  serviceAreas: { districtCode: string; priority: number }[];
  certificationCount: number;
}

export default function Attendants() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);

  // 篩選狀態寫入 URL，可分享與回上頁
  const q = params.get('q') ?? '';
  const districtCode = params.get('districtCode') ?? '';
  const employmentType = params.get('employmentType') ?? '';
  const certType = params.get('certType') ?? '';
  const status = params.get('status') ?? 'ACTIVE';

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const query = useQuery({
    queryKey: ['attendants', { q, districtCode, employmentType, certType, status, page }],
    queryFn: async () =>
      api.get<AttendantRow[]>(
        `/attendants${qs({ q, districtCode, employmentType, certType, status, page, pageSize: 50 })}`,
      ),
  });

  const meta = query.data?.meta as
    | { total: number; page: number; totalPages: number }
    | undefined;

  return (
    <div>
      <PageHeader
        title="照服員"
        subtitle={meta ? `共 ${meta.total} 位` : undefined}
        actions={
          <Link to="/attendants/new" className="btn-primary">
            + 新增照服員
          </Link>
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label className="label">搜尋</label>
          <input
            className="input"
            placeholder="姓名、員編或電話"
            value={q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <div>
          <label className="label">服務區域</label>
          <select
            className="input"
            value={districtCode}
            onChange={(e) => update('districtCode', e.target.value)}
          >
            <option value="">全部</option>
            {Object.entries(DISTRICT_NAMES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">聘僱型態</label>
          <select
            className="input"
            value={employmentType}
            onChange={(e) => update('employmentType', e.target.value)}
          >
            <option value="">全部</option>
            {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">持有證照</label>
          <select
            className="input"
            value={certType}
            onChange={(e) => update('certType', e.target.value)}
          >
            <option value="">不限</option>
            {Object.entries(CERT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">狀態</label>
          <select className="input" value={status} onChange={(e) => update('status', e.target.value)}>
            <option value="">全部</option>
            <option value="ACTIVE">在職</option>
            <option value="ON_LEAVE">請假中</option>
            <option value="RESIGNED">已離職</option>
          </select>
        </div>
      </div>

      {query.isError && <ErrorBanner error={query.error} />}

      <div className="card overflow-hidden">
        {query.isLoading ? (
          <div className="p-8">
            <Spinner label="載入中…" />
          </div>
        ) : query.data && query.data.data.length > 0 ? (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">員編</th>
                <th className="th">姓名</th>
                <th className="th">身分證</th>
                <th className="th">電話</th>
                <th className="th">聘僱</th>
                <th className="th">服務區域</th>
                <th className="th">證照</th>
                <th className="th">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data.data.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">{a.employeeNo}</td>
                  <td className="td">
                    <Link to={`/attendants/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="td font-mono text-xs text-slate-500">{a.nationalIdMasked}</td>
                  <td className="td text-xs">{a.phone}</td>
                  <td className="td">
                    <Badge tone={a.employmentType === 'FULL_TIME' ? 'brand' : 'neutral'}>
                      {EMPLOYMENT_LABELS[a.employmentType] ?? a.employmentType}
                    </Badge>
                  </td>
                  <td className="td text-xs">
                    {a.serviceAreas
                      .sort((x, y) => x.priority - y.priority)
                      .map((s) => districtName(s.districtCode))
                      .join('、')}
                  </td>
                  <td className="td text-xs text-slate-500">{a.certificationCount} 張</td>
                  <td className="td">
                    <Badge tone={a.status === 'ACTIVE' ? 'green' : 'neutral'}>
                      {STATUS_LABELS[a.status] ?? a.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="查無符合條件的照服員" hint="試著放寬篩選條件" />
        )}
      </div>

      {meta && (
        <div className="mt-3 flex justify-end">
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
