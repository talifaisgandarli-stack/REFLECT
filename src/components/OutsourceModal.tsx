/**
 * Outsource sifarişi yarat — admin yalnız (REQ-FIN-07).
 * RLS-də outsource_items admin-only-write olduğuna görə insert təhlükəsizdir;
 * user görünüş (outsource_user_view) sırf SELECT-dir.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type Props = { onClose: () => void };

export function OutsourceModal({ onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();

  const projects = useQuery({
    queryKey: ['outsource-modal', 'projects'],
    queryFn: async () =>
      (await supabase.from('projects').select('id, name').is('archived_at', null).order('name'))
        .data ?? [],
  });
  const profiles = useQuery({
    queryKey: ['outsource-modal', 'profiles'],
    queryFn: async () =>
      (await supabase.from('profiles').select('id, full_name, email').order('full_name')).data ?? [],
  });

  const [workTitle, setWorkTitle] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [projectId, setProjectId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!workTitle.trim()) throw new Error(t('outsource.modal.work_title_required'));
      const n = amount ? Number(amount.replace(',', '.')) : null;
      if (n != null && (!Number.isFinite(n) || n <= 0)) {
        throw new Error(t('outsource.modal.amount_invalid'));
      }
      const { error } = await supabase.from('outsource_items').insert({
        work_title: workTitle.trim(),
        contact_person: contactPerson || null,
        contact_company: contactCompany || null,
        amount: n,
        deadline: deadline || null,
        project_id: projectId || null,
        responsible_user_id: responsibleId || null,
        status: 'order',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outsource'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label={t('outsource.modal.dialog_label')}
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
        <h2 className="text-h2">{t('outsource.modal.title')}</h2>

        <div className="mt-4 space-y-3">
          <Field label={t('outsource.modal.work_title')} required>
            <input
              className="input"
              value={workTitle}
              onChange={(e) => setWorkTitle(e.target.value)}
              autoFocus
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('outsource.modal.contact_person')}>
              <input
                className="input"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </Field>
            <Field label={t('outsource.modal.contact_company')}>
              <input
                className="input"
                value={contactCompany}
                onChange={(e) => setContactCompany(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('outsource.modal.amount')}>
              <input
                type="text"
                inputMode="decimal"
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </Field>
            <Field label={t('outsource.modal.deadline')}>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
          </div>

          <Field label={t('outsource.modal.project')}>
            <select
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">{t('outsource.modal.project_none')}</option>
              {(projects.data ?? []).map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('outsource.modal.responsible')}>
            <select
              className="input"
              value={responsibleId}
              onChange={(e) => setResponsibleId(e.target.value)}
            >
              <option value="">{t('outsource.modal.responsible_none')}</option>
              {(profiles.data ?? []).map(
                (p: { id: string; full_name: string | null; email: string }) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ),
              )}
            </select>
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
          <button
            type="submit"
            className="btn-primary"
            disabled={save.isPending || !workTitle.trim()}
          >
            {save.isPending ? t('outsource.modal.saving') : t('outsource.modal.submit')}
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
