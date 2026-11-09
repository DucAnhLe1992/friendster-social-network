import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import PostCard from '@/components/custom/PostCard';
import { getErrorMessage } from '@/lib/api';
import type { Page, Post } from '@/types';

interface PostFeedProps {
  queryKey: QueryKey;
  fetchPage: (cursor?: string) => Promise<Page<Post>>;
  empty: ReactNode;
  enabled?: boolean;
}

export const FeedSkeleton = ({ count = 3 }: { count?: number }) => (
  <div aria-hidden>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex gap-3 px-4 sm:px-6 py-5 border-b border-border">
        <div className="w-11 h-11 rounded-full shimmer flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="h-3.5 w-1/3 rounded shimmer" />
          <div className="h-3.5 w-full rounded shimmer" />
          <div className="h-3.5 w-2/3 rounded shimmer" />
        </div>
      </div>
    ))}
  </div>
);

const PostFeed = ({ queryKey, fetchPage, empty, enabled = true }: PostFeedProps) => {
  const sentinel = useRef<HTMLDivElement>(null);

  const { data, error, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore && last.meta.nextCursor ? last.meta.nextCursor : undefined),
    enabled,
  });

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '600px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <FeedSkeleton />;

  if (isError) {
    return (
      <div className="text-center py-16 px-6">
        <p className="text-muted-foreground mb-4">{getErrorMessage(error, 'Could not load posts')}</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Try again
        </Button>
      </div>
    );
  }

  const posts = data?.pages.flatMap((p) => p.items) ?? [];
  if (posts.length === 0) return <>{empty}</>;

  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post._id} post={post} />
      ))}
      <div ref={sentinel} />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      {!hasNextPage && posts.length > 5 && (
        <p className="text-center text-sm text-muted-foreground py-8">You're all caught up</p>
      )}
    </div>
  );
};

export default PostFeed;
