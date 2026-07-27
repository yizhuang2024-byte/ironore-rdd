/**
 * 排班主畫面。
 *
 * 300 位照服員的規模下，關鍵設計是**預設永遠不顯示全部人**：
 *  - 進入時預設今日 + 使用者所屬單位，督導的組通常 20–40 人，一屏可見
 *  - 列採虛擬捲動，即使解除篩選 DOM 也只有可視區的列
 *  - 時間軸只畫 06:00–21:00，1 小時 60px，不需水平捲動
 *  - 查詢強制日期區間（後端上限 31 天）
 */

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  addTaipeiDays,
  calcWorkMinutes,
  toTaipeiDate,
  toTaipeiMinuteOfDay,
} from '@ltc/shared';
import { api, qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import {
  Badge,
  EmptyState,
  ErrorBanner,
  HoursPill,
  Modal,
  PageHeader,
  Spinner,
} from '../../components/ui.js';
import { DISTRICT_NAMES, districtName, fmtTime } from '../../lib/format.js';

const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 21 * 60;
const PX_PER_HOUR = 60;
const ROW_HEIGHT = 56;
const TOTAL_WIDTH = ((DAY_END_MIN - DAY_START_MIN) / 60) * PX_PER_HOUR;

interface Visit {
  id: string;
  unitId: string | null;
  serviceDate: string;
  startAt: string;
  endAt: string;
  plannedMinutes: number;
  status: string;
  overrideReason: string | null;
  attendant: { id: string; name: string; employeeNo: string } | null;
  recipient: {
    id: string;
    caseNo: string;
    nameMasked: string;
    districtCode: string;
    cmsLevel: number;
  } | null;
  items: { code: string; quantity: number }[];
}

interface Unit {
  id: string;
  name: string;
}

interface Finding {
  ruleId: string;
  severity: 'BLOCK' | 'WARN' | 'INFO';
  titleZh: string;
  messageZh: string;
  legalRef?: string;
  overridable: boolean;
}

interface Candidate {
  attendant: { id: string; name: string; employeeNo: string };
  level: 'BLOCKED' | 'WARNING' | 'CLEAR';
  blockCount: number;
  warnCount: number;
  allBlocksOverridable: boolean;
  findings: Finding[];
}

type GroupMode = 'attendant' | 'recipient' | 'district';

export default function Schedule() {
  const [params, setParams] = useSearchParams();
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const date = params.get('date') ?? toTaipeiDate(new Date());
  const unitId = params.get('unitId') ?? '';
  const districtCode = params.get('districtCode') ?? '';
  const groupMode = (params.get('group') ?? 'attendant') as GroupMode;
  const unassignedOnly = params.get('unassignedOnly') === '1';
  const [selected, setSelected] = useState<Visit | null>(null);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const units = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.get<Unit[]>('/units')).data,
  });

  // 督導預設載入自己的單位 —— 不篩選就是 300 人的畫面
  const defaultUnitId = user?.roles.find((r) => r.unitId)?.unitId ?? '';
  const effectiveUnitId = unitId || defaultUnitId;

  const visits = useQuery({
    queryKey: ['visits', date, effectiveUnitId, districtCode, unassignedOnly],
    queryFn: async () =>
      (
        await api.get<Visit[]>(
          `/schedules/visits${qs({
            from: date,
            to: date,
            unitId: effectiveUnitId,
            districtCode,
            unassignedOnly: unassignedOnly ? 'true' : '',
            limit: 2000,
          })}`,
        )
      ).data,
  });

  const unassigned = useMemo(
    () => (visits.data ?? []).filter((v) => !v.attendant && v.status !== 'CANCELLED'),
    [visits.data],
  );

  /** 依分組模式建立列 */
  const rows = useMemo(() => {
    const list = (visits.data ?? []).filter((v) => v.status !== 'CANCELLED');
    const map = new Map<string, { key: string; label: string; sub: string; visits: Visit[] }>();

    for (const v of list) {
      let key: string;
      let label: string;
      let sub: string;

      if (groupMode === 'recipient') {
        key = v.recipient?.id ?? 'none';
        label = v.recipient?.nameMasked ?? '（無個案）';
        sub = v.recipient?.caseNo ?? '';
      } else if (groupMode === 'district') {
        key = v.recipient?.districtCode ?? 'none';
        label = districtName(v.recipient?.districtCode);
        sub = '';
      } else {
        key = v.attendant?.id ?? '__unassigned__';
        label = v.attendant?.name ?? '未指派';
        sub = v.attendant?.employeeNo ?? '';
      }

      const bucket = map.get(key) ?? { key, label, sub, visits: [] };
      bucket.visits.push(v);
      map.set(key, bucket);
    }

    return [...map.values()].sort((a, b) => {
      // 未指派列固定在最上方，督導最需要先處理
      if (a.key === '__unassigned__') return -1;
      if (b.key === '__unassigned__') return 1;
      return a.label.localeCompare(b.label, 'zh-TW');
    });
  }, [visits.data, groupMode]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const showAllWarning = !effectiveUnitId && rows.length > 60;

  return (
    <div>
      <PageHeader
        title="排班"
        subtitle={
          <>
            {date}（台北時間）
            {visits.data && <span className="ml-2">共 {visits.data.length} 筆班次</span>}
          </>
        }
      />

      {/* 篩選列 —— 狀態寫入 URL，可分享與回上頁 */}
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="flex items-end gap-1">
          <button
            className="btn-secondary px-2 py-2"
            onClick={() => update('date', addTaipeiDays(date, -1))}
            aria-label="前一日"
          >
            ‹
          </button>
          <div>
            <label className="label">日期</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => update('date', e.target.value)}
            />
          </div>
          <button
            className="btn-secondary px-2 py-2"
            onClick={() => update('date', addTaipeiDays(date, 1))}
            aria-label="後一日"
          >
            ›
          </button>
          <button
            className="btn-secondary py-2 text-xs"
            onClick={() => update('date', toTaipeiDate(new Date()))}
          >
            今日
          </button>
        </div>

        <div>
          <label className="label">服務單位</label>
          <select
            className="input"
            value={effectiveUnitId}
            onChange={(e) => update('unitId', e.target.value)}
          >
            <option value="">全部單位</option>
            {units.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
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
          <label className="label">分組方式</label>
          <select
            className="input"
            value={groupMode}
            onChange={(e) => update('group', e.target.value)}
          >
            <option value="attendant">依照服員（指派視角）</option>
            <option value="recipient">依個案（服務連續性）</option>
            <option value="district">依行政區（路線視角）</option>
          </select>
        </div>

        <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => update('unassignedOnly', e.target.checked ? '1' : '')}
          />
          只看未指派
        </label>
      </div>

      {showAllWarning && (
        <div className="mb-3 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          目前顯示全部單位共 {rows.length} 列 — 建議先選擇服務單位或行政區以利操作
        </div>
      )}

      {visits.isError && <ErrorBanner error={visits.error} />}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        {/* 時間軸 */}
        <div className="card overflow-hidden">
          {visits.isLoading ? (
            <div className="p-8">
              <Spinner label="載入班次…" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState message="此條件下沒有班次" hint="換個日期或放寬篩選條件" />
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: TOTAL_WIDTH + 180 }}>
                {/* 時間刻度 */}
                <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-slate-50">
                  <div className="w-[180px] shrink-0 px-3 py-2 text-xs font-semibold text-slate-500">
                    {groupMode === 'attendant' ? '照服員' : groupMode === 'recipient' ? '個案' : '行政區'}
                  </div>
                  <div className="relative" style={{ width: TOTAL_WIDTH }}>
                    {Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => (
                      <span
                        key={i}
                        className="absolute top-2 -translate-x-1/2 text-[10px] text-slate-400"
                        style={{ left: i * PX_PER_HOUR }}
                      >
                        {String(DAY_START_MIN / 60 + i).padStart(2, '0')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 虛擬捲動的列 */}
                <div ref={scrollRef} className="max-h-[62vh] overflow-y-auto">
                  <div
                    style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
                  >
                    {virtualizer.getVirtualItems().map((vi) => {
                      const row = rows[vi.index]!;
                      return (
                        <TimelineRow
                          key={row.key}
                          row={row}
                          top={vi.start}
                          groupMode={groupMode}
                          onSelect={setSelected}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 未排班佇列 */}
        <aside className="card flex max-h-[70vh] flex-col p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">
            未排班佇列
            <Badge tone={unassigned.length > 0 ? 'amber' : 'green'}>{unassigned.length}</Badge>
          </h2>
          <p className="mb-3 text-[11px] text-slate-400">點選卡片指派照服員</p>
          <div className="flex-1 space-y-1.5 overflow-y-auto">
            {unassigned.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2 text-left transition-colors hover:bg-amber-100"
              >
                <p className="text-xs font-medium text-slate-800">
                  {fmtTime(v.startAt)}–{fmtTime(v.endAt)}
                </p>
                <p className="text-xs text-slate-600">
                  {v.recipient?.nameMasked}
                  <span className="ml-1 text-slate-400">
                    {districtName(v.recipient?.districtCode)}
                  </span>
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                  {v.items.map((i) => i.code).join('、')}
                </p>
              </button>
            ))}
            {unassigned.length === 0 && (
              <p className="py-8 text-center text-xs text-slate-400">此條件下班次皆已指派</p>
            )}
          </div>
        </aside>
      </div>

      {selected && (
        <AssignDrawer
          visit={selected}
          canOverride={can('schedule:override')}
          onClose={() => setSelected(null)}
          onAssigned={() => {
            void qc.invalidateQueries({ queryKey: ['visits'] });
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function TimelineRow({
  row,
  top,
  groupMode,
  onSelect,
}: {
  row: { key: string; label: string; sub: string; visits: Visit[] };
  top: number;
  groupMode: GroupMode;
  onSelect: (v: Visit) => void;
}) {
  // 工時膠囊：讓督導不必點開就知道誰滿了
  const work = useMemo(
    () =>
      calcWorkMinutes(
        row.visits.map((v) => ({ startAt: new Date(v.startAt), endAt: new Date(v.endAt) })),
        60,
      ),
    [row.visits],
  );

  return (
    <div
      className="absolute right-0 left-0 flex border-b border-slate-100"
      style={{ top, height: ROW_HEIGHT }}
    >
      <div className="w-[180px] shrink-0 px-3 py-2">
        <p className="truncate text-sm font-medium text-slate-800">{row.label}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {row.sub && <span className="font-mono text-[10px] text-slate-400">{row.sub}</span>}
          {groupMode === 'attendant' && row.key !== '__unassigned__' && (
            <HoursPill minutes={work.policy} capMinutes={480} />
          )}
        </div>
      </div>

      <div className="relative" style={{ width: TOTAL_WIDTH }}>
        {/* 每小時格線 */}
        {Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 }, (_, i) => (
          <span
            key={i}
            className="absolute top-0 bottom-0 w-px bg-slate-100"
            style={{ left: i * PX_PER_HOUR }}
          />
        ))}

        {row.visits.map((v) => {
          const startMin = toTaipeiMinuteOfDay(new Date(v.startAt));
          const endMin = toTaipeiMinuteOfDay(new Date(v.endAt));
          const left = ((startMin - DAY_START_MIN) / 60) * PX_PER_HOUR;
          const width = Math.max(18, ((endMin - startMin) / 60) * PX_PER_HOUR);
          const unassignedVisit = !v.attendant;

          return (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              title={`${fmtTime(v.startAt)}–${fmtTime(v.endAt)} ${v.recipient?.nameMasked ?? ''} ${v.items.map((i) => i.code).join('、')}`}
              className={`absolute top-1.5 bottom-1.5 overflow-hidden rounded-md border px-1.5 text-left text-[10px] leading-tight transition-shadow hover:shadow-md ${
                unassignedVisit
                  ? 'border-amber-300 bg-amber-100 text-amber-900'
                  : v.overrideReason
                    ? 'border-violet-300 bg-violet-100 text-violet-900'
                    : 'border-brand-300 bg-brand-100 text-brand-900'
              }`}
              style={{ left, width }}
            >
              <span className="block truncate font-medium">
                {groupMode === 'attendant' ? v.recipient?.nameMasked : (v.attendant?.name ?? '未指派')}
              </span>
              <span className="block truncate font-mono opacity-70">
                {v.items.map((i) => i.code).join(',')}
              </span>
              {v.overrideReason && <span className="absolute top-0 right-0.5 text-[9px]">⚠</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 指派抽屜 —— 候選人已依衝突排序，每位下方顯示其衝突標籤 */
function AssignDrawer({
  visit,
  canOverride,
  onClose,
  onAssigned,
}: {
  visit: Visit;
  canOverride: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [pending, setPending] = useState<Candidate | null>(null);
  const [reason, setReason] = useState('');

  const candidates = useQuery({
    queryKey: ['candidates', visit.id],
    queryFn: async () =>
      (await api.get<Candidate[]>(`/schedules/visits/${visit.id}/candidates?limit=15`)).data,
  });

  const assign = useMutation({
    mutationFn: async (input: { attendantId: string; overrideRuleIds: string[]; reason?: string }) =>
      api.post(`/schedules/visits/${visit.id}/assign`, {
        attendantId: input.attendantId,
        overrideRuleIds: input.overrideRuleIds,
        overrideReason: input.reason,
      }),
    onSuccess: onAssigned,
  });

  function attempt(c: Candidate) {
    if (c.level === 'CLEAR' || (c.level === 'WARNING' && c.blockCount === 0)) {
      assign.mutate({ attendantId: c.attendant.id, overrideRuleIds: [] });
    } else {
      setPending(c);
    }
  }

  const blocked = pending?.findings.filter((f) => f.severity === 'BLOCK') ?? [];
  const hardBlocked = blocked.filter((f) => !f.overridable);
  const canForce = canOverride && blocked.length > 0 && hardBlocked.length === 0;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`指派照服員 — ${fmtTime(visit.startAt)}–${fmtTime(visit.endAt)} ${visit.recipient?.nameMasked ?? ''}`}
    >
      {pending ? (
        <div>
          <button
            className="mb-3 text-xs text-brand-700 hover:underline"
            onClick={() => setPending(null)}
          >
            ← 回候選清單
          </button>

          <p className="mb-3 text-sm">
            指派 <strong>{pending.attendant.name}</strong> 至此班次將觸發以下檢核：
          </p>

          <ul className="mb-4 space-y-2">
            {pending.findings.map((f) => (
              <li
                key={f.ruleId + f.messageZh}
                className={`rounded-lg border px-3 py-2 ${
                  f.severity === 'BLOCK'
                    ? f.overridable
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-rose-300 bg-rose-50'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{f.ruleId}</span>
                  <Badge
                    tone={f.severity === 'BLOCK' ? (f.overridable ? 'amber' : 'red') : 'neutral'}
                  >
                    {f.severity === 'BLOCK' ? (f.overridable ? '需覆寫' : '不可覆寫') : '提醒'}
                  </Badge>
                  <span className="text-sm font-medium text-slate-800">{f.titleZh}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{f.messageZh}</p>
                {f.legalRef && (
                  <p className="mt-0.5 text-[11px] text-slate-400">依據：{f.legalRef}</p>
                )}
              </li>
            ))}
          </ul>

          {hardBlocked.length > 0 ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
              此指派含<strong>不可覆寫</strong>的檢核（
              {hardBlocked.map((f) => f.ruleId).join('、')}
              ），無法排入。請改選其他照服員。
            </p>
          ) : canForce ? (
            <div>
              <label className="label">覆寫理由（必填，將記入稽核紀錄）</label>
              <textarea
                className="input"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例：經勞資會議同意；緊急代班"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setPending(null)}>
                  取消
                </button>
                <button
                  className="btn-danger"
                  disabled={!reason.trim() || assign.isPending}
                  onClick={() =>
                    assign.mutate({
                      attendantId: pending.attendant.id,
                      overrideRuleIds: blocked.map((f) => f.ruleId),
                      reason: reason.trim(),
                    })
                  }
                >
                  督導覆寫並指派
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              您沒有覆寫排班檢核的權限，請洽督導處理。
            </p>
          )}

          {assign.isError && (
            <div className="mt-3">
              <ErrorBanner error={assign.error} />
            </div>
          )}
        </div>
      ) : candidates.isLoading ? (
        <Spinner label="檢核候選照服員…" />
      ) : (
        <ul className="space-y-1.5">
          {candidates.data?.map((c) => (
            <li key={c.attendant.id}>
              <button
                onClick={() => attempt(c)}
                disabled={assign.isPending}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <span>
                  <span className="text-sm font-medium text-slate-800">{c.attendant.name}</span>
                  <span className="ml-1.5 font-mono text-[11px] text-slate-400">
                    {c.attendant.employeeNo}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  {c.blockCount > 0 && <Badge tone="red">🔴 {c.blockCount}</Badge>}
                  {c.warnCount > 0 && <Badge tone="amber">🟡 {c.warnCount}</Badge>}
                  {c.level === 'CLEAR' && <Badge tone="green">無衝突</Badge>}
                </span>
              </button>
            </li>
          ))}
          {candidates.data?.length === 0 && (
            <EmptyState message="此時段沒有可指派的照服員" hint="請調整班次時間或擴大服務單位範圍" />
          )}
        </ul>
      )}
    </Modal>
  );
}
