import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';
import { notifyError } from '@/lib/errors';

interface FollowButtonProps {
  handle: string;
  userId: string;
  isFollowing?: boolean;
  onChange?: (state: { isFollowing: boolean; followerCount: number }) => void;
  size?: 'sm' | 'default';
  className?: string;
}

const FollowButton = ({ handle, userId, isFollowing: initial = false, onChange, size = 'sm', className }: FollowButtonProps) => {
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setFollowing(initial);
  }

  if (!me || me._id === userId) return null;

  const toggle = async () => {
    const wasFollowing = following;
    setBusy(true);
    setFollowing(!wasFollowing);
    try {
      const res = wasFollowing ? await apiClient.unfollowUser(handle) : await apiClient.followUser(handle);
      setFollowing(res.isFollowing);
      const current = useAuthStore.getState().user;
      if (current && res.isFollowing !== wasFollowing) {
        setUser({ ...current, followingCount: Math.max(0, current.followingCount + (res.isFollowing ? 1 : -1)) });
      }
      onChange?.(res);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    } catch (error) {
      setFollowing(wasFollowing);
      notifyError(error, 'Could not update follow');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      disabled={busy}
      aria-pressed={following}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      variant={following ? 'outline' : 'default'}
      className={cn(
        'rounded-full min-w-[96px] font-semibold transition-all',
        following
          ? 'hover:border-destructive/60 hover:text-destructive hover:bg-destructive/10'
          : 'bg-foreground text-background hover:bg-foreground/90',
        className
      )}
    >
      {following ? (hover ? 'Unfollow' : 'Following') : 'Follow'}
    </Button>
  );
};

export default FollowButton;
