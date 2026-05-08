import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_CATEGORIES,
  VARIABLE_REGISTRY,
  extractVariables,
  renderTemplate,
} from './templates';

describe('renderTemplate', () => {
  it('substitutes known tokens with the resolver output', () => {
    const out = renderTemplate('Salam, {{client_name}}!', {
      client: { name: 'Aksent Group' },
    });
    expect(out).toBe('Salam, Aksent Group!');
  });

  it('handles whitespace inside the braces', () => {
    expect(renderTemplate('{{ user_name }}', { user: { full_name: 'Talifa' } })).toBe('Talifa');
  });

  it('leaves unknown tokens intact so authors can spot them', () => {
    expect(renderTemplate('hello {{notarealvar}}', {})).toBe('hello {{notarealvar}}');
  });

  it('falls back to "—" when a known token has no value in context', () => {
    expect(renderTemplate('{{client_email}}', {})).toBe('—');
  });

  it('renders multiple distinct tokens in one pass', () => {
    const out = renderTemplate(
      '{{client_name}} / {{project_name}} — {{firm_name}}',
      { client: { name: 'A' }, project: { name: 'B' }, firmName: 'Reflect' },
    );
    expect(out).toBe('A / B — Reflect');
  });
});

describe('extractVariables', () => {
  it('returns distinct tokens', () => {
    const got = extractVariables('{{a}} {{b}} {{a}}');
    expect(got.sort()).toEqual(['a', 'b']);
  });

  it('returns an empty array when the body has no tokens', () => {
    expect(extractVariables('plain text')).toEqual([]);
  });
});

describe('VARIABLE_REGISTRY', () => {
  it('every registry key has a label, example, and resolve fn', () => {
    for (const [key, entry] of Object.entries(VARIABLE_REGISTRY)) {
      expect(entry.label, `${key}.label`).toBeTruthy();
      expect(entry.example, `${key}.example`).toBeTruthy();
      expect(typeof entry.resolve, `${key}.resolve`).toBe('function');
    }
  });
});

describe('TEMPLATE_CATEGORIES', () => {
  it('contains "Digər" as the catch-all', () => {
    expect(TEMPLATE_CATEGORIES).toContain('Digər');
  });
});
