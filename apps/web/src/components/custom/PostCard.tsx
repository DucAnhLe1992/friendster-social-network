import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Link2, MoreHorizontal, Trash2, Pencil, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNowStrict } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { useAuthStore } from '@/store/authStore';
import { apiClient, getErrorMessage, mediaUrl } from '@/lib/api';
import type { Post } from '@/types';

interface PostCardProps {
  post: Post;
  onDeleted?: () => void;
  detailed?: boolean;
}

const PostCard = ({ post, onDeleted, detailed = false }: PostCardProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?._id);

  const [content, setContent] = useState(post.content);
  const [isEdited, setIsEdited] = useState(post.isEdited);
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [liking, setLiking] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  useEffect(() => {
    setContent(post.content);
    setIsEdited(post.isEdited);
    setIsLiked(post.isLiked);
    setLikeCount(post.likeCount);
  }, [post]);

  const isAuthor = userId === post.author._id;
  const openPost = () => !detailed && navigate(`/post/${post._id}`);

  const toggleLike = async () => {
    if (liking) return;
    const next = !isLiked;
    setLiking(true);
    setIsLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      const res = next ? await apiClient.likePost(post._id) : await apiClient.unlikePost(post._id);
      setLikeCount(res.likeCount);
    } catch (error) {
      setIsLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      toast.error(getErrorMessage(error, 'Could not update like'));
    } finally {
      setLiking(false);
    }
  };

  const saveEdit = async (value: string) => {
    try {
      const updated = await apiClient.updatePost(post._id, value);
      setContent(updated.content);
      setIsEdited(true);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Post updated');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not update post'));
      throw error;
    }
  };

  const confirmDelete = async () => {
    try {
      await apiClient.deletePost(post._id);
      toast.success('Post deleted');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['user', post.author.handle] });
      onDeleted?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not delete post'));
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/post/${post._id}`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const images = post.images ?? [];

  return (
    <>
    <article
      onClick={openPost}
      className={`px-4 sm:px-6 py-4 border-b border-border transition-colors animate-fade-in ${
        detailed ? '' : 'cursor-pointer hover:bg-secondary/30'
      }`}
    >
      <div className="flex gap-3">
        <Link to={`/profile/${post.author.handle}`} onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
          <UserAvatar user={post.author} className="w-11 h-11 ring-2 ring-transparent hover:ring-primary/40 transition-all" />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap text-sm">
              <Link
                to={`/profile/${post.author.handle}`}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold hover:underline truncate max-w-[40vw] sm:max-w-none"
              >
                {post.author.displayName}
              </Link>
              {post.author.isVerified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
              <span className="text-muted-foreground truncate">@{post.author.handle}</span>
              <span className="text-muted-foreground">·</span>
              <time className="text-muted-foreground" dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>
                {formatDistanceToNowStrict(new Date(post.createdAt))}
              </time>
              {isEdited && <span className="text-muted-foreground text-xs">· edited</span>}
            </div>

            {isAuthor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1 text-muted-foreground">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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

          {content && (
            <RichText
              text={content}
              className={`mt-1 whitespace-pre-wrap break-words leading-relaxed ${detailed ? 'text-lg' : ''}`}
            />
          )}

          {images.length > 0 && (
            <div
              className={`grid gap-1 mt-3 rounded-2xl overflow-hidden border border-border ${
                images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewer(image);
                  }}
                  className={`relative overflow-hidden bg-secondary ${
                    images.length === 3 && index === 0 ? 'row-span-2' : ''
                  }`}
                >
                  <img
                    src={mediaUrl(image)}
                    alt=""
                    loading="lazy"
                    className={`w-full h-full object-cover hover:scale-105 transition-transform duration-500 ${
                      images.length === 1 ? 'max-h-[28rem]' : 'aspect-square'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-6 mt-3 -ml-2 text-muted-foreground">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/post/${post._id}`);
              }}
              className="flex items-center gap-1.5 group hover:text-primary transition-colors"
              aria-label="Comments"
            >
              <span className="p-2 rounded-full group-hover:bg-primary/10 transition-colors">
                <MessageCircle className="w-[18px] h-[18px]" />
              </span>
              <span className="text-sm tabular-nums">{post.commentsCount}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleLike();
              }}
              className={`flex items-center gap-1.5 group transition-colors ${isLiked ? 'text-rose-500' : 'hover:text-rose-500'}`}
              aria-label={isLiked ? 'Unlike' : 'Like'}
              aria-pressed={isLiked}
            >
              <span className="p-2 rounded-full group-hover:bg-rose-500/10 transition-colors">
                <Heart
                  className={`w-[18px] h-[18px] transition-transform ${isLiked ? 'fill-current scale-110' : 'group-active:scale-90'}`}
                />
              </span>
              <span className="text-sm tabular-nums">{likeCount}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                copyLink();
              }}
              className="flex items-center gap-1.5 group hover:text-primary transition-colors"
              aria-label="Copy link"
            >
              <span className="p-2 rounded-full group-hover:bg-primary/10 transition-colors">
                <Link2 className="w-[18px] h-[18px]" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </article>

      <EditTextDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit post"
        initialValue={content}
        maxLength={280}
        allowEmpty={images.length > 0}
        onSave={saveEdit}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this post?"
        description="This removes the post and all of its comments. This can't be undone."
        onConfirm={confirmDelete}
      />
      <Dialog open={viewer !== null} onOpenChange={(open) => !open && setViewer(null)}>
        <DialogContent className="max-w-4xl p-2 bg-background/95" onClick={(e) => e.stopPropagation()}>
          <DialogTitle className="sr-only">Image</DialogTitle>
          {viewer && <img src={mediaUrl(viewer)} alt="" className="w-full max-h-[85vh] object-contain rounded-lg" />}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PostCard;
