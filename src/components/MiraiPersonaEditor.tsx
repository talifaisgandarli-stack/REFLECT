/**
 * Settings → MIRAI personalar (PRD §7.2 admin override).
 *
 * Each of the 5 PRD-spec personas has a built-in default system prompt
 * baked into api/mirai/{chat,stream}.ts. This page lets admins paste a
 * studio-specific override into system_settings.mirai.persona.<key> =
 * {"v": "..."} which the handler reads at request time. Empty value =
 * fall back to default.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type PersonaKey =
  | 'general'
  | 'project_manager'
  | 'finance_analyst'
  | 'cmo'
  | 'hr_partner';

const PERSONAS: Array<{ key: PersonaKey; label: string; defaultPrompt: string }> = [
  {
    key: 'general',
    label: 'Köməkçi',
    defaultPrompt:
      'Sən MIRAI-sən — Bakıdakı Reflect arxitektura studiyasının daxili köməkçisi. Qısa cavab ver. Mənbə göstərə bilməyəndə açıq de.',
  },
  {
    key: 'project_manager',
    label: 'Layihə Mühəndisi',
    defaultPrompt:
      'Sən MIRAI-nin "Layihə Mühəndisi" şəxsiyyətisən. Tapşırıq, deadline və faza koordinasiyasında kömək et.',
  },
  {
    key: 'finance_analyst',
    label: 'Maliyyə Analitiki',
    defaultPrompt:
      'Sən MIRAI-nin "Maliyyə Analitiki" şəxsiyyətisən. Cash flow, P&L, forecast. Fərdi maaşları əsla göstərmə.',
  },
  {
    key: 'cmo',
    label: 'CMO',
    defaultPrompt:
      'Sən MIRAI-nin CMO şəxsiyyətisən. Trend, mükafat və məzmun fürsətlərini sürface elə.',
  },
  {
    key: 'hr_partner',
    label: 'HR',
    defaultPrompt:
      'Sən MIRAI-nin HR şəxsiyyətisən. Karyera, performans, məzuniyyət.',
  },
];

type SettingRow = { key: string; value: { v: unknown } | null };

export function MiraiPersonaEditor() {
  const qc = useQueryClient();
  const [active, setActive] = useState<PersonaKey>('general');
  const [text, setText] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const settings = useQuery({
    queryKey: ['mirai-personas'],
    queryFn: async (): Promise<SettingRow[]> => {
      const keys = PERSONAS.map((p) => `mirai.persona.${p.key}`);
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', keys);
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });

  const overrides = new Map<string, string>();
  for (const r of settings.data ?? []) {
    if (typeof r.value?.v === 'string') overrides.set(r.key, r.value.v);
  }

  useEffect(() => {
    setText(overrides.get(`mirai.persona.${active}`) ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = text.trim();
      const key = `mirai.persona.${active}`;
      if (!trimmed) {
        // Empty input = fall back to the built-in default. Drop the row.
        const { error } = await supabase
          .from('system_settings')
          .delete()
          .eq('key', key);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key, value: { v: trimmed } }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => {
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ['mirai-personas'] });
      setTimeout(() => setSavedAt(null), 2_500);
    },
  });

  const persona = PERSONAS.find((p) => p.key === active)!;
  const effective = text.trim() || persona.defaultPrompt;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-5">
      <aside>
        <h3 className="text-h3 mb-3">Personalar</h3>
        <ul className="space-y-1">
          {PERSONAS.map((p) => {
            const has = overrides.has(`mirai.persona.${p.key}`);
            return (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => setActive(p.key)}
                  className="w-full text-left px-3 py-2 rounded-btn flex items-center justify-between"
                  style={{
                    background:
                      active === p.key ? 'var(--surface-mist)' : 'transparent',
                    border: '1px solid var(--line-soft)',
                  }}
                >
                  <span>{p.label}</span>
                  {has ? (
                    <span
                      className="text-tiny"
                      style={{
                        color: 'var(--brand-text)',
                        background: 'var(--brand-mist)',
                        padding: '2px 8px',
                        borderRadius: 6,
                      }}
                    >
                      override
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section>
        <h3 className="text-h3 mb-1">{persona.label}</h3>
        <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
          Boş saxla → standart prompt istifadə olunacaq. Override edirsənsə,
          əvvəlcədən qoşulan kontekst (tarix, rol, RAG) yenə əlavə olunacaq.
        </p>

        <textarea
          className="input font-mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ minHeight: 220, padding: '12px 14px', whiteSpace: 'pre-wrap' }}
          placeholder={persona.defaultPrompt}
        />

        <details className="mt-3">
          <summary
            className="text-meta cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            Faktiki istifadə olunan prompt (önbaxış)
          </summary>
          <pre
            className="text-meta mt-2"
            style={{
              background: 'var(--surface-mist)',
              padding: 12,
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              color: 'var(--text-soft)',
            }}
          >
            {effective}
          </pre>
        </details>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex items-center justify-between mt-4">
          {savedAt ? (
            <span
              className="text-meta"
              style={{ color: 'var(--brand-text)' }}
              role="status"
              aria-live="polite"
            >
              Yadda saxlanıldı ✓
            </span>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button
              type="button"
              className="btn-outline"
              onClick={() => setText('')}
              disabled={!text}
            >
              Standartı bərpa et
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? 'Yadda saxlanılır…' : 'Yadda saxla'}
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}
