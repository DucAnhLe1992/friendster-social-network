import { Link, useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';
import PageHeader from '@/components/custom/PageHeader';
import PostCard from '@/components/custom/PostCard';
import CommentItem from '@/components/custom/CommentItem';
import CommentComposer from '@/components/custom/CommentComposer';
import EmptyState from '@/components/custom/EmptyState';
import { FeedSkeleton } from '@/components/custom/PostFeed';
import { apiClient } from '@/lib/api';

const PostDetail = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const postQuery = useQuery({ queryKey: ['post', id], queryFn: () => apiClient.getPost(id), enabled: !!id });

  const comments = useInfiniteQuery({
    queryKey: ['comments', id],
    queryFn: ({ pageParam }) => apiClient.getComments(id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, _all, lastParam) => (last.meta.hasMore ? lastParam + 1 : undefined),
    enabled: postQuery.isSuccess,
  });

  const submitComment = async (value: string) => {
    await apiClient.createComment(id, value);
    queryClient.invalidateQueries({ queryKey: ['comments', id] });
    queryClient.invalidateQueries({ queryKey: ['post', id] });
  };

  if (postQuery.isLoading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Post" back />
        <FeedSkeleton count={1} />
      </div>
    );
  }

  const post = postQuery.data;
  if (!post) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Post" back />
        <EmptyState
          icon={<FileQuestion className="w-7 h-7" />}
          title="This post isn't available"
          description="It may have been deleted, or the link might be wrong."
          action={
            <Button asChild variant="outline">
              <Link to="/">Back to home</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const items = comments.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <PageHeader title="Post" back />

      <PostCard post={post} detailed onDeleted={() => navigate('/', { replace: true })} />

      <div className="px-4 sm:px-6 py-4 border-b border-border">
        <CommentComposer placeholder="Post your reply" onSubmit={submitComment} />
      </div>

      <div className="px-4 sm:px-6 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {post.commentsCount} {post.commentsCount === 1 ? 'comment' : 'comments'}
        </h2>
      </div>

      {comments.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : comments.isError ? (
        <div className="text-center py-10">
          <p className="text-muted-foreground mb-3">Could not load comments.</p>
          <Button variant="outline" onClick={() => comments.refetch()}>Try again</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<MessageCircle className="w-7 h-7" />} title="No comments yet" description="Start the conversation." />
      ) : (
        <>
          {items.map((comment) => (
            <CommentItem key={comment._id} comment={comment} postId={id} />
          ))}
          {comments.hasNextPage && (
            <div className="flex justify-center py-6">
              <Button variant="outline" onClick={() => comments.fetchNextPage()} disabled={comments.isFetchingNextPage}>
                {comments.isFetchingNextPage && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Show more comments
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PostDetail;
