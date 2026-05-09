/**
 * Müştəri yarat — REQ-CRM. Inserts into clients with confidence_pct
 * derived from the chosen stage (REQ-CRM-02 confidence map).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useT } from '@/lib/i18n';
import {
  CLIENT_STAGE_CONFIDENCE,
  CLIENT_STAGE_ORDER,
} from '@/lib/labels';
import type { ClientPipelineStage } from '@/types/db';

type Props = { onClose: () => void };

export function ClientCreateModal({ onClose }: Props) {
  const t = useT();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState<ClientPipelineStage>('lead');
  const [expectedValue, setExpectedValue] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t('client.create.name_required'));
      const ev = expectedValue ? Number(expectedValue.replace(',', '.')) : null;
      if (ev != null && (!Number.isFinite(ev) || ev < 0)) {
        throw new Error(t('client.create.value_negative'));
      }
      const { error } = await supabase.from('clients').insert({
        name: name.trim(),
        company: company || null,
        email: email || null,
        phone: phone || null,
        pipeline_stage: stage,
        confidence_pct: CLIENT_STAGE_CONFIDENCE[stage],
        expected_value: ev,
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label={t('client.create.dialog_label')}
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
        <h2 className="text-h2">{t('client.create.title')}</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              {t('client.create.name')}
            </span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              {t('client.create.company')}
            </span>
            <input
              className="input"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                {t('client.create.email')}
              </span>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                {t('client.create.phone')}
              </span>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+994…"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                {t('client.create.stage')}
              </span>
              <select
                className="input"
                value={stage}
                onChange={(e) => setStage(e.target.value as ClientPipelineStage)}
              >
                {CLIENT_STAGE_ORDER.filter((s) => s !== 'archived' && s !== 'lost').map((s) => (
                  <option key={s} value={s}>
                    {t(`client.stage.${s}`)} ({CLIENT_STAGE_CONFIDENCE[s]}%)
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                {t('client.create.expected_value')}
              </span>
              <input
                type="text"
                inputMode="decimal"
                className="input"
                value={expectedValue}
                onChange={(e) => setExpectedValue(e.target.value)}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
          </div>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            {t('common.back')}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !name}>
            {save.isPending ? t('client.create.saving') : t('client.create.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
