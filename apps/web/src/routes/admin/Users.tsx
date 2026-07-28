/**
 * 使用者與角色管理。
 *
 * 角色決定資料可見範圍，因此每次異動都是高風險操作 ——
 * 畫面上明確標示各角色的可見範圍，避免誤設。
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { fmtDateTime } from '../../lib/format.js';

interface UserRow {
  id: string;
  account: string;
  displayName: string;
  status: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  roles: { role: string; unitId: string | null }[];
}

interface Unit {
  id: string;
  name: string;
}

interface AttendantOption {
  id: string;
  name: string;
  employeeNo: string;
}

const ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: '管理者',
  SUPERVISOR: '督導',
  ADMIN_STAFF: '行政',
  ATTENDANT: '照服員',
  AUDITOR: '稽核',
};

const ROLE_SCOPES: Record<string, string> = {
  ORG_ADMIN: '全機構讀寫、使用者管理、支付基準、稽核查詢',
  SUPERVISOR: '所屬單位的個案與照服員，可覆寫排班檢核',
  ADMIN_STAFF: '全單位主檔建檔與排班，不可覆寫檢核',
  ATTENDANT: '僅自己的班表與請假，行動端介面',
  AUDITOR: '全機構唯讀，不可查看個資明文',
};

export default function Users() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [credential, setCredential] = useState<{ account: string; password: string } | null>(null);

  const [account, setAccount] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('ADMIN_STAFF');
  const [unitId, setUnitId] = useState('');
  const [attendantId, setAttendantId] = useState('');

  const users = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get<UserRow[]>('/users')).data,
  });
  const units = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.get<Unit[]>('/units')).data,
  });
  const attendants = useQuery({
    queryKey: ['attendants-for-user'],
    queryFn: async () =>
      (await api.get<AttendantOption[]>('/attendants?pageSize=200&status=ACTIVE')).data,
    enabled: role === 'ATTENDANT',
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ account: string; initialPassword: string }>('/users', {
          account: account.trim(),
          displayName: displayName.trim(),
          roles: [{ role, unitId: unitId || null }],
          ...(role === 'ATTENDANT' && attendantId ? { attendantId } : {}),
        })
      ).data,
    onSuccess: (d) => {
      setCredential({ account: d.account, password: d.initialPassword });
      setCreateOpen(false);
      setAccount('');
      setDisplayName('');
      setAttendantId('');
      void qc.invalidateQueries({ queryKey: ['users-list'] });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async (user: UserRow) =>
      ({
        account: user.account,
        ...(await api.post<{ newPassword: string }>(`/users/${user.id}/reset-password`)).data,
      }),
    onSuccess: (d) => setCredential({ account: d.account, password: d.newPassword }),
  });

  const toggleStatus = useMutation({
    mutationFn: async (user: UserRow) =>
      api.patch(`/users/${user.id}`, {
        status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users-list'] }),
  });

  const unlock = useMutation({
    mutationFn: async (user: UserRow) => api.patch(`/users/${user.id}`, { unlock: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users-list'] }),
  });

  const unitName = (id: string | null) =>
    id ? (units.data?.find((u) => u.id === id)?.name ?? id) : '全機構';

  return (
    <div>
      <PageHeader
        title="使用者與角色"
        subtitle="角色決定資料可見範圍，異動皆記入稽核紀錄"
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            + 新增使用者
          </button>
        }
      />

      {users.isError && <ErrorBanner error={users.error} />}

      <div className="card overflow-hidden">
        {users.isLoading ? (
          <div className="p-8">
            <Spinner />
          </div>
        ) : users.data && users.data.length > 0 ? (
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">帳號</th>
                <th className="th">姓名</th>
                <th className="th">角色</th>
                <th className="th">範圍</th>
                <th className="th">最後登入</th>
                <th className="th">狀態</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.data.map((u) => {
                const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="td font-mono text-xs">{u.account}</td>
                    <td className="td text-sm">{u.displayName}</td>
                    <td className="td">
                      {u.roles.map((r) => (
                        <Badge key={r.role + r.unitId} tone="brand">
                          {ROLE_LABELS[r.role] ?? r.role}
                        </Badge>
                      ))}
                    </td>
                    <td className="td text-xs text-slate-500">
                      {u.roles.map((r) => unitName(r.unitId)).join('、')}
                    </td>
                    <td className="td text-xs text-slate-500">
                      {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : '從未登入'}
                    </td>
                    <td className="td">
                      {locked ? (
                        <Badge tone="red">已鎖定</Badge>
                      ) : u.status === 'ACTIVE' ? (
                        <Badge tone="green">啟用</Badge>
                      ) : (
                        <Badge>停用</Badge>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex gap-2 text-xs">
                        {locked && (
                          <button
                            className="text-brand-700 hover:underline"
                            onClick={() => unlock.mutate(u)}
                          >
                            解鎖
                          </button>
                        )}
                        <button
                          className="text-brand-700 hover:underline"
                          onClick={() => {
                            if (confirm(`重設 ${u.account} 的密碼？該使用者所有裝置會被登出。`)) {
                              resetPassword.mutate(u);
                            }
                          }}
                        >
                          重設密碼
                        </button>
                        <button
                          className="text-slate-600 hover:underline"
                          onClick={() => toggleStatus.mutate(u)}
                        >
                          {u.status === 'ACTIVE' ? '停用' : '啟用'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState message="尚無使用者" />
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新增使用者"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button
              className="btn-primary"
              disabled={create.isPending || !account.trim() || !displayName.trim()}
              onClick={() => create.mutate()}
            >
              {create.isPending ? '建立中…' : '建立'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="帳號" required hint="英數字與 . _ - ，建檔後不可變更">
            <input
              className="input font-mono"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </Field>
          <Field label="姓名" required>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label="角色" required hint={ROLE_SCOPES[role]}>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {(role === 'SUPERVISOR' || role === 'ATTENDANT') && (
            <Field
              label="所屬服務單位"
              hint={role === 'SUPERVISOR' ? '督導只能看到所屬單位的資料' : undefined}
            >
              <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">全機構</option>
                {units.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {role === 'ATTENDANT' && (
            <Field label="綁定照服員" hint="綁定後該帳號才看得到自己的班表">
              <select
                className="input"
                value={attendantId}
                onChange={(e) => setAttendantId(e.target.value)}
              >
                <option value="">未綁定</option>
                {attendants.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.employeeNo} {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {create.isError && <ErrorBanner error={create.error} />}
        </div>
      </Modal>

      <Modal
        open={!!credential}
        onClose={() => setCredential(null)}
        title="初始密碼"
        footer={
          <button className="btn-primary" onClick={() => setCredential(null)}>
            我已記下
          </button>
        }
      >
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <strong>此密碼僅顯示這一次，關閉後無法再查看。</strong>
            <br />
            請立即交付使用者，並要求首次登入後變更。
          </p>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">帳號</dt>
              <dd className="font-mono text-sm">{credential?.account}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">臨時密碼</dt>
              <dd className="rounded bg-slate-100 px-2 py-1 font-mono text-sm select-all">
                {credential?.password}
              </dd>
            </div>
          </dl>
        </div>
      </Modal>
      <span className="hidden">{qs({})}</span>
    </div>
  );
}
