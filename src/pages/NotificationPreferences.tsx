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

type Channel = 'inapp' | 'email' | 'telegram';
type EventKind =
  | 'mention'
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_done'
  | 'task_cancelled'
  | 'deadline_reminder'
  | 'finance_alert'
  | 'mirai_feed'; // PRD §10.4 — MIRAI CMO feed posts (Elanlar)

const CHANNELS: Array<{ key: Channel; label: string; hint?: string }> = [
  { key: 'inapp', label: 'Tətbiqdə' },
  { key: 'email', label: 'Email' },
  { key: 'telegram', label: 'Telegram', hint: 'Bağlamaq üçün /telegram səhifəsi' },
];

const EVENTS: Array<{ key: EventKind; label: string; description?: string }> = [
  { key: 'mention', label: '@mention', description: 'Şərhlərdə adın çəkiləndə' },
  { key: 'task_assigned', label: 'Yeni tapşırıq', description: 'Sənə tapşırıq təyin olunduqda' },
  {
    key: 'task_status_changed',
    label: 'Status dəyişikliyi',
    description: 'Sənin tapşırıqlarının statusu hərəkətdə olduqda',
  },
  { key: 'task_done', label: 'Tapşırıq tamamlandı', description: 'Komandalı tapşırıqlar tamamlanıb' },
  { key: 'task_cancelled', label: 'Tapşırıq ləğv edildi' },
  { key: 'deadline_reminder', label: 'Deadline xəbərdarlıq', description: '3 gün / 1 gün / həmin gün' },
  {
    key: 'finance_alert',
    label: 'Maliyyə xəbərdarlığı',
    description: 'Yalnız adminlər üçün — Telegramda gizlədilmir',
  },
  {
    key: 'mirai_feed',
    label: 'MIRAI xəbər lenti',
    description: 'MIRAI CMO yeni arxitektura xəbərləri paylaşanda',
  },
];

type PrefRow = {
  user_id: string;
  channel: Channel;
  event_kind: EventKind;
  enabled: boolean;
};

/**
 * `embedded` skips the PageHead + outer `.card` so the component can be
 * dropped inside another page (Parametrlər → Bildirişlər tab) without
 * duplicating the page header or stacking cards. Standalone /tapşırıqlar?
 * No — it has its own route too (and renders with embedded=false). — S-27
 */
export function NotificationPreferencesPage({ embedded = false }: { embedded?: boolean } = {}) {
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
      for (const e of EVENTS) {
        const row = prefs.data.find((r) => r.channel === c.key && r.event_kind === e.key);
        next[`${c.key}:${e.key}`] = row ? row.enabled : true;
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

  function toggle(channel: Channel, event: EventKind) {
    const key = `${channel}:${event}`;
    const next = !(grid[key] ?? true);
    setGrid((g) => ({ ...g, [key]: next }));
    save.mutate({ channel, event, enabled: next });
  }

  // PRD §UX — bulk toggle every event for one channel column (e.g. mute Telegram)
  function toggleChannel(channel: Channel, enabled: boolean) {
    setGrid((g) => {
      const next = { ...g };
      for (const e of EVENTS) next[`${channel}:${e.key}`] = enabled;
      return next;
    });
    for (const e of EVENTS) save.mutate({ channel, event: e.key, enabled });
  }

  return (
    <>
      {embedded ? (
        // The Settings shell already provides the page header; just give
        // the same save-pending indicator a place to live.
        save.isPending ? (
          <p className="text-meta mb-2" style={{ color: 'var(--text-muted)' }}>
            Yadda saxlanılır…
          </p>
        ) : null
      ) : (
        <PageHead
          meta={profile?.full_name ?? profile?.email ?? '—'}
          title="Bildirişlər"
          actions={
            save.isPending ? (
              <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                Yadda saxlanılır…
              </span>
            ) : null
          }
        />
      )}

      <div
        className={`${embedded ? '' : 'card '}overflow-x-auto`}
        style={{ maxHeight: '70vh' }}
      >
        <table className="w-full text-body" style={{ minWidth: 520 }}>
          {/* PRD §UX — sticky header so column labels stay visible when scrolling */}
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th
                className="text-meta text-left py-3 pr-4"
                style={{
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Hadisə
              </th>
              {CHANNELS.map((c) => {
                // Channel is "all-on" if every event for that channel is true
                const allOn = EVENTS.every((e) => grid[`${c.key}:${e.key}`] ?? true);
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
                    {c.label}
                    {/* PRD §8.1 — surface link status for Telegram channel so users know
                        whether the toggles will actually do anything. */}
                    {c.key === 'telegram' ? (
                      <span
                        className="block text-meta"
                        style={{
                          color: profile?.telegram_chat_id ? 'var(--success-deep, #16794a)' : 'var(--warning, #c47d00)',
                          fontSize: 9,
                          textTransform: 'none',
                          letterSpacing: 'normal',
                          marginTop: 2,
                        }}
                      >
                        {profile?.telegram_chat_id ? '● bağlıdır' : '○ bağlı deyil'}
                      </span>
                    ) : null}
                    {/* PRD §UX — one-click mute/unmute the whole channel column */}
                    <button
                      type="button"
                      className="block mx-auto mt-1 hover:underline"
                      style={{
                        color: 'var(--brand-text)',
                        fontSize: 10,
                        textTransform: 'none',
                        letterSpacing: 'normal',
                      }}
                      onClick={() => toggleChannel(c.key, !allOn)}
                      title={allOn ? 'Bu kanalı tamamilə söndür' : 'Bu kanalı tamamilə aç'}
                    >
                      {allOn ? 'Hamısını söndür' : 'Hamısını aç'}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {EVENTS.map((e) => (
              <tr
                key={e.key}
                className="hover:bg-surface-mist transition-colors"
                style={{ borderBottom: '1px solid var(--line-soft)' }}
              >
                <td className="py-3 pr-4">
                  <div className="font-medium" style={{ color: 'var(--text)' }}>
                    {e.label}
                  </div>
                  {e.description ? (
                    <div
                      className="text-meta"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {e.description}
                    </div>
                  ) : null}
                </td>
                {CHANNELS.map((c) => {
                  const k = `${c.key}:${e.key}`;
                  const checked = grid[k] ?? true;
                  return (
                    <td key={c.key} className="py-3 px-4 text-center">
                      <label
                        className="inline-flex items-center cursor-pointer"
                        aria-label={`${e.label} — ${c.label}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(c.key, e.key)}
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
            ))}
          </tbody>
        </table>

        <p className="text-meta mt-4" style={{ color: 'var(--text-muted)' }}>
          Yeni hesablarda hər kanal aktivdir. Söndürmək seçimi yadda saxlanır;
          sonra notify-fanout cron-u həmin kanaldan ötürmür.
        </p>
      </div>
    </>
  );
}
