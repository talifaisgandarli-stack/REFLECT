import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { useSystemSettings } from '@/lib/hooks';
import { NotificationPreferencesPage } from './NotificationPreferences';

const NAV = [
  { to: 'umumi', label: 'Ümumi' },
  { to: 'şablonlar', label: 'Şablonlar' },
  { to: 'bilik', label: 'Bilik Bazası' },
  { to: 'bildirişlər', label: 'Bildirişlər' },
];

export function SettingsPage() {
  return (
    <>
      <PageHead meta="Yalnız admin" title="Parametrlər" />
      <div className="grid grid-cols-1 lg:grid-cols-[200px,1fr] gap-6">
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-btn text-ui ${isActive ? 'bg-surface-mist' : ''}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="card">
          <Routes>
            <Route index element={<Navigate to="umumi" replace />} />
            <Route path="umumi" element={<GeneralSettings />} />
            <Route path="şablonlar" element={<TemplatesSettings />} />
            <Route path="bilik" element={<KnowledgeBaseSettings />} />
            <Route path="bildirişlər" element={<NotificationsSettings />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

// §10.1 Ümumi — system_settings key/value editor (firm name, default currency, working hours, AZ holidays).
const KNOWN_KEYS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: 'firm_name', label: 'Şirkət adı', placeholder: 'Reflect Architects' },
  { key: 'default_currency', label: 'Default valyuta', placeholder: 'AZN' },
  { key: 'working_hours', label: 'İş saatları', placeholder: '09:00-18:00' },
  { key: 'az_holidays', label: 'AZ tətil günləri (vergüllü siyahı)', placeholder: '2026-01-01,2026-03-20' },
];

function GeneralSettings() {
  const qc = useQueryClient();
  const settings = useSystemSettings();
  const map = Object.fromEntries(
    (settings.data ?? []).map((s: { key: string; value: unknown }) => [
      s.key,
      typeof s.value === 'string' ? s.value : JSON.stringify(s.value),
    ]),
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (input: { key: string; value: string }) => {
      // PRD §10.1 store as jsonb. Parse JSON if possible, else string.
      let parsed: unknown = input.value;
      try {
        parsed = JSON.parse(input.value);
      } catch {
        parsed = input.value;
      }
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: input.key, value: parsed, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-settings'] }),
  });

  return (
    <div className="space-y-4">
      <h3 className="text-h3">Şirkət (system_settings)</h3>
      {KNOWN_KEYS.map((k) => {
        const current = draft[k.key] ?? map[k.key] ?? '';
        const dirty = draft[k.key] !== undefined && draft[k.key] !== (map[k.key] ?? '');
        return (
          <div key={k.key} className="flex items-center gap-2">
            <label className="block flex-1">
              <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {k.label}
              </span>
              <input
                className="input mt-1 w-full"
                placeholder={k.placeholder}
                value={current}
                onChange={(e) => setDraft((p) => ({ ...p, [k.key]: e.target.value }))}
              />
            </label>
            {dirty ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => save.mutate({ key: k.key, value: current })}
              >
                Yadda saxla
              </button>
            ) : null}
          </div>
        );
      })}
      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        Saat qurşağı: Asia/Baku (sabit, REQ-FIN-09).
      </p>
    </div>
  );
}

function TemplatesSettings() {
  return <p className="text-body">Sənəd şablonları (kontrakt, akt, faktura) — v1.5-də.</p>;
}
function KnowledgeBaseSettings() {
  return <p className="text-body">Yüklənmiş PDF-lər və MIRAI RAG mənbələri — burada idarə olunur.</p>;
}
function NotificationsSettings() {
  return <NotificationPreferencesPage />;
}
