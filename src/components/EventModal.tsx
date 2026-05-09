/**
 * Calendar event create/edit (PRD §8.2). Insert via Supabase; Meet button
 * spawns meet.new in a new tab and pastes the URL into the form (manual
 * paste — v2 swaps for Google OAuth + Meet API per spec).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type Props = {
  initial?: Partial<{
    title: string;
    starts_at: string;
    ends_at: string;
    all_day: boolean;
    location: string;
    meet_url: string;
    description: string;
  }>;
  onClose: () => void;
};

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString().slice(0, 16);
}

function defaultEnd(start: string): string {
  const d = new Date(start);
  d.setHours(d.getHours() + 1);
  return d.toISOString().slice(0, 16);
}

export function EventModal({ initial, onClose }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [start, setStart] = useState(initial?.starts_at ?? defaultStart());
  const [end, setEnd] = useState(initial?.ends_at ?? defaultEnd(initial?.starts_at ?? defaultStart()));
  const [location, setLocation] = useState(initial?.location ?? '');
  const [meetUrl, setMeetUrl] = useState(initial?.meet_url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [externalEmails, setExternalEmails] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      if (!start || !end) throw new Error('Başlama/bitiş tarixi tələb olunur');
      if (new Date(end) < new Date(start)) throw new Error('Bitiş başlanğıcdan əvvəl ola bilməz');

      const emails = externalEmails
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const { error } = await supabase.from('calendar_events').insert({
        title: title.trim(),
        description: description.trim() || null,
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        all_day: allDay,
        location: location || null,
        meet_url: meetUrl || null,
        external_emails: emails,
        organizer_id: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['calendar', 'upcoming'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni görüş"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">+ Görüş</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Başlıq
            </span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <span className="text-body">Bütün gün</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Başlama
              </span>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                className="input"
                value={allDay ? start.slice(0, 10) : start.slice(0, 16)}
                onChange={(e) => setStart(allDay ? e.target.value : e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Bitiş
              </span>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                className="input"
                value={allDay ? end.slice(0, 10) : end.slice(0, 16)}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Yer
            </span>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ofis, otaq, ünvan…"
            />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Meet linki
            </span>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={meetUrl}
                onChange={(e) => setMeetUrl(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
              <a
                href="https://meet.new"
                target="_blank"
                rel="noreferrer noopener"
                className="btn-outline shrink-0"
              >
                meet.new ↗
              </a>
            </div>
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Xarici iştirakçılar (vergüllə)
            </span>
            <input
              className="input"
              value={externalEmails}
              onChange={(e) => setExternalEmails(e.target.value)}
              placeholder="aksent@firma.az, ext@..."
            />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Təsvir
            </span>
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ minHeight: 88, padding: '12px 14px' }}
            />
          </label>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !title}>
            {save.isPending ? 'Yadda saxlanılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}
