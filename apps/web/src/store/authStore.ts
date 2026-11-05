import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Tokens } from '@/types';

interface AuthState {
  user: User | null;
  tokens: Tokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** In-memory counter bumped on every login/logout; async auth work captures it and is discarded if it changed. */
  generation: number;

  setUser: (user: User) => void;
  setTokensFor: (generation: number, tokens: Tokens) => void;
  setLoading: (value: boolean) => void;
  login: (user: User, tokens: Tokens) => void;
  logout: () => void;
  logoutFor: (generation: number) => void;
}

const signedOut = { user: null, tokens: null, isAuthenticated: false, isLoading: false };

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,
      generation: 0,

      // Only refreshes the signed-in account's own profile; a late response for another account is ignored.
      setUser: (user) => set((s) => (s.user?._id === user._id ? { user } : {})),
      setTokensFor: (generation, tokens) => set((s) => (s.generation === generation ? { tokens } : {})),
      setLoading: (isLoading) => set({ isLoading }),
      login: (user, tokens) =>
        set((s) => ({ user, tokens, isAuthenticated: true, isLoading: false, generation: s.generation + 1 })),
      logout: () => set((s) => ({ ...signedOut, generation: s.generation + 1 })),
      logoutFor: (generation) =>
        set((s) => (s.generation === generation ? { ...signedOut, generation: s.generation + 1 } : {})),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
