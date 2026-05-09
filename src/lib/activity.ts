/**
 * Translate an entity_type DB string into a user-facing locale key
 * understood by the i18n dictionaries (`entity.<type>`). Unknown types
 * fall back to the raw type string so admins still see *something*.
 */
export function entityLabelKey(entity_type: string): string {
  return `entity.${entity_type}`;
}

/** Translate an activity_log.action verb (snake_case DB column) into a
 *  user-facing locale key. Same fallback semantics as entityLabelKey:
 *  unknown actions surface "action.<raw>" so the dev console warning
 *  catches them. */
export function actionLabelKey(action: string): string {
  return `action.${action}`;
}

/**
 * Map activity_log row → user-facing route.
 *
 * Used by the dashboard activity feed (slice 11) and audit log
 * (slice 31) so a row click jumps the user to the relevant entity.
 *
 * Tasks deep-link to /tapşırıqlar#task-<id> so the kanban scrolls
 * + highlights it (slice 25). Projects route to /layihelər/:id.
 * Clients route to /müştərilər (slide-in panel needs the page open).
 *
 * Returns null when no usable destination is known — caller renders
 * a non-link row.
 */
export function activityHref(entity_type: string, entity_id: string | null): string | null {
  if (!entity_id) return null;
  switch (entity_type) {
    case 'task':
    case 'task_comment':
      return `/tapşırıqlar#task-${entity_id}`;
    case 'project':
      return `/layihelər/${entity_id}`;
    case 'client':
      return `/müştərilər#client-${entity_id}`;
    case 'announcement':
      return '/komanda/elanlar';
    default:
      return null;
  }
}

/**
 * Locale key for a field name surfaced in the activity diff summary.
 * Falls through to the raw `activity.field.<name>` key so the i18n
 * missing-key warning catches new fields and we add a row to the
 * dictionaries.
 */
export function fieldLabelKey(field: string): string {
  return `activity.field.${field}`;
}

/**
 * Render a short, human diff string for an activity_log row, given
 * the field that changed and its old/new values. Pure helper so the
 * AuditLog page (and future activity-feed surfaces) all read consistent
 * copy through t().
 *
 * Pattern: "<field> <oldValue> → <newValue>" with empty values shown
 * as "—". Locale-aware via the t() argument so it slots into
 * useT()-driven components without hooks gymnastics.
 */
type Translator = (key: string, vars?: Record<string, string | number>) => string;

function valueToString(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.length > 0 ? v : '—';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // Arrays + objects: best-effort short form for the diff line; the
  // detail panel can still expand these later.
  try {
    const s = JSON.stringify(v);
    return s.length > 64 ? `${s.slice(0, 64)}…` : s;
  } catch {
    return '—';
  }
}

export function activityDiffSummary(
  field: string | null,
  oldValue: unknown,
  newValue: unknown,
  t: Translator,
): string | null {
  if (!field) return null;
  return t('activity.diff.template', {
    field: t(fieldLabelKey(field)),
    old: valueToString(oldValue),
    new: valueToString(newValue),
  });
}
