import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Badge, EmptyState, ErrorBanner, Modal, PageHeader, Spinner } from '../../components/ui.js';
import { useAuth } from '../../lib/auth.js';
import { LEAVE_TYPE_LABELS, fmtDateTime, fmtTime, toTaipeiDate } from '../../lib/format.js';

interface Leave {
  id: string;
  leaveType: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  status: string;
  attendant: { id: string; name: string; employeeNo: string };
}

interface AffectedVisit {
  id: string;
  serviceDate: string;
  startAt: string;
  endAt: string;
  recipient: { id: string; caseNo: string; nameMasked: string; districtCode: string };
}

export default function Leaves() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [status, setStatus] = useState('PENDING');
  const [reviewing, setReviewing] = useState<Leave | null>(null);

  const leaves = useQuery({
    queryKey: ['leaves', status],
    queryFn: async () => (await api.get<Leave[]>(`/leaves?status=${status}`)).data,
  });

  const affected = useQuery({
    queryKey: ['leave-affected', reviewing?.id],
    queryFn: async () =>
      (await api.get<AffectedVisit[]>(`/leaves/${reviewing!.id}/affected-visits`)).data,
    enabled: !!reviewing,
  });

  const act = useMutation({
    mutationFn: async (input: { id: string; action: 'approve' | 'reject' }) =>
      api.post(`/leaves/${input.id}/${input.action}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leaves'] });
      setReviewing(null);
    },
  });

  return (
    <div>
      <PageHeader
        title="請假審核"
        actions={
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">待審核</option>
            <option value="APPROVED">已核准</option>
            <option value="REJECTED">已駁回</option>
            <option value="">全部</option>
          </select>
        }
      />

      {leaves.isError && <ErrorBanner error={leaves.error} />}

      <div className="card overflow-hidden">
        {leaves.isLoading ? (
          <div className="p-8">
            <Spinner />
          </div>
        ) : leaves.data && leaves.data.length > 0 ? (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">照服員</th>
                <th className="th">假別</th>
                <th className="th">起始</th>
                <th className="th">結束</th>
                <th className="th">事由</th>
                <th className="th">狀態</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaves.data.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="td">
                    {l.attendant.name}
                    <span className="ml-1 font-mono text-[11px] text-slate-400">
                      {l.attendant.employeeNo}
                    </span>
                  </td>
                  <td className="td text-xs">{LEAVE_TYPE_LABELS[l.leaveType] ?? l.leaveType}</td>
                  <td className="td text-xs">{fmtDateTime(l.startAt)}</td>
                  <td className="td text-xs">{fmtDateTime(l.endAt)}</td>
                  <td className="td max-w-48 truncate text-xs text-slate-500">{l.reason ?? '—'}</td>
                  <td className="td">
                    <Badge
                      tone={
                        l.status === 'APPROVED' ? 'green' : l.status === 'REJECTED' ? 'red' : 'amber'
                      }
                    >
                      {l.status === 'PENDING' ? '待審' : l.status === 'APPROVED' ? '已核准' : '已駁回'}
                    </Badge>
                  </td>
                  <td className="td">
                    {l.status === 'PENDING' && can('leave:approve') && (
                      <button
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => setReviewing(l)}
                      >
                        審核
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="沒有符合條件的請假申請" />
        )}
      </div>

      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        wide
        title={`審核請假 — ${reviewing?.attendant.name ?? ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setReviewing(null)}>
              取消
            </button>
            <button
              className="btn-secondary"
              disabled={act.isPending}
              onClick={() => act.mutate({ id: reviewing!.id, action: 'reject' })}
            >
              駁回
            </button>
            <button
              className="btn-primary"
              disabled={act.isPending}
              onClick={() => act.mutate({ id: reviewing!.id, action: 'approve' })}
            >
              核准
            </button>
          </>
        }
      >
        {reviewing && (
          <div className="space-y-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">假別</dt>
                <dd>{LEAVE_TYPE_LABELS[reviewing.leaveType]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">期間</dt>
                <dd>
                  {fmtDateTime(reviewing.startAt)} ~ {fmtDateTime(reviewing.endAt)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">事由</dt>
                <dd>{reviewing.reason ?? '—'}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                受影響的已排班次
                {affected.data && (
                  <Badge tone={affected.data.length > 0 ? 'amber' : 'green'}>
                    {affected.data.length}
                  </Badge>
                )}
              </h3>
              {affected.isLoading ? (
                <Spinner />
              ) : affected.data && affected.data.length > 0 ? (
                <>
                  <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    核准後這些班次仍指派給請假中的照服員，需逐一改派或取消。
                  </p>
                  <ul className="max-h-52 space-y-1 overflow-y-auto">
                    {affected.data.map((v) => (
                      <li
                        key={v.id}
                        className="flex justify-between rounded border border-slate-200 px-2.5 py-1.5 text-xs"
                      >
                        <span>
                          {v.serviceDate} {fmtTime(v.startAt)}–{fmtTime(v.endAt)}
                        </span>
                        <span className="text-slate-500">
                          {v.recipient.nameMasked}（{v.recipient.caseNo}）
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-slate-400">無受影響的已排班次</p>
              )}
            </div>

            {act.isError && <ErrorBanner error={act.error} />}
          </div>
        )}
      </Modal>
    </div>
  );
}

void toTaipeiDate;
