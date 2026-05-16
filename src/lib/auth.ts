import { useEffect } from 'react';
import { supabase } from './supabase';
import { useAuth } from './store';
import { setSentryUser } from './sentry';
import type { Profile, Role } from '@/types/db';

/** Boots auth from Supabase: session + profile + role. Run once at app root. */
export function useAuthBootstrap() {
  const { setSession, setProfile, setHydrated } = useAuth();

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(userId: string) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle<Profile>();

      // REQ-AUTH-03 — deactivated profiles must not have a session.
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        if (!cancelled) {
          setSession(null);
          setProfile(null, null);
          setSentryUser(null);
        }
        return;
      }

      let role: Role | null = null;
      if (profile?.role_id) {
        const { data } = await supabase
          .from('roles')
          .select('*')
          .eq('id', profile.role_id)
          .maybeSingle<Role>();
        role = data;
      }
      if (!cancelled) {
        setProfile(profile ?? null, role);
        // PRD §9.4 — attribute frontend Sentry events to the signed-in user
        if (profile) setSentryUser({ id: profile.id, email: profile.email });
        else setSentryUser(null);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const uid = data.session?.user?.id ?? null;
      setSession(uid ? { userId: uid } : null);
      if (uid) loadProfile(uid).finally(() => setHydrated(true));
      else setHydrated(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      setSession(uid ? { userId: uid } : null);
      if (uid) {
        loadProfile(uid);
        // PRD §9.4 — record login events into audit_log for forensics.
        // Only on SIGNED_IN to avoid double-counting token refreshes.
        if (event === 'SIGNED_IN') {
          void supabase.from('audit_log').insert({
            actor_id: uid,
            action: 'login',
            resource: 'auth',
            ip: null,
            user_agent: navigator.userAgent,
          });
        }
      }
      else {
        setProfile(null, null);
        setSentryUser(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setProfile, setHydrated]);
}

export async function signInWithPassword(email: string, password: string) {
  // PRD §5 / REQ-AUTH-01 — server-side rate limit gate (migration 0031).
  // Fail-open: if the endpoint is unreachable we let Supabase handle it.
  try {
    const res = await fetch('/api/auth/rate-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { error?: string }).error ?? 'Çox sayda cəhd. 15 dəqiqə gözləyin.';
      // Forward Retry-After (seconds) so the UI can render a live countdown.
      const retryAfter = Number(res.headers.get('retry-after')) || 900;
      return {
        data: { user: null, session: null },
        error: { message: msg, status: 429, retryAfterSeconds: retryAfter } as never,
      };
    }
  } catch {
    // network error → fail-open, proceed to Supabase
  }
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function sendMagicLink(email: string) {
  return supabase.auth.signInWithOtp({ email });
}

export async function sendPasswordReset(email: string) {
  // Uses Supabase's hosted password-reset email (configurable in dashboard).
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
}
