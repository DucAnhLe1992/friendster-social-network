import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { MapPin, Link as LinkIcon, CalendarDays, BadgeCheck, Mail, UserX, FileText, Image, Heart, MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import PageHeader from '@/components/custom/PageHeader';
import PostFeed from '@/components/custom/PostFeed';
import UserAvatar from '@/components/custom/UserAvatar';
import FollowButton from '@/components/custom/FollowButton';
import EmptyState from '@/components/custom/EmptyState';
import RichText from '@/components/custom/RichText';
import EditProfileDialog from '@/components/custom/EditProfileDialog';
import ConnectionsDialog, { type ConnectionKind } from '@/components/custom/ConnectionsDialog';
import { useAuthStore } from '@/store/authStore';
import { apiClient, getErrorMessage, mediaUrl, type ProfileTab } from '@/lib/api';
import type { User } from '@/types';

type Tab = ProfileTab | 'replies';

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: 'posts', label: 'Posts', icon: FileText },
  { id: 'replies', label: 'Replies', icon: MessageSquare },
  { id: 'media', label: 'Media', icon: Image },
  { id: 'likes', label: 'Likes', icon: Heart },
];

const Profile = () => {
  const { handle = '' } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('posts');
  const [editOpen, setEditOpen] = useState(false);
  const [connections, setConnections] = useState<ConnectionKind | null>(null);
  const [startingChat, setStartingChat] = useState(false);

  const userQuery = useQuery({ queryKey: ['user', handle], queryFn: () => apiClient.getUser(handle), enabled: !!handle });
  const user = userQuery.data;
  const isMe = !!user && me?._id === user._id;

  const updateFollow = ({ isFollowing, followerCount }: { isFollowing: boolean; followerCount: number }) =>
    queryClient.setQueryData<User>(['user', handle], (old) => (old ? { ...old, isFollowing, followerCount } : old));

  const openChat = async () => {
    setStartingChat(true);
    try {
      const conversation = await apiClient.startConversation(handle);
      navigate(`/messages/${conversation._id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open a conversation'));
    } finally {
      setStartingChat(false);
    }
  };

  if (userQuery.isLoading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Profile" back />
        <div className="h-48 shimmer" />
        <div className="px-6 -mt-12 space-y-3">
          <div className="w-24 h-24 rounded-full shimmer ring-4 ring-background" />
          <div className="h-5 w-40 rounded shimmer" />
          <div className="h-4 w-24 rounded shimmer" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Profile" back />
        <EmptyState
          icon={<UserX className="w-7 h-7" />}
          title="This account doesn't exist"
          description={`We couldn't find anyone with the handle @${handle}.`}
          action={
            <Button asChild variant="outline">
              <Link to="/explore">Search for people</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const cover = mediaUrl(user.coverImage);
  const website = user.website?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <PageHeader title={user.displayName} subtitle={`${user.postCount ?? 0} posts`} back />

      <div className="relative h-36 sm:h-48 bg-gradient-to-br from-primary/50 via-accent/30 to-background overflow-hidden">
        {cover && <img src={cover} alt="" className="w-full h-full object-cover animate-fade-in" />}
      </div>

      <div className="px-4 sm:px-6">
        <div className="flex justify-between items-end -mt-12 sm:-mt-16">
          <UserAvatar user={user} className="w-24 h-24 sm:w-32 sm:h-32 ring-4 ring-background text-3xl" />
          <div className="flex gap-2 pb-2">
            {isMe ? (
              <Button variant="outline" className="rounded-full font-semibold" onClick={() => setEditOpen(true)}>
                Edit profile
              </Button>
            ) : (
              <>
                <Button variant="outline" size="icon" className="rounded-full" onClick={openChat} disabled={startingChat} aria-label="Send message">
                  {startingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                </Button>
                <FollowButton handle={user.handle} userId={user._id} isFollowing={user.isFollowing} onChange={updateFollow} size="default" />
              </>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h2 className="text-xl font-bold">{user.displayName}</h2>
            {user.isVerified && <BadgeCheck className="w-5 h-5 text-primary" />}
          </div>
          <p className="text-muted-foreground">@{user.handle}</p>
        </div>

        {user.bio && <RichText text={user.bio} className="mt-3 whitespace-pre-wrap break-words leading-relaxed" />}

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm text-muted-foreground">
          {user.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {user.location}
            </span>
          )}
          {user.website && (
            <a href={user.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 text-primary hover:underline">
              <LinkIcon className="w-4 h-4" />
              {website}
            </a>
          )}
          {user.createdAt && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-4 h-4" />
              Joined {format(new Date(user.createdAt), 'MMMM yyyy')}
            </span>
          )}
        </div>

        <div className="flex gap-5 mt-3 text-sm">
          <button onClick={() => setConnections('following')} className="hover:underline">
            <span className="font-semibold text-foreground">{user.followingCount}</span>{' '}
            <span className="text-muted-foreground">Following</span>
          </button>
          <button onClick={() => setConnections('followers')} className="hover:underline">
            <span className="font-semibold text-foreground">{user.followerCount}</span>{' '}
            <span className="text-muted-foreground">{user.followerCount === 1 ? 'Follower' : 'Followers'}</span>
          </button>
        </div>
      </div>

      <div className="flex mt-4 border-b border-border overflow-x-auto hide-scrollbar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 min-w-[80px] relative py-3.5 text-sm font-medium hover:bg-secondary/40 transition-colors"
          >
            <span className={tab === t.id ? 'text-foreground' : 'text-muted-foreground'}>{t.label}</span>
            {tab === t.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-12 rounded-full bg-gradient-to-r from-primary to-accent" />}
          </button>
        ))}
      </div>

      {tab === 'replies' ? (
        <RepliesList handle={handle} />
      ) : (
        <PostFeed
          key={tab}
          queryKey={['posts', 'user', handle, tab]}
          fetchPage={(page) => apiClient.getUserPosts(handle, tab, page)}
          empty={(() => {
            const meta = TABS.find((t) => t.id === tab)!;
            const Icon = meta.icon;
            const copy = {
              posts: isMe ? "You haven't posted yet" : `@${handle} hasn't posted yet`,
              media: 'No photos yet',
              likes: isMe ? "Posts you like will show up here" : 'No liked posts yet',
            }[tab];
            return <EmptyState icon={<Icon className="w-7 h-7" />} title={copy} />;
          })()}
        />
      )}

      {isMe && <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} user={user} />}
      <ConnectionsDialog handle={handle} kind={connections} onClose={() => setConnections(null)} />
    </div>
  );
};

const RepliesList = ({ handle }: { handle: string }) => {
  const query = useQuery({ queryKey: ['replies', 'user', handle], queryFn: () => apiClient.getUserReplies(handle) });

  if (query.isLoading) {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-xl shimmer" />)}
      </div>
    );
  }
  if (query.isError) return <p className="text-center text-muted-foreground py-12">Could not load replies.</p>;

  const replies = query.data ?? [];
  if (replies.length === 0) return <EmptyState icon={<MessageSquare className="w-7 h-7" />} title="No replies yet" />;

  return (
    <ul>
      {replies.map((reply) => (
        <li key={reply._id} className="border-b border-border">
          <Link to={`/post/${reply.post._id}`} className="flex gap-3 px-4 sm:px-6 py-4 hover:bg-secondary/30 transition-colors">
            <UserAvatar user={reply.author} className="w-10 h-10 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">
                Replying to <span className="text-primary">@{reply.post.author?.handle}</span> ·{' '}
                {formatDistanceToNowStrict(new Date(reply.createdAt))}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words">{reply.content}</p>
              {reply.post.content && (
                <p className="mt-2 text-sm text-muted-foreground border-l-2 border-border pl-3 line-clamp-2">{reply.post.content}</p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default Profile;
