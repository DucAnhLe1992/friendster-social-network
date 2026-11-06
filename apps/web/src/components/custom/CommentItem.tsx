import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, MoreHorizontal, Pencil, Trash2, Loader2, BadgeCheck } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import UserAvatar from '@/components/custom/UserAvatar';
import RichText from '@/components/custom/RichText';
import EditTextDialog from '@/components/custom/EditTextDialog';
import ConfirmDialog from '@/components/custom/ConfirmDialog';
import CommentComposer from '@/components/custom/CommentComposer';
import { useAuthStore } from '@/store/authStore';
import { apiClient } from '@/lib/api';
import type { Comment } from '@/types';
import { notifyError } from '@/lib/errors';

interface CommentItemProps {
  comment: Comment;
  postId: string;
  parentId?: string;
}

const CommentItem = ({ comment, postId, parentId }: CommentItemProps) => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?._id);
  const isReply = Boolean(parentId);
  const threadId = parentId ?? comment._id;

  const [content, setContent] = useState(comment.content);
  const [isEdited, setIsEdited] = useState(comment.isEdited);
  const [isLiked, setIsLiked] = useState(comment.isLiked);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [liking, setLiking] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const replies = useQuery({
    queryKey: ['replies', comment._id],
    queryFn: () => apiClient.getReplies(postId, comment._id),
    enabled: !isReply && showReplies,
  });

  const refreshThread = () => {
    queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    queryClient.invalidateQueries({ queryKey: ['replies', threadId] });
    queryClient.invalidateQueries({ queryKey: ['post', postId] });
  };

  const toggleLike = async () => {
    if (liking) return;
    const next = !isLiked;
    setLiking(true);
    setIsLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const res = next ? await apiClient.likeComment(postId, comment._id) : await apiClient.unlikeComment(postId, comment._id);
      setLikeCount(res.likeCount);
    } catch (error) {
      setIsLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      notifyError(error, 'Could not update like');
    } finally {
      setLiking(false);
    }
  };

  const saveEdit = async (value: string) => {
    try {
      const updated = await apiClient.updateComment(postId, comment._id, value);
      setContent(updated.content);
      setIsEdited(true);
      toast.success('Comment updated');
    } catch (error) {
      notifyError(error, 'Could not update comment');
      throw error;
    }
  };

  const confirmDelete = async () => {
    try {
      await apiClient.deleteComment(postId, comment._id);
      refreshThread();
      toast.success('Comment deleted');
    } catch (error) {
      notifyError(error, 'Could not delete comment');
    }
  };

  const submitReply = async (value: string) => {
    await apiClient.createComment(postId, value, threadId);
    refreshThread();
    setReplying(false);
    setShowReplies(true);
  };

  const replyItems = replies.data?.items ?? [];

  return (
    <div className={isReply ? 'pt-4' : 'px-4 sm:px-6 py-4 border-b border-border animate-fade-in'}>
      <div className="flex gap-3">
        <Link to={`/profile/${comment.author.handle}`} className="flex-shrink-0">
          <UserAvatar user={comment.author} className={isReply ? 'w-8 h-8' : 'w-10 h-10'} />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap text-sm min-w-0">
              <Link to={`/profile/${comment.author.handle}`} className="font-semibold hover:underline truncate">
                {comment.author.displayName}
              </Link>
              {comment.author.isVerified && <BadgeCheck className="w-4 h-4 text-primary" />}
              <span className="text-muted-foreground truncate">@{comment.author.handle}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{formatDistanceToNowStrict(new Date(comment.createdAt))}</span>
              {isEdited && <span className="text-muted-foreground text-xs">· edited</span>}
            </div>

            {userId === comment.author._id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2 text-muted-foreground">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <RichText text={content} className="mt-0.5 text-[15px] whitespace-pre-wrap break-words leading-relaxed" />

          <div className="flex items-center gap-5 mt-2 text-muted-foreground text-sm">
            <button
              type="button"
              onClick={toggleLike}
              className={`flex items-center gap-1.5 transition-colors ${isLiked ? 'text-rose-500' : 'hover:text-rose-500'}`}
              aria-pressed={isLiked}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
              <span className="tabular-nums">{likeCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Reply
            </button>
          </div>

          {replying && (
            <div className="mt-3 animate-slide-up">
              <CommentComposer
                autoFocus
                compact
                placeholder={`Reply to @${comment.author.handle}`}
                initialValue={isReply ? `@${comment.author.handle} ` : ''}
                onSubmit={submitReply}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}

          {!isReply && comment.replyCount > 0 && (
            <button
              type="button"
              onClick={() => setShowReplies((v) => !v)}
              className="mt-3 text-sm font-medium text-primary hover:underline flex items-center gap-2"
            >
              <span className="w-6 h-px bg-border" />
              {showReplies ? 'Hide replies' : `View ${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}`}
            </button>
          )}

          {!isReply && showReplies && (
            <div className="border-l-2 border-border/70 pl-4 mt-1">
              {replies.isLoading && <Loader2 className="w-4 h-4 animate-spin text-primary mt-4" />}
              {replies.isError && <p className="text-sm text-destructive mt-3">Could not load replies.</p>}
              {replyItems.map((reply) => (
                <CommentItem key={reply._id} comment={reply} postId={postId} parentId={comment._id} />
              ))}
            </div>
          )}
        </div>
      </div>

      <EditTextDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit comment"
        initialValue={content}
        maxLength={280}
        onSave={saveEdit}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this comment?"
        description={isReply ? "This can't be undone." : "Any replies to this comment will also be removed. This can't be undone."}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default CommentItem;
