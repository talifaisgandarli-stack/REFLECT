/**
 * Notification preferences — PRD §10.4.
 *
 * Per-user, per-channel × per-event toggle grid. Default is enabled (PRD
 * says users opt out, not in); rows are upserted on toggle. RLS scopes
 * to auth.uid() so we never have to filter by user_id client-side.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

const CHANNELS = [
  { key: 'in_app', label: 'Tətbiqdə' },
  { key: 'email', label: 'Email' },
  { key: 'telegram', label: 'Telegram' },
] as const;

const EVENTS = [
  { key: 'task_deadline',      label: 'Tapşırıq deadline-ları' },
  { key: 'mention',            label: 'Mention-lar' },
  { key: 'task_status_change', label: 'Tapşırıq status dəyişiklikləri' },
  { key: 'finance_alert',      label: 'Maliyyə xəbərdarlıqları (admin)' },
  { key: 'mirai_feed',         label: 'MIRAI feed' },
] as const;

type Channel = (typeof CHANNELS)[number]['key'];
type Event = (typeof EVENTS)[number]['key'];
type Row = { channel: Channel; event_kind: Event; enabled: boolean };

export function NotificationPrefsPanel() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const prefs = useQuery({
    queryKey: ['notification_preferences', profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('channel, event_kind, enabled');
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: { channel: Channel; event_kind: Event; enabled: boolean }) => {
      if (!profile?.id) throw new Error('No profile');
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: profile.id,
            channel: input.channel,
            event_kind: input.event_kind,
            enabled: input.enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,channel,event_kind' },
        );
      if (error) throw error;
    },
    onMutate: async (input) => {
      // Optimistic flip.
      await qc.cancelQueries({ queryKey: ['notification_preferences'] });
      const prev = qc.getQueryData<Row[]>(['notification_preferences', profile?.id]);
      qc.setQueryData<Row[]>(['notification_preferences', profile?.id], (old) => {
        const next = (old ?? []).slice();
        const idx = next.findIndex(
          (r) => r.channel === input.channel && r.event_kind === input.event_kind,
        );
        if (idx >= 0) next[idx] = { ...next[idx], enabled: input.enabled };
        else next.push({ channel: input.channel, event_kind: input.event_kind, enabled: input.enabled });
        return next;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notification_preferences', profile?.id], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notification_preferences'] }),
  });

  function isEnabled(c: Channel, e: Event): boolean {
    const row = (prefs.data ?? []).find((r) => r.channel === c && r.event_kind === e);
    // PRD §10.4: default-on. Missing row = enabled.
    return row ? row.enabled : true;
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-h3">Bildirişlər</h3>
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Standart olaraq hamısı açıqdır. Söndürmək istədiyini sönd.
        </p>
      </div>
      <div className="overflow-x-auto" style={{ marginLeft: -16, marginRight: -16 }}>
        <table className="w-full text-body" style={{ minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th
                className="text-left py-2 px-4 text-meta"
                style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Hadisə
              </th>
              {CHANNELS.map((c) => (
                <th
                  key={c.key}
                  className="text-center py-2 px-4 text-meta"
                  style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((e) => (
              <tr key={e.key} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-2 px-4">{e.label}</td>
                {CHANNELS.map((c) => (
                  <td key={c.key} className="text-center py-2 px-4">
                    <input
                      type="checkbox"
                      checked={isEnabled(c.key, e.key)}
                      onChange={(ev) =>
                        upsert.mutate({
                          channel: c.key,
                          event_kind: e.key,
                          enabled: ev.target.checked,
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
