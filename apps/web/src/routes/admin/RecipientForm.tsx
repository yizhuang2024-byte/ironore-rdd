/**
 * 個案新增／編輯。
 *
 * 新增與編輯共用同一份表單 —— 兩者的欄位幾乎相同，分成兩個檔案會讓
 * 「新增時忘了加上某個欄位」這種漏洞悄悄出現。
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
import { COPAY_LABELS, DISTRICT_NAMES } from '../../lib/format.js';

interface Unit {
  id: string;
  name: string;
}
interface UserRow {
  id: string;
  displayName: string;
  roles: { role: string; unitId: string | null }[];
}
interface Contact {
  name: string;
  relation: string;
  phone: string;
  isPrimary: boolean;
}

interface RecipientDetail {
  id: string;
  caseNo: string;
  ltcCaseNo: string | null;
  nameMasked: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  districtCode: string;
  lat: number | null;
  lng: number | null;
  cmsLevel: number;
  copayCategory: string;
  remoteAreaTier: string;
  status: string;
  serviceStartOn: string;
  serviceEndOn: string | null;
  primaryUnitId: string | null;
  supervisorId: string | null;
}

interface FormState {
  caseNo: string;
  ltcCaseNo: string;
  name: string;
  nationalId: string;
  birthDate: string;
  gender: string;
  phone: string;
  address: string;
  districtCode: string;
  lat: string;
  lng: string;
  cmsLevel: number;
  copayCategory: string;
  remoteAreaTier: string;
  serviceStartOn: string;
  primaryUnitId: string;
  supervisorId: string;
  careNotes: string;
  medicalNotes: string;
  status: string;
}

const emptyForm = (): FormState => ({
  caseNo: '',
  ltcCaseNo: '',
  name: '',
  nationalId: '',
  birthDate: '',
  gender: '',
  phone: '',
  address: '',
  districtCode: '',
  lat: '',
  lng: '',
  cmsLevel: 4,
  copayCategory: 'GENERAL',
  remoteAreaTier: 'NONE',
  serviceStartOn: toTaipeiDate(new Date()),
  primaryUnitId: '',
  supervisorId: '',
  careNotes: '',
  medicalNotes: '',
  status: 'ACTIVE',
});

export default function RecipientForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unavailability, setUnavailability] = useState<WeeklyWindow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const units = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.get<Unit[]>('/units')).data,
  });
  const supervisors = useQuery({
    queryKey: ['users', 'SUPERVISOR'],
    queryFn: async () => (await api.get<UserRow[]>('/users?role=SUPERVISOR')).data,
  });

  const existing = useQuery({
    queryKey: ['recipient', id],
    queryFn: async () => (await api.get<RecipientDetail>(`/recipients/${id}`)).data,
    enabled: isEdit,
  });
  const existingContacts = useQuery({
    queryKey: ['recipient-contacts', id],
    queryFn: async () => (await api.get<Contact[]>(`/recipients/${id}/contacts`)).data,
    enabled: isEdit,
  });
  const existingUnavail = useQuery({
    queryKey: ['recipient-unavail', id],
    queryFn: async () =>
      (await api.get<(WeeklyWindow & { weekday: number | null })[]>(
        `/recipients/${id}/unavailability`,
      )).data,
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existing.data) return;
    const d = existing.data;
    setForm((f) => ({
      ...f,
      caseNo: d.caseNo,
      ltcCaseNo: d.ltcCaseNo ?? '',
      // 編輯時姓名等個資需另行解密，這裡留白代表「不變更」
      phone: d.phone ?? '',
      birthDate: d.birthDate ? d.birthDate.slice(0, 10) : '',
      gender: d.gender ?? '',
      districtCode: d.districtCode,
      lat: d.lat?.toString() ?? '',
      lng: d.lng?.toString() ?? '',
      cmsLevel: d.cmsLevel,
      copayCategory: d.copayCategory,
      remoteAreaTier: d.remoteAreaTier,
      serviceStartOn: d.serviceStartOn.slice(0, 10),
      primaryUnitId: d.primaryUnitId ?? '',
      supervisorId: d.supervisorId ?? '',
      status: d.status,
    }));
  }, [existing.data]);

  useEffect(() => {
    if (existingContacts.data) setContacts(existingContacts.data);
  }, [existingContacts.data]);

  useEffect(() => {
    if (existingUnavail.data) {
      setUnavailability(
        existingUnavail.data
          .filter((u) => u.weekday != null)
          .map((u) => ({
            weekday: u.weekday!,
            startMinute: u.startMinute,
            endMinute: u.endMinute,
            reason: u.reason ?? '',
          })),
      );
    }
  }, [existingUnavail.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        ltcCaseNo: form.ltcCaseNo || undefined,
        phone: form.phone || undefined,
        districtCode: form.districtCode,
        cmsLevel: form.cmsLevel,
        copayCategory: form.copayCategory,
        remoteAreaTier: form.remoteAreaTier,
        ...(form.lat && form.lng ? { lat: Number(form.lat), lng: Number(form.lng) } : {}),
        ...(form.primaryUnitId ? { primaryUnitId: form.primaryUnitId } : {}),
        ...(form.supervisorId ? { supervisorId: form.supervisorId } : {}),
        // 個資欄位留白時不送出，代表不變更（避免把既有資料清空）
        ...(form.name ? { name: form.name } : {}),
        ...(form.nationalId ? { nationalId: form.nationalId } : {}),
        ...(form.address ? { address: form.address } : {}),
        ...(form.careNotes ? { careNotes: form.careNotes } : {}),
        ...(form.medicalNotes ? { medicalNotes: form.medicalNotes } : {}),
        ...(form.birthDate ? { birthDate: form.birthDate } : {}),
        ...(form.gender ? { gender: form.gender } : {}),
      };

      let recipientId = id!;
      if (isEdit) {
        payload['status'] = form.status;
        await api.patch(`/recipients/${id}`, payload);
      } else {
        payload['caseNo'] = form.caseNo;
        payload['name'] = form.name;
        payload['serviceStartOn'] = form.serviceStartOn;
        const created = await api.post<{ id: string }>('/recipients', payload);
        recipientId = created.data.id;
      }

      await api.put(`/recipients/${recipientId}/contacts`, { contacts });
      await api.put(`/recipients/${recipientId}/unavailability`, {
        windows: unavailability.map((w) => ({
          weekday: w.weekday,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          reason: w.reason || undefined,
        })),
      });

      return recipientId;
    },
    onSuccess: (recipientId) => {
      void qc.invalidateQueries({ queryKey: ['recipients'] });
      void qc.invalidateQueries({ queryKey: ['recipient', recipientId] });
      navigate(`/recipients/${recipientId}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : '儲存失敗'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEdit && (!form.caseNo || !form.name || !form.districtCode)) {
      setError('案號、姓名與行政區為必填');
      return;
    }
    if (!form.districtCode) {
      setError('請選擇行政區');
      return;
    }
    save.mutate();
  }

  if (isEdit && existing.isLoading) return <Spinner label="載入中…" />;

  return (
    <form onSubmit={submit} className="max-w-4xl">
      <PageHeader
        title={isEdit ? `編輯個案 ${existing.data?.caseNo ?? ''}` : '新增個案'}
        subtitle={
          isEdit
            ? '個資欄位留白表示不變更；填入新值才會覆寫'
            : '建檔後需再建立照顧計畫，個案才能排班'
        }
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(isEdit ? `/recipients/${id}` : '/recipients')}
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
          <Field label="機構案號" required={!isEdit}>
            <input
              className="input"
              value={form.caseNo}
              disabled={isEdit}
              onChange={(e) => setForm({ ...form, caseNo: e.target.value })}
            />
          </Field>
          <Field label="照管中心個案編號">
            <input
              className="input"
              value={form.ltcCaseNo}
              onChange={(e) => setForm({ ...form, ltcCaseNo: e.target.value })}
            />
          </Field>
          <Field
            label="姓名"
            required={!isEdit}
            hint={isEdit ? '留白表示不變更' : '將加密儲存，列表僅顯示遮罩'}
          >
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="身分證字號" hint={isEdit ? '留白表示不變更' : '加密儲存'}>
            <input
              className="input font-mono"
              value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: e.target.value.toUpperCase() })}
            />
          </Field>
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
          <Field label="聯絡電話">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          {isEdit && (
            <Field label="服務狀態">
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="PENDING">待啟案</option>
                <option value="ACTIVE">服務中</option>
                <option value="SUSPENDED">暫停服務</option>
                <option value="CLOSED">已結案</option>
              </select>
            </Field>
          )}
        </FormSection>

        <FormSection
          title="地址與座標"
          description="座標用於排班時估算照服員的移動時間。留白時系統會退回以行政區鄰接關係粗估，精度較低但仍可運作。"
        >
          <Field label="行政區" required>
            <select
              className="input"
              value={form.districtCode}
              onChange={(e) => setForm({ ...form, districtCode: e.target.value })}
            >
              <option value="">請選擇</option>
              {Object.entries(DISTRICT_NAMES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="詳細地址" hint={isEdit ? '留白表示不變更；加密儲存' : '加密儲存'}>
            <input
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="緯度" hint="選填，如 25.0330">
            <input
              className="input font-mono"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
            />
          </Field>
          <Field label="經度" hint="選填，如 121.5654">
            <input
              className="input font-mono"
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
            />
          </Field>
        </FormSection>

        <FormSection title="長照屬性">
          <Field label="CMS 失能等級" required>
            <select
              className="input"
              value={form.cmsLevel}
              onChange={(e) => setForm({ ...form, cmsLevel: Number(e.target.value) })}
            >
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} 級
                </option>
              ))}
            </select>
          </Field>
          <Field label="部分負擔身分別" required>
            <select
              className="input"
              value={form.copayCategory}
              onChange={(e) => setForm({ ...form, copayCategory: e.target.value })}
            >
              {Object.entries(COPAY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="偏遠地區加成"
            hint="原民區或離島採支付基準的第二價格欄"
          >
            <select
              className="input"
              value={form.remoteAreaTier}
              onChange={(e) => setForm({ ...form, remoteAreaTier: e.target.value })}
            >
              <option value="NONE">否</option>
              <option value="REMOTE">偏遠地區</option>
              <option value="MOUNTAIN_ISLAND">山地或離島</option>
            </select>
          </Field>
          {!isEdit && (
            <Field label="服務起始日" required>
              <input
                type="date"
                className="input"
                value={form.serviceStartOn}
                onChange={(e) => setForm({ ...form, serviceStartOn: e.target.value })}
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
          <Field label="主責督導">
            <select
              className="input"
              value={form.supervisorId}
              onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}
            >
              <option value="">未指定</option>
              {supervisors.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </Field>
        </FormSection>

        <FormSection
          title="照顧注意事項"
          cols={1}
          description="屬個資法第 6 條特種個人資料，加密儲存。照服員行動端可看到「照顧注意事項」以執行服務，但看不到病史。"
        >
          <Field label="照顧注意事項" hint="照服員行動端可見">
            <textarea
              className="input"
              rows={2}
              placeholder="例：行動需助行器，移位時請留意左側肢體無力"
              value={form.careNotes}
              onChange={(e) => setForm({ ...form, careNotes: e.target.value })}
            />
          </Field>
          <Field label="病史與用藥" hint="僅主責督導與管理者可見">
            <textarea
              className="input"
              rows={2}
              value={form.medicalNotes}
              onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })}
            />
          </Field>
        </FormSection>

        <FormSection title="緊急聯絡人" cols={1}>
          <div>
            {contacts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">
                尚未登記聯絡人
              </p>
            ) : (
              <ul className="space-y-2">
                {contacts.map((c, idx) => (
                  <li key={idx} className="flex flex-wrap items-center gap-2">
                    <input
                      className="input w-28 py-1.5 text-xs"
                      placeholder="姓名"
                      value={c.name}
                      onChange={(e) => {
                        const next = [...contacts];
                        next[idx] = { ...c, name: e.target.value };
                        setContacts(next);
                      }}
                    />
                    <input
                      className="input w-20 py-1.5 text-xs"
                      placeholder="關係"
                      value={c.relation}
                      onChange={(e) => {
                        const next = [...contacts];
                        next[idx] = { ...c, relation: e.target.value };
                        setContacts(next);
                      }}
                    />
                    <input
                      className="input w-36 py-1.5 font-mono text-xs"
                      placeholder="電話"
                      value={c.phone}
                      onChange={(e) => {
                        const next = [...contacts];
                        next[idx] = { ...c, phone: e.target.value };
                        setContacts(next);
                      }}
                    />
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="radio"
                        name="primaryContact"
                        checked={c.isPrimary}
                        onChange={() =>
                          setContacts(contacts.map((x, i) => ({ ...x, isPrimary: i === idx })))
                        }
                      />
                      主要
                    </label>
                    <button
                      type="button"
                      className="text-xs text-rose-600 hover:underline"
                      onClick={() => setContacts(contacts.filter((_, i) => i !== idx))}
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
                setContacts([
                  ...contacts,
                  { name: '', relation: '', phone: '', isPrimary: contacts.length === 0 },
                ])
              }
            >
              + 新增聯絡人
            </button>
          </div>
        </FormSection>

        <FormSection
          title="不可服務時段"
          cols={1}
          description="就醫日、家屬在家日等。排班若落在這些時段會出現 R05 警示（可覆寫）。"
        >
          <WeeklyWindowEditor
            windows={unavailability}
            onChange={setUnavailability}
            withReason
            emptyHint="未設定 — 視為全時段皆可服務"
          />
        </FormSection>
      </div>

      {/* 錯誤只呈現一次，且緊鄰送出按鈕：這份表單很長，
          放在頁首的話使用者在底部按下儲存後根本看不到 */}
      {error && (
        <div className="mt-4">
          <ErrorBanner error={new Error(error)} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 pb-8">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(isEdit ? `/recipients/${id}` : '/recipients')}
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
