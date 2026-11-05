import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Tokens } from '@/types';

interface AuthState {
  user: User | null;
  tokens: Tokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: User) => void;
  setTokens: (tokens: Tokens) => void;
  setLoading: (value: boolean) => void;
  login: (user: User, tokens: Tokens) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      isLoading: true,

      setUser: (user) => set({ user }),
      setTokens: (tokens) => set({ tokens }),
      setLoading: (isLoading) => set({ isLoading }),
      login: (user, tokens) => set({ user, tokens, isAuthenticated: true, isLoading: false }),
      logout: () => set({ user: null, tokens: null, isAuthenticated: false, isLoading: false }),
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
