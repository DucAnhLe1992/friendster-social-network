import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/custom/UserAvatar';
import { useAuthStore } from '@/store/authStore';
import { notifyError } from '@/lib/errors';

const MAX = 280;

interface CommentComposerProps {
  placeholder: string;
  onSubmit: (value: string) => Promise<void>;
  onCancel?: () => void;
  initialValue?: string;
  autoFocus?: boolean;
  compact?: boolean;
}

const CommentComposer = ({ placeholder, onSubmit, onCancel, initialValue = '', autoFocus, compact }: CommentComposerProps) => {
  const user = useAuthStore((s) => s.user);
  const [value, setValue] = useState(initialValue);
  const [sending, setSending] = useState(false);

  const trimmed = value.trim();
  const canSend = !sending && trimmed.length > 0 && value.length <= MAX;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSubmit(trimmed);
      setValue('');
    } catch (error) {
      notifyError(error, 'Could not post your reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex gap-3">
      {!compact && <UserAvatar user={user} className="w-10 h-10 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={compact ? 2 : 2}
          disabled={sending}
          className="w-full resize-none rounded-xl bg-secondary/50 border border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none px-3 py-2.5 text-[15px] placeholder:text-muted-foreground transition-all"
        />
        <div className="flex items-center justify-end gap-3 mt-2">
          <span className={`text-xs tabular-nums ${value.length > MAX ? 'text-destructive' : 'text-muted-foreground'}`}>
            {value.length}/{MAX}
          </span>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={sending}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={submit} disabled={!canSend} className="rounded-full px-4 bg-gradient-to-r from-primary to-accent text-white">
            {sending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Reply
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CommentComposer;
