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
