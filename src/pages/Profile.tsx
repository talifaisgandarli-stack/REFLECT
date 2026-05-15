/**
 * REQ-AUTH-03 — user profile: avatar, full_name, locale, telegram linking.
 * Email and role are read-only (admin-only to change per PRD §5 MODULE 1).
 */
import { useState } from 'react';
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

export function ProfilePage() {
  const { profile, role, setProfile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [locale, setLocale] = useState<'az' | 'en' | 'ru'>(profile?.locale ?? 'az');
  const [saved, setSaved] = useState(false);

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

  if (!profile) return null;

  return (
    <>
      <PageHead meta="Hesabım" title="Profil" />

      <div className="max-w-xl space-y-6">
        {/* Avatar */}
        <div className="card flex items-center gap-5">
          <Avatar name={profile.full_name ?? profile.email} size={64} />
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
    </>
  );
}
