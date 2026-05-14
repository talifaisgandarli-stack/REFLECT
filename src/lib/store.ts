import { create } from 'zustand';
import type { Profile, Role } from '@/types/db';

type AuthState = {
  session: { userId: string } | null;
  profile: Profile | null;
  role: Role | null;
  hydrated: boolean;
  isAdmin: boolean;
  setSession: (s: AuthState['session']) => void;
  setProfile: (p: Profile | null, r: Role | null) => void;
  setHydrated: (h: boolean) => void;
};

export const useAuth = create<AuthState>((set) => ({
  session: null,
  profile: null,
  role: null,
  hydrated: false,
  isAdmin: false,
  setSession: (session) => set({ session }),
  setProfile: (profile, role) =>
    set({
      profile,
      role,
      isAdmin: !!profile && (profile.is_creator || !!role?.is_admin),
    }),
  setHydrated: (hydrated) => set({ hydrated }),
}));

type UIState = {
  sidebarOpen: boolean;
  miraiPanelOpen: boolean;
  cmdkOpen: boolean;
  taskCreateOpen: boolean;
  toggleSidebar: () => void;
  toggleMirai: () => void;
  setCmdK: (open: boolean) => void;
  setTaskCreate: (open: boolean) => void;
};

export const useUI = create<UIState>((set) => ({
  sidebarOpen: false,
  miraiPanelOpen: false,
  cmdkOpen: false,
  taskCreateOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleMirai: () => set((s) => ({ miraiPanelOpen: !s.miraiPanelOpen })),
  setCmdK: (open) => set({ cmdkOpen: open }),
  setTaskCreate: (open) => set({ taskCreateOpen: open }),
}));
