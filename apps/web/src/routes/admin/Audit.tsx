import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../../lib/api.js';
import { Badge, EmptyState, ErrorBanner, PageHeader, Pagination, Spinner } from '../../components/ui.js';
import { fmtDateTime } from '../../lib/format.js';

interface Log {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  subjectRecipientId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  ipAddress: string | null;
  changes: unknown;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: '新增',
  UPDATE: '修改',
  DELETE: '刪除',
  READ: '讀取',
  EXPORT: '匯出',
  LOGIN: '登入',
  LOGIN_FAILED: '登入失敗',
  LOGOUT: '登出',
  OVERRIDE: '覆寫檢核',
};

const ACTION_TONES: Record<string, 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'brand'> = {
  READ: 'blue',
  EXPORT: 'amber',
  DELETE: 'red',
  LOGIN_FAILED: 'red',
  OVERRIDE: 'amber',
  CREATE: 'green',
};

export default function Audit() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const logs = useQuery({
    queryKey: ['audit', action, entityType, page],
    queryFn: async () => api.get<Log[]>(`/audit/logs${qs({ action, entityType, page, pageSize: 50 })}`),
  });

  const meta = logs.data?.meta as { total: number; page: number; totalPages: number } | undefined;

  return (
    <div>
      <PageHeader
        title="稽核紀錄"
        subtitle="個資法要求的存取軌跡。本表在資料庫層已撤銷更新與刪除權限，無法竄改。"
      />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">動作</label>
          <select className="input" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">全部</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">資料類型</label>
          <select
            className="input"
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
          >
            <option value="">全部</option>
            <option value="CareRecipient">個案</option>
            <option value="CareRecipient.PII">個案個資明文</option>
            <option value="Attendant">照服員</option>
            <option value="ServiceVisit">班次</option>
            <option value="CarePlan">照顧計畫</option>
            <option value="User">使用者</option>
          </select>
        </div>
      </div>

      {logs.isError && <ErrorBanner error={logs.error} />}

      <div className="card overflow-hidden">
        {logs.isLoading ? (
          <div className="p-8"><Spinner /></div>
        ) : logs.data && logs.data.data.length > 0 ? (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">時間</th>
                <th className="th">動作</th>
                <th className="th">資料類型</th>
                <th className="th">角色</th>
                <th className="th">IP</th>
                <th className="th">異動內容</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.data.data.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                  <td className="td">
                    <Badge tone={ACTION_TONES[l.action] ?? 'neutral'}>
                      {ACTION_LABELS[l.action] ?? l.action}
                    </Badge>
                  </td>
                  <td className="td text-xs">{l.entityType}</td>
                  <td className="td text-xs text-slate-500">{l.actorRole ?? '—'}</td>
                  <td className="td font-mono text-[11px] text-slate-400">{l.ipAddress ?? '—'}</td>
                  <td className="td max-w-md truncate font-mono text-[11px] text-slate-500">
                    {l.changes ? JSON.stringify(l.changes) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="沒有符合條件的稽核紀錄" />
        )}
      </div>

      {meta && (
        <div className="mt-3 flex justify-end">
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
