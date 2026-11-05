import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { apiClient, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

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

  useEffect(() => setFollowing(initial), [initial]);

  if (!me || me._id === userId) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const res = following ? await apiClient.unfollowUser(handle) : await apiClient.followUser(handle);
      setFollowing(res.isFollowing);
      setUser({ ...me, followingCount: Math.max(0, me.followingCount + (res.isFollowing ? 1 : -1)) });
      onChange?.(res);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['suggestions'] });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not update follow'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      disabled={busy}
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
