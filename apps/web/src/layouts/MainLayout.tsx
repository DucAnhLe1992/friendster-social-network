import { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home, Compass, Bell, Mail, User, LogOut, Sparkles, Feather } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CreatePost from '@/components/custom/CreatePost';
import UserAvatar from '@/components/custom/UserAvatar';
import RightRail from '@/layouts/RightRail';
import { useAuthStore } from '@/store/authStore';
import { apiClient, signOut } from '@/lib/api';

const Badge = ({ count, className = '' }: { count: number; className?: string }) =>
  count > 0 ? (
    <span
      className={`absolute min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-background ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  ) : null;

const MainLayout = () => {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [composeOpen, setComposeOpen] = useState(false);

  const unreadNotifications = useQuery({
    queryKey: ['unread', 'notifications'],
    queryFn: apiClient.getUnreadNotifications,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const unreadMessages = useQuery({
    queryKey: ['unread', 'messages'],
    queryFn: apiClient.getUnreadMessages,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const isMessages = pathname.startsWith('/messages');

  const navItems = [
    { icon: Home, label: 'Home', path: '/', badge: 0 },
    { icon: Compass, label: 'Explore', path: '/explore', badge: 0 },
    { icon: Bell, label: 'Notifications', path: '/notifications', badge: unreadNotifications.data ?? 0 },
    { icon: Mail, label: 'Messages', path: '/messages', badge: unreadMessages.data ?? 0 },
    { icon: User, label: 'Profile', path: `/profile/${user?.handle ?? ''}`, badge: 0 },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const accountMenuItems = user && (
    <>
      <DropdownMenuLabel className="truncate">{user.email ?? `@${user.handle}`}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => navigate(`/profile/${user.handle}`)}>
        <User className="w-4 h-4 mr-2" />
        Your profile
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={handleLogout} className="text-destructive focus:text-destructive">
        <LogOut className="w-4 h-4 mr-2" />
        Sign out
      </DropdownMenuItem>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="flex justify-center">
        <aside className="hidden md:flex flex-col w-20 xl:w-64 flex-shrink-0 sticky top-0 h-screen border-r border-border px-3 py-4">
          <NavLink to="/" className="flex items-center gap-3 px-3 py-2 mb-4 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-primary group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text hidden xl:block">Friendster</span>
          </NavLink>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-4 px-3 py-3 rounded-xl transition-all duration-200 ${
                    isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`
                }
              >
                <span className="relative">
                  <item.icon className="w-6 h-6" />
                  <Badge count={item.badge} className="-top-1.5 -right-2" />
                </span>
                <span className="hidden xl:block text-[15px]">{item.label}</span>
              </NavLink>
            ))}

            <Button
              onClick={() => setComposeOpen(true)}
              aria-label="Create post"
              className="w-full mt-4 h-12 rounded-full bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 glow-primary"
            >
              <Feather className="w-5 h-5 xl:hidden" />
              <span className="hidden xl:inline">Post</span>
            </Button>
          </nav>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Account menu"
                  className="flex items-center gap-3 p-2 rounded-full hover:bg-secondary transition-colors text-left"
                >
                  <UserAvatar user={user} className="w-10 h-10" />
                  <div className="flex-1 min-w-0 hidden xl:block">
                    <p className="font-semibold text-sm truncate">{user.displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">@{user.handle}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {accountMenuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </aside>

        <main className={`flex-1 min-w-0 ${isMessages ? 'max-w-5xl' : 'max-w-[640px] border-r border-border'} min-h-screen`}>
          <Outlet />
        </main>

        {!isMessages && <RightRail />}
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around py-1.5">
          {navItems.filter((item) => item.label !== 'Profile').map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.path === '/'}
              aria-label={item.label}
              className={({ isActive }) => `relative p-3 rounded-xl transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <item.icon className="w-6 h-6" />
              <Badge count={item.badge} className="top-1.5 right-1" />
            </NavLink>
          ))}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Account menu"
                  className={`p-2.5 rounded-xl transition-colors ${pathname.startsWith('/profile/' + user.handle) ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <UserAvatar user={user} className="w-7 h-7" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56 mb-2">
                {accountMenuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </nav>

      {!isMessages && (
        <button
          onClick={() => setComposeOpen(true)}
          className="md:hidden fixed right-4 bottom-20 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-accent text-white flex items-center justify-center shadow-lg glow-primary active:scale-95 transition-transform"
          aria-label="Create post"
        >
          <Feather className="w-6 h-6" />
        </button>
      )}

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create post</DialogTitle>
          </DialogHeader>
          <CreatePost autoFocus onSuccess={() => setComposeOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MainLayout;
