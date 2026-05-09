/**
 * Karyera Strukturu (PRD §M9.2). Admin manages the level catalogue;
 * users read the ladder + see their current level highlighted with a
 * promotion path to the next tier.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { relativeTime } from '@/lib/format';

type PromotionRow = {
  id: string;
  employee_id: string;
  target_level_id: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  rationale: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
};

type LevelRow = {
  id: string;
  level_index: number;
  name: string;
  description: string | null;
  requirements: string[];
};

export function CareerPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LevelRow | null>(null);

  const levels = useQuery({
    queryKey: ['career-levels'],
    queryFn: async (): Promise<LevelRow[]> => {
      const { data, error } = await supabase
        .from('career_levels')
        .select('*')
        .order('level_index', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string;
        level_index: number;
        name: string;
        description: string | null;
        requirements: unknown;
      }>).map((r) => ({
        ...r,
        requirements: Array.isArray(r.requirements) ? (r.requirements as string[]) : [],
      }));
    },
  });

  const myLevelId = useMemo(() => {
    if (!profile) return null;
    return (profile as { career_level_id?: string | null }).career_level_id ?? null;
  }, [profile]);

  const myLevel = (levels.data ?? []).find((l) => l.id === myLevelId);
  const nextLevel = myLevel
    ? (levels.data ?? []).find((l) => l.level_index === myLevel.level_index + 1) ?? null
    : null;

  return (
    <>
      <PageHead
        meta={myLevel ? `Sənin səviyyən: ${myLevel.name}` : 'Promosyon yolu'}
        title="Karyera Strukturu"
        actions={
          isAdmin ? (
            <button
              className="btn-primary"
              onClick={() =>
                setEditing({
                  id: '',
                  level_index: ((levels.data ?? []).at(-1)?.level_index ?? 0) + 1,
                  name: '',
                  description: null,
                  requirements: [],
                })
              }
            >
              + Səviyyə
            </button>
          ) : null
        }
      />

      {myLevel && nextLevel ? (
        <PromotionPath
          myLevelName={myLevel.name}
          nextLevelId={nextLevel.id}
          nextLevelName={nextLevel.name}
          requirements={nextLevel.requirements}
          employeeId={profile?.id ?? null}
          isAdminView={isAdmin}
        />
      ) : null}

      {isAdmin ? <AdminQueue levels={levels.data ?? []} /> : null}

      <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {(levels.data ?? []).map((l) => {
          const isMine = l.id === myLevelId;
          return (
            <li
              key={l.id}
              className="card"
              style={{
                borderColor: isMine ? 'var(--brand-text)' : 'var(--line)',
                borderWidth: isMine ? 2 : 1,
              }}
            >
              <div
                className="text-meta uppercase tracking-wider"
                style={{ color: isMine ? 'var(--brand-text)' : 'var(--text-muted)' }}
              >
                Səviyyə {l.level_index}
                {isMine ? ' · Sən' : ''}
              </div>
              <h3 className="text-h3 mt-1">{l.name}</h3>
              {l.description ? (
                <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>
                  {l.description}
                </p>
              ) : null}
              {l.requirements.length > 0 ? (
                <ul
                  className="mt-3 space-y-1 text-meta"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {l.requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                        style={{ background: 'var(--text-muted)' }}
                      />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  className="btn-ghost mt-3"
                  onClick={() => setEditing(l)}
                  style={{ height: 32, padding: '0 12px' }}
                >
                  Düzəlt
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {editing && isAdmin ? (
        <LevelModal
          level={editing}
          onClose={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['career-levels'] });
          }}
        />
      ) : null}
    </>
  );
}

function LevelModal({ level, onClose }: { level: LevelRow; onClose: () => void }) {
  const [name, setName] = useState(level.name);
  const [description, setDescription] = useState(level.description ?? '');
  const [reqsText, setReqsText] = useState(level.requirements.join('\n'));
  const [levelIndex, setLevelIndex] = useState<number>(level.level_index);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad tələb olunur');
      const reqs = reqsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        level_index: levelIndex,
        name: name.trim(),
        description: description.trim() || null,
        requirements: reqs,
      };
      if (level.id) {
        const { error } = await supabase.from('career_levels').update(payload).eq('id', level.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('career_levels').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: onClose,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('career_levels').delete().eq('id', level.id);
      if (error) throw error;
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Səviyyə"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{level.id ? 'Düzəlt' : '+ Yeni səviyyə'}</h2>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-[100px,1fr] gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Sıra
              </span>
              <input
                type="number"
                min={1}
                className="input"
                value={levelIndex}
                onChange={(e) => setLevelIndex(Number(e.target.value))}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Ad
              </span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Təsvir
            </span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Tələblər (hər sətir bir nöqtə)
            </span>
            <textarea
              className="input"
              value={reqsText}
              onChange={(e) => setReqsText(e.target.value)}
              style={{ minHeight: 140, padding: '12px 14px', whiteSpace: 'pre-wrap' }}
              placeholder={'Müstəqil paket sahibliyi\nMentee dəstəyi'}
            />
          </label>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-between items-center mt-6">
          {level.id ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              style={{ color: 'var(--state-error)' }}
            >
              Sil
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              disabled={save.isPending}
            >
              Geri
            </button>
            <button type="submit" className="btn-primary" disabled={save.isPending || !name}>
              {save.isPending ? 'Yadda saxlanılır…' : 'Yadda saxla'}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}

function PromotionPath({
  myLevelName,
  nextLevelId,
  nextLevelName,
  requirements,
  employeeId,
  isAdminView,
}: {
  myLevelName: string;
  nextLevelId: string;
  nextLevelName: string;
  requirements: string[];
  employeeId: string | null;
  isAdminView: boolean;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [rationale, setRationale] = useState('');

  const myRequest = useQuery({
    queryKey: ['promotion-mine', employeeId],
    enabled: !!employeeId && !isAdminView,
    queryFn: async (): Promise<PromotionRow | null> => {
      const { data, error } = await supabase
        .from('promotion_requests')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PromotionRow | null;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('Profil hazır deyil');
      const { error } = await supabase.from('promotion_requests').insert({
        employee_id: employeeId,
        target_level_id: nextLevelId,
        rationale: rationale.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setShowForm(false);
      setRationale('');
      qc.invalidateQueries({ queryKey: ['promotion-mine'] });
    },
  });

  const cancelOwn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('promotion_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotion-mine'] }),
  });

  const pending = myRequest.data?.status === 'pending' ? myRequest.data : null;

  return (
    <div
      className="card-feature mb-5"
      style={{ background: 'var(--brand-mist)', color: 'var(--ink)' }}
    >
      <div
        className="text-tiny font-medium"
        style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        Promosyon yolu
      </div>
      <h2 className="text-h2 mt-1">
        {myLevelName} → {nextLevelName}
      </h2>
      {requirements.length > 0 ? (
        <ul className="mt-3 space-y-1 text-body">
          {requirements.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: 'var(--brand-text)' }}
              />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {!isAdminView && employeeId ? (
        pending ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className="chip"
              style={{ background: '#FFF6E5', color: '#92400E' }}
            >
              Gözləmədə · {relativeTime(pending.created_at)}
            </span>
            <button
              type="button"
              className="text-meta hover:underline"
              style={{ color: 'var(--ink)', opacity: 0.7 }}
              onClick={() => cancelOwn.mutate(pending.id)}
            >
              Müraciəti ləğv et
            </button>
          </div>
        ) : showForm ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <textarea
              className="input flex-1 min-w-[240px]"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Niyə artıq hazır olduğunu qısa yaz…"
              style={{ minHeight: 60, padding: '8px 12px' }}
            />
            <button type="submit" className="btn-primary" disabled={submit.isPending}>
              {submit.isPending ? 'Göndərilir…' : 'Müraciət göndər'}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setShowForm(false)}
            >
              Geri
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => setShowForm(true)}
          >
            Promosyona müraciət et
          </button>
        )
      ) : null}
    </div>
  );
}

function AdminQueue({
  levels,
}: {
  levels: Array<{ id: string; name: string; level_index: number }>;
}) {
  const qc = useQueryClient();
  const requests = useQuery({
    queryKey: ['promotion-queue'],
    queryFn: async (): Promise<PromotionRow[]> => {
      const { data, error } = await supabase
        .from('promotion_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PromotionRow[];
    },
  });

  const decide = useMutation({
    mutationFn: async (input: { id: string; status: 'approved' | 'denied' }) => {
      const { error } = await supabase.rpc('promotion_decide', {
        p_id: input.id,
        p_status: input.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotion-queue'] });
      qc.invalidateQueries({ queryKey: ['career-levels'] });
    },
  });

  const list = requests.data ?? [];
  const levelMap = new Map(levels.map((l) => [l.id, l.name]));

  if (list.length === 0) {
    return (
      <div
        className="card mb-5 text-meta"
        style={{ color: 'var(--text-muted)' }}
      >
        Gözləyən promosyon müraciəti yoxdur.
      </div>
    );
  }

  return (
    <div className="card mb-5">
      <h3 className="text-h3 mb-3">Promosyon növbəsi · {list.length}</h3>
      <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
        {list.map((r) => (
          <li key={r.id} className="py-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-body">
                <code style={{ background: 'var(--surface-mist)', padding: '1px 6px' }}>
                  {r.employee_id.slice(0, 8)}
                </code>{' '}
                → <strong>{levelMap.get(r.target_level_id) ?? '—'}</strong>
              </div>
              {r.rationale ? (
                <p className="text-meta mt-1" style={{ color: 'var(--text-soft)' }}>
                  {r.rationale}
                </p>
              ) : null}
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {relativeTime(r.created_at)}
              </div>
            </div>
            <span className="flex gap-1 shrink-0">
              <button
                type="button"
                className="chip chip-brand"
                onClick={() => decide.mutate({ id: r.id, status: 'approved' })}
              >
                Təsdiqlə
              </button>
              <button
                type="button"
                className="chip"
                style={{ background: '#FEEEED', color: 'var(--state-error)' }}
                onClick={() => decide.mutate({ id: r.id, status: 'denied' })}
              >
                Rədd
              </button>
            </span>
          </li>
        ))}
      </ul>
      {decide.error ? (
        <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
          {(decide.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}
