import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, qs } from '../../lib/api.js';
import {
  Badge,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Pagination,
  Spinner,
} from '../../components/ui.js';
import { COPAY_LABELS, DISTRICT_NAMES, STATUS_LABELS, districtName } from '../../lib/format.js';

interface RecipientRow {
  id: string;
  caseNo: string;
  ltcCaseNo: string | null;
  nameMasked: string | null;
  nationalIdMasked: string | null;
  addressMasked: string | null;
  districtCode: string;
  cmsLevel: number;
  copayCategory: string;
  status: string;
}

export default function Recipients() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const q = params.get('q') ?? '';
  const districtCode = params.get('districtCode') ?? '';
  const cmsLevel = params.get('cmsLevel') ?? '';
  const status = params.get('status') ?? 'ACTIVE';

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const query = useQuery({
    queryKey: ['recipients', { q, districtCode, cmsLevel, status, page }],
    queryFn: async () =>
      api.get<RecipientRow[]>(
        `/recipients${qs({ q, districtCode, cmsLevel, status, page, pageSize: 50 })}`,
      ),
  });

  const meta = query.data?.meta as
    | { total: number; page: number; totalPages: number }
    | undefined;

  return (
    <div>
      <PageHeader
        title="個案"
        subtitle={
          <>
            {meta ? `共 ${meta.total} 位` : ''}
            <span className="ml-2 text-xs text-slate-400">
              個資一律遮罩顯示，查看完整資料會留下稽核紀錄
            </span>
          </>
        }
        actions={
          <Link to="/recipients/new" className="btn-primary">
            + 新增個案
          </Link>
        }
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label className="label">搜尋</label>
          <input
            className="input"
            placeholder="案號、姓名或照管中心個案號"
            value={q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <div>
          <label className="label">行政區</label>
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
          <label className="label">CMS 等級</label>
          <select
            className="input"
            value={cmsLevel}
            onChange={(e) => update('cmsLevel', e.target.value)}
          >
            <option value="">全部</option>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} 級
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">狀態</label>
          <select className="input" value={status} onChange={(e) => update('status', e.target.value)}>
            <option value="">全部</option>
            <option value="ACTIVE">服務中</option>
            <option value="PENDING">待啟案</option>
            <option value="SUSPENDED">暫停服務</option>
            <option value="CLOSED">已結案</option>
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
                <th className="th">案號</th>
                <th className="th">姓名</th>
                <th className="th">身分證</th>
                <th className="th">行政區</th>
                <th className="th">CMS</th>
                <th className="th">身分別</th>
                <th className="th">地址</th>
                <th className="th">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data.data.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">{r.caseNo}</td>
                  <td className="td">
                    <Link
                      to={`/recipients/${r.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {r.nameMasked}
                    </Link>
                  </td>
                  <td className="td font-mono text-xs text-slate-500">{r.nationalIdMasked}</td>
                  <td className="td text-xs">{districtName(r.districtCode)}</td>
                  <td className="td">
                    <Badge tone={r.cmsLevel >= 7 ? 'red' : r.cmsLevel >= 5 ? 'amber' : 'neutral'}>
                      {r.cmsLevel} 級
                    </Badge>
                  </td>
                  <td className="td text-xs">{COPAY_LABELS[r.copayCategory] ?? r.copayCategory}</td>
                  <td className="td max-w-48 truncate text-xs text-slate-500">{r.addressMasked}</td>
                  <td className="td">
                    <Badge tone={r.status === 'ACTIVE' ? 'green' : 'neutral'}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="查無符合條件的個案" hint="試著放寬篩選條件" />
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
