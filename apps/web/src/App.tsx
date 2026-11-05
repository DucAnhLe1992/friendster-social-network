import { Fragment, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import axios from 'axios';

import { useAuthStore } from '@/store/authStore';
import { apiClient } from '@/lib/api';
import { RealtimeProvider } from '@/context/RealtimeContext';

import MainLayout from '@/layouts/MainLayout';
import AuthLayout from '@/layouts/AuthLayout';

const Home = lazy(() => import('@/pages/Home'));
const Explore = lazy(() => import('@/pages/Explore'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Messages = lazy(() => import('@/pages/Messages'));
const Profile = lazy(() => import('@/pages/Profile'));
const PostDetail = lazy(() => import('@/pages/PostDetail'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
});

// Wipe every cached response the moment the signed-in account changes, before the next account renders.
useAuthStore.subscribe((state, prev) => {
  if (state.user?._id === prev.user?._id) return;
  queryClient.cancelQueries();
  queryClient.clear();
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

const PageFallback = () => (
  <div className="flex justify-center py-16">
    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
  </div>
);

const protectedPage = (page: ReactNode) => (
  <ProtectedRoute>
    <Suspense fallback={<PageFallback />}>{page}</Suspense>
  </ProtectedRoute>
);
const publicPage = (page: ReactNode) => (
  <PublicRoute>
    <Suspense fallback={<PageFallback />}>{page}</Suspense>
  </PublicRoute>
);

const AccountScope = ({ children }: { children: ReactNode }) => {
  const userId = useAuthStore((s) => s.user?._id ?? 'guest');
  return <Fragment key={userId}>{children}</Fragment>;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer>
          <RealtimeProvider>
            <AccountScope>
              <Routes>
                <Route element={<AuthLayout />}>
                  <Route path="/login" element={publicPage(<Login />)} />
                  <Route path="/register" element={publicPage(<Register />)} />
                </Route>

                <Route element={<MainLayout />}>
                  <Route path="/" element={protectedPage(<Home />)} />
                  <Route path="/explore" element={protectedPage(<Explore />)} />
                  <Route path="/notifications" element={protectedPage(<Notifications />)} />
                  <Route path="/messages" element={protectedPage(<Messages />)} />
                  <Route path="/messages/:id" element={protectedPage(<Messages />)} />
                  <Route path="/profile/:handle" element={protectedPage(<Profile />)} />
                  <Route path="/post/:id" element={protectedPage(<PostDetail />)} />
                  <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
                </Route>
              </Routes>
            </AccountScope>
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
