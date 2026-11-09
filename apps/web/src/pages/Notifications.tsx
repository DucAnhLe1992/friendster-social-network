import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Reply, UserPlus, AtSign, CheckCheck, Bell, X, Loader2 } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';

import { Button } from '@/components/ui/button';
import PageHeader from '@/components/custom/PageHeader';
import UserAvatar from '@/components/custom/UserAvatar';
import EmptyState from '@/components/custom/EmptyState';
import { FeedSkeleton } from '@/components/custom/PostFeed';
import { apiClient, getErrorMessage, mediaUrl } from '@/lib/api';
import type { Notification, NotificationType } from '@/types';
import { notifyError } from '@/lib/errors';
import { usePageTitle } from '@/hooks/usePageTitle';

const TYPE_META: Record<NotificationType, { icon: typeof Heart; color: string; text: string }> = {
  like: { icon: Heart, color: 'text-rose-500 bg-rose-500/10', text: 'liked your post' },
  comment: { icon: MessageCircle, color: 'text-primary bg-primary/10', text: 'commented on your post' },
  reply: { icon: Reply, color: 'text-sky-400 bg-sky-400/10', text: 'replied to your comment' },
  follow: { icon: UserPlus, color: 'text-emerald-400 bg-emerald-400/10', text: 'started following you' },
  mention: { icon: AtSign, color: 'text-amber-400 bg-amber-400/10', text: 'mentioned you' },
};

const Notifications = () => {
  usePageTitle('Notifications');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => apiClient.getNotifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, _all, lastParam) => (last.meta.hasMore ? lastParam + 1 : undefined),
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = query.data?.pages[0]?.meta.unreadCount ?? 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['unread', 'notifications'] });
  };

  const markAll = async () => {
    try {
      await apiClient.markAllNotificationsAsRead();
      refresh();
    } catch (error) {
      notifyError(error, 'Could not mark notifications as read');
    }
  };

  const open = async (n: Notification) => {
    if (!n.isRead) apiClient.markNotificationAsRead(n._id).then(refresh).catch(() => undefined);
    navigate(n.type === 'follow' || !n.post ? `/profile/${n.sender.handle}` : `/post/${n.post._id}`);
  };

  const remove = async (id: string) => {
    try {
      await apiClient.deleteNotification(id);
      refresh();
    } catch (error) {
      notifyError(error, 'Could not remove notification');
    }
  };

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        actions={
          unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAll} className="text-primary">
              <CheckCheck className="w-4 h-4 mr-1.5" />
              Mark all read
            </Button>
          )
        }
      />

      {query.isLoading ? (
        <FeedSkeleton />
      ) : query.isError ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-3">{getErrorMessage(query.error, 'Could not load notifications')}</p>
          <Button variant="outline" onClick={() => query.refetch()}>Try again</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-7 h-7" />}
          title="Nothing here yet"
          description="When people like, comment on, or reply to your posts, or follow you, you'll see it here."
        />
      ) : (
        <ul>
          {items.map((n) => {
            const meta = TYPE_META[n.type];
            const Icon = meta.icon;
            const preview = n.comment?.content ?? n.post?.content;
            const thumb = n.post?.images?.[0];
            return (
              // Clickable row for mouse users; keyboard users get the same action via Enter.
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
              <li
                key={n._id}
                /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */
                tabIndex={0}
                aria-label={`${n.sender?.displayName ?? 'Someone'} ${meta.text}`}
                onClick={() => open(n)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) open(n);
                }}
                className={`group relative flex gap-3 px-4 sm:px-6 py-4 border-b border-border cursor-pointer transition-colors hover:bg-secondary/40 ${
                  n.isRead ? '' : 'bg-primary/[0.06]'
                }`}
              >
                {!n.isRead && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                  <Icon className={`w-[18px] h-[18px] ${n.type === 'like' ? 'fill-current' : ''}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <UserAvatar user={n.sender} className="w-8 h-8 mb-2" />
                  <p className="text-[15px]">
                    <span className="font-semibold">{n.sender?.displayName ?? 'Someone'}</span>{' '}
                    <span className="text-muted-foreground">{meta.text}</span>
                    <span className="text-muted-foreground text-sm"> · {formatDistanceToNowStrict(new Date(n.createdAt))}</span>
                  </p>
                  {preview && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{preview}</p>}
                </div>
                {thumb && <img src={mediaUrl(thumb)} alt="" aria-hidden loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(n._id);
                  }}
                  className="absolute right-3 top-3 p-1.5 rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-secondary hover:text-foreground transition-all"
                  aria-label="Remove notification"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center py-6">
          <Button variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
};

export default Notifications;
