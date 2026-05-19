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
  /** PRD §6.3 Cmd+N — global new-task modal */
  taskCreateOpen: boolean;
  /** PRD §6.3 — context-aware Cmd+N: when set, new task becomes subtask. */
  taskCreateParent: { id: string; level: number } | null;
  toggleSidebar: () => void;
  toggleMirai: () => void;
  setCmdK: (open: boolean) => void;
  openTaskCreate: () => void;
  closeTaskCreate: () => void;
  setTaskCreateParent: (p: { id: string; level: number } | null) => void;
};

export const useUI = create<UIState>((set) => ({
  sidebarOpen: false,
  miraiPanelOpen: false,
  cmdkOpen: false,
  taskCreateOpen: false,
  taskCreateParent: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleMirai: () => set((s) => ({ miraiPanelOpen: !s.miraiPanelOpen })),
  setCmdK: (open) => set({ cmdkOpen: open }),
  openTaskCreate: () => set({ taskCreateOpen: true }),
  closeTaskCreate: () => set({ taskCreateOpen: false, taskCreateParent: null }),
  setTaskCreateParent: (taskCreateParent) => set({ taskCreateParent }),
}));
