/**
 * Personal notification preferences (PRD §10.4).
 *
 * Matrix of channel × event_kind toggles. Every cell is opt-out by default
 * (notif_enabled() in 0007 returns true when no row exists), so a fresh
 * user sees every checkbox checked. Saving writes a single upsert per cell.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { useT } from '@/lib/i18n';

type Channel = 'inapp' | 'email' | 'telegram';
type EventKind =
  | 'mention'
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_done'
  | 'task_cancelled'
  | 'deadline_reminder'
  | 'finance_alert'
  | 'calendar_event_rsvp';

const CHANNELS: Array<{ key: Channel; labelKey: string }> = [
  { key: 'inapp', labelKey: 'notif.channel.inapp' },
  { key: 'email', labelKey: 'notif.channel.email' },
  { key: 'telegram', labelKey: 'notif.channel.telegram' },
];

const EVENT_KINDS: EventKind[] = [
  'mention',
  'task_assigned',
  'task_status_changed',
  'task_done',
  'task_cancelled',
  'deadline_reminder',
  'finance_alert',
  'calendar_event_rsvp',
];

type PrefRow = {
  user_id: string;
  channel: Channel;
  event_kind: EventKind;
  enabled: boolean;
};

export function NotificationPreferencesPage() {
  const t = useT();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [grid, setGrid] = useState<Record<string, boolean>>({});

  const prefs = useQuery({
    queryKey: ['notification-preferences', profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<PrefRow[]> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('user_id, channel, event_kind, enabled')
        .eq('user_id', profile!.id);
      if (error) throw error;
      return (data ?? []) as PrefRow[];
    },
  });

  useEffect(() => {
    if (!prefs.data) return;
    const next: Record<string, boolean> = {};
    for (const c of CHANNELS) {
      for (const kind of EVENT_KINDS) {
        const row = prefs.data.find((r) => r.channel === c.key && r.event_kind === kind);
        next[`${c.key}:${kind}`] = row ? row.enabled : true;
      }
    }
    setGrid(next);
  }, [prefs.data]);

  const save = useMutation({
    mutationFn: async (input: { channel: Channel; event: EventKind; enabled: boolean }) => {
      if (!profile?.id) throw new Error('Profile not ready');
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: profile.id,
            channel: input.channel,
            event_kind: input.event,
            enabled: input.enabled,
          },
          { onConflict: 'user_id,channel,event_kind' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });

  const bulkChannel = useMutation({
    mutationFn: async (input: { channel: Channel; enabled: boolean }) => {
      if (!profile?.id) throw new Error('Profile not ready');
      const rows = EVENT_KINDS.map((kind) => ({
        user_id: profile.id,
        channel: input.channel,
        event_kind: kind,
        enabled: input.enabled,
      }));
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(rows, { onConflict: 'user_id,channel,event_kind' });
      if (error) throw error;
      // Optimistic local update so the UI reflects instantly.
      setGrid((prev) => {
        const next = { ...prev };
        for (const kind of EVENT_KINDS) next[`${input.channel}:${kind}`] = input.enabled;
        return next;
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });

  function toggle(channel: Channel, event: EventKind) {
    const key = `${channel}:${event}`;
    const next = !(grid[key] ?? true);
    setGrid((g) => ({ ...g, [key]: next }));
    save.mutate({ channel, event, enabled: next });
  }

  function channelAllChecked(channel: Channel): boolean {
    return EVENT_KINDS.every((kind) => (grid[`${channel}:${kind}`] ?? true));
  }

  return (
    <>
      <PageHead
        meta={profile?.full_name ?? profile?.email ?? '—'}
        title={t('notif.title')}
        actions={
          save.isPending ? (
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {t('notif.saving')}
            </span>
          ) : null
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-body" style={{ minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th
                className="text-meta text-left py-3 pr-4"
                style={{
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {t('notif.col.event')}
              </th>
              {CHANNELS.map((c) => {
                const allOn = channelAllChecked(c.key);
                return (
                  <th
                    key={c.key}
                    className="text-meta text-center py-3 px-4"
                    style={{
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span>{t(c.labelKey)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          bulkChannel.mutate({ channel: c.key, enabled: !allOn })
                        }
                        disabled={bulkChannel.isPending || !profile?.id}
                        className="text-tiny"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--line)',
                          padding: '2px 8px',
                          borderRadius: 6,
                          color: 'var(--text-soft)',
                          cursor: 'pointer',
                          textTransform: 'none',
                          letterSpacing: 0,
                        }}
                        aria-label={
                          allOn
                            ? t('notif.bulk.all_off_aria', { channel: t(c.labelKey) })
                            : t('notif.bulk.all_on_aria', { channel: t(c.labelKey) })
                        }
                      >
                        {allOn ? t('notif.bulk.all_off') : t('notif.bulk.all_on')}
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {EVENT_KINDS.map((kind) => {
              const eventLabel = t(`notif.event.${kind}.label`);
              const eventDesc = t(`notif.event.${kind}.desc`);
              return (
                <tr key={kind} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 pr-4">
                    <div className="font-medium" style={{ color: 'var(--text)' }}>
                      {eventLabel}
                    </div>
                    {eventDesc ? (
                      <div
                        className="text-meta"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {eventDesc}
                      </div>
                    ) : null}
                  </td>
                  {CHANNELS.map((c) => {
                    const k = `${c.key}:${kind}`;
                    const checked = grid[k] ?? true;
                    return (
                      <td key={c.key} className="py-3 px-4 text-center">
                        <label
                          className="inline-flex items-center cursor-pointer"
                          aria-label={`${eventLabel} — ${t(c.labelKey)}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(c.key, kind)}
                            disabled={!profile?.id || prefs.isLoading}
                            className="sr-only peer"
                          />
                        <span
                          aria-hidden
                          className="inline-block w-10 h-6 rounded-full relative transition-colors"
                          style={{
                            background: checked
                              ? 'var(--brand-action)'
                              : 'var(--surface-mist)',
                            border: `1px solid ${checked ? 'var(--brand-action-hover)' : 'var(--line)'}`,
                          }}
                        >
                          <span
                            className="absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full transition-transform"
                            style={{
                              background: 'var(--surface)',
                              transform: checked ? 'translateX(16px)' : 'translateX(0)',
                              boxShadow: '0 1px 2px rgba(14,22,17,0.2)',
                            }}
                          />
                                  </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="text-meta mt-4" style={{ color: 'var(--text-muted)' }}>
          {t('notif.opt_out_note')}
        </p>
      </div>
    </>
  );
}
