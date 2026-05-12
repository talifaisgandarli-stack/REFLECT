/**
 * REQ-PROJ-01 — Create project modal.
 * Fields: name, client (select/create inline), phases[], start_date, deadline,
 * requires_expertise, expertise_deadline, payment_buffer_days (default 10).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useClients } from '@/lib/hooks';
import type { Project } from '@/types/db';

// PRD §5 Module 3 — canonical phase list
const PHASES = [
  'Konsepsiya',
  'SD',
  'DD',
  'CD',
  'Tender',
  'İcra nəzarəti',
] as const;

type Props = { onClose: () => void; onCreated?: (p: Project) => void };

export function ProjectCreateModal({ onClose, onCreated }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const clients = useClients();

  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [createNewClient, setCreateNewClient] = useState(false);
  const [phases, setPhases] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [requiresExpertise, setRequiresExpertise] = useState(false);
  const [expertiseDeadline, setExpertiseDeadline] = useState('');
  const [paymentBuffer, setPaymentBuffer] = useState(10);

  function togglePhase(phase: string) {
    setPhases((prev) =>
      prev.includes(phase) ? prev.filter((p) => p !== phase) : [...prev, phase],
    );
  }

  const create = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Layihə adı tələb olunur');
      if (phases.length === 0) throw new Error('Ən azı bir faza seçin');

      let resolvedClientId: string | null = clientId || null;

      if (createNewClient) {
        const cname = newClientName.trim();
        if (!cname) throw new Error('Müştəri adı tələb olunur');
        const { data: newClient, error: clientErr } = await supabase
          .from('clients')
          .insert({ name: cname, created_by: profile?.id ?? null })
          .select('id')
          .single();
        if (clientErr) throw clientErr;
        resolvedClientId = newClient.id;
      }

      if (startDate && deadline && deadline < startDate) {
        throw new Error('Bitmə tarixi başlama tarixindən əvvəl ola bilməz.');
      }

      const payload = {
        name: trimmedName,
        client_id: resolvedClientId,
        phases,
        start_date: startDate || null,
        deadline: deadline || null,
        requires_expertise: requiresExpertise,
        expertise_deadline: requiresExpertise ? expertiseDeadline || null : null,
        payment_buffer_days: paymentBuffer,
        status: 'active',
        created_by: profile?.id ?? null,
      };

      const { data, error } = await supabase.from('projects').insert(payload).select('*').single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      onCreated?.(project);
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni layihə"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-lg"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="text-h2 mb-4">Yeni layihə</h2>

        <div className="space-y-4">
          {/* Name */}
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Layihə adı <span style={{ color: '#B91C1C' }}>*</span>
            </span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Layihə adını daxil edin…"
              autoFocus
              required
            />
          </label>

          {/* Client */}
          <div>
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Müştəri
            </span>
            {!createNewClient ? (
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">— müştərisiz —</option>
                  {(clients.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` (${c.company})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-outline text-meta"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => {
                    setCreateNewClient(true);
                    setClientId('');
                  }}
                >
                  + Yeni
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Müştəri adı…"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn-outline text-meta"
                  onClick={() => {
                    setCreateNewClient(false);
                    setNewClientName('');
                  }}
                >
                  Ləğv
                </button>
              </div>
            )}
          </div>

          {/* Phases multi-select */}
          <div>
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Fazalar <span style={{ color: '#B91C1C' }}>*</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {PHASES.map((phase) => {
                const active = phases.includes(phase);
                return (
                  <button
                    key={phase}
                    type="button"
                    onClick={() => togglePhase(phase)}
                    className="chip"
                    style={{
                      cursor: 'pointer',
                      background: active ? 'var(--brand-action)' : 'var(--surface-mist)',
                      color: active ? 'var(--ink)' : 'var(--text)',
                      border: `1px solid ${active ? 'var(--brand-action-hover)' : 'var(--line)'}`,
                      fontWeight: active ? 600 : 400,
                    }}
                    aria-pressed={active}
                  >
                    {phase}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Başlama tarixi
              </span>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Bitmə tarixi
              </span>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={startDate || undefined}
              />
            </label>
          </div>

          {/* Expertise */}
          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={requiresExpertise}
              onChange={(e) => setRequiresExpertise(e.target.checked)}
            />
            Ekspertiza tələb olunur
          </label>

          {requiresExpertise && (
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Ekspertiza deadline
              </span>
              <input
                type="date"
                className="input max-w-[200px]"
                value={expertiseDeadline}
                onChange={(e) => setExpertiseDeadline(e.target.value)}
              />
            </label>
          )}

          {/* Payment buffer */}
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Ödəniş buferi (gün)
            </span>
            <input
              type="number"
              min={0}
              max={365}
              className="input max-w-[120px]"
              value={paymentBuffer}
              onChange={(e) => setPaymentBuffer(Number(e.target.value))}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </label>
        </div>

        {create.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(create.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>
            Geri
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={create.isPending || !name.trim() || phases.length === 0}
          >
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}
