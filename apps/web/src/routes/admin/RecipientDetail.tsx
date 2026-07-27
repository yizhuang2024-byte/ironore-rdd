import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { calcCopay, toTaipeiDate } from '@ltc/shared';
import { api, qs } from '../../lib/api.js';
import { Badge, ErrorBanner, Modal, PageHeader, Spinner } from '../../components/ui.js';
import { useAuth } from '../../lib/auth.js';
import {
  COPAY_LABELS,
  STATUS_LABELS,
  districtName,
  fmtDate,
  fmtMoney,
} from '../../lib/format.js';

interface CarePlanItem {
  id: string;
  code: string;
  approvedPerMonth: number;
  approvedPerWeek: number | null;
  paymentItem?: { name: string; price: number };
}

interface CarePlan {
  id: string;
  planNo: string | null;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  cmsLevel: number;
  copayCategory: string;
  monthlyQuota: number;
  status: string;
  items: CarePlanItem[];
}

interface Detail {
  id: string;
  caseNo: string;
  ltcCaseNo: string | null;
  nameMasked: string | null;
  nationalIdMasked: string | null;
  addressMasked: string | null;
  phone: string | null;
  birthDate: string | null;
  districtCode: string;
  cmsLevel: number;
  copayCategory: string;
  remoteAreaTier: string;
  status: string;
  serviceStartOn: string;
  serviceEndOn: string | null;
  contacts: { id: string; name: string; relation: string; phone: string; isPrimary: boolean }[];
  carePlans: CarePlan[];
}

interface QuotaResult {
  month: string;
  ratePermille: number;
  approvedQuota: number;
  scheduledAmount: number;
  remainingQuota: number;
  overQuotaAmount: number;
  utilizationRate: number;
  visitCount: number;
  copay: {
    withinQuotaAmount: number;
    copayWithinQuota: number;
    govSubsidy: number;
    overQuotaSelfPay: number;
    totalSelfPay: number;
  };
}

interface PaymentItem {
  code: string;
  name: string;
  price: number;
  priceRemote: number | null;
  standardMinutes: number | null;
}

