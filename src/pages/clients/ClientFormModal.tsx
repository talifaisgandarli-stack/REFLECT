/**
 * Client create / edit / delete modal (CRM, PRD Module 6). Collects every client
 * detail and the pipeline stage. Opened from "+ Yeni müştəri", a column's
 * "+ Müştəri" button (pre-set stage), or a card's edit (✎) affordance.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { isValidEmail, isValidPhone } from '@/lib/validation';
import {
  CLIENT_STAGE_CONFIDENCE,
  CLIENT_STAGE_LABEL,
  CLIENT_TIER_DESC,
  CLIENT_TIER_ORDER,
} from '@/lib/labels';
import type { Client, ClientPipelineStage, ClientTier } from '@/types/db';

// Stages selectable in the form (lost/archived/signed handled via drag / flows).
const FORM_STAGES: ClientPipelineStage[] = ['lead', 'proposal', 'negotiation', 'in_progress', 'portfolio'];

export function ClientFormModal({
  mode,
  client,
  defaultStage,
  onClose,
}: {
  mode: 'create' | 'edit';
  client?: Client;
  defaultStage?: ClientPipelineStage;
  onClose: () => void;
}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(client?.name ?? '');
  const [company, setCompany] = useState(client?.company ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [industry, setIndustry] = useState(client?.industry ?? '');
  const [tier, setTier] = useState<'' | ClientTier>(client?.tier ?? '');
  const [expected, setExpected] = useState(client?.expected_value ? String(client.expected_value) : '');
  const [stage, setStage] = useState<ClientPipelineStage>(client?.pipeline_stage ?? defaultStage ?? 'lead');
  const [confirmDel, setConfirmDel] = useState(false);

  function validate() {
    if (!name.trim()) throw new Error('Ad tələb olunur');
    if (email.trim() && !isValidEmail(email.trim())) throw new Error('Etibarsız email');
    if (phone.trim() && !isValidPhone(phone.trim())) throw new Error('Etibarsız telefon');
  }

  const fields = () => ({
    name: name.trim(),
    company: company.trim() || null,
    email: email.trim() || null,
    phone: phone.trim() || null,
    industry: industry.trim() || null,
    tier: tier || null,
    expected_value: expected ? Number(expected) : null,
  });

  const save = useMutation({
    mutationFn: async () => {
      validate();
      if (mode === 'create') {
        const { error } = await supabase.from('clients').insert({
          ...fields(),
          pipeline_stage: stage,
          confidence_pct: CLIENT_STAGE_CONFIDENCE[stage],
        });
        if (error) throw error;
      } else if (client) {
        const { error } = await supabase.from('clients').update(fields()).eq('id', client.id);
        if (error) throw error;
        if (stage !== client.pipeline_stage) {
          const { error: e2 } = await supabase.rpc('set_client_stage', {
            p_client_id: client.id,
            p_to_stage: stage,
            p_lost_reason: null,
          });
          if (e2) throw e2;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-project-stats'] });
      onClose();
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!client) return;
      const { error } = await supabase.from('clients').delete().eq('id', client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client-project-stats'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(14,22,17,0.4)' }} onClick={onClose}>
      <form
        className="card w-full max-w-md"
        style={{ padding: 24, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      >
        <h2 className="text-h2 mb-4">{mode === 'create' ? 'Yeni müştəri' : 'Müştərini redaktə et'}</h2>
        <div className="space-y-3">
          <F label="Ad (sifarişçi) *">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </F>
          <F label="Təşkilat (şirkət)">
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Məs. Prezident İşlər İdarəsi" />
          </F>
          <div style={{ display: 'flex', gap: 8 }}>
            <F label="Email" style={{ flex: 1 }}>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </F>
            <F label="Telefon" style={{ flex: 1 }}>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </F>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <F label="Sahə" style={{ flex: 1 }}>
              <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Məs. Tikinti" />
            </F>
            <F label="Tier" style={{ width: 130 }}>
              <select className="input" value={tier} onChange={(e) => setTier(e.target.value as ClientTier | '')}>
                <option value="">—</option>
                {CLIENT_TIER_ORDER.map((t) => (
                  <option key={t} value={t}>{CLIENT_TIER_DESC[t]}</option>
                ))}
              </select>
            </F>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <F label="Mərhələ" style={{ flex: 1 }}>
              <select className="input" value={stage} onChange={(e) => setStage(e.target.value as ClientPipelineStage)}>
                {FORM_STAGES.map((s) => (
                  <option key={s} value={s}>{CLIENT_STAGE_LABEL[s]}</option>
                ))}
              </select>
            </F>
            {isAdmin ? (
              <F label="Gözlənilən dəyər (₼)" style={{ width: 150 }}>
                <input className="input" type="number" value={expected} onChange={(e) => setExpected(e.target.value)} />
              </F>
            ) : null}
          </div>
        </div>

        {(save.isError || del.isError) ? (
          <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>
            {((save.error || del.error) as Error)?.message ?? 'Xəta'}
          </p>
        ) : null}

        <div className="flex gap-2 mt-5 justify-between items-center">
          {mode === 'edit' ? (
            confirmDel ? (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--error)' }}>Əminsən?</span>
                <button type="button" className="btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} disabled={del.isPending} onClick={() => del.mutate()}>
                  Bəli, sil
                </button>
              </span>
            ) : (
              <button type="button" className="btn-outline" style={{ color: 'var(--error)' }} onClick={() => setConfirmDel(true)}>
                🗑 Sil
              </button>
            )
          ) : (
            <span />
          )}
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-outline" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {mode === 'create' ? 'Yarat' : 'Saxla'}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}

function F({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'block', ...style }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
