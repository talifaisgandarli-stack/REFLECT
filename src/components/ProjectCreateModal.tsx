/**
 * REQ-PROJ-01 — Create project modal.
 * Fields: name, client (select/create inline), phases[], start_date, deadline,
 * requires_expertise, expertise_deadline, payment_buffer_days (default 10).
 */
import { useEffect, useState } from 'react';
import { useFocusTrap } from '@/lib/a11y';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from './Toast';
import { useAuth } from '@/lib/store';
import { useClients } from '@/lib/hooks';
import { phaseLabel, grossFromNet } from '@/lib/labels';
import { formatAZN } from '@/lib/format';
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

type Props = { onClose: () => void; onCreated?: (p: Project) => void; existingProject?: Project };

export function ProjectCreateModal({ onClose, onCreated, existingProject }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const clients = useClients();
  const isEdit = !!existingProject;
  // Runtime row carries columns the Project type omits (tags); read via cast.
  const ex = existingProject as (Project & { tags?: string[]; contract_code?: string | null }) | undefined;

  // PRD §UX — suggest existing tags for autocomplete (migration 0053)
  const existingTags = useQuery({
    queryKey: ['project-tags-suggest'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('tags').not('tags', 'is', null);
      const set = new Set<string>();
      for (const row of (data ?? []) as Array<{ tags: string[] | null }>) {
        for (const t of row.tags ?? []) set.add(t);
      }
      return Array.from(set).sort();
    },
    staleTime: 60_000,
  });

  const [name, setName] = useState(ex?.name ?? '');
  const [clientId, setClientId] = useState(ex?.client_id ?? '');
  const [newClientName, setNewClientName] = useState('');
  const [createNewClient, setCreateNewClient] = useState(false);
  const [phases, setPhases] = useState<string[]>(ex?.phases ?? []);
  const [startDate, setStartDate] = useState(ex?.start_date ?? '');
  const [deadline, setDeadline] = useState(ex?.deadline ?? '');
  const [requiresExpertise, setRequiresExpertise] = useState(ex?.requires_expertise ?? false);
  const [expertiseDeadline, setExpertiseDeadline] = useState(ex?.expertise_deadline ?? '');
  const [paymentBuffer, setPaymentBuffer] = useState(ex?.payment_buffer_days ?? 10);
  // PRD §6.x — project tags (migration 0053)
  const [tagsInput, setTagsInput] = useState((ex?.tags ?? []).join(', '));
  const [contractCode, setContractCode] = useState(ex?.contract_code ?? '');
  // migration 0087 — contract value (ƏDV-siz) + VAT rate; gross computed live.
  const [contractNet, setContractNet] = useState(
    ex?.contract_value_net != null ? String(ex.contract_value_net) : '',
  );
  const [vatRate, setVatRate] = useState(ex?.vat_rate != null ? String(ex.vat_rate) : '18');
  const contractNetNum = contractNet.trim() ? Number(contractNet.replace(',', '.')) : null;
  const vatRateNum = vatRate.trim() ? Number(vatRate.replace(',', '.')) : 18;
  const contractGross = grossFromNet(contractNetNum, vatRateNum);

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
      // US-PROJ-01 — deadline is a required submit field (the expertise/timeline
      // planning in REQ-PROJ-02 depends on it). Client stays optional per the
      // PRD's "— müştərisiz —" affordance.
      if (!deadline) throw new Error('Bitmə tarixi tələb olunur');

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

      // PRD §REQ-PROJ — date sanity checks
      if (startDate && deadline && deadline < startDate) {
        throw new Error('Bitmə tarixi başlama tarixindən əvvəl ola bilməz.');
      }
      if (requiresExpertise && expertiseDeadline && deadline && expertiseDeadline > deadline) {
        throw new Error('Ekspertiza tarixi ümumi bitmə tarixindən sonra ola bilməz.');
      }
      if (requiresExpertise && expertiseDeadline && startDate && expertiseDeadline < startDate) {
        throw new Error('Ekspertiza tarixi başlama tarixindən əvvəl ola bilməz.');
      }
      if (contractNet.trim() && (!Number.isFinite(contractNetNum!) || contractNetNum! < 0)) {
        throw new Error('Müqavilə dəyəri düzgün deyil.');
      }
      if (!Number.isFinite(vatRateNum) || vatRateNum < 0 || vatRateNum > 100) {
        throw new Error('ƏDV faizi 0–100 aralığında olmalıdır.');
      }

      const base = {
        name: trimmedName,
        client_id: resolvedClientId,
        phases,
        start_date: startDate || null,
        deadline: deadline || null,
        requires_expertise: requiresExpertise,
        expertise_deadline: requiresExpertise ? expertiseDeadline || null : null,
        payment_buffer_days: paymentBuffer,
        contract_code: contractCode.trim() || null,
        contract_value_net: contractNetNum,
        vat_rate: vatRateNum,
        // PRD §6.x — parse comma-separated tags
        tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      };

      if (isEdit) {
        // Edit mode: patch the existing row; status/created_by stay as-is.
        const { data, error } = await supabase
          .from('projects')
          .update(base)
          .eq('id', existingProject!.id)
          .select('*')
          .single();
        if (error) throw error;
        return data as Project;
      }
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...base, status: 'active', created_by: profile?.id ?? null })
        .select('*')
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      toast.success(isEdit ? `"${project.name}" yeniləndi` : `"${project.name}" yaradıldı`);
      onCreated?.(project);
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const trapRef = useFocusTrap<HTMLFormElement>(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Layihəni redaktə et' : 'Yeni layihə'}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        ref={trapRef}
        className="card w-full max-w-lg"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="text-h2 mb-4">{isEdit ? 'Layihəni redaktə et' : 'Yeni layihə'}</h2>

        <div className="space-y-4">
          {/* Name */}
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Layihə adı <span style={{ color: 'var(--error-deep)' }}>*</span>
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
              Fazalar <span style={{ color: 'var(--error-deep)' }}>*</span>
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
                    {phaseLabel(phase)}
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
                Bitmə tarixi <span style={{ color: 'var(--error-deep)' }}>*</span>
              </span>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={startDate || undefined}
                required
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

        {/* migration 0087 — contract value split ƏDV-siz + ƏDV faizi, gross live */}
        <div className="mt-3 rounded-btn p-3" style={{ background: 'var(--surface-mist)' }}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Müqavilə dəyəri — ƏDV-siz (₼)
              </span>
              <input
                type="text"
                inputMode="decimal"
                className="input"
                placeholder="0.00"
                value={contractNet}
                onChange={(e) => setContractNet(e.target.value)}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                ƏDV %
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                className="input"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
          </div>
          {contractGross != null ? (
            <p className="text-meta mt-2" style={{ color: 'var(--brand-text)', fontVariantNumeric: 'tabular-nums' }}>
              ƏDV-li (brutto): <strong>{formatAZN(contractGross)}</strong>
              {contractNetNum != null ? ` · ƏDV: ${formatAZN(contractGross - contractNetNum)}` : ''}
            </p>
          ) : (
            <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
              Mənfəət hesablaması ƏDV-siz məbləğ üzərindən gedir.
            </p>
          )}
        </div>

        {/* migration 0086 — optional signed-contract reference code */}
        <label className="block mt-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Müqavilə kodu (könüllü)
          </span>
          <input
            type="text"
            className="input"
            placeholder="məs. MK-2026-014"
            value={contractCode}
            onChange={(e) => setContractCode(e.target.value)}
          />
        </label>

        {/* PRD §6.x — tags (comma-separated, migration 0053) + autocomplete */}
        <label className="block mt-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Etiketlər (vergüllə)
          </span>
          <input
            type="text"
            className="input"
            placeholder={existingTags.data?.length ? `məs: ${existingTags.data.slice(0, 3).join(', ')}` : 'məs: lüks, mənzil, Bakı'}
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            list="project-tag-suggestions"
          />
          <datalist id="project-tag-suggestions">
            {(existingTags.data ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>

        {create.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>
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
            disabled={create.isPending || !name.trim() || phases.length === 0 || !deadline}
          >
            {create.isPending ? (isEdit ? 'Saxlanılır…' : 'Yaradılır…') : (isEdit ? 'Yadda saxla' : 'Yarat')}
          </button>
        </div>
      </form>
    </div>
  );
}
