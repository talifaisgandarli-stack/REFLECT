/**
 * Settings → Ümumi (PRD §10.1).
 *
 * Reads + writes `system_settings` rows keyed by:
 *   firm.name                   {"v": "Reflect"}
 *   firm.working_hours          {"v": "09:00-18:00"}
 *   firm.az_holidays            {"v": ["2026-01-01", ...]}
 *   firm.currency               {"v": "AZN"}
 *   finance.alert.income_threshold  {"v": 5000}
 *   finance.alert.expense_threshold {"v": 5000}
 *
 * Each row is upserted on save; the page is admin-only by parent route.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';

type SettingRow = { key: string; value: { v: unknown } | null };

const KEYS = [
  'firm.name',
  'firm.working_hours',
  'firm.currency',
  'firm.az_holidays',
  'finance.alert.income_threshold',
  'finance.alert.expense_threshold',
] as const;

type SettingsState = {
  firmName: string;
  workingHours: string;
  currency: string;
  holidaysText: string;
  incomeThreshold: string;
  expenseThreshold: string;
};

const DEFAULTS: SettingsState = {
  firmName: 'Reflect',
  workingHours: '09:00-18:00',
  currency: 'AZN',
  holidaysText: '',
  incomeThreshold: '5000',
  expenseThreshold: '5000',
};

export function GeneralSettingsForm() {
  const t = useT();
  const qc = useQueryClient();
  const [state, setState] = useState<SettingsState>(DEFAULTS);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const settings = useQuery({
    queryKey: ['system-settings'],
    queryFn: async (): Promise<SettingRow[]> => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', [...KEYS]);
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    const map = new Map(settings.data.map((r) => [r.key, r.value?.v]));
    setState({
      firmName: (map.get('firm.name') as string | undefined) ?? DEFAULTS.firmName,
      workingHours:
        (map.get('firm.working_hours') as string | undefined) ?? DEFAULTS.workingHours,
      currency: (map.get('firm.currency') as string | undefined) ?? DEFAULTS.currency,
      holidaysText: Array.isArray(map.get('firm.az_holidays'))
        ? (map.get('firm.az_holidays') as string[]).join('\n')
        : '',
      incomeThreshold: String(
        (map.get('finance.alert.income_threshold') as number | undefined) ??
          DEFAULTS.incomeThreshold,
      ),
      expenseThreshold: String(
        (map.get('finance.alert.expense_threshold') as number | undefined) ??
          DEFAULTS.expenseThreshold,
      ),
    });
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => {
      const holidays = state.holidaysText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
      const income = Number(state.incomeThreshold);
      const expense = Number(state.expenseThreshold);
      if (!Number.isFinite(income) || income <= 0)
        throw new Error('Gəlir hədd-i müsbət olmalıdır');
      if (!Number.isFinite(expense) || expense <= 0)
        throw new Error('Xərc hədd-i müsbət olmalıdır');

      const rows = [
        { key: 'firm.name', value: { v: state.firmName.trim() || 'Reflect' } },
        { key: 'firm.working_hours', value: { v: state.workingHours.trim() } },
        { key: 'firm.currency', value: { v: state.currency.trim() || 'AZN' } },
        { key: 'firm.az_holidays', value: { v: holidays } },
        { key: 'finance.alert.income_threshold', value: { v: income } },
        { key: 'finance.alert.expense_threshold', value: { v: expense } },
      ];
      const { error } = await supabase
        .from('system_settings')
        .upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => {
      setSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ['system-settings'] });
      // Auto-clear "saved" toast after a moment
      setTimeout(() => setSavedAt(null), 2_500);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-5"
    >
      <section>
        <h3 className="text-h3 mb-3">{t('settings.general.firm')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={t('settings.general.firm_name')}>
            <input
              className="input"
              value={state.firmName}
              onChange={(e) => setState((s) => ({ ...s, firmName: e.target.value }))}
            />
          </Field>
          <Field label={t('settings.general.timezone')}>
            <input className="input" value="Asia/Baku" disabled />
          </Field>
          <Field label={t('settings.general.hours')}>
            <input
              className="input"
              value={state.workingHours}
              onChange={(e) =>
                setState((s) => ({ ...s, workingHours: e.target.value }))
              }
            />
          </Field>
          <Field label={t('settings.general.currency')}>
            <input
              className="input"
              value={state.currency}
              onChange={(e) => setState((s) => ({ ...s, currency: e.target.value }))}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="text-h3 mb-3">{t('settings.general.holidays_title')}</h3>
        <p className="text-meta mb-2" style={{ color: 'var(--text-muted)' }}>
          {t('settings.general.holidays_note')}
        </p>
        <textarea
          className="input font-mono"
          value={state.holidaysText}
          onChange={(e) => setState((s) => ({ ...s, holidaysText: e.target.value }))}
          style={{ minHeight: 140, padding: '12px 14px', whiteSpace: 'pre-wrap' }}
          placeholder={'2026-01-01\n2026-03-08\n2026-03-20'}
        />
      </section>

      <section>
        <h3 className="text-h3 mb-3">{t('settings.general.alerts_title')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={t('settings.general.income_threshold')}>
            <input
              type="text"
              inputMode="numeric"
              className="input"
              value={state.incomeThreshold}
              onChange={(e) =>
                setState((s) => ({ ...s, incomeThreshold: e.target.value }))
              }
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </Field>
          <Field label={t('settings.general.expense_threshold')}>
            <input
              type="text"
              inputMode="numeric"
              className="input"
              value={state.expenseThreshold}
              onChange={(e) =>
                setState((s) => ({ ...s, expenseThreshold: e.target.value }))
              }
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </Field>
        </div>
      </section>

      {save.error ? (
        <p className="text-meta" style={{ color: '#B91C1C' }}>
          {(save.error as Error).message}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        {savedAt ? (
          <span
            className="text-meta"
            style={{ color: 'var(--brand-text)' }}
            role="status"
            aria-live="polite"
          >
            {t('settings.general.saved')}
          </span>
        ) : (
          <span />
        )}
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? t('notif.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