export default function RecipientDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [pii, setPii] = useState<Record<string, string | null> | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const month = toTaipeiDate(new Date()).slice(0, 7);

  const detail = useQuery({
    queryKey: ['recipient', id],
    queryFn: async () => (await api.get<Detail>(`/recipients/${id}`)).data,
    enabled: !!id,
  });

  const quota = useQuery({
    queryKey: ['recipient-quota', id, month],
    queryFn: async () =>
      (await api.get<QuotaResult>(`/recipients/${id}/quota${qs({ month })}`)).data,
    enabled: !!id,
  });

  const reveal = useMutation({
    mutationFn: async () =>
      (await api.post<Record<string, string | null>>(`/recipients/${id}/reveal-pii`, {
        reason: '督導檢視個案資料',
      })).data,
    onSuccess: (d) => setPii(d),
  });

  if (detail.isLoading) return <Spinner label="載入中…" />;
  if (detail.isError) return <ErrorBanner error={detail.error} />;
  const r = detail.data!;
  const activePlan = r.carePlans.find((p) => p.status === 'ACTIVE');

  return (
    <div>
      <PageHeader
        title={pii?.['name'] ?? r.nameMasked ?? '（未命名）'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{r.caseNo}</span>
            {r.ltcCaseNo && (
              <span className="text-xs text-slate-400">照管中心 {r.ltcCaseNo}</span>
            )}
            <Badge tone={r.status === 'ACTIVE' ? 'green' : 'neutral'}>
              {STATUS_LABELS[r.status] ?? r.status}
            </Badge>
            <Badge tone={r.cmsLevel >= 7 ? 'red' : r.cmsLevel >= 5 ? 'amber' : 'neutral'}>
              CMS {r.cmsLevel} 級
            </Badge>
            <Badge>{COPAY_LABELS[r.copayCategory]}</Badge>
          </span>
        }
        actions={
          <Link to="/recipients" className="btn-secondary">
            ← 返回列表
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">基本資料</h2>
            {can('pii:reveal') && !pii && (
              <button
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() => reveal.mutate()}
                disabled={reveal.isPending}
              >
                {reveal.isPending ? '解密中…' : '顯示完整資料'}
              </button>
            )}
          </div>
          {pii && (
            <p className="mb-3 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
              已顯示個資明文，此次存取已記入稽核紀錄
            </p>
          )}
          <dl className="space-y-2 text-sm">
            <Row
              label="身分證"
              value={<span className="font-mono">{pii?.['nationalId'] ?? r.nationalIdMasked}</span>}
            />
            <Row label="電話" value={r.phone ?? '—'} />
            <Row label="生日" value={fmtDate(r.birthDate)} />
            <Row label="行政區" value={districtName(r.districtCode)} />
            <Row label="地址" value={pii?.['address'] ?? r.addressMasked ?? '—'} />
            <Row label="啟案日" value={fmtDate(r.serviceStartOn)} />
            {r.remoteAreaTier !== 'NONE' && (
              <Row label="偏遠地區" value={<Badge tone="amber">採第二價格欄</Badge>} />
            )}
          </dl>

          {pii?.['careNotes'] && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">照顧注意事項</p>
              <p className="text-sm text-slate-700">{pii['careNotes']}</p>
            </div>
          )}

          <h3 className="mt-4 mb-2 text-sm font-semibold text-slate-800">緊急聯絡人</h3>
          <ul className="space-y-1 text-sm">
            {r.contacts.map((c) => (
              <li key={c.id} className="flex justify-between text-slate-700">
                <span>
                  {c.name}
                  <span className="ml-1 text-xs text-slate-400">（{c.relation}）</span>
                </span>
                <span className="font-mono text-xs">{c.phone}</span>
              </li>
            ))}
            {r.contacts.length === 0 && <li className="text-xs text-slate-400">未登記</li>}
          </ul>
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              本月給付額度與部分負擔 <span className="text-xs font-normal text-slate-400">{month}</span>
            </h2>
            {can('careplan:write') && (
              <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setPlanOpen(true)}>
                編輯照顧計畫
              </button>
            )}
          </div>

          {quota.isLoading ? (
            <Spinner />
          ) : quota.data ? (
            <>
              <div className="mb-4">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>
                    已排 {fmtMoney(quota.data.scheduledAmount)} 元 / 核定{' '}
                    {fmtMoney(quota.data.approvedQuota)} 元
                  </span>
                  <span
                    className={
                      quota.data.utilizationRate > 1 ? 'font-medium text-rose-700' : ''
                    }
                  >
                    {(quota.data.utilizationRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full transition-all ${
                      quota.data.utilizationRate > 1
                        ? 'bg-rose-500'
                        : quota.data.utilizationRate > 0.85
                          ? 'bg-amber-500'
                          : 'bg-brand-600'
                    }`}
                    style={{ width: `${Math.min(100, quota.data.utilizationRate * 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="服務趟次" value={String(quota.data.visitCount)} />
                <Stat label="政府補助" value={`${fmtMoney(quota.data.copay.govSubsidy)} 元`} />
                <Stat
                  label={`額度內自付 ${quota.data.ratePermille / 10}%`}
                  value={`${fmtMoney(quota.data.copay.copayWithinQuota)} 元`}
                />
                <Stat
                  label="自付總額"
                  value={`${fmtMoney(quota.data.copay.totalSelfPay)} 元`}
                  highlight
                />
              </div>

              {quota.data.overQuotaAmount > 0 && (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  超出核定額度 {fmtMoney(quota.data.overQuotaAmount)} 元，
                  <strong>超額部分須由個案 100% 自費</strong>
                  （即使是低收入戶亦然）。
                </p>
              )}
            </>
          ) : null}

          <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-800">
            照顧計畫核定項目
            {activePlan && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                v{activePlan.version}｜{fmtDate(activePlan.effectiveFrom)} 起生效
              </span>
            )}
          </h3>
          {activePlan ? (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">代碼</th>
                  <th className="th">項目</th>
                  <th className="th">單價</th>
                  <th className="th">核定／週</th>
                  <th className="th">核定／月</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activePlan.items.map((it) => (
                  <tr key={it.id}>
                    <td className="td font-mono text-xs">{it.code}</td>
                    <td className="td text-sm">{it.paymentItem?.name ?? '—'}</td>
                    <td className="td text-xs">{fmtMoney(it.paymentItem?.price)} 元</td>
                    <td className="td text-xs">{it.approvedPerWeek ?? '—'}</td>
                    <td className="td text-xs">{it.approvedPerMonth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              目前無生效中的照顧計畫 — 此個案無法排班（R22）
            </p>
          )}
        </section>
      </div>

      {planOpen && (
        <CarePlanEditor
          recipient={r}
          onClose={() => setPlanOpen(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['recipient', id] });
            void qc.invalidateQueries({ queryKey: ['recipient-quota', id] });
            setPlanOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** 照顧計畫編輯 —— 右側即時試算月金額與部分負擔 */
function CarePlanEditor({
  recipient,
  onClose,
  onSaved,
}: {
  recipient: Detail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = toTaipeiDate(new Date());
  const active = recipient.carePlans.find((p) => p.status === 'ACTIVE');
  const [rows, setRows] = useState<{ code: string; perWeek: number; perMonth: number }[]>(
    active?.items.map((i) => ({
      code: i.code,
      perWeek: i.approvedPerWeek ?? 0,
      perMonth: i.approvedPerMonth,
    })) ?? [],
  );
  const [monthlyQuota, setMonthlyQuota] = useState(active?.monthlyQuota ?? 0);

  const items = useQuery({
    queryKey: ['payment-items', today],
    queryFn: async () =>
      (await api.get<{ items: PaymentItem[] }>(`/payment-items/resolve${qs({ date: today })}`)).data
        .items,
  });

  const priceOf = useMemo(() => {
    const map = new Map(items.data?.map((i) => [i.code, i]) ?? []);
    return (code: string) => {
      const item = map.get(code);
      if (!item) return 0;
      return recipient.remoteAreaTier === 'NONE' ? item.price : (item.priceRemote ?? item.price);
    };
  }, [items.data, recipient.remoteAreaTier]);

  // 即時試算 —— 使用與後端相同的 shared 計算函式
  const estimate = useMemo(() => {
    const scheduledAmount = rows.reduce((s, r) => s + priceOf(r.code) * r.perMonth, 0);
    const ratePermille =
      recipient.copayCategory === 'LOW_INCOME'
        ? 0
        : recipient.copayCategory === 'LOW_MID_INCOME'
          ? 50
          : 160;
    return {
      scheduledAmount,
      ...calcCopay({ scheduledAmount, approvedQuota: monthlyQuota, ratePermille }),
    };
  }, [rows, monthlyQuota, priceOf, recipient.copayCategory]);

  const save = useMutation({
    mutationFn: async () =>
      api.post(`/recipients/${recipient.id}/care-plans`, {
        effectiveFrom: today,
        cmsLevel: recipient.cmsLevel,
        copayCategory: recipient.copayCategory,
        monthlyQuota,
        items: rows.map((r) => ({
          code: r.code,
          approvedPerMonth: r.perMonth,
          approvedPerWeek: r.perWeek || undefined,
        })),
      }),
    onSuccess: onSaved,
  });

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="編輯照顧計畫"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn-primary"
            disabled={save.isPending || rows.length === 0}
            onClick={() => save.mutate()}
          >
            {save.isPending ? '儲存中…' : '建立新版本'}
          </button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div>
          <label className="label">核定月給付額度（元）</label>
          <input
            type="number"
            className="input mb-4"
            value={monthlyQuota}
            onChange={(e) => setMonthlyQuota(Number(e.target.value))}
          />

          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0">核定服務項目</label>
            <select
              className="input w-auto py-1 text-xs"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                if (rows.some((r) => r.code === e.target.value)) return;
                setRows([...rows, { code: e.target.value, perWeek: 1, perMonth: 4 }]);
              }}
            >
              <option value="">+ 新增項目…</option>
              {items.data
                ?.filter((i) => !rows.some((r) => r.code === i.code))
                .map((i) => (
                  <option key={i.code} value={i.code}>
                    {i.code} {i.name}（{i.price} 元）
                  </option>
                ))}
            </select>
          </div>

          <table className="w-full">
            <thead>
              <tr>
                <th className="th">代碼</th>
                <th className="th">單價</th>
                <th className="th">每週</th>
                <th className="th">每月</th>
                <th className="th">月金額</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => (
                <tr key={row.code}>
                  <td className="td font-mono text-xs">{row.code}</td>
                  <td className="td text-xs">{fmtMoney(priceOf(row.code))}</td>
                  <td className="td">
                    <input
                      type="number"
                      min={0}
                      className="input w-16 px-1.5 py-1 text-xs"
                      value={row.perWeek}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, perWeek: Number(e.target.value) };
                        setRows(next);
                      }}
                    />
                  </td>
                  <td className="td">
                    <input
                      type="number"
                      min={0}
                      className="input w-16 px-1.5 py-1 text-xs"
                      value={row.perMonth}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, perMonth: Number(e.target.value) };
                        setRows(next);
                      }}
                    />
                  </td>
                  <td className="td text-xs font-medium">
                    {fmtMoney(priceOf(row.code) * row.perMonth)}
                  </td>
                  <td className="td">
                    <button
                      className="text-xs text-rose-600 hover:underline"
                      onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                    >
                      移除
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-slate-400">
                    請至少新增一個核定項目
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="rounded-lg bg-slate-50 p-4">
          <h3 className="mb-3 text-xs font-semibold text-slate-700">月金額試算</h3>
          <dl className="space-y-2 text-sm">
            <Row label="月預估金額" value={`${fmtMoney(estimate.scheduledAmount)} 元`} />
            <Row label="核定額度" value={`${fmtMoney(monthlyQuota)} 元`} />
            <Row
              label="額度使用率"
              value={
                <span
                  className={
                    monthlyQuota > 0 && estimate.scheduledAmount > monthlyQuota
                      ? 'font-medium text-rose-700'
                      : ''
                  }
                >
                  {monthlyQuota > 0
                    ? `${((estimate.scheduledAmount / monthlyQuota) * 100).toFixed(1)}%`
                    : '—'}
                </span>
              }
            />
            <hr className="border-slate-200" />
            <Row label="政府補助" value={`${fmtMoney(estimate.govSubsidy)} 元`} />
            <Row label="額度內自付" value={`${fmtMoney(estimate.copayWithinQuota)} 元`} />
            {estimate.overQuotaSelfPay > 0 && (
              <Row
                label="超額自費"
                value={
                  <span className="font-medium text-rose-700">
                    {fmtMoney(estimate.overQuotaSelfPay)} 元
                  </span>
                }
              />
            )}
            <Row
              label="自付總額"
              value={<strong>{fmtMoney(estimate.totalSelfPay)} 元</strong>}
            />
          </dl>

          {estimate.overQuotaSelfPay > 0 && (
            <p className="mt-3 rounded-md bg-rose-50 px-2.5 py-2 text-[11px] leading-relaxed text-rose-800">
              超出核定額度 {fmtMoney(estimate.overQuotaSelfPay)} 元，
              超額部分須由個案 100% 自費。
            </p>
          )}
        </aside>
      </div>

      {save.isError && (
        <div className="mt-4">
          <ErrorBanner error={save.error} />
        </div>
      )}
    </Modal>
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
      <p className={`mt-0.5 text-base font-semibold ${highlight ? 'text-brand-800' : 'text-slate-800'}`}>
        {value}
      </p>
    </div>
  );
}
