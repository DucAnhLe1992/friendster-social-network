import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import axios from 'axios';

import { useAuthStore } from '@/store/authStore';
import { apiClient } from '@/lib/api';
import { RealtimeProvider } from '@/context/RealtimeContext';

import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';

import Home from '@/pages/Home';
import Explore from '@/pages/Explore';
import Notifications from '@/pages/Notifications';
import Messages from '@/pages/Messages';
import Profile from '@/pages/Profile';
import PostDetail from '@/pages/PostDetail';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

const FullScreenSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
  </div>
);

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <FullScreenSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <FullScreenSpinner />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AuthInitializer = ({ children }: { children: ReactNode }) => {
  const hasToken = useAuthStore((s) => Boolean(s.tokens?.accessToken));
  const { setUser, setLoading, logout } = useAuthStore.getState();

  useEffect(() => {
    if (!hasToken) {
      setLoading(false);
      return;
    }
    apiClient
      .getMe()
      .then(setUser)
      .catch((error) => {
        // Keep the cached session when the server is simply unreachable
        if (axios.isAxiosError(error) && error.response?.status === 401) logout();
      })
      .finally(() => setLoading(false));
  }, [hasToken, setUser, setLoading, logout]);

  return <>{children}</>;
};

const protectedPage = (page: ReactNode) => <ProtectedRoute>{page}</ProtectedRoute>;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer>
          <RealtimeProvider>
            <Routes>
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
              </Route>

              <Route element={<MainLayout />}>
                <Route path="/" element={protectedPage(<Home />)} />
                <Route path="/explore" element={protectedPage(<Explore />)} />
                <Route path="/notifications" element={protectedPage(<Notifications />)} />
                <Route path="/messages" element={protectedPage(<Messages />)} />
                <Route path="/messages/:id" element={protectedPage(<Messages />)} />
                <Route path="/profile/:handle" element={protectedPage(<Profile />)} />
                <Route path="/post/:id" element={protectedPage(<PostDetail />)} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </RealtimeProvider>
        </AuthInitializer>
      </BrowserRouter>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
