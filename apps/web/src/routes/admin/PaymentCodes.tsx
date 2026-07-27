import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Badge, ErrorBanner, PageHeader, Spinner } from '../../components/ui.js';
import { fmtDate, fmtMoney } from '../../lib/format.js';

interface Schedule {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceRef: string | null;
  isActive: boolean;
  _count: { items: number; quotas: number; copayRates: number };
}

interface Item {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  priceRemote: number | null;
  standardMinutes: number | null;
  maxPerDay: number | null;
  maxPerMonth: number | null;
  isAddOn: boolean;
  requiredCerts: string[];
}

interface Quota {
  id: string;
  cmsLevel: number;
  category: string;
  monthlyAmount: number;
}
interface Rate {
  id: string;
  copayCategory: string;
  category: string;
  ratePermille: number;
}

export default function PaymentCodes() {
  const [selected, setSelected] = useState('');

  const schedules = useQuery({
    queryKey: ['payment-schedules'],
    queryFn: async () => (await api.get<Schedule[]>('/payment-schedules')).data,
  });

  const scheduleId = selected || schedules.data?.[0]?.id || '';

  const items = useQuery({
    queryKey: ['payment-items-list', scheduleId],
    queryFn: async () => (await api.get<Item[]>(`/payment-schedules/${scheduleId}/items`)).data,
    enabled: !!scheduleId,
  });
  const quotas = useQuery({
    queryKey: ['payment-quotas', scheduleId],
    queryFn: async () => (await api.get<Quota[]>(`/payment-schedules/${scheduleId}/quotas`)).data,
    enabled: !!scheduleId,
  });
  const rates = useQuery({
    queryKey: ['payment-rates', scheduleId],
    queryFn: async () =>
      (await api.get<Rate[]>(`/payment-schedules/${scheduleId}/copay-rates`)).data,
    enabled: !!scheduleId,
  });

  const current = schedules.data?.find((s) => s.id === scheduleId);

  return (
    <div>
      <PageHeader
        title="長照給付及支付基準"
        subtitle="所有金額查詢皆依服務日期解析當時生效的版本，而非取現行版本"
        actions={
          <select
            className="input w-auto"
            value={scheduleId}
            onChange={(e) => setSelected(e.target.value)}
          >
            {schedules.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        }
      />

      {current?.sourceRef?.includes('範例') && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <strong>⚠️ 目前使用的是範例資料，不可用於正式申報。</strong>
          <p className="mt-1 text-xs leading-relaxed">
            上線前必須由機構申報人員自衛生福利部公告之《長期照顧服務申請及給付辦法》附表四（照顧組合表）
            逐項校對後匯入，並於 <code>docs/04-ltc-payment-codes.md</code> 留下校對簽核紀錄。
            範例資料中僅 BA01、BA02、BA08 三項價格經查證，其餘皆為佔位值。
          </p>
        </div>
      )}

      {schedules.isError && <ErrorBanner error={schedules.error} />}

      {current && (
        <div className="card mb-4 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">生效日</dt>
              <dd>{fmtDate(current.effectiveFrom)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">失效日</dt>
              <dd>{current.effectiveTo ? fmtDate(current.effectiveTo) : '現行版本'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">項目數</dt>
              <dd>{current._count.items}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">來源</dt>
              <dd className="truncate text-xs">{current.sourceRef ?? '—'}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden">
          <h2 className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">
            服務項目
          </h2>
          {items.isLoading ? (
            <div className="p-6">
              <Spinner />
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="th">代碼</th>
                    <th className="th">項目</th>
                    <th className="th">給付價格</th>
                    <th className="th">原民區／離島</th>
                    <th className="th">時長</th>
                    <th className="th">日／月上限</th>
                    <th className="th">需證照</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.data?.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className="td font-mono text-xs">{i.code}</td>
                      <td className="td text-sm">
                        {i.name}
                        {i.isAddOn && (
                          <span className="ml-1.5">
                            <Badge tone="amber">加計</Badge>
                          </span>
                        )}
                      </td>
                      <td className="td text-xs">{fmtMoney(i.price)}</td>
                      <td className="td text-xs text-slate-500">
                        {i.priceRemote ? fmtMoney(i.priceRemote) : '—'}
                      </td>
                      <td className="td text-xs">
                        {i.standardMinutes ? `${i.standardMinutes} 分` : '—'}
                      </td>
                      <td className="td text-xs">
                        {i.maxPerDay ?? '—'} / {i.maxPerMonth ?? '—'}
                      </td>
                      <td className="td text-[11px] text-slate-500">
                        {i.requiredCerts.join('、') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">CMS 月給付額度</h2>
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {quotas.data
                  ?.filter((q) => q.category === 'CARE_PROFESSIONAL')
                  .map((q) => (
                    <tr key={q.id}>
                      <td className="td text-xs">CMS {q.cmsLevel} 級</td>
                      <td className="td text-right text-xs font-medium">
                        {fmtMoney(q.monthlyAmount)} 元
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">部分負擔比率</h2>
            <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
              僅適用核定額度內的金額；超出額度部分一律 100% 自費，低收入戶亦然。
            </p>
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {rates.data
                  ?.filter((r) => r.category === 'CARE_PROFESSIONAL')
                  .map((r) => (
                    <tr key={r.id}>
                      <td className="td text-xs">
                        {r.copayCategory === 'GENERAL'
                          ? '一般戶'
                          : r.copayCategory === 'LOW_MID_INCOME'
                            ? '中低收入戶'
                            : '低收入戶'}
                      </td>
                      <td className="td text-right text-xs font-medium">{r.ratePermille / 10}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
