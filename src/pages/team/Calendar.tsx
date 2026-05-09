/**
 * Calendar — PRD §8.5 + §8 integrations.
 * Month / Week / Day views (list rendering for v1; full grid v1.5).
 * Insert calendar_events row on submit; .ics email invite v1.5.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/lib/store';

type Event = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  meet_url: string | null;
  organizer_id: string | null;
};

export function CalendarPage() {
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [open, setOpen] = useState(false);
  const events = useQuery({
    queryKey: ['calendar'],
    queryFn: async () =>
      ((
        await supabase
          .from('calendar_events')
          .select('*')
          .order('starts_at', { ascending: true })
          .limit(100)
      ).data ?? []) as Event[],
  });

  return (
    <>
      <PageHead
        meta="Asia/Baku"
        title="Təqvim"
        actions={
          <>
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                className={`chip ${view === v ? 'chip-brand' : ''}`}
                onClick={() => setView(v)}
              >
                {v === 'month' ? 'Ay' : v === 'week' ? 'Həftə' : 'Gün'}
              </button>
            ))}
            <button className="btn-primary" onClick={() => setOpen(true)}>
              + Görüş
            </button>
          </>
        }
      />
      <div className="card">
        {(events.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Yaxınlaşan görüş yoxdur.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {(events.data ?? []).map((e) => (
              <li
                key={e.id}
                className="py-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{e.title}</div>
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {e.location ?? '—'}
                    {e.meet_url ? (
                      <>
                        {' · '}
                        <a
                          href={e.meet_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--brand-text)' }}
                        >
                          Meet
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(e.starts_at, { hour: '2-digit', minute: '2-digit' })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open ? <EventCreateModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function EventCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(toLocal(now));
  const [endsAt, setEndsAt] = useState(toLocal(in1h));
  const [location, setLocation] = useState('');
  const [meetUrl, setMeetUrl] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      if (!session?.userId) throw new Error('No session');
      const { error } = await supabase.from('calendar_events').insert({
        title,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        location: location || null,
        meet_url: meetUrl || null,
        organizer_id: session.userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="card max-w-md w-full space-y-3">
        <h3 className="text-h3">Yeni görüş</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Başlıq
          </span>
          <input
            className="input mt-1 w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Başlama
            </span>
            <input
              type="datetime-local"
              className="input mt-1 w-full"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Bitmə
            </span>
            <input
              type="datetime-local"
              className="input mt-1 w-full"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Məkan
          </span>
          <input
            className="input mt-1 w-full"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Meet linki
          </span>
          <input
            className="input mt-1 w-full"
            value={meetUrl}
            onChange={(e) => setMeetUrl(e.target.value)}
            placeholder="https://meet.new"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!title || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Yarat'}
          </button>
        </div>
      </div>
    </div>
  );
}

function toLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
