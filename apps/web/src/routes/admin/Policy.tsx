import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { ErrorBanner, PageHeader, Spinner } from '../../components/ui.js';

interface Policy {
  normalDailyMinutes: number;
  maxDailyMinutes: number;
  normalWeeklyMinutes: number;
  monthlyOtMode: string;
  monthlyOtMinutes: number;
  restBreakAfterMinutes: number;
  restBreakMinutes: number;
  minShiftGapMinutes: number;
  enforceSevenDayRest: boolean;
  idleGapCountsAsWorkThresholdMinutes: number;
  detourFactor: number;
  speedKmhUrbanCore: number;
  speedKmhUrban: number;
  speedKmhSuburban: number;
  parkingBufferMinutes: number;
  sameDistrictMinutes: number;
  adjacentDistrictMinutes: number;
  farDistrictMinutes: number;
  roundingMode: string;
}

interface Org {
  id: string;
  name: string;
  taxId: string;
  ltcCode: string | null;
  policy: Policy;
}

export default function PolicyPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<Policy>>({});

  const org = useQuery({
    queryKey: ['org'],
    queryFn: async () => (await api.get<Org>('/org')).data,
  });

  useEffect(() => {
    if (org.data?.policy) setDraft(org.data.policy);
  }, [org.data]);

  const save = useMutation({
    mutationFn: async () => api.patch('/org/policy', draft),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['org'] }),
  });

  if (org.isLoading) return <Spinner label="載入中…" />;
  if (org.isError) return <ErrorBanner error={org.error} />;

  const set = <K extends keyof Policy>(key: K, value: Policy[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="機構政策設定"
        subtitle={org.data?.name}
        actions={
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '儲存中…' : '儲存'}
          </button>
        }
      />

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>⚠️ 這些是機構政策設定，不是系統認定的法律見解。</strong>
        <p className="mt-1 text-xs leading-relaxed">
          勞基法在居家服務業的適用細節（特別是「趟與趟之間的空檔是否計入工時」）在實務上仍有爭議，
          涉及待命時間與自由運用時間的界線。上線前請由機構人資或法務書面確認各項門檻值。
          詳見 <code>docs/03-conflict-rules.md</code>。
        </p>
      </div>

      <section className="card mb-4 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">工時門檻</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="日正常工時（分鐘）"
            hint="勞基法 §30，預設 480 = 8 小時"
            value={draft.normalDailyMinutes}
            onChange={(v) => set('normalDailyMinutes', v)}
          />
          <Field
            label="日工時法定上限（分鐘）"
            hint="勞基法 §32，預設 720 = 12 小時"
            value={draft.maxDailyMinutes}
            onChange={(v) => set('maxDailyMinutes', v)}
          />
          <Field
            label="週正常工時（分鐘）"
            hint="勞基法 §30，預設 2400 = 40 小時"
            value={draft.normalWeeklyMinutes}
            onChange={(v) => set('normalWeeklyMinutes', v)}
          />
          <Field
            label="連續工作上限（分鐘）"
            hint="勞基法 §35，預設 240 = 4 小時"
            value={draft.restBreakAfterMinutes}
            onChange={(v) => set('restBreakAfterMinutes', v)}
          />
          <Field
            label="應有休息（分鐘）"
            hint="勞基法 §35，預設 30 分鐘"
            value={draft.restBreakMinutes}
            onChange={(v) => set('restBreakMinutes', v)}
          />
          <Field
            label="班距下限（分鐘）"
            hint="勞基法 §34，居服是否適用有爭議 → 僅警示"
            value={draft.minShiftGapMinutes}
            onChange={(v) => set('minShiftGapMinutes', v)}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">月延長工時制度</label>
            <select
              className="input"
              value={draft.monthlyOtMode ?? 'STANDARD_46'}
              onChange={(e) => set('monthlyOtMode', e.target.value)}
            >
              <option value="STANDARD_46">一般制（每月 46 小時）</option>
              <option value="FLEX_54_138">彈性制（經勞資會議同意，單月 54／三個月 138 小時）</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-400">勞基法 §32 II</p>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.enforceSevenDayRest ?? true}
              onChange={(e) => set('enforceSevenDayRest', e.target.checked)}
            />
            啟用七休一檢核（勞基法 §36）
          </label>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label className="label">趟間空檔計入工時的門檻（分鐘）</label>
          <input
            type="number"
            className="input max-w-40"
            value={draft.idleGapCountsAsWorkThresholdMinutes ?? 60}
            onChange={(e) =>
              set('idleGapCountsAsWorkThresholdMinutes', Number(e.target.value))
            }
          />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            空檔小於等於此值者計入工時，大於此值者不計。
            <strong className="text-slate-700">
              這是本系統最具爭議的參數
            </strong>
            —— 排班畫面與工時統計會同時顯示三種算法（僅服務時數 / 含所有空檔 / 依本設定採計），
            供督導與人資判斷，系統本身不對此表示法律見解。
          </p>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">路程估算參數</h2>
        <p className="mb-4 text-[11px] text-slate-500">
          Phase 1 不依賴任何付費地圖 API。有座標時以直線距離乘上迂迴係數估算，
          缺座標時退回行政區鄰接表。估算結果僅作提醒（R07 恆為警示，不會阻擋排班）。
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field
            label="迂迴係數"
            hint="直線 → 路網，預設 1.35"
            step={0.05}
            value={draft.detourFactor}
            onChange={(v) => set('detourFactor', v)}
          />
          <Field label="市中心車速 (km/h)" value={draft.speedKmhUrbanCore} onChange={(v) => set('speedKmhUrbanCore', v)} />
          <Field label="市區車速 (km/h)" value={draft.speedKmhUrban} onChange={(v) => set('speedKmhUrban', v)} />
          <Field label="郊區車速 (km/h)" value={draft.speedKmhSuburban} onChange={(v) => set('speedKmhSuburban', v)} />
          <Field label="停車緩衝（分鐘）" hint="停車、找門牌、上樓" value={draft.parkingBufferMinutes} onChange={(v) => set('parkingBufferMinutes', v)} />
          <Field label="同區（分鐘）" hint="無座標時的退回值" value={draft.sameDistrictMinutes} onChange={(v) => set('sameDistrictMinutes', v)} />
          <Field label="相鄰區（分鐘）" value={draft.adjacentDistrictMinutes} onChange={(v) => set('adjacentDistrictMinutes', v)} />
          <Field label="非相鄰區（分鐘）" value={draft.farDistrictMinutes} onChange={(v) => set('farDistrictMinutes', v)} />
        </div>

        <div className="mt-4 max-w-56">
          <label className="label">金額進位方式</label>
          <select
            className="input"
            value={draft.roundingMode ?? 'HALF_UP'}
            onChange={(e) => set('roundingMode', e.target.value)}
          >
            <option value="HALF_UP">四捨五入</option>
            <option value="FLOOR">無條件捨去</option>
            <option value="CEIL">無條件進位</option>
          </select>
          <p className="mt-1 text-[11px] text-slate-400">須依衛福部公告之規定設定</p>
        </div>
      </section>

      {save.isError && (
        <div className="mt-4">
          <ErrorBanner error={save.error} />
        </div>
      )}
      {save.isSuccess && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          已儲存 — 排班檢核將立即套用新的門檻值
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | undefined;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        step={step}
        className="input"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
