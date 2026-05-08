import { useEffect } from 'react';
import { supabase } from './supabase';
import { useAuth } from './store';
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
      let role: Role | null = null;
      if (profile?.role_id) {
        const { data } = await supabase
          .from('roles')
          .select('*')
          .eq('id', profile.role_id)
          .maybeSingle<Role>();
        role = data;
      }
      if (!cancelled) setProfile(profile ?? null, role);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const uid = data.session?.user?.id ?? null;
      setSession(uid ? { userId: uid } : null);
      if (uid) loadProfile(uid).finally(() => setHydrated(true));
      else setHydrated(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setSession(uid ? { userId: uid } : null);
      if (uid) loadProfile(uid);
      else setProfile(null, null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setProfile, setHydrated]);
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function sendMagicLink(email: string) {
  return supabase.auth.signInWithOtp({ email });
}
