/**
 * Admin invitations panel — REQ-AUTH-02.
 * - Invite by email + role (POSTs /api/invitations/create)
 * - Lists pending invitations (RLS: invitations_admin_only)
 * - Revoke via expires_at = now()
 *
 * Re-invite handled server-side: /api/invitations/create upserts on email,
 * which automatically bumps expiry per the PRD edge case.
 */
import { FormEvent, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type Role = { id: string; key: string; name: string; level: number };
type Invitation = {
  id: string;
  email: string;
  role_id: string;
  expires_at: string;
  accepted_at: string | null;
  token: string;
};

async function authedFetch(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessiya tapılmadı.');
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function InvitationsPanel() {
  const qc = useQueryClient();
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async (): Promise<Role[]> =>
      ((await supabase.from('roles').select('*').order('level', { ascending: false })).data ?? []) as Role[],
  });
  const invites = useQuery({
    queryKey: ['invitations'],
    queryFn: async (): Promise<Invitation[]> =>
      ((await supabase
        .from('invitations')
        .select('*')
        .is('accepted_at', null)
        .order('expires_at', { ascending: true })).data ?? []) as Invitation[],
  });

  const create = useMutation({
    mutationFn: (input: { email: string; role_key: string }) =>
      authedFetch('/api/invitations/create', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invitations')
        .update({ expires_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  });

  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await create.mutateAsync({ email: email.trim().toLowerCase(), role_key: roleKey });
      setEmail('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-h3 mb-2">Yeni dəvətnamə</h3>
        <form onSubmit={onSubmit} className="flex flex-wrap gap-2 items-start">
          <input
            type="email"
            required
            placeholder="email@stüdiya.az"
            className="input"
            style={{ minWidth: 260 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            required
            className="input"
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">Rol seç…</option>
            {(roles.data ?? []).map((r) => (
              <option key={r.id} value={r.key}>{r.name}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={create.isPending || !roleKey}>
            {create.isPending ? 'Göndərilir…' : 'Dəvət göndər'}
          </button>
          {err ? <p className="text-meta self-center" style={{ color: '#B91C1C' }}>{err}</p> : null}
        </form>
        <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
          Link 48 saat etibarlıdır. Eyni email üçün təkrar dəvət müddəti uzadır.
        </p>
      </div>

      <div>
        <h3 className="text-h3 mb-2">Gözləyən dəvətnamələr</h3>
        {invites.isLoading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</p>
        ) : (invites.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Aktiv dəvətnamə yoxdur.</p>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Email', 'Müddət', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 px-3 text-meta"
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(invites.data ?? []).map((i) => {
                const expired = new Date(i.expires_at).getTime() < Date.now();
                return (
                  <tr key={i.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-2 px-3">{i.email}</td>
                    <td className="py-2 px-3 text-meta" style={{ color: expired ? '#B91C1C' : 'var(--text-soft)' }}>
                      {expired ? 'Müddəti bitib' : new Date(i.expires_at).toLocaleString('az-Latn-AZ')}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {!expired ? (
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ height: 32, padding: '0 12px' }}
                          onClick={() => revoke.mutate(i.id)}
                          disabled={revoke.isPending}
                        >
                          Ləğv et
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
