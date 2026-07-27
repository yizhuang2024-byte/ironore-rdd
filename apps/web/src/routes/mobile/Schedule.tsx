import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addTaipeiDays, startOfTaipeiWeek, toTaipeiDate } from '@ltc/shared';
import { api, qs } from '../../lib/api.js';
import { ErrorBanner, Spinner } from '../../components/ui.js';
import { WEEKDAY_LABELS } from '../../lib/format.js';
import { VisitCard, type MobileVisit } from './Today.js';

export default function MobileSchedule() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = toTaipeiDate(new Date());
  const weekStart = addTaipeiDays(startOfTaipeiWeek(today), weekOffset * 7);
  const weekEnd = addTaipeiDays(weekStart, 6);

  const visits = useQuery({
    queryKey: ['m-visits', weekStart, weekEnd],
    queryFn: async () =>
      (await api.get<MobileVisit[]>(`/m/visits${qs({ from: weekStart, to: weekEnd })}`)).data,
  });

  const byDate = new Map<string, MobileVisit[]>();
  for (const v of visits.data ?? []) {
    byDate.set(v.serviceDate, [...(byDate.get(v.serviceDate) ?? []), v]);
  }

  const days = Array.from({ length: 7 }, (_, i) => addTaipeiDays(weekStart, i));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="btn-secondary px-3 py-1.5" onClick={() => setWeekOffset((w) => w - 1)}>
          ‹ 上週
        </button>
        <span className="text-sm font-medium text-slate-700">
          {weekStart} ~ {weekEnd}
        </span>
        <button className="btn-secondary px-3 py-1.5" onClick={() => setWeekOffset((w) => w + 1)}>
          下週 ›
        </button>
      </div>

      {weekOffset !== 0 && (
        <button
          className="mb-3 w-full text-center text-xs text-brand-700"
          onClick={() => setWeekOffset(0)}
        >
          回到本週
        </button>
      )}

      {visits.isError && <ErrorBanner error={visits.error} />}

      {visits.isLoading ? (
        <Spinner label="載入班表…" />
      ) : (
        <div className="space-y-5">
          {days.map((d) => {
            const list = byDate.get(d) ?? [];
            const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
            const isToday = d === today;
            return (
              <section key={d}>
                <h3
                  className={`mb-2 flex items-baseline gap-2 text-sm font-semibold ${
                    isToday ? 'text-brand-800' : 'text-slate-700'
                  }`}
                >
                  <span>
                    {d.slice(5)}（{WEEKDAY_LABELS[weekday]}）
                  </span>
                  {isToday && (
                    <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] text-brand-800">
                      今日
                    </span>
                  )}
                  <span className="text-xs font-normal text-slate-400">{list.length} 趟</span>
                </h3>
                {list.length > 0 ? (
                  <div className="space-y-2">
                    {list.map((v) => (
                      <VisitCard key={v.id} v={v} />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 py-3 text-center text-xs text-slate-400">
                    休息
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
