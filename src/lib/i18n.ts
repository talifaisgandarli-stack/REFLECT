/**
 * Minimal i18n helper. Picks the locale from profile.locale (loaded into the
 * Zustand auth store) with a fallback to navigator.language and finally to
 * 'az'. Translation lookup is dot-key against locales/*.json; missing keys
 * surface the key itself in dev so they're impossible to miss.
 *
 * Placeholder substitution: `{{name}}` style, with {pct} → %d kind args
 * passed in via the `vars` param.
 */
import azStrings from '@/locales/az.json';
import enStrings from '@/locales/en.json';
import ruStrings from '@/locales/ru.json';
import { useAuth } from './store';

export type Locale = 'az' | 'en' | 'ru';

const DICT: Record<Locale, Record<string, string>> = {
  az: azStrings as Record<string, string>,
  en: enStrings as Record<string, string>,
  ru: ruStrings as Record<string, string>,
};

function detectLocale(profileLocale: string | null | undefined): Locale {
  if (profileLocale && profileLocale in DICT) return profileLocale as Locale;
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language?.slice(0, 2).toLowerCase();
    if (lang && lang in DICT) return lang as Locale;
  }
  return 'az';
}

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\s*(\w+)\s*\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

/**
 * Hook variant — re-renders when profile.locale changes (auth store update).
 * Use this in components.
 */
export function useT() {
  const profile = useAuth((s) => s.profile);
  const locale = detectLocale(profile?.locale ?? null);
  return (key: string, vars?: Record<string, string | number>): string => {
    const dict = DICT[locale] ?? DICT.az;
    const raw = dict[key] ?? DICT.az[key] ?? key;
    return format(raw, vars);
  };
}

/**
 * Module-level helper for non-React contexts (utility functions, server side
 * rendered fragments). Always reads from the AZ dictionary because there's
 * no profile in scope.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = DICT.az[key] ?? key;
  return format(raw, vars);
}

export const SUPPORTED_LOCALES: Locale[] = ['az', 'en', 'ru'];
