/**
 * 排班樣板管理與產生班表精靈。
 *
 * 樣板只是產生器 —— 改樣板不會動到已產生的班次，需再跑一次「產生班表」。
 * generate 是冪等的，只會補上缺少的日期，因此可以安心重複執行。
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addTaipeiDays, toTaipeiDate } from '@ltc/shared';
import { api, qs } from '../../lib/api.js';
import {
  Badge,
  EmptyState,
  ErrorBanner,
  Modal,
  PageHeader,
  Spinner,
} from '../../components/ui.js';
import { Field } from '../../components/form.js';
import { WEEKDAY_LABELS, districtName, fmtMinuteOfDay } from '../../lib/format.js';

interface Pattern {
  id: string;
  recipientId: string;
  recipient: { id: string; caseNo: string; nameMasked: string; districtCode: string };
  attendantId: string | null;
  attendant: { id: string; name: string; employeeNo: string } | null;
  weekday: number;
  startMinute: number;
  durationMinutes: number;
  itemCodes: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

interface GenerateResult {
  created?: number;
  wouldCreate?: number;
  patternCount: number;
  sample?: { recipientId: string; date: string; startMinute: number; itemCodes: string[] }[];
}

export default function Patterns() {
  const qc = useQueryClient();
  const today = toTaipeiDate(new Date());
  const [genOpen, setGenOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addTaipeiDays(today, 30));
  const [preview, setPreview] = useState<GenerateResult | null>(null);

  const patterns = useQuery({
    queryKey: ['patterns'],
    queryFn: async () => (await api.get<Pattern[]>('/schedules/patterns')).data,
  });

  const dryRun = useMutation({
    mutationFn: async () =>
      (await api.post<GenerateResult>('/schedules/generate', { from, to, dryRun: true })).data,
    onSuccess: setPreview,
  });

  const generate = useMutation({
    mutationFn: async () =>
      (await api.post<GenerateResult>('/schedules/generate', { from, to })).data,
    onSuccess: (r) => {
      setPreview(r);
      void qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => api.delete(`/schedules/patterns/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['patterns'] }),
  });

  const byWeekday = new Map<number, Pattern[]>();
  for (const p of patterns.data ?? []) {
    byWeekday.set(p.weekday, [...(byWeekday.get(p.weekday) ?? []), p]);
  }

  return (
    <div>
      <PageHeader
        title="排班樣板"
        subtitle={
          <>
            樣板是班次的產生器，不是班表本身 — 修改樣板不會影響已產生的班次
            {patterns.data && <span className="ml-2">共 {patterns.data.length} 個樣板</span>}
          </>
        }
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setPreview(null);
              setGenOpen(true);
            }}
          >
            產生班表
          </button>
        }
      />

      {patterns.isError && <ErrorBanner error={patterns.error} />}

      {patterns.isLoading ? (
        <Spinner label="載入樣板…" />
      ) : (patterns.data?.length ?? 0) === 0 ? (
        <EmptyState
          message="尚未建立任何排班樣板"
          hint="請至個案詳情頁建立週期性服務時段"
        />
      ) : (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
            const list = (byWeekday.get(wd) ?? []).sort((a, b) => a.startMinute - b.startMinute);
            if (list.length === 0) return null;
            return (
              <section key={wd} className="card overflow-hidden">
                <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                  週{WEEKDAY_LABELS[wd]}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {list.length} 個樣板
                  </span>
                </h2>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">時間</th>
                      <th className="th">個案</th>
                      <th className="th">行政區</th>
                      <th className="th">固定照服員</th>
                      <th className="th">服務項目</th>
                      <th className="th">生效期間</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="td font-mono text-xs">
                          {fmtMinuteOfDay(p.startMinute)}–
                          {fmtMinuteOfDay(p.startMinute + p.durationMinutes)}
                        </td>
                        <td className="td text-sm">
                          {p.recipient.nameMasked}
                          <span className="ml-1 font-mono text-[11px] text-slate-400">
                            {p.recipient.caseNo}
                          </span>
                        </td>
                        <td className="td text-xs">{districtName(p.recipient.districtCode)}</td>
                        <td className="td text-xs">
                          {p.attendant ? (
                            p.attendant.name
                          ) : (
                            <Badge tone="amber">未指定</Badge>
                          )}
                        </td>
                        <td className="td font-mono text-[11px]">{p.itemCodes.join('、')}</td>
                        <td className="td text-[11px] text-slate-500">
                          {p.effectiveFrom.slice(0, 10)} ~ {p.effectiveTo?.slice(0, 10) ?? '無期限'}
                        </td>
                        <td className="td">
                          <button
                            className="text-xs text-rose-600 hover:underline"
                            onClick={() => {
                              if (confirm('停用此樣板？已產生的班次會保留。')) {
                                deactivate.mutate(p.id);
                              }
                            }}
                          >
                            停用
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        wide
        title="依樣板產生班表"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setGenOpen(false)}>
              關閉
            </button>
            <button
              className="btn-secondary"
              disabled={dryRun.isPending}
              onClick={() => dryRun.mutate()}
            >
              {dryRun.isPending ? '試算中…' : '試算（不寫入）'}
            </button>
            <button
              className="btn-primary"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? '產生中…' : '確認產生'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            此操作為<strong>冪等</strong> — 同一期間重複執行不會產生重複班次，
            只會補上尚未產生的日期。可以安心先試算再確認。
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="起始日">
              <input
                type="date"
                className="input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="結束日" hint="一次最多 92 天">
              <input
                type="date"
                className="input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>

          {(dryRun.isError || generate.isError) && (
            <ErrorBanner error={dryRun.error ?? generate.error} />
          )}

          {preview && (
            <div className="rounded-lg border border-slate-200 p-3">
              {preview.wouldCreate !== undefined ? (
                <>
                  <p className="text-sm">
                    試算結果：將產生 <strong>{preview.wouldCreate}</strong> 筆班次
                    <span className="ml-1 text-xs text-slate-500">
                      （來自 {preview.patternCount} 個樣板）
                    </span>
                  </p>
                  {preview.wouldCreate === 0 && (
                    <p className="mt-1 text-xs text-emerald-700">
                      此期間的班次皆已產生，無需重複執行
                    </p>
                  )}
                  {preview.sample && preview.sample.length > 0 && (
                    <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-slate-500">
                      {preview.sample.map((s, i) => (
                        <li key={i} className="font-mono">
                          {s.date} {fmtMinuteOfDay(s.startMinute)} {s.itemCodes.join(',')}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-emerald-800">
                  已產生 <strong>{preview.created}</strong> 筆班次
                  <span className="ml-1 text-xs text-slate-500">
                    （來自 {preview.patternCount} 個樣板）
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
      <span className="hidden">{qs({})}</span>
    </div>
  );
}
