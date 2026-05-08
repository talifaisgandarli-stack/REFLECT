import { describe, expect, it } from 'vitest';
import { t } from './i18n';
import az from '@/locales/az.json';
import en from '@/locales/en.json';
import ru from '@/locales/ru.json';

describe('t() module helper', () => {
  it('returns AZ string for known key', () => {
    expect(t('common.save')).toBe('Yadda saxla');
  });

  it('substitutes {placeholder} variables', () => {
    expect(t('mirai.budget_warning', { pct: 80 })).toContain('80');
  });

  it('returns the key itself when missing (dev visibility)', () => {
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });
});

describe('locale dictionaries', () => {
  it('en + ru carry the same keys as az (no missing translations)', () => {
    const azKeys = new Set(Object.keys(az));
    const enKeys = new Set(Object.keys(en));
    const ruKeys = new Set(Object.keys(ru));
    const missingFromEn = [...azKeys].filter((k) => !enKeys.has(k));
    const missingFromRu = [...azKeys].filter((k) => !ruKeys.has(k));
    expect(missingFromEn, `en is missing: ${missingFromEn.join(', ')}`).toEqual([]);
    expect(missingFromRu, `ru is missing: ${missingFromRu.join(', ')}`).toEqual([]);
  });

  it('every locale has a non-empty value for every key', () => {
    for (const dict of [az, en, ru] as Array<Record<string, string>>) {
      for (const [k, v] of Object.entries(dict)) {
        expect(typeof v, `${k}`).toBe('string');
        expect(v.trim().length, `${k} empty`).toBeGreaterThan(0);
      }
    }
  });
});
