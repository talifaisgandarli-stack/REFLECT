/**
 * Shared manual subtask builder used by both the create- and edit-task modals
 * (REQ-TASK-01). Each row carries its own title, its own deadline (mandatory)
 * and its own assignee(s) (mandatory). Fully-empty rows are ignored on submit.
 */
import { useMemo } from 'react';

export type DraftSubtask = {
  key: string;
  title: string;
  assigneeIds: string[];
  deadline: string; // YYYY-MM-DD — mandatory for every subtask
  isExpertise: boolean;
};

export const EXPERTISE_CHILDREN = [
  'Çertyoj hazırlığı',
  'Spesifikasiya',
  'Möhür + imza',
  'Çap + ciltləmə',
  'Ekspertizaya təhvil',
] as const;

let subtaskKeySeq = 0;
export const newSubtask = (title = '', isExpertise = false): DraftSubtask => ({
  key: `st-${subtaskKeySeq++}`,
  title,
  assigneeIds: [],
  deadline: '',
  isExpertise,
});

// A row is "empty" (and ignored) only when nothing has been entered at all.
const isEmptyRow = (s: DraftSubtask) =>
  !s.title.trim() && s.assigneeIds.length === 0 && !s.deadline;

// First validation problem across all non-empty rows, or null when valid.
export function subtaskError(subtasks: DraftSubtask[]): string | null {
  for (const s of subtasks) {
    if (isEmptyRow(s)) continue;
    const t = s.title.trim();
    if (!t) return 'Alt-tapşırığın başlığını yazın';
    if (!s.deadline) return `"${t}" üçün son tarix (deadline) seçin`;
    if (s.assigneeIds.length === 0) return `"${t}" üçün ən azı bir icraçı seçin`;
  }
  return null;
}

// Trimmed, non-empty rows ready to insert. Caller must validate first.
export function cleanSubtasks(subtasks: DraftSubtask[]): DraftSubtask[] {
  return subtasks
    .filter((s) => !isEmptyRow(s))
    .map((s) => ({ ...s, title: s.title.trim() }));
}

type Member = { id: string; full_name: string | null; email: string };

export function SubtaskBuilder({
  subtasks,
  onChange,
  assignable,
  minDate,
  legend = 'Alt-tapşırıqlar (könüllü)',
}: {
  subtasks: DraftSubtask[];
  onChange: (next: DraftSubtask[]) => void;
  assignable: Member[];
  minDate?: string;
  legend?: string;
}) {
  const err = useMemo(() => subtaskError(subtasks), [subtasks]);
  const add = (title = '', isExpertise = false) =>
    onChange([...subtasks, newSubtask(title, isExpertise)]);
  const update = (key: string, patch: Partial<DraftSubtask>) =>
    onChange(subtasks.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const remove = (key: string) => onChange(subtasks.filter((s) => s.key !== key));
  const toggleAssignee = (key: string, id: string) =>
    onChange(
      subtasks.map((s) =>
        s.key === key
          ? {
              ...s,
              assigneeIds: s.assigneeIds.includes(id)
                ? s.assigneeIds.filter((x) => x !== id)
                : [...s.assigneeIds, id],
            }
          : s,
      ),
    );

  return (
    <fieldset className="border rounded-btn p-3" style={{ borderColor: 'var(--line)' }}>
      <legend className="text-meta px-2" style={{ color: 'var(--text-muted)' }}>
        {legend}
      </legend>

      {subtasks.length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Hələ alt-tapşırıq yoxdur. Hər birinin son tarixi və icraçısı olmalıdır.
        </p>
      ) : (
        <div className="space-y-3">
          {subtasks.map((st, i) => (
            <div key={st.key} className="rounded-btn p-2" style={{ background: 'var(--surface-mist)' }}>
              <div className="flex gap-2 items-center">
                {st.isExpertise ? (
                  <span
                    aria-hidden
                    className="inline-flex items-center justify-center shrink-0"
                    style={{
                      width: 16, height: 16, borderRadius: 4,
                      background: 'var(--brand-action)', color: 'var(--ink)',
                      fontWeight: 700, fontSize: 10,
                    }}
                  >E</span>
                ) : null}
                <input
                  className="input flex-1"
                  value={st.title}
                  onChange={(e) => update(st.key, { title: e.target.value })}
                  placeholder={`Alt-tapşırıq ${i + 1}…`}
                  aria-label={`Alt-tapşırıq ${i + 1} başlığı`}
                />
                <button
                  type="button"
                  className="chip shrink-0"
                  style={{ color: 'var(--error-deep)' }}
                  onClick={() => remove(st.key)}
                  aria-label="Alt-tapşırığı sil"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="block">
                  <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Son tarix <span style={{ color: 'var(--error-deep)' }}>*</span>
                  </span>
                  <input
                    type="date"
                    className="input"
                    value={st.deadline}
                    min={minDate || undefined}
                    onChange={(e) => update(st.key, { deadline: e.target.value })}
                    aria-label={`Alt-tapşırıq ${i + 1} son tarix`}
                  />
                </label>
                <div>
                  <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                    İcraçı(lar) <span style={{ color: 'var(--error-deep)' }}>*</span>
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {assignable.map((m) => {
                      const checked = st.assigneeIds.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex items-center gap-1.5 text-meta cursor-pointer chip"
                          style={{ background: checked ? 'var(--brand-action)' : 'var(--surface)', color: checked ? 'var(--ink)' : 'var(--text)' }}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => toggleAssignee(st.key, m.id)}
                          />
                          {m.full_name ?? m.email}
                        </label>
                      );
                    })}
                    {assignable.length === 0 ? (
                      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>İcraçı yoxdur.</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          className="chip"
          style={{ fontSize: 12, color: 'var(--brand-text)' }}
          onClick={() => add()}
        >
          + Alt-tapşırıq əlavə et
        </button>
        <button
          type="button"
          className="chip"
          style={{ fontSize: 12, color: 'var(--brand-text)' }}
          onClick={() => EXPERTISE_CHILDREN.forEach((t) => add(t, true))}
          title="5 ekspertiza alt-tapşırığını sətir kimi əlavə et (son tarix + icraçı yenə də tələb olunur)"
        >
          + Ekspertiza dəsti
        </button>
      </div>

      {err ? (
        <p className="text-meta mt-2" style={{ color: 'var(--error-deep)' }}>{err}</p>
      ) : null}
    </fieldset>
  );
}
