import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import {
  useActiveProfiles,
  useDayLogs,
  useDeleteDayLog,
  useProjects,
  useUpsertDayLog,
} from '@/lib/hooks';
import type { DayLog, Profile, Project } from '@/types/db';
import { formatDate } from '@/lib/format';

/**
 * Day-level timesheet (§11.1 / §12.1 — no per-task time tracking).
 * Default scope: current week. Self by default; admin can switch employees.
 */
export function TimesheetPage() {
  const { profile, isAdmin } = useAuth();
  const [employeeId, setEmployeeId] = useState<string>(profile?.id ?? '');
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
  const week = useMemo(() => weekRange(weekAnchor), [weekAnchor]);

  useEffect(() => {
    if (!employeeId && profile?.id) setEmployeeId(profile.id);
  }, [employeeId, profile?.id]);

  const { data: people = [] } = useActiveProfiles();
  const { data: projects = [] } = useProjects();
  const { data: logs = [], isLoading } = useDayLogs({
    employeeId: isAdmin ? employeeId || undefined : profile?.id,
    from: week.fromISO,
    to: week.toISO,
  });

  const totalHours = logs.reduce((s, l) => s + Number(l.hours), 0);

  return (
    <>
      <PageHead
        meta={`${week.fromHuman} – ${week.toHuman} · ${totalHours} saat`}
        title="Day Log"
        actions={
          <>
            <button className="btn-outline" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>
              ←
            </button>
            <button className="btn-outline" onClick={() => setWeekAnchor(new Date())}>
              Bu həftə
            </button>
            <button className="btn-outline" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>
              →
            </button>
          </>
        }
      />

      {isAdmin ? (
        <div className="card mb-4 flex items-center gap-3">
          <span
            className="text-meta uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            İşçi
          </span>
          <select
            className="input"
            style={{ width: 280 }}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="">— Hamı —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <WeekTable
        days={week.days}
        logs={logs}
        projects={projects}
        loading={isLoading}
        canEdit={!isAdmin || (!!employeeId && employeeId === profile?.id) || isAdmin}
        editorEmployeeId={isAdmin ? employeeId : profile?.id ?? ''}
      />
    </>
  );
}

function WeekTable({
  days,
  logs,
  projects,
  loading,
  canEdit,
  editorEmployeeId,
}: {
  days: Date[];
  logs: DayLog[];
  projects: Project[];
  loading: boolean;
  canEdit: boolean;
  editorEmployeeId: string;
}) {
  const upsert = useUpsertDayLog();
  const del = useDeleteDayLog();
  const byDay = useMemo(() => {
    const m = new Map<string, DayLog>();
    for (const l of logs) m.set(l.day, l);
    return m;
  }, [logs]);

  if (loading) return <div className="card text-meta">Yüklənir…</div>;

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {['Tarix', 'Saat', 'Layihə', 'Qeyd', ''].map((h, i) => (
              <th
                key={`${h}-${i}`}
                className="text-left py-3 px-3 text-meta"
                style={{
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const iso = isoDate(d);
            const log = byDay.get(iso) ?? null;
            return (
              <DayRow
                key={iso}
                day={d}
                iso={iso}
                log={log}
                projects={projects}
                canEdit={canEdit && !!editorEmployeeId}
                editorEmployeeId={editorEmployeeId}
                onSave={(values) =>
                  upsert.mutate({
                    employee_id: editorEmployeeId,
                    day: iso,
                    hours: values.hours,
                    project_id: values.project_id || null,
                    note: values.note || null,
                  })
                }
                onDelete={() => log && del.mutate(log.id)}
                busy={upsert.isPending || del.isPending}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DayRow({
  day,
  iso,
  log,
  projects,
  canEdit,
  onSave,
  onDelete,
  busy,
}: {
  day: Date;
  iso: string;
  log: DayLog | null;
  projects: Project[];
  canEdit: boolean;
  onSave: (v: { hours: number; project_id: string; note: string }) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [hours, setHours] = useState<string>(log ? String(log.hours) : '');
  const [projectId, setProjectId] = useState<string>(log?.project_id ?? '');
  const [note, setNote] = useState<string>(log?.note ?? '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setHours(log ? String(log.hours) : '');
    setProjectId(log?.project_id ?? '');
    setNote(log?.note ?? '');
    setDirty(false);
  }, [log?.id, log?.hours, log?.project_id, log?.note]);

  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const dayLabel = new Intl.DateTimeFormat('az-AZ', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(day);

  function save() {
    const n = Number(hours);
    if (!Number.isFinite(n) || n < 0 || n > 24) return;
    onSave({ hours: n, project_id: projectId, note });
    setDirty(false);
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--line-soft)', opacity: isWeekend ? 0.65 : 1 }}>
      <td className="py-3 px-3" style={{ width: 140 }}>
        <div className="text-body">{dayLabel}</div>
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {formatDate(iso)}
        </div>
      </td>
      <td className="py-3 px-3" style={{ width: 90 }}>
        <input
          className="input w-full"
          type="number"
          min="0"
          max="24"
          step="0.25"
          value={hours}
          disabled={!canEdit}
          onChange={(e) => {
            setHours(e.target.value);
            setDirty(true);
          }}
          onBlur={() => dirty && save()}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        />
      </td>
      <td className="py-3 px-3">
        <select
          className="input w-full"
          value={projectId}
          disabled={!canEdit}
          onChange={(e) => {
            setProjectId(e.target.value);
            setDirty(true);
          }}
          onBlur={() => dirty && save()}
        >
          <option value="">— Layihə yoxdur —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 px-3">
        <input
          className="input w-full"
          value={note}
          disabled={!canEdit}
          onChange={(e) => {
            setNote(e.target.value);
            setDirty(true);
          }}
          onBlur={() => dirty && save()}
        />
      </td>
      <td className="py-3 px-3 text-right" style={{ width: 90 }}>
        {log && canEdit ? (
          <button
            className="btn-outline"
            disabled={busy}
            style={{ color: 'var(--danger, #B91C1C)' }}
            onClick={() => {
              if (!confirm('Qeydi silmək istəyirsən?')) return;
              onDelete();
            }}
          >
            Sil
          </button>
        ) : null}
      </td>
    </tr>
  );
}

// ---------------- helpers ----------------
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function weekRange(anchor: Date) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const fromISO = isoDate(days[0]);
  const toISO = isoDate(days[6]);
  return {
    fromISO,
    toISO,
    days,
    fromHuman: formatDate(fromISO, { day: '2-digit', month: 'short' }),
    toHuman: formatDate(toISO, { day: '2-digit', month: 'short' }),
  };
}
