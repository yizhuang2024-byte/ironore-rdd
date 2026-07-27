import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toTaipeiDate } from '@ltc/shared';
import { api } from '../../lib/api.js';
import { Badge, ErrorBanner, Spinner } from '../../components/ui.js';
import { LEAVE_TYPE_LABELS, fmtDateTime } from '../../lib/format.js';

interface Leave {
  id: string;
  leaveType: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  status: string;
}

export default function MobileLeaves() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState('PERSONAL');
  const [date, setDate] = useState(toTaipeiDate(new Date()));
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [reason, setReason] = useState('');

  const leaves = useQuery({
    queryKey: ['m-leaves'],
    queryFn: async () => (await api.get<Leave[]>('/m/leaves')).data,
  });

  const submit = useMutation({
    mutationFn: async () => {
      // 台北時間轉 UTC：DB 一律存 UTC
      const toIso = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        const utc = Date.UTC(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)) - 1,
          Number(date.slice(8, 10)),
          (h ?? 0) - 8,
          m ?? 0,
        );
        return new Date(utc).toISOString();
      };
      return api.post('/leaves', {
        leaveType,
        startAt: allDay ? toIso('00:00') : toIso(startTime),
        endAt: allDay ? toIso('23:59') : toIso(endTime),
        reason: reason.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['m-leaves'] });
      setOpen(false);
      setReason('');
    },
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">請假</h2>
        <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setOpen(!open)}>
          {open ? '取消' : '+ 申請請假'}
        </button>
      </div>

      {open && (
        <div className="card mb-4 space-y-3 p-4">
          <div>
            <label className="label">假別</label>
            <select
              className="input"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
            >
              {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">日期</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            全天
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">開始</label>
                <input
                  type="time"
                  className="input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <label className="label">結束</label>
                <input
                  type="time"
                  className="input"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <label className="label">事由</label>
            <textarea
              className="input"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="選填"
            />
          </div>

          {submit.isError && <ErrorBanner error={submit.error} />}

          <button
            className="btn-primary w-full"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '送出中…' : '送出申請'}
          </button>
          <p className="text-center text-[11px] text-slate-400">
            送出後由督導審核，核准前班表不會變動
          </p>
        </div>
      )}

      {leaves.isLoading ? (
        <Spinner />
      ) : leaves.data && leaves.data.length > 0 ? (
        <div className="space-y-2">
          {leaves.data.map((l) => (
            <div key={l.id} className="card p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">
                  {LEAVE_TYPE_LABELS[l.leaveType] ?? l.leaveType}
                </span>
                <Badge
                  tone={
                    l.status === 'APPROVED' ? 'green' : l.status === 'REJECTED' ? 'red' : 'amber'
                  }
                >
                  {l.status === 'PENDING'
                    ? '待審核'
                    : l.status === 'APPROVED'
                      ? '已核准'
                      : l.status === 'REJECTED'
                        ? '已駁回'
                        : '已取消'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {fmtDateTime(l.startAt)} ~ {fmtDateTime(l.endAt)}
              </p>
              {l.reason && <p className="mt-1 text-xs text-slate-600">{l.reason}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-sm text-slate-500">尚無請假紀錄</p>
        </div>
      )}
    </div>
  );
}
