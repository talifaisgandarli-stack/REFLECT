/**
 * Template variable registry — REQ §10.2 / Module 10.
 *
 * Each variable is identified by `{{key}}` inside a template body. The
 * registry binds keys to a runtime resolver that produces a string at
 * render time. Resolvers run inside a single render() call which extracts
 * keys from the body, computes once per key, and substitutes everywhere.
 *
 * The registry is intentionally narrow in v1 — letters, invoices, and acts
 * use the same eight or so fields. New keys ship as code, not as DB rows,
 * so usage is greppable.
 */
export type TemplateContext = {
  firmName?: string;
  client?: { name: string; company?: string | null; email?: string | null };
  project?: { name: string; deadline?: string | null };
  invoice?: { number?: string | null; amount?: number | null; date?: string | null };
  user?: { full_name?: string | null; email?: string };
};

const azDate = new Intl.DateTimeFormat('az-AZ', {
  timeZone: 'Asia/Baku',
  year: 'numeric',
  month: 'long',
  day: '2-digit',
});
const azn = new Intl.NumberFormat('az-AZ', {
  style: 'currency',
  currency: 'AZN',
  maximumFractionDigits: 0,
});

export type VariableKey =
  | 'firm_name'
  | 'today'
  | 'client_name'
  | 'client_company'
  | 'client_email'
  | 'project_name'
  | 'project_deadline'
  | 'invoice_number'
  | 'invoice_amount'
  | 'invoice_date'
  | 'user_name'
  | 'user_email';

export const VARIABLE_REGISTRY: Record<
  VariableKey,
  { label: string; example: string; resolve: (ctx: TemplateContext) => string }
> = {
  firm_name: {
    label: 'Şirkət adı',
    example: 'Reflect',
    resolve: (c) => c.firmName ?? 'Reflect',
  },
  today: {
    label: 'Bugünkü tarix',
    example: azDate.format(new Date()),
    resolve: () => azDate.format(new Date()),
  },
  client_name: {
    label: 'Müştəri adı',
    example: 'Aksent Group',
    resolve: (c) => c.client?.name ?? '—',
  },
  client_company: {
    label: 'Müştəri şirkəti',
    example: 'Aksent LLC',
    resolve: (c) => c.client?.company ?? '—',
  },
  client_email: {
    label: 'Müştəri e-poçtu',
    example: 'info@aksent.az',
    resolve: (c) => c.client?.email ?? '—',
  },
  project_name: {
    label: 'Layihə adı',
    example: 'Yasamal Tower',
    resolve: (c) => c.project?.name ?? '—',
  },
  project_deadline: {
    label: 'Layihə son tarixi',
    example: '2026-12-15',
    resolve: (c) => c.project?.deadline ?? '—',
  },
  invoice_number: {
    label: 'Faktura nömrəsi',
    example: 'INV-2026-001',
    resolve: (c) => c.invoice?.number ?? '—',
  },
  invoice_amount: {
    label: 'Faktura məbləği',
    example: azn.format(15000),
    resolve: (c) =>
      c.invoice?.amount != null ? azn.format(c.invoice.amount) : '—',
  },
  invoice_date: {
    label: 'Faktura tarixi',
    example: azDate.format(new Date()),
    resolve: (c) =>
      c.invoice?.date ? azDate.format(new Date(c.invoice.date)) : '—',
  },
  user_name: {
    label: 'İcraçı adı',
    example: 'Talifa İsgəndərli',
    resolve: (c) => c.user?.full_name ?? '—',
  },
  user_email: {
    label: 'İcraçı e-poçtu',
    example: 't@reflect.studio',
    resolve: (c) => c.user?.email ?? '—',
  },
};

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Render a template body by substituting every {{key}} that the registry knows. */
export function renderTemplate(body: string, ctx: TemplateContext): string {
  return body.replace(VAR_RE, (match, key: string) => {
    const entry = VARIABLE_REGISTRY[key as VariableKey];
    return entry ? entry.resolve(ctx) : match;
  });
}

/** Extract distinct {{key}} variables found in a template body. */
export function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) seen.add(m[1]);
  return Array.from(seen);
}

export const TEMPLATE_CATEGORIES = [
  'Məktub',
  'Faktura',
  'Akt',
  'Müqavilə',
  'Sorğu',
  'Digər',
] as const;
