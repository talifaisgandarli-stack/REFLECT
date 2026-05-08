/**
 * Calendar event create modal — US-CAL-01 + US-CAL-02.
 *
 * Recurrence: minimal subset (None/Daily/Weekly/Monthly + UNTIL date). Full
 * RFC 5545 round-tripping is supported in storage but the picker stays simple
 * per PRD §3 product principle "speed over completeness".
 */
import { FormEvent, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useCreateEvent } from '@/lib/calendar';
import { ValidationError } from '@/lib/finance';
import { useProjects } from '@/lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/db';

type Props = { onClose: () => void; defaultStart?: Date };

const FREQ = [
  { v: '', label: 'Təkrarsız' },
  { v: 'DAILY', label: 'Hər gün' },
  { v: 'WEEKLY', label: 'Hər həftə' },
  { v: 'MONTHLY', label: 'Hər ay' },
] as const;

export function EventModal({ onClose, defaultStart }: Props) {
  const projects = useProjects();
  const profiles = useQuery({
    queryKey: ['profiles', 'active'],
    queryFn: async (): Promise<Profile[]> =>
      ((await supabase.from('profiles').select('*').eq('is_active', true)).data ?? []) as Profile[],
  });

  const create = useCreateEvent();

  const startDefault = (defaultStart ?? new Date()).toISOString().slice(0, 16);
  const endDefault = new Date(
    (defaultStart ? defaultStart.getTime() : Date.now()) + 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 16);

  const [allDay, setAllDay] = useState(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [externals, setExternals] = useState('');
  const [meetUrl, setMeetUrl] = useState('');
  const [freq, setFreq] = useState<'' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('');
  const [until, setUntil] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function toggleAttendee(id: string) {
    setAttendees((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  // US-CAL-02: open meet.new in a new tab; user pastes URL back here.
  function openMeet() {
    window.open('https://meet.new', '_blank', 'noopener,noreferrer');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);

    const startsRaw = String(f.get('starts_at'));
    const endsRaw = String(f.get('ends_at'));
    const starts_at = allDay
      ? new Date(startsRaw + 'T00:00:00Z').toISOString()
      : new Date(startsRaw).toISOString();
    const ends_at = allDay
      ? new Date(endsRaw + 'T23:59:59Z').toISOString()
      : new Date(endsRaw).toISOString();

    let recurrence_rule: string | null = null;
    if (freq) {
      recurrence_rule = `FREQ=${freq}`;
      if (until) {
        const u = until.replace(/-/g, '') + 'T235959Z';
        recurrence_rule += `;UNTIL=${u}`;
      }
    }

    const externalEmails = externals
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await create.mutateAsync({
        title: String(f.get('title') ?? ''),
        description: (f.get('description') as string) || null,
        starts_at,
        ends_at,
        all_day: allDay,
        recurrence_rule,
        location: (f.get('location') as string) || null,
        meet_url: meetUrl || null,
        attendees,
        external_emails: externalEmails,
        project_id: (f.get('project_id') as string) || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  // Update end-date to match start when user toggles all_day so the date
  // pickers stay coherent.
  useEffect(() => {
    // intentionally empty — defaultValue keys re-mount on allDay toggle.
  }, [allDay]);

  return (
    <Modal title="+ Yeni hadisə" onClose={onClose} width={620}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Başlıq *">
          <input name="title" type="text" required autoFocus className="input" />
        </Field>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          <span className="text-body">Bütün gün</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlama *">
            <input
              key={`s-${allDay}`}
              name="starts_at"
              type={allDay ? 'date' : 'datetime-local'}
              required
              defaultValue={allDay ? startDefault.slice(0, 10) : startDefault}
              className="input"
            />
          </Field>
          <Field label="Bitmə *">
            <input
              key={`e-${allDay}`}
              name="ends_at"
              type={allDay ? 'date' : 'datetime-local'}
              required
              defaultValue={allDay ? endDefault.slice(0, 10) : endDefault}
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Təkrar">
            <select
              className="input"
              value={freq}
              onChange={(e) => setFreq(e.target.value as typeof freq)}
            >
              {FREQ.map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </select>
          </Field>
          {freq ? (
            <Field label="Son tarix (UNTIL)">
              <input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="input"
              />
            </Field>
          ) : <div />}
        </div>

        <Field label="Yer">
          <input name="location" type="text" className="input" />
        </Field>

        <Field label="Görüş linki (Meet)">
          <div className="flex gap-2">
            <input
              type="url"
              className="input flex-1"
              placeholder="https://meet.google.com/..."
              value={meetUrl}
              onChange={(e) => setMeetUrl(e.target.value)}
            />
            <button type="button" className="btn-outline" onClick={openMeet} style={{ whiteSpace: 'nowrap' }}>
              Meet yarat
            </button>
          </div>
        </Field>

        <Field label="Daxili iştirakçılar">
          <div className="flex flex-wrap gap-2 mt-1">
            {(profiles.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip ${attendees.includes(p.id) ? 'chip-brand' : ''}`}
                onClick={() => toggleAttendee(p.id)}
              >
                {p.full_name ?? p.email}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Xarici email-lər (vergüllə ayır)">
          <textarea
            className="input"
            style={{ height: 60, padding: 10 }}
            placeholder="müştəri@example.com, partnyor@example.com"
            value={externals}
            onChange={(e) => setExternals(e.target.value)}
          />
        </Field>

        <Field label="Layihə (istəyə bağlı)">
          <select name="project_id" className="input" defaultValue="">
            <option value="">—</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Təsvir">
          <textarea name="description" className="input" style={{ height: 80, padding: 12 }} />
        </Field>

        {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>
            Ləğv et
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Saxlanılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
