/**
 * REQ-AUTH-03 — user profile: avatar, full_name, locale, telegram linking.
 * Email and role are read-only (admin-only to change per PRD §5 MODULE 1).
 * US-AUTH-04 — user can edit avatar, name, and locale.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { Avatar } from '@/components/Avatar';
import { SkeletonBox } from '@/components/Skeleton';
import { toast } from '@/components/Toast';
import { formatDuration } from '@/lib/useTimeTracking';
import { downloadCsv } from '@/lib/csv';
import { relativeTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import type { Profile } from '@/types/db';
import { useNavigate } from 'react-router-dom';

const LOCALES = [
  { value: 'az', label: 'Azərbaycan dili' },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
] as const;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function ProfilePage() {
  const { profile, role, setProfile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [locale, setLocale] = useState<'az' | 'en' | 'ru'>(profile?.locale ?? 'az');
  const [saved, setSaved] = useState(false);

  // Avatar upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarDragOver, setAvatarDragOver] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Sessiya yoxdur');
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() || null, locale })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setProfile(data as Profile, role);
      qc.invalidateQueries({ queryKey: ['profile'] });
      setSaved(true);
      toast.success('Profil yeniləndi');
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // REQ-AUTH-03 — avatar upload: validate → upload to Storage → update profiles → sync store
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-selecting the same file triggers onChange again
    e.target.value = '';
    await uploadAvatarFile(file);
  }

  // PRD §UX — accept a File from input OR drag-and-drop; shared validate + upload path
  async function uploadAvatarFile(file: File | undefined) {
    if (!file || !profile) return;

    setAvatarError(null);

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setAvatarError('Yalnız JPEG, PNG, WebP və ya GIF formatı qəbul edilir.');
      return;
    }
    // Validate size
    if (file.size > MAX_BYTES) {
      setAvatarError('Fayl həcmi 5 MB-dan çox ola bilməz.');
      return;
    }

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${profile.id}/${Date.now()}.${ext}`;

    setAvatarUploading(true);
    try {
      // Upload to Supabase Storage bucket "avatars"
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      // Update profiles row
      const { data, error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (dbError) throw dbError;

      // Sync Zustand store + invalidate React Query cache
      setProfile(data as Profile, role);
      qc.invalidateQueries({ queryKey: ['profile'] });
    } catch (err) {
      setAvatarError((err as Error).message ?? 'Yükləmə uğursuz oldu.');
    } finally {
      setAvatarUploading(false);
    }
  }

  // PRD §UX — clear avatar (revert to initials). Storage object is left in place
  // intentionally (orphaned); cleanup is a separate batch job concern.
  async function removeAvatar() {
    if (!profile || !profile.avatar_url) return;
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;
      setProfile(data as Profile, role);
      qc.invalidateQueries({ queryKey: ['profile'] });
    } catch (err) {
      setAvatarError((err as Error).message ?? 'Silinmə uğursuz oldu.');
    } finally {
      setAvatarUploading(false);
    }
  }

  // PRD §6.7 — skeleton while profile is hydrating (auth bootstrap)
  if (!profile) {
    return (
      <>
        <PageHead meta="Hesabım" title="Profil" />
        <div className="max-w-xl space-y-3">
          <SkeletonBox height={120} radius={14} />
          <SkeletonBox height={180} radius={14} />
          <SkeletonBox height={120} radius={14} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        meta="Hesabım"
        title={profile.full_name ? `Profil — ${profile.full_name.split(' ')[0]}` : 'Profil'}
      />

      <div className="max-w-xl space-y-6">
        {/* Avatar — click to upload (REQ-AUTH-03) */}
        <div className="card flex items-center gap-5">
          <div
            className="flex flex-col items-center gap-1"
            // PRD §UX — drag-and-drop file onto avatar to upload
            onDragOver={(e) => { e.preventDefault(); setAvatarDragOver(true); }}
            onDragLeave={() => setAvatarDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setAvatarDragOver(false);
              if (avatarUploading) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void uploadAvatarFile(file);
            }}
            style={avatarDragOver
              ? { outline: '2px dashed var(--brand-action)', outlineOffset: 4, borderRadius: 8 }
              : undefined}
          >
            {/* Clickable avatar wrapper */}
            <button
              type="button"
              className="relative rounded-full focus:outline-none focus-visible:ring-2"
              style={{ width: 64, height: 64 }}
              onClick={() => !avatarUploading && fileInputRef.current?.click()}
              aria-label="Foto yüklə"
              disabled={avatarUploading}
            >
              {/* Dim avatar during upload */}
              <span
                style={{
                  opacity: avatarUploading ? 0.45 : 1,
                  transition: 'opacity 0.2s',
                  display: 'block',
                }}
              >
                <Avatar
                  name={profile.full_name ?? profile.email}
                  url={profile.avatar_url}
                  size={64}
                  tooltip={[profile.full_name, profile.email, role?.name].filter(Boolean).join(' · ')}
                />
              </span>

              {/* Spinner overlay while uploading */}
              {avatarUploading && (
                <span
                  className="absolute inset-0 flex items-center justify-center rounded-full"
                  style={{ background: 'rgba(0,0,0,0.25)' }}
                  aria-hidden="true"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </span>
              )}
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Label under avatar */}
            <span
              className="text-meta cursor-pointer select-none"
              style={{ color: 'var(--brand-text)', fontSize: 12 }}
              onClick={() => !avatarUploading && fileInputRef.current?.click()}
            >
              {avatarUploading ? 'Yüklənir…' : 'Foto yüklə'}
            </span>
            {/* PRD §UX — constraint hint so users know limits BEFORE they fail */}
            <span
              className="text-meta text-center"
              style={{ color: 'var(--text-muted)', fontSize: 10, opacity: 0.7 }}
            >
              JPG / PNG / WEBP / GIF · maks 5 MB · sürüklə-burax
            </span>
            {/* PRD §UX — remove photo (revert to initials avatar) */}
            {profile.avatar_url && !avatarUploading ? (
              <button
                type="button"
                className="text-meta hover:underline"
                style={{ color: 'var(--error-deep)', fontSize: 10 }}
                onClick={removeAvatar}
              >
                Şəkli sil
              </button>
            ) : null}

            {/* Inline error */}
            {avatarError && (
              <p
                className="text-meta text-center"
                style={{ color: 'var(--error-deep)', fontSize: 12, maxWidth: 120 }}
              >
                {avatarError}
              </p>
            )}
          </div>

          <div>
            <div className="text-h3 flex items-center gap-2">
              {profile.full_name ?? '—'}
              {/* PRD §UX — locale chip so user sees current language at a glance */}
              <span
                className="chip"
                style={{
                  background: 'var(--surface-mist)',
                  color: 'var(--text-muted)',
                  fontSize: 10,
                  padding: '0 6px',
                  textTransform: 'uppercase',
                }}
                title={`Dil: ${profile.locale}`}
              >
                {profile.locale}
              </span>
            </div>
            <div className="text-meta mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {/* PRD §UX — mailto link so user (or admin viewing) can compose with one click */}
              <a
                href={`mailto:${profile.email}`}
                className="hover:underline"
                style={{ color: 'inherit' }}
              >
                {profile.email}
              </a>
            </div>
            <div className="text-meta mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {role?.name ?? 'Üzv'}
              {profile.is_creator ? ' · Creator' : ''}
              {/* PRD §UX — membership age so user sees how long they've been on Reflect */}
              {profile.created_at ? (
                <span
                  title={new Date(profile.created_at).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}
                >
                  {' · üzv '}{relativeTime(profile.created_at)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Edit form */}
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate();
          }}
        >
          <h3 className="text-h3">Məlumatlarımı redaktə et</h3>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Ad Soyad
            </span>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Adınız Soyadınız"
            />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              E-poçt (dəyişilmir)
            </span>
            <div className="relative">
              <input className="input opacity-60 pr-20" value={profile.email} readOnly />
              {/* PRD §UX — one-click copy to clipboard with brief confirmation */}
              <CopyEmailButton email={profile.email} />
            </div>
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Rol (dəyişilmir)
            </span>
            <input className="input opacity-60" value={role?.name ?? '—'} readOnly />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Dil
            </span>
            <select
              className="input"
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'az' | 'en' | 'ru')}
            >
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          {update.error ? (
            <p className="text-meta" style={{ color: 'var(--error-deep)' }}>
              {(update.error as Error).message}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={update.isPending}>
              {update.isPending ? 'Saxlanılır…' : 'Saxla'}
            </button>
            {saved ? (
              <span className="text-meta" style={{ color: 'var(--brand-text)' }}>
                Saxlanıldı ✓
              </span>
            ) : null}
          </div>
        </form>

        {/* Telegram linking */}
        <div className="card space-y-3">
          <h3 className="text-h3">Telegram</h3>
          {profile.telegram_chat_id ? (
            <div className="flex items-center gap-3">
              <span
                className="chip"
                style={{ background: 'var(--brand-glow-lg)', color: 'var(--brand-text)' }}
              >
                Qoşulub
              </span>
              <span
                className="text-meta"
                style={{ color: 'var(--text-muted)' }}
                title={profile.telegram_linked_at
                  ? new Date(profile.telegram_linked_at).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })
                  : undefined}
              >
                {profile.telegram_linked_at
                  ? `${relativeTime(profile.telegram_linked_at)} qoşulub`
                  : ''}
              </span>
            </div>
          ) : (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Telegram qoşulmayıb. Bildirişlər üçün qoşun.
            </p>
          )}
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate('/telegram')}
          >
            {profile.telegram_chat_id ? 'Yenidən qoş' : 'Telegram-ı qoş'}
          </button>
        </div>

        {/* Password change — REQ-AUTH-03 */}
        <PasswordChangeCard email={profile.email} />

        {/* Email change request — admin approval required (REQ-AUTH-03) */}
        <EmailChangeRequestCard userId={profile.id} currentEmail={profile.email} />

        {/* PRD §UX — personal stats summary (admin or self) */}
        <PersonalStatsCard userId={profile.id} />

        {/* Bu günkü izlənmiş vaxt — time tracking sessions */}
        <TimeEntriesTodayCard userId={profile.id} />

        {/* Login history (REQ-AUTH-03 / §9.4) — last 10 sessions */}
        <LoginHistoryCard userId={profile.id} />

        {/* Notification preferences shortcut */}
        <div className="card">
          <h3 className="text-h3 mb-2">Bildiriş tənzimləmələri</h3>
          <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
            Hansı bildirişlər alacağınızı seçin.
          </p>
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate('/bildirişlər')}
          >
            Bildirişlərə keç →
          </button>
        </div>
      </div>

      {/* Inline spinner keyframe — scoped to avoid global pollution */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// REQ-AUTH-03 — change Supabase Auth password (Profile-only; admin role mgmt
// stays in Settings → Dəvətlər). Re-authentication via current password
// before issuing the updateUser call to mitigate session-hijack risk.
function PasswordChangeCard({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErr(null);
    setOk(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);

    if (newPassword.length < 8) {
      setErr('Yeni şifrə ən azı 8 simvol olmalıdır');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr('Yeni şifrə təsdiq ilə üst-üstə düşmür');
      return;
    }

    setBusy(true);
    try {
      // Re-authenticate by signing in again with the current password.
      // signInWithPassword refreshes the session — if it fails, password is wrong.
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signErr) throw new Error('Cari şifrə yanlışdır');

      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) throw updErr;

      setOk(true);
      reset();
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h3 className="text-h3">Şifrə</h3>
      {!open ? (
        <>
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Şifrəni mütəmadi olaraq dəyişmək məsləhətdir.
          </p>
          <button type="button" className="btn-outline" onClick={() => { setOpen(true); reset(); }}>
            Şifrəni dəyiş
          </button>
          {ok ? (
            <p className="text-meta" style={{ color: 'var(--success-deep)' }}>
              ✓ Şifrə uğurla dəyişdirildi
            </p>
          ) : null}
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Cari şifrə</span>
            <input
              type="password"
              className="input w-full"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Yeni şifrə (min 8)</span>
            <input
              type="password"
              className="input w-full"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Yeni şifrəni təsdiq et</span>
            <input
              type="password"
              className="input w-full"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {err ? (
            <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{err}</p>
          ) : null}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn-outline"
              onClick={() => { setOpen(false); reset(); }}
              disabled={busy}
            >
              Ləğv
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Dəyişdirilir…' : 'Şifrəni yenilə'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// REQ-AUTH-03 — user requests an email change; admin reviews + applies
// (admin-approval prevents account-takeover via stolen session).
function EmailChangeRequestCard({ userId, currentEmail }: { userId: string; currentEmail: string }) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Show pending status if there's already an open request
  const pending = useQuery({
    queryKey: ['email_change_request', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_change_requests')
        .select('id, new_email, status, created_at, reviewed_at, review_note')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; new_email: string; status: string; created_at: string; reviewed_at: string | null; review_note: string | null } | null;
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!newEmail.includes('@')) {
      setErr('Etibarlı email daxil edin');
      return;
    }
    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setErr('Yeni email cari ilə eyni ola bilməz');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from('email_change_requests').insert({
        user_id: userId,
        current_email: currentEmail,
        new_email: newEmail.trim().toLowerCase(),
        reason: reason.trim() || null,
      });
      if (error) throw error;
      setSubmitted(true);
      setOpen(false);
      setNewEmail('');
      setReason('');
      pending.refetch();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h3 className="text-h3">Email</h3>
      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        Cari email: <code style={{ background: 'var(--surface-mist)', padding: '1px 6px', borderRadius: 4 }}>{currentEmail}</code>
      </p>

      {pending.data ? (
        <div
          className="rounded-card px-3 py-2"
          style={{
            background: 'var(--brand-glow-sm)',
            border: '1px solid var(--brand-glow-xl)',
            color: 'var(--brand-text)',
          }}
        >
          <div className="text-meta">
            ⏳ Gözləyən sorğu: <strong>{pending.data.new_email}</strong>
          </div>
          <div className="text-meta opacity-70" style={{ fontSize: 11 }}>
            {new Date(pending.data.created_at).toLocaleDateString('az-AZ')} tarixində göndərildi · admin təsdiqini gözləyir
          </div>
        </div>
      ) : !open ? (
        <>
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Email dəyişikliyi admin təsdiqi tələb edir.
          </p>
          <button type="button" className="btn-outline" onClick={() => { setOpen(true); setSubmitted(false); }}>
            Email dəyişikliyi tələb et
          </button>
          {submitted ? (
            <p className="text-meta" style={{ color: 'var(--success-deep)' }}>
              ✓ Sorğu göndərildi
            </p>
          ) : null}
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Yeni email</span>
            <input
              type="email"
              required
              className="input w-full"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Səbəb (könüllü)</span>
            <textarea
              className="input w-full"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Niyə email-i dəyişmək istəyirsən?"
            />
          </label>
          {err ? <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{err}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => { setOpen(false); setErr(null); }} disabled={busy}>
              Ləğv
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Göndərilir…' : 'Sorğu göndər'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// PRD §UX — single-purpose copy-email chip with brief "✓ Kopyalandı" confirmation.
function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="absolute right-1 top-1/2 -translate-y-1/2 chip"
      style={{ fontSize: 11, color: copied ? 'var(--brand-text)' : 'var(--text-muted)' }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(email);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard requires secure context — silently ignore */
        }
      }}
      aria-label="E-poçtu kopyala"
    >
      {copied ? '✓ Kopyalandı' : '📋 Kopyala'}
    </button>
  );
}

// PRD §UX — at-a-glance personal stats: open tasks, done this year, member projects.
// Uses head:true count queries so we don't pull row data.
function PersonalStatsCard({ userId }: { userId: string }) {
  const stats = useQuery({
    queryKey: ['profile-stats', userId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const year = new Date().getFullYear();
      const yearStart = new Date(year, 0, 1).toISOString();
      const lastYearStart = new Date(year - 1, 0, 1).toISOString();
      const lastYearEnd = yearStart;
      const [openTasks, doneTasks, doneLastYear, projects] = await Promise.all([
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .contains('assignee_ids', [userId])
          .is('archived_at', null)
          .not('status', 'in', '("done","cancelled")'),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .contains('assignee_ids', [userId])
          .eq('status', 'done')
          .gte('updated_at', yearStart),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .contains('assignee_ids', [userId])
          .eq('status', 'done')
          .gte('updated_at', lastYearStart)
          .lt('updated_at', lastYearEnd),
        supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .is('archived_at', null)
          .eq('status', 'active'),
      ]);
      return {
        open: openTasks.count ?? 0,
        doneYear: doneTasks.count ?? 0,
        doneLastYear: doneLastYear.count ?? 0,
        activeProjects: projects.count ?? 0,
      };
    },
  });
  // PRD §UX — Δ vs same point last year (rough trend signal)
  const yoyDelta = (stats.data?.doneYear ?? 0) - (stats.data?.doneLastYear ?? 0);
  return (
    <div className="card grid grid-cols-3 gap-3">
      <div>
        <div className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>Açıq tapşırıq</div>
        <div className="text-h2" style={{ fontVariantNumeric: 'tabular-nums' }}>{stats.data?.open ?? 0}</div>
      </div>
      <div>
        <div className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>Bu il tamamlanıb</div>
        <div className="text-h2 flex items-baseline gap-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {stats.data?.doneYear ?? 0}
          {/* PRD §UX — Δ vs last year for context */}
          {stats.data && (stats.data.doneLastYear > 0 || stats.data.doneYear > 0) ? (
            <span
              className="text-meta"
              style={{
                color: yoyDelta > 0 ? 'var(--success-deep, #16794a)' : yoyDelta < 0 ? 'var(--error-deep, #b3261e)' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 500,
              }}
              title={`Keçən il bu vaxta: ${stats.data.doneLastYear}`}
            >
              {yoyDelta > 0 ? '▲' : yoyDelta < 0 ? '▼' : '='} {Math.abs(yoyDelta)}
            </span>
          ) : null}
        </div>
      </div>
      <div>
        <div className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>Aktiv layihə (firma)</div>
        <div className="text-h2" style={{ fontVariantNumeric: 'tabular-nums' }}>{stats.data?.activeProjects ?? 0}</div>
      </div>
    </div>
  );
}

// PRD §REQ-AUTH-03 + §9.4 — show last 10 login events for this user from audit_log
function LoginHistoryCard({ userId }: { userId: string }) {
  const history = useQuery({
    queryKey: ['login_history', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('id, created_at, ip, user_agent')
        .eq('actor_id', userId)
        .eq('action', 'login')
        .order('created_at', { ascending: false })
        .limit(10);
      return (data ?? []) as Array<{ id: string; created_at: string; ip: string | null; user_agent: string | null }>;
    },
  });

  function shortUA(ua: string | null): string {
    if (!ua) return '—';
    // Best-effort browser/OS extraction
    const m = ua.match(/(Chrome|Safari|Firefox|Edge|Opera)\/[\d.]+/);
    const os = ua.match(/Windows|Mac OS X|Linux|Android|iPhone/);
    return `${m?.[0] ?? 'Naməlum'} · ${os?.[0] ?? '—'}`;
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3">Daxil olma tarixçəsi</h3>
        {/* PRD §9.4 — let user export their own login audit trail */}
        {(history.data ?? []).length > 0 ? (
          <button
            type="button"
            className="chip"
            style={{ fontSize: 11, color: 'var(--text-muted)' }}
            onClick={() => {
              downloadCsv(
                `daxil-olma-${new Date().toISOString().slice(0, 10)}.csv`,
                ['Tarix', 'IP', 'Brauzer/OS'],
                (history.data ?? []).map((h) => ({
                  'Tarix': new Date(h.created_at).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' }),
                  'IP': h.ip ?? '',
                  'Brauzer/OS': shortUA(h.user_agent),
                })),
              );
            }}
            title="CSV faylı yüklə"
          >
            ↓ CSV
          </button>
        ) : null}
      </div>
      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        Son 10 sessiya. Tanımadığın bir girişi görürsənsə, dərhal şifrəni dəyiş.
      </p>
      {history.isLoading ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</div>
      ) : (history.data ?? []).length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Hələ qeyd yoxdur.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
          {(history.data ?? []).map((h) => (
            <li key={h.id} className="py-2 flex items-center justify-between gap-3 text-meta">
              <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(h.created_at).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{shortUA(h.user_agent)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Time tracking — today's sessions with per-task duration + total + CSV export
function TimeEntriesTodayCard({ userId }: { userId: string }) {
  const entries = useQuery({
    queryKey: ['time-entries-day', userId],
    queryFn: async () => {
      // Asia/Baku midnight today
      const now = new Date();
      const offsetMin = 4 * 60;
      const local = new Date(now.getTime() + offsetMin * 60_000);
      local.setUTCHours(0, 0, 0, 0);
      const since = new Date(local.getTime() - offsetMin * 60_000).toISOString();

      const { data } = await supabase
        .from('time_entries')
        .select('id, task_id, started_at, ended_at, duration_seconds, tasks(title)')
        .eq('user_id', userId)
        .gte('started_at', since)
        .order('started_at', { ascending: false });
      return (data ?? []) as Array<{
        id: string;
        task_id: string;
        started_at: string;
        ended_at: string | null;
        duration_seconds: number | null;
        tasks?: { title: string }[] | { title: string } | null;
      }>;
    },
  });

  const rows = entries.data ?? [];

  // Weekly total — separate query (last 7 days)
  const weekly = useQuery({
    queryKey: ['time-entries-week', userId],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data } = await supabase
        .from('time_entries')
        .select('duration_seconds, started_at, ended_at')
        .eq('user_id', userId)
        .gte('started_at', since);
      let total = 0;
      for (const r of (data ?? []) as Array<{ duration_seconds: number | null; started_at: string; ended_at: string | null }>) {
        if (r.duration_seconds != null) total += r.duration_seconds;
        else if (!r.ended_at) total += Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000);
      }
      return total;
    },
  });

  if (rows.length === 0) return null;

  const total = rows.reduce((s, r) => {
    if (r.duration_seconds != null) return s + r.duration_seconds;
    if (!r.ended_at) return s + Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000);
    return s;
  }, 0);

  function taskTitle(r: typeof rows[number]): string {
    const t = r.tasks;
    if (Array.isArray(t)) return t[0]?.title ?? r.task_id.slice(0, 8);
    return t?.title ?? r.task_id.slice(0, 8);
  }

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-h3">
          ⏱ Bu gün ({formatDuration(total)})
          {weekly.data != null ? (
            <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>
              · həftə {formatDuration(weekly.data)}
            </span>
          ) : null}
        </h3>
        {/* Per-project breakdown — tasks aggregated by their project */}
        <PerProjectTimeBreakdown userId={userId} since={(() => {
          const now = new Date();
          const local = new Date(now.getTime() + 4 * 3600_000);
          local.setUTCHours(0, 0, 0, 0);
          return new Date(local.getTime() - 4 * 3600_000).toISOString();
        })()} />
        <button
          type="button"
          className="chip"
          style={{ fontSize: 11, color: 'var(--text-muted)' }}
          onClick={() => {
            downloadCsv(
              `time-entries-${new Date().toISOString().slice(0, 10)}`,
              ['Başlama', 'Bitmə', 'Müddət (san)', 'Tapşırıq'],
              rows.map((r) => ({
                Başlama: r.started_at,
                Bitmə: r.ended_at ?? '',
                'Müddət (san)': r.duration_seconds ?? '',
                Tapşırıq: taskTitle(r),
              })),
            );
          }}
        >
          ↓ CSV
        </button>
      </div>
      {/* Last 7 days mini-bars (newest right) */}
      <WeeklyTimeBars userId={userId} />
      <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
        {rows.map((r) => (
          <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-meta">
            <span className="truncate" style={{ color: 'var(--text)' }}>{taskTitle(r)}</span>
            <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
              {r.duration_seconds != null
                ? formatDuration(r.duration_seconds)
                : <span style={{ color: 'var(--brand-action)' }}>aktiv</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 7-day mini bar chart of tracked seconds per day (Mon-Sun in Asia/Baku)
function WeeklyTimeBars({ userId }: { userId: string }) {
  const week = useQuery({
    queryKey: ['time-entries-week-bars', userId],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data } = await supabase
        .from('time_entries')
        .select('duration_seconds, started_at, ended_at')
        .eq('user_id', userId)
        .gte('started_at', since);
      const buckets = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ duration_seconds: number | null; started_at: string; ended_at: string | null }>) {
        const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(new Date(r.started_at));
        const sec = r.duration_seconds ?? (!r.ended_at ? Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000) : 0);
        buckets.set(key, (buckets.get(key) ?? 0) + sec);
      }
      const out: Array<{ day: string; seconds: number; label: string }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000);
        const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(d);
        const dow = d.toLocaleDateString('az-AZ', { weekday: 'narrow', timeZone: 'Asia/Baku' });
        out.push({ day: key, seconds: buckets.get(key) ?? 0, label: dow });
      }
      return out;
    },
  });
  const items = week.data ?? [];
  const max = Math.max(1, ...items.map((d) => d.seconds));
  if (items.every((d) => d.seconds === 0)) return null;
  return (
    <div className="mb-3 flex items-end gap-1.5" style={{ height: 60 }}>
      {items.map((d) => {
        const h = Math.max(2, (d.seconds / max) * 50);
        const isToday = d.day === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(new Date());
        return (
          <div key={d.day} className="flex flex-col items-center gap-1" style={{ flex: 1 }} title={`${d.day}: ${formatDuration(d.seconds)}`}>
            <div
              style={{
                height: `${h}px`,
                width: '100%',
                background: isToday ? 'var(--brand-action)' : 'var(--brand-glow-sm)',
                borderRadius: 3,
              }}
            />
            <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 9 }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Per-project aggregation of today's time entries (chip row beside totals)
function PerProjectTimeBreakdown({ userId, since }: { userId: string; since: string }) {
  const breakdown = useQuery({
    queryKey: ['time-entries-by-project', userId, since],
    queryFn: async () => {
      // Fetch entries + their task → project_id via separate lookup
      const { data: entries } = await supabase
        .from('time_entries')
        .select('task_id, duration_seconds, started_at, ended_at')
        .eq('user_id', userId)
        .gte('started_at', since);
      const rows = (entries ?? []) as Array<{ task_id: string; duration_seconds: number | null; started_at: string; ended_at: string | null }>;
      if (rows.length === 0) return [] as Array<{ project: string; seconds: number }>;
      const taskIds = Array.from(new Set(rows.map((r) => r.task_id)));
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, project_id, projects(name)')
        .in('id', taskIds);
      const projectMap = new Map<string, string>();
      for (const t of (tasks ?? []) as Array<{ id: string; projects?: { name: string }[] | { name: string } | null }>) {
        const pname = Array.isArray(t.projects) ? t.projects[0]?.name : t.projects?.name;
        projectMap.set(t.id, pname ?? '— (layihəsiz)');
      }
      const buckets = new Map<string, number>();
      for (const r of rows) {
        const sec = r.duration_seconds ?? (!r.ended_at ? Math.floor((Date.now() - new Date(r.started_at).getTime()) / 1000) : 0);
        const key = projectMap.get(r.task_id) ?? '— (layihəsiz)';
        buckets.set(key, (buckets.get(key) ?? 0) + sec);
      }
      return Array.from(buckets.entries())
        .map(([project, seconds]) => ({ project, seconds }))
        .sort((a, b) => b.seconds - a.seconds);
    },
  });
  const items = breakdown.data ?? [];
  if (items.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap" style={{ maxWidth: 480 }}>
      {items.slice(0, 4).map((b) => (
        <span
          key={b.project}
          className="chip"
          style={{
            background: 'var(--surface-mist)',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {b.project.length > 18 ? b.project.slice(0, 16) + '…' : b.project} · {formatDuration(b.seconds)}
        </span>
      ))}
    </div>
  );
}
