/**
 * Edit an existing project — slice 122.
 *
 * Mirrors ProjectCreateModal but takes a `project` row, pre-fills the
 * form, and writes via .update() instead of .insert(). Also exposes
 * the `status` enum picker (active/on_hold/closed/cancelled) which the
 * create flow doesn't surface — new projects always start as 'active'.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import type { Project, ProjectStatus } from '@/types/db';

const STATUS_OPTIONS: ProjectStatus[] = ['active', 'on_hold', 'closed', 'cancelled'];

type Props = { project: Project; onClose: () => void };

export function ProjectEditModal({ project, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();

  const clients = useQuery({
    queryKey: ['project-modal', 'clients'],
    queryFn: async () =>
      (await supabase.from('clients').select('id, name').order('name')).data ?? [],
  });

  const [name, setName] = useState(project.name);
  const [clientId, setClientId] = useState(project.client_id ?? '');
  const [phasesText, setPhasesText] = useState((project.phases ?? []).join(', '));
  const [startDate, setStartDate] = useState(project.start_date ?? '');
  const [deadline, setDeadline] = useState(project.deadline ?? '');
  const [requiresExpertise, setRequiresExpertise] = useState(!!project.requires_expertise);
  const [expertiseDeadline, setExpertiseDeadline] = useState(project.expertise_deadline ?? '');
  const [paymentBuffer, setPaymentBuffer] = useState(String(project.payment_buffer_days ?? 10));
  const [status, setStatus] = useState<ProjectStatus>(project.status);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('projects.create.name_required'));
      const phases = phasesText
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const buffer = Number(paymentBuffer);
      const { error } = await supabase
        .from('projects')
        .update({
          name: name.trim(),
          client_id: clientId || null,
          phases,
          start_date: startDate || null,
          deadline: deadline || null,
          requires_expertise: requiresExpertise,
          expertise_deadline: requiresExpertise ? expertiseDeadline || null : null,
          payment_buffer_days:
            Number.isFinite(buffer) && buffer >= 0 ? Math.round(buffer) : 10,
          status,
        })
        .eq('id', project.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      onClose();
    },
    onError: (e) => {
      toast.error((e as Error).message);
    },
  });

  return (
    <div
      role="dialog"
      aria-label={t('projects.edit.dialog_label')}
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
        <h2 className="text-h2">{t('projects.edit.title')}</h2>

        <div className="mt-4 space-y-3">
          <Field label={t('projects.create.name')} required>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('projects.create.client')}>
              <select
                className="input"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">{t('projects.create.client_none')}</option>
                {(clients.data ?? []).map((c: { id: string; name: string }) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('projects.edit.status')}>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {t(`projects.status.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={t('projects.create.phases')}>
            <input
              className="input"
              value={phasesText}
              onChange={(e) => setPhasesText(e.target.value)}
              placeholder={t('projects.create.phases_placeholder')}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('projects.create.start_date')}>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label={t('projects.create.deadline')}>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={startDate || undefined}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={requiresExpertise}
              onChange={(e) => setRequiresExpertise(e.target.checked)}
            />
            {t('projects.create.requires_expertise')}
          </label>

          {requiresExpertise ? (
            <Field label={t('projects.create.expertise_deadline')}>
              <input
                type="date"
                className="input"
                value={expertiseDeadline}
                onChange={(e) => setExpertiseDeadline(e.target.value)}
              />
            </Field>
          ) : null}

          <Field label={t('projects.create.payment_buffer')}>
            <input
              type="number"
              min={0}
              step={1}
              className="input"
              value={paymentBuffer}
              onChange={(e) => setPaymentBuffer(e.target.value)}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            disabled={save.isPending}
          >
            {t('common.back')}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !name}>
            {save.isPending ? t('projects.edit.saving') : t('projects.edit.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
        {required ? <span style={{ color: 'var(--state-error)' }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}
