import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/custom/UserAvatar';
import { useAuthStore } from '@/store/authStore';
import { apiClient, getErrorMessage } from '@/lib/api';

const MAX_CHARS = 280;
const MAX_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface Attachment {
  file: File;
  preview: string;
}

const CreatePost = ({ onSuccess, autoFocus }: { onSuccess?: () => void; autoFocus?: boolean }) => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const previews = useRef<string[]>([]);
  useEffect(() => {
    previews.current = attachments.map((a) => a.preview);
  }, [attachments]);
  useEffect(() => () => previews.current.forEach(URL.revokeObjectURL), []);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (attachments.length + next.length >= MAX_IMAGES) {
        toast.error(`You can attach up to ${MAX_IMAGES} images`);
        break;
      }
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name} is not a supported image type`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 5MB`);
        continue;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const charCount = content.length;
  const remaining = MAX_CHARS - charCount;
  const canSubmit = !submitting && (content.trim().length > 0 || attachments.length > 0) && remaining >= 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const images = attachments.length ? await apiClient.uploadPostImages(attachments.map((a) => a.file)) : [];
      await apiClient.createPost(content.trim(), images);
      attachments.forEach((a) => URL.revokeObjectURL(a.preview));
      setContent('');
      setAttachments([]);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['trending'] });
      if (user) queryClient.invalidateQueries({ queryKey: ['user', user.handle] });
      toast.success('Posted');
      onSuccess?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not publish your post'));
    } finally {
      setSubmitting(false);
    }
  };

  const ringProgress = Math.min(charCount / MAX_CHARS, 1);

  return (
    <div className="flex gap-3">
      <UserAvatar user={user} className="w-11 h-11 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <textarea
          ref={textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
          placeholder="What's happening?"
          rows={2}
          autoFocus={autoFocus}
          disabled={submitting}
          className="w-full resize-none bg-transparent border-0 outline-none text-lg placeholder:text-muted-foreground py-2 leading-relaxed max-h-80 custom-scrollbar"
        />

        {attachments.length > 0 && (
          <div className={`grid gap-2 mt-2 ${attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {attachments.map((a, index) => (
              <div key={a.preview} className="relative group rounded-2xl overflow-hidden border border-border animate-scale-in">
                <img
                  src={a.preview}
                  alt=""
                  className={`w-full object-cover ${attachments.length === 1 ? 'max-h-80' : 'aspect-square'}`}
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  disabled={submitting}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center transition-colors"
                  aria-label="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
          <div className="flex items-center gap-1">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED.join(',')}
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={submitting || attachments.length >= MAX_IMAGES}
              className="p-2 rounded-full text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="Add images"
              title={`Add up to ${MAX_IMAGES} images`}
            >
              <ImagePlus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {charCount > 0 && (
              <div className="flex items-center gap-2">
                <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" className="stroke-border" />
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 10}
                    strokeDashoffset={2 * Math.PI * 10 * (1 - ringProgress)}
                    className={`transition-all ${remaining < 0 ? 'stroke-destructive' : remaining <= 20 ? 'stroke-amber-400' : 'stroke-primary'}`}
                  />
                </svg>
                {remaining <= 20 && (
                  <span className={`text-xs tabular-nums ${remaining < 0 ? 'text-destructive' : 'text-amber-400'}`}>{remaining}</span>
                )}
              </div>
            )}
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-full px-5 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting ? 'Posting' : 'Post'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePost;
