import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import {
  EXPERTISE_SUBTASKS,
  isOpenChildrenError,
  useActiveProfiles,
  useCreateTask,
  useProjects,
  useTasks,
  useUpdateTaskStatus,
} from '@/lib/hooks';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_STATUS_TONE } from '@/lib/labels';
import type { Task, TaskStatus } from '@/types/db';
import { useAuth } from '@/lib/store';
import { SubtaskBlockingModal } from '@/components/SubtaskBlockingModal';

export function TasksPage() {
  const { profile } = useAuth();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [mineOnly, setMineOnly] = useState(false);
  const urlAssignee =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('assignee')
      : null;
  const filter = mineOnly && profile?.id
    ? { assigneeId: profile.id }
    : urlAssignee
      ? { assigneeId: urlAssignee }
      : undefined;
  const { data: tasks = [], isLoading } = useTasks(filter);
  const update = useUpdateTaskStatus();
  const [blocker, setBlocker] = useState<{ id: string; from?: TaskStatus } | null>(null);
  const [creating, setCreating] = useState(false);

  function moveTask(id: string, status: TaskStatus, from?: TaskStatus) {
    update.mutate(
      { id, status, from },
      {
        onError: (e) => {
          if (status === 'done' && isOpenChildrenError(e)) {
            setBlocker({ id, from });
          }
        },
      },
    );
  }

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      idea: [], queued: [], active: [], review: [], expert: [], done: [], cancelled: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const meta = `${tasks.length} cəmi · ${grouped.active.length} icrada · ${grouped.review.length} yoxlamada`;

  return (
    <>
      <PageHead
        meta={meta}
        title="Tapşırıqlar"
        actions={
          <>
            <input className="input max-w-[240px]" placeholder="Axtar…" />
            <button
              className={`btn-outline ${mineOnly ? 'border-brand-text' : ''}`}
              onClick={() => setMineOnly((v) => !v)}
            >
              Mənim
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni
            </button>
          </>
        }
      />

      <div className="flex gap-2 mb-4">
        {(['board', 'table'] as const).map((v) => (
          <button
            key={v}
            className={`chip ${view === v ? 'chip-brand' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'board' ? 'Lövhə' : 'Cədvəl'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : tasks.length === 0 ? (
        <EmptyState
          title="Hələ tapşırıq yoxdur"
          body="İlk tapşırığı yarat və BU GÜN sütunu canlanacaq."
          cta={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni tapşırıq
            </button>
          }
        />
      ) : view === 'board' ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {TASK_STATUS_ORDER.map((s) => {
            const isToday = s === 'active';
            const tone = TASK_STATUS_TONE[s];
            return (
              <div
                key={s}
                className="rounded-card p-3"
                style={{
                  background: isToday ? 'var(--ink)' : 'transparent',
                  color: isToday ? 'var(--canvas)' : 'inherit',
                  border: isToday ? 'none' : '1px dashed var(--line)',
                  minHeight: 320,
                }}
              >
                <h3
                  className="text-tiny mb-3"
                  style={{
                    color: isToday ? 'var(--brand-action)' : tone.text,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {isToday ? 'BU GÜN' : TASK_STATUS_LABEL[s]} · {grouped[s].length}
                </h3>
                <div className="space-y-2">
                  {grouped[s].map((t) => (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ id: t.id, from: t.status }))}
                      onDragOver={(e) => e.preventDefault()}
                      className="rounded-card p-3 text-body"
                      style={{
                        background: isToday ? '#1F2925' : 'var(--surface)',
                        border: `1px solid ${isToday ? '#2D3833' : 'var(--line)'}`,
                      }}
                    >
                      <div className="font-medium">{t.title}</div>
                      {t.deadline ? (
                        <div className="text-meta opacity-70 mt-1">{t.deadline}</div>
                      ) : null}
                    </article>
                  ))}
                </div>
                <div
                  className="mt-3 text-meta opacity-60 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const { id, from } = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (from !== s) moveTask(id, s, from);
                  }}
                  style={{ minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  buraya at
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <table className="w-full text-body">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Tapşırıq', 'Status', 'İcraçı', 'Deadline'].map((h) => (
                <th
                  key={h}
                  className="text-meta text-left py-3 px-3"
                  style={{
                    color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-3 px-3">{t.title}</td>
                <td className="py-3 px-3">{TASK_STATUS_LABEL[t.status]}</td>
                <td className="py-3 px-3">{t.assignee_ids.length} nəfər</td>
                <td className="py-3 px-3">{t.deadline ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {blocker ? (
        <SubtaskBlockingModal
          parentTaskId={blocker.id}
          onCancel={() => setBlocker(null)}
          onResolved={() => {
            const b = blocker;
            setBlocker(null);
            if (b) moveTask(b.id, 'done', b.from);
          }}
        />
      ) : null}

      {creating ? <CreateTaskModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const create = useCreateTask();
  const { data: projects = [] } = useProjects();
  const { data: people = [] } = useActiveProfiles();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [assignees, setAssignees] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [duration, setDuration] = useState('');
  const [unit, setUnit] = useState<'hour' | 'day' | 'week'>('day');
  const [risk, setRisk] = useState('0');
  const [description, setDescription] = useState('');
  const [isExpertise, setIsExpertise] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(EXPERTISE_SUBTASKS));
  const [err, setErr] = useState<string | null>(null);

  function toggle(t: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
  function toggleAssignee(id: string) {
    setAssignees((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setErr(null);
    if (!title.trim()) return setErr('Başlıq lazımdır.');
    if (deadline && startDate && deadline < startDate) {
      return setErr('Deadline başlanğıcdan əvvəl ola bilməz.');
    }
    const dur = duration === '' ? null : Number(duration);
    if (dur != null && (!Number.isFinite(dur) || dur < 0)) {
      return setErr('Müddət düzgün deyil.');
    }
    const riskN = Number(risk);
    if (!Number.isFinite(riskN) || riskN < 0 || riskN > 100) {
      return setErr('Risk buffer 0–100 aralığında olmalıdır.');
    }
    create.mutate(
      {
        title: title.trim(),
        project_id: projectId || null,
        assignee_ids: [...assignees],
        start_date: startDate || null,
        deadline: deadline || null,
        estimated_duration: dur,
        duration_unit: dur != null ? unit : null,
        risk_buffer_pct: riskN,
        description: description.trim() || null,
        is_expertise_subtask: isExpertise,
        expertise_children: isExpertise ? [...picked] : [],
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[520px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">+ Yeni tapşırıq</h2>
        <label className="block mb-3">
          <div
            className="text-meta uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Başlıq
          </div>
          <input
            className="input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block mb-3">
          <div
            className="text-meta uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Layihə
          </div>
          <select
            className="input w-full"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">— Yoxdur —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="chip mb-3"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Daha az sahə' : 'Daha çox sahə'}
        </button>

        {showAdvanced ? (
          <>
            <div className="mb-3">
              <div
                className="text-meta uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                İcraçılar
              </div>
              <div
                className="rounded-card p-2 max-h-32 overflow-y-auto"
                style={{ border: '1px solid var(--line-soft)' }}
              >
                {people.length === 0 ? (
                  <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    İşçi yoxdur.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {people.map((p) => (
                      <li key={p.id}>
                        <label className="flex items-center gap-2 text-body cursor-pointer">
                          <input
                            type="checkbox"
                            checked={assignees.has(p.id)}
                            onChange={() => toggleAssignee(p.id)}
                          />
                          <span>{p.full_name ?? p.email}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block mb-3">
                <div
                  className="text-meta uppercase tracking-wider mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Başlanğıc
                </div>
                <input
                  className="input w-full"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="block mb-3">
                <div
                  className="text-meta uppercase tracking-wider mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Deadline
                </div>
                <input
                  className="input w-full"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block mb-3 col-span-2">
                <div
                  className="text-meta uppercase tracking-wider mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Müddət
                </div>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="0"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                  <select
                    className="input"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as typeof unit)}
                    disabled={duration === ''}
                  >
                    <option value="hour">saat</option>
                    <option value="day">gün</option>
                    <option value="week">həftə</option>
                  </select>
                </div>
              </label>
              <label className="block mb-3">
                <div
                  className="text-meta uppercase tracking-wider mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Risk %
                </div>
                <input
                  className="input w-full"
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                />
              </label>
            </div>

            <label className="block mb-3">
              <div
                className="text-meta uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Təsvir
              </div>
              <textarea
                className="input w-full"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </>
        ) : null}

        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={isExpertise}
            onChange={(e) => setIsExpertise(e.target.checked)}
          />
          <span className="text-body">
            Ekspertiza tapşırığı (alt-tapşırıqlar avtomatik təklif olunur)
          </span>
        </label>
        {isExpertise ? (
          <div
            className="rounded-card p-3 mb-3"
            style={{ background: 'var(--surface-mist)' }}
          >
            <div
              className="text-tiny uppercase tracking-wider mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Alt-tapşırıqlar
            </div>
            <ul className="space-y-1">
              {EXPERTISE_SUBTASKS.map((t) => (
                <li key={t}>
                  <label className="flex items-center gap-2 text-body">
                    <input
                      type="checkbox"
                      checked={picked.has(t)}
                      onChange={() => toggle(t)}
                    />
                    <span>{t}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {err ? (
          <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
            {err}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button className="btn-primary" disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </div>
    </div>
  );
}
