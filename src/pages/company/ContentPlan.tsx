/**
 * Məzmun Planlaması — PRD §9.3 / US-CONTENT-01.
 *
 * Admin-only kanban over content_plans.status: idea / draft / review /
 * published. Click a card → side panel with edit. "+ Post" creates an
 * idea-status row.
 *
 * Out of scope (logged): the "deadline reminder 2 days before
 * scheduled_at" half of US-CONTENT-01 — lands in
 * /api/cron/telegram-reminders alongside task deadlines.
 */
import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { supabase } from '@/lib/supabase';
import { ValidationError } from '@/lib/finance';
import {
  CONTENT_CHANNEL_LABEL,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_ORDER,
  type ContentChannel,
  type ContentPlan,
  type ContentStatus,
  useContentPlans,
  useCreateContentPlan,
  useDeleteContentPlan,
  useUpdateContentPlan,
} from '@/lib/contentPlan';
import type { Profile } from '@/types/db';

const CHANNELS: ContentChannel[] = [
  'instagram', 'linkedin', 'facebook', 'website', 'newsletter', 'other',
];

export function ContentPlanPage() {
  const plans = useContentPlans();
  const [open, setOpen] = useState<null | 'create' | { editing: ContentPlan }>(null);
  const update = useUpdateContentPlan();

  const grouped: Record<ContentStatus, ContentPlan[]> = {
    idea: [], draft: [], review: [], published: [],
  };
  for (const p of plans.data ?? []) grouped[p.status].push(p);

  return (
    <>
      <PageHead
        meta="MIRAI CMO + manual"
        title="Məzmun Planlaması"
        actions={<button className="btn-primary" onClick={() => setOpen('create')}>+ Məzmun postu</button>}
      />

      {plans.isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : (plans.data ?? []).length === 0 ? (
        <EmptyState
          title="Məzmun cədvəli boşdur"
          body="İlk postu yarat — Idea → Draft → Review → Published axını ilə hərəkət etdir."
          cta={<button className="btn-primary" onClick={() => setOpen('create')}>+ Məzmun postu</button>}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {CONTENT_STATUS_ORDER.map((s) => (
            <div key={s} className="rounded-card p-3" style={{ border: '1px dashed var(--line)' }}>
              <h3
                className="text-tiny uppercase mb-3 tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                {CONTENT_STATUS_LABEL[s]} · {grouped[s].length}
              </h3>
              <div className="space-y-2">
                {grouped[s].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="card text-left w-full"
                    style={{ padding: 12 }}
                    onClick={() => setOpen({ editing: p })}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-body truncate">{p.topic}</span>
                      <span
                        className="text-tiny shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {CONTENT_CHANNEL_LABEL[p.channel]}
                      </span>
                    </div>
                    {p.scheduled_at ? (
                      <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
                        {new Date(p.scheduled_at).toLocaleDateString('az-Latn-AZ', {
                          month: 'short', day: 'numeric',
                        })}
                      </div>
                    ) : null}
                    {/* Status quick-advance: forward + back, admin-only via RLS */}
                    <div className="flex gap-1 mt-2">
                      {CONTENT_STATUS_ORDER.map((next) =>
                        next === p.status ? null : (
                          <button
                            key={next}
                            type="button"
                            className="text-tiny px-2 h-[22px] leading-[22px] rounded-chip"
                            style={{
                              background: 'rgba(255,255,255,0.04)',
                              color: 'var(--text-muted)',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              update.mutate({ id: p.id, status: next });
                            }}
                          >
                            → {CONTENT_STATUS_LABEL[next]}
                          </button>
                        ),
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {open === 'create' ? (
        <PlanModal mode="create" onClose={() => setOpen(null)} />
      ) : open && 'editing' in open ? (
        <PlanModal mode="edit" plan={open.editing} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function PlanModal({
  mode,
  plan,
  onClose,
}: {
  mode: 'create' | 'edit';
  plan?: ContentPlan;
  onClose: () => void;
}) {
  const create = useCreateContentPlan();
  const update = useUpdateContentPlan();
  const del = useDeleteContentPlan();
  const [err, setErr] = useState<string | null>(null);

  const profiles = useQuery({
    queryKey: ['profiles', 'active'],
    queryFn: async (): Promise<Profile[]> =>
      ((await supabase.from('profiles').select('*').eq('is_active', true)).data ?? []) as Profile[],
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      const channel = f.get('channel') as ContentChannel;
      const topic = String(f.get('topic') ?? '');
      const scheduled = (f.get('scheduled_at') as string) || null;
      const owner_id = (f.get('owner_id') as string) || null;
      const status = (f.get('status') as ContentStatus) || 'idea';
      const body = (f.get('body') as string) || null;
      const scheduled_at = scheduled ? new Date(scheduled + 'T09:00:00').toISOString() : null;

      if (mode === 'create') {
        await create.mutateAsync({ channel, topic, scheduled_at, owner_id, status, body });
      } else if (plan) {
        await update.mutateAsync({
          id: plan.id, channel, topic, scheduled_at, owner_id, status, body,
        });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title={mode === 'create' ? '+ Məzmun postu' : plan?.topic ?? 'Post'} onClose={onClose} width={520}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Mövzu *">
          <input
            name="topic"
            type="text"
            required
            autoFocus
            className="input"
            defaultValue={plan?.topic}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kanal *">
            <select name="channel" required className="input" defaultValue={plan?.channel ?? 'instagram'}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>{CONTENT_CHANNEL_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" className="input" defaultValue={plan?.status ?? 'idea'}>
              {CONTENT_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tarix">
            <input
              name="scheduled_at"
              type="date"
              className="input"
              defaultValue={plan?.scheduled_at ? plan.scheduled_at.slice(0, 10) : ''}
            />
          </Field>
          <Field label="Sahibi">
            <select name="owner_id" className="input" defaultValue={plan?.owner_id ?? ''}>
              <option value="">—</option>
              {(profiles.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Mətn">
          <textarea
            name="body"
            className="input"
            style={{ height: 120, padding: 12 }}
            defaultValue={plan?.body ?? ''}
          />
        </Field>

        {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}

        <div className="flex justify-between gap-2 pt-2">
          {mode === 'edit' && plan ? (
            <button
              type="button"
              className="btn-ghost"
              style={{ color: '#B91C1C' }}
              onClick={() => {
                if (confirm('Bu post silinsin?')) {
                  del.mutate(plan.id);
                  onClose();
                }
              }}
            >
              Sil
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Ləğv</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={create.isPending || update.isPending}
            >
              {(create.isPending || update.isPending) ? 'Saxlanılır…' : 'Saxla'}
            </button>
          </div>
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
