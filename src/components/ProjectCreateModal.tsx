/**
 * Project create modal — REQ-PROJ-01.
 * Inserts into `projects` with phases parsed from a comma list and an
 * optional expertise toggle. RLS in 0002 restricts insert to admin /
 * Level 1; the modal is only mounted from /layihelər which the parent
 * layout already guards. Final validation lives at the DB CHECK on
 * project_status (enum).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useT } from '@/lib/i18n';

type Props = { onClose: () => void };

export function ProjectCreateModal({ onClose }: Props) {
  const t = useT();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const clients = useQuery({
    queryKey: ['project-modal', 'clients'],
    queryFn: async () =>
      (await supabase.from('clients').select('id, name').order('name')).data ?? [],
  });

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [phasesText, setPhasesText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [requiresExpertise, setRequiresExpertise] = useState(false);
  const [expertiseDeadline, setExpertiseDeadline] = useState('');
  const [paymentBuffer, setPaymentBuffer] = useState('10');

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('projects.create.name_required'));
      const phases = phasesText
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const buffer = Number(paymentBuffer);
      const { error } = await supabase.from('projects').insert({
        name: name.trim(),
        client_id: clientId || null,
        phases,
        start_date: startDate || null,
        deadline: deadline || null,
        requires_expertise: requiresExpertise,
        expertise_deadline: requiresExpertise ? expertiseDeadline || null : null,
        payment_buffer_days: Number.isFinite(buffer) && buffer >= 0 ? Math.round(buffer) : 10,
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label={t('projects.create.dialog_label')}
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
        <h2 className="text-h2">{t('projects.create.title')}</h2>

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

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

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
            {save.isPending ? t('projects.create.saving') : t('projects.create.submit')}
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
