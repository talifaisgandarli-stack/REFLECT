/**
 * REQ-AUTH-03 — user profile: avatar, full_name, locale, telegram linking.
 * Email and role are read-only (admin-only to change per PRD §5 MODULE 1).
 * US-AUTH-04 — user can edit avatar, name, and locale.
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { Avatar } from '@/components/Avatar';
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
      setTimeout(() => setSaved(false), 2000);
    },
  });

  // REQ-AUTH-03 — avatar upload: validate → upload to Storage → update profiles → sync store
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so re-selecting the same file triggers onChange again
    e.target.value = '';

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

  if (!profile) return null;

  return (
    <>
      <PageHead meta="Hesabım" title="Profil" />

      <div className="max-w-xl space-y-6">
        {/* Avatar — click to upload (REQ-AUTH-03) */}
        <div className="card flex items-center gap-5">
          <div className="flex flex-col items-center gap-1">
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
            <div className="text-h3">{profile.full_name ?? '—'}</div>
            <div className="text-meta mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {profile.email}
            </div>
            <div className="text-meta mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {role?.name ?? 'Üzv'}
              {profile.is_creator ? ' · Creator' : ''}
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
            <input className="input opacity-60" value={profile.email} readOnly />
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
              <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {profile.telegram_linked_at
                  ? `${new Date(profile.telegram_linked_at).toLocaleDateString('az-AZ')} tarixindən`
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
