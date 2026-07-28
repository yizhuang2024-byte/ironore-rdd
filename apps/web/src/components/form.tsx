/**
 * 表單元件。刻意保持極簡 —— 主檔表單的欄位很多，
 * 每個欄位多一層抽象就多一分理解成本。
 */

import type { ReactNode } from 'react';

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      {/* 用 label 包住控制項做隱式關聯：讀螢幕軟體才會唸出欄位名，點文字也才會聚焦。
          不用 htmlFor + id 是因為 Field 不產生控制項本身，拿不到它的 id。 */}
      <label>
        <span className="label">
          {label}
          {/* aria-hidden：星號是給眼睛看的視覺提示，讓它進入無障礙名稱只會讓
              讀螢幕軟體把欄位唸成「姓名 星號」，也污染測試的欄位定位 */}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-rose-600">
              *
            </span>
          )}
        </span>
        {children}
      </label>
      {error ? (
        <p className="mt-0.5 text-[11px] text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  cols = 2,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  cols?: 1 | 2 | 3;
}) {
  const gridCls = cols === 1 ? '' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {description && (
        <p className="mt-0.5 mb-3 text-[11px] leading-relaxed text-slate-500">{description}</p>
      )}
      <div className={`mt-3 grid gap-4 ${gridCls}`}>{children}</div>
    </section>
  );
}

/** 週期性時段編輯器 —— 照服員可服務時段與個案不可服務時段共用 */
export interface WeeklyWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
  reason?: string;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function toHHMM(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function fromHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function WeeklyWindowEditor({
  windows,
  onChange,
  withReason,
  emptyHint,
}: {
  windows: WeeklyWindow[];
  onChange: (next: WeeklyWindow[]) => void;
  withReason?: boolean;
  emptyHint?: string;
}) {
  const update = (idx: number, patch: Partial<WeeklyWindow>) => {
    const next = [...windows];
    next[idx] = { ...next[idx]!, ...patch };
    onChange(next);
  };

  return (
    <div>
      {windows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">
          {emptyHint ?? '尚未設定'}
        </p>
      ) : (
        <ul className="space-y-2">
          {windows.map((w, idx) => (
            <li key={idx} className="flex flex-wrap items-center gap-2">
              <select
                className="input w-auto py-1.5 text-xs"
                value={w.weekday}
                onChange={(e) => update(idx, { weekday: Number(e.target.value) })}
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={i} value={i}>
                    週{d}
                  </option>
                ))}
              </select>
              <input
                type="time"
                className="input w-auto py-1.5 text-xs"
                value={toHHMM(w.startMinute)}
                onChange={(e) => update(idx, { startMinute: fromHHMM(e.target.value) })}
              />
              <span className="text-xs text-slate-400">至</span>
              <input
                type="time"
                className="input w-auto py-1.5 text-xs"
                value={toHHMM(w.endMinute)}
                onChange={(e) => update(idx, { endMinute: fromHHMM(e.target.value) })}
              />
              {withReason && (
                <input
                  className="input min-w-32 flex-1 py-1.5 text-xs"
                  placeholder="事由（如：固定回診）"
                  value={w.reason ?? ''}
                  onChange={(e) => update(idx, { reason: e.target.value })}
                />
              )}
              {w.endMinute <= w.startMinute && (
                <span className="text-[11px] text-rose-600">結束需晚於開始</span>
              )}
              <button
                type="button"
                className="text-xs text-rose-600 hover:underline"
                onClick={() => onChange(windows.filter((_, i) => i !== idx))}
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn-secondary mt-2 px-2 py-1 text-xs"
        onClick={() =>
          onChange([...windows, { weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 }])
        }
      >
        + 新增時段
      </button>
    </div>
  );
}
