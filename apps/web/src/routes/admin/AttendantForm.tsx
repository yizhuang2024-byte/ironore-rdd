/**
 * 照服員新增／編輯。
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { toTaipeiDate } from '@ltc/shared';
import { api } from '../../lib/api.js';
import { ErrorBanner, PageHeader, Spinner } from '../../components/ui.js';
import {
  Field,
  FormSection,
  WeeklyWindowEditor,
  type WeeklyWindow,
} from '../../components/form.js';
import { DISTRICT_NAMES, EMPLOYMENT_LABELS, districtName } from '../../lib/format.js';

interface Unit {
  id: string;
  name: string;
}

interface AttendantDetail {
  id: string;
  employeeNo: string;
  name: string;
  phone: string;
  birthDate: string | null;
  gender: string | null;
  employmentType: string;
  hiredOn: string;
  resignedOn: string | null;
  status: string;
  primaryUnitId: string | null;
  homeDistrict: string | null;
  maxDailyMinutes: number;
  maxWeeklyMinutes: number;
  maxMonthlyOtMinutes: number;
  serviceAreas: { districtCode: string; priority: number }[];
  availabilities: { weekday: number; startMinute: number; endMinute: number }[];
}

interface FormState {
  employeeNo: string;
  name: string;
  nationalId: string;
  birthDate: string;
  gender: string;
  phone: string;
  address: string;
  employmentType: string;
  hiredOn: string;
  resignedOn: string;
  status: string;
  primaryUnitId: string;
  homeDistrict: string;
  maxDailyMinutes: number;
  maxWeeklyMinutes: number;
  maxMonthlyOtMinutes: number;
}

const emptyForm = (): FormState => ({
  employeeNo: '',
  name: '',
  nationalId: '',
  birthDate: '',
  gender: '',
  phone: '',
  address: '',
  employmentType: 'FULL_TIME',
  hiredOn: toTaipeiDate(new Date()),
  resignedOn: '',
  status: 'ACTIVE',
  primaryUnitId: '',
  homeDistrict: '',
  maxDailyMinutes: 480,
  maxWeeklyMinutes: 2400,
  maxMonthlyOtMinutes: 2760,
});

export default function AttendantForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [areas, setAreas] = useState<{ districtCode: string; priority: number }[]>([]);
  const [availability, setAvailability] = useState<WeeklyWindow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const units = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.get<Unit[]>('/units')).data,
  });

  const existing = useQuery({
    queryKey: ['attendant', id],
    queryFn: async () => (await api.get<AttendantDetail>(`/attendants/${id}`)).data,
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existing.data) return;
    const d = existing.data;
    setForm((f) => ({
      ...f,
      employeeNo: d.employeeNo,
      name: d.name,
      phone: d.phone,
      birthDate: d.birthDate ? d.birthDate.slice(0, 10) : '',
      gender: d.gender ?? '',
      employmentType: d.employmentType,
      hiredOn: d.hiredOn.slice(0, 10),
      resignedOn: d.resignedOn ? d.resignedOn.slice(0, 10) : '',
      status: d.status,
      primaryUnitId: d.primaryUnitId ?? '',
      homeDistrict: d.homeDistrict ?? '',
      maxDailyMinutes: d.maxDailyMinutes,
      maxWeeklyMinutes: d.maxWeeklyMinutes,
      maxMonthlyOtMinutes: d.maxMonthlyOtMinutes,
    }));
    setAreas(d.serviceAreas.map((a) => ({ districtCode: a.districtCode, priority: a.priority })));
    setAvailability(
      d.availabilities.map((a) => ({
        weekday: a.weekday,
        startMinute: a.startMinute,
        endMinute: a.endMinute,
      })),
    );
  }, [existing.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        phone: form.phone,
        employmentType: form.employmentType,
        maxDailyMinutes: form.maxDailyMinutes,
        maxWeeklyMinutes: form.maxWeeklyMinutes,
        ...(form.address ? { address: form.address } : {}),
        ...(form.primaryUnitId ? { primaryUnitId: form.primaryUnitId } : {}),
      };

      let attendantId = id!;
      if (isEdit) {
        payload['status'] = form.status;
        payload['maxMonthlyOtMinutes'] = form.maxMonthlyOtMinutes;
        payload['resignedOn'] = form.resignedOn || null;
        await api.patch(`/attendants/${id}`, payload);
      } else {
        payload['employeeNo'] = form.employeeNo;
        payload['hiredOn'] = form.hiredOn;
        if (form.nationalId) payload['nationalId'] = form.nationalId;
        if (form.birthDate) payload['birthDate'] = form.birthDate;
        if (form.gender) payload['gender'] = form.gender;
        if (form.homeDistrict) payload['homeDistrict'] = form.homeDistrict;
        const created = await api.post<{ id: string }>('/attendants', payload);
        attendantId = created.data.id;
      }

      await api.put(`/attendants/${attendantId}/service-areas`, { areas });
      await api.put(`/attendants/${attendantId}/availability`, {
        windows: availability.map((w) => ({
          weekday: w.weekday,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        })),
      });

      return attendantId;
    },
    onSuccess: (attendantId) => {
      void qc.invalidateQueries({ queryKey: ['attendants'] });
      void qc.invalidateQueries({ queryKey: ['attendant', attendantId] });
      navigate(`/attendants/${attendantId}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : '儲存失敗'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name || !form.phone) {
      setError('姓名與電話為必填');
      return;
    }
    if (!isEdit && !form.employeeNo) {
      setError('員工編號為必填');
      return;
    }
    for (const w of availability) {
      if (w.endMinute <= w.startMinute) {
        setError('可服務時段的結束時間必須晚於開始時間');
        return;
      }
    }
    save.mutate();
  }

  if (isEdit && existing.isLoading) return <Spinner label="載入中…" />;

  const unusedDistricts = Object.entries(DISTRICT_NAMES).filter(
    ([code]) => !areas.some((a) => a.districtCode === code),
  );

  return (
    <form onSubmit={submit} className="max-w-4xl">
      <PageHeader
        title={isEdit ? `編輯照服員 ${form.employeeNo}` : '新增照服員'}
        subtitle={
          isEdit ? undefined : '建檔後可於使用者管理中為其開設帳號，才能使用行動端查看班表'
        }
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(isEdit ? `/attendants/${id}` : '/attendants')}
            >
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? '儲存中…' : '儲存'}
            </button>
          </>
        }
      />

      <div className="space-y-4">
        <FormSection title="基本資料">
          <Field label="員工編號" required={!isEdit}>
            <input
              className="input font-mono"
              value={form.employeeNo}
              disabled={isEdit}
              onChange={(e) => setForm({ ...form, employeeNo: e.target.value })}
            />
          </Field>
          <Field label="姓名" required>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          {!isEdit && (
            <Field label="身分證字號" hint="加密儲存">
              <input
                className="input font-mono"
                value={form.nationalId}
                onChange={(e) => setForm({ ...form, nationalId: e.target.value.toUpperCase() })}
              />
            </Field>
          )}
          <Field label="聯絡電話" required>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          {!isEdit && (
            <>
              <Field label="出生日期">
                <input
                  type="date"
                  className="input"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                />
              </Field>
              <Field label="性別">
                <select
                  className="input"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">未填</option>
                  <option value="M">男</option>
                  <option value="F">女</option>
                  <option value="OTHER">其他</option>
                </select>
              </Field>
            </>
          )}
          <Field label="居住地址" hint={isEdit ? '留白表示不變更；加密儲存' : '加密儲存'}>
            <input
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
        </FormSection>

        <FormSection title="聘僱資訊">
          <Field label="聘僱型態" required>
            <select
              className="input"
              value={form.employmentType}
              onChange={(e) => {
                const t = e.target.value;
                // 部分工時的契約工時上限通常較低，切換時給合理預設
                const presets: Record<string, { d: number; w: number }> = {
                  FULL_TIME: { d: 480, w: 2400 },
                  PART_TIME: { d: 300, w: 1800 },
                  HOURLY: { d: 240, w: 1200 },
                  DISPATCH: { d: 480, w: 2400 },
                };
                const p = presets[t] ?? presets['FULL_TIME']!;
                setForm({
                  ...form,
                  employmentType: t,
                  maxDailyMinutes: p.d,
                  maxWeeklyMinutes: p.w,
                });
              }}
            >
              {Object.entries(EMPLOYMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {!isEdit && (
            <Field label="到職日" required>
              <input
                type="date"
                className="input"
                value={form.hiredOn}
                onChange={(e) => setForm({ ...form, hiredOn: e.target.value })}
              />
            </Field>
          )}
          <Field label="服務單位">
            <select
              className="input"
              value={form.primaryUnitId}
              onChange={(e) => setForm({ ...form, primaryUnitId: e.target.value })}
            >
              <option value="">未指定</option>
              {units.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          {!isEdit && (
            <Field label="居住行政區" hint="用於估算首趟與末趟的移動時間">
              <select
                className="input"
                value={form.homeDistrict}
                onChange={(e) => setForm({ ...form, homeDistrict: e.target.value })}
              >
                <option value="">未指定</option>
                {Object.entries(DISTRICT_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {isEdit && (
            <>
              <Field label="在職狀態">
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="ACTIVE">在職</option>
                  <option value="ON_LEAVE">留職停薪</option>
                  <option value="RESIGNED">已離職</option>
                </select>
              </Field>
              <Field label="離職日" hint="設定後該日之後無法排班">
                <input
                  type="date"
                  className="input"
                  value={form.resignedOn}
                  onChange={(e) => setForm({ ...form, resignedOn: e.target.value })}
                />
              </Field>
            </>
          )}
        </FormSection>

        <FormSection
          title="契約工時上限"
          cols={3}
          description="這是個別契約的上限。勞基法的法定上限（日 12 小時、月延長 46 小時）另由機構政策設定，兩者取較嚴格者判定。"
        >
          <Field label="日工時上限（分鐘）" hint={`${(form.maxDailyMinutes / 60).toFixed(1)} 小時`}>
            <input
              type="number"
              className="input"
              value={form.maxDailyMinutes}
              onChange={(e) => setForm({ ...form, maxDailyMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="週工時上限（分鐘）" hint={`${(form.maxWeeklyMinutes / 60).toFixed(0)} 小時`}>
            <input
              type="number"
              className="input"
              value={form.maxWeeklyMinutes}
              onChange={(e) => setForm({ ...form, maxWeeklyMinutes: Number(e.target.value) })}
            />
          </Field>
          {isEdit && (
            <Field
              label="月延長工時上限（分鐘）"
              hint={`${(form.maxMonthlyOtMinutes / 60).toFixed(0)} 小時`}
            >
              <input
                type="number"
                className="input"
                value={form.maxMonthlyOtMinutes}
                onChange={(e) => setForm({ ...form, maxMonthlyOtMinutes: Number(e.target.value) })}
              />
            </Field>
          )}
        </FormSection>

        <FormSection
          title="可服務區域"
          cols={1}
          description="排班時若個案不在此範圍內會出現 R06 警示（可覆寫）。未設定則視為不限制。"
        >
          <div>
            {areas.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">
                未設定 — 視為不限制服務區域
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {areas.map((a, idx) => (
                  <li
                    key={a.districtCode}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1"
                  >
                    <span className="text-sm">{districtName(a.districtCode)}</span>
                    <select
                      className="input w-auto px-1 py-0.5 text-[11px]"
                      value={a.priority}
                      onChange={(e) => {
                        const next = [...areas];
                        next[idx] = { ...a, priority: Number(e.target.value) };
                        setAreas(next);
                      }}
                    >
                      <option value={1}>主要</option>
                      <option value={2}>支援</option>
                    </select>
                    <button
                      type="button"
                      className="text-xs text-rose-600"
                      onClick={() => setAreas(areas.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {unusedDistricts.length > 0 && (
              <select
                className="input mt-2 w-auto py-1 text-xs"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setAreas([
                    ...areas,
                    { districtCode: e.target.value, priority: areas.length === 0 ? 1 : 2 },
                  ]);
                }}
              >
                <option value="">+ 新增服務區域…</option>
                {unusedDistricts.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </FormSection>

        <FormSection
          title="可服務時段"
          cols={1}
          description="排班時若落在此範圍外會出現 R03 警示（可覆寫）。未設定則視為不限制。"
        >
          <WeeklyWindowEditor
            windows={availability}
            onChange={setAvailability}
            emptyHint="未設定 — 視為全時段皆可排班"
          />
        </FormSection>
      </div>

      {/* 錯誤只呈現一次，且緊鄰送出按鈕 —— 理由同個案表單 */}
      {error && (
        <div className="mt-4">
          <ErrorBanner error={new Error(error)} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 pb-8">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(isEdit ? `/attendants/${id}` : '/attendants')}
        >
          取消
        </button>
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? '儲存中…' : '儲存'}
        </button>
      </div>
    </form>
  );
}
