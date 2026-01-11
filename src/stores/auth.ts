import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrentUser, VisibleModule } from '@/types';

interface AuthState {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  visibleModules: VisibleModule[];

  // Actions
  setUser: (user: CurrentUser | null) => void;
  setVisibleModules: (modules: VisibleModule[]) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      visibleModules: [],

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        }),

      setVisibleModules: (modules) =>
        set({ visibleModules: modules }),

      setLoading: (loading) =>
        set({ isLoading: loading }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          visibleModules: [],
        }),
    }),
    {
      name: 'seisei-auth',
      partialize: (state) => ({
        // Only persist user basic info, not full state
        user: state.user ? {
          id: state.user.id,
          displayName: state.user.displayName,
          isAdmin: state.user.isAdmin,
          tenant: {
            tenantCode: state.user.tenant.tenantCode,
            name: state.user.tenant.name,
          },
        } : null,
      }),
    }
  )
);
