import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UserAvatar from '@/components/custom/UserAvatar';
import { useAuthStore } from '@/store/authStore';
import { apiClient, getErrorMessage } from '@/lib/api';

const NewMessageDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const navigate = useNavigate();
  const myId = useAuthStore((s) => s.user?._id);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim().replace(/^@/, '')), 300);
    return () => clearTimeout(id);
  }, [input]);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setInput('');
  }

  const results = useQuery({ queryKey: ['search', 'users', q], queryFn: () => apiClient.searchUsers(q), enabled: open && q.length > 0 });
  const users = (results.data ?? []).filter((u) => u._id !== myId);

  const start = async (handle: string) => {
    setOpening(handle);
    try {
      const conversation = await apiClient.startConversation(handle);
      onOpenChange(false);
      navigate(`/messages/${conversation._id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not start a conversation'));
    } finally {
      setOpening(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search people by name or handle"
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary border border-transparent focus:border-primary/50 outline-none text-sm"
            />
          </div>
        </div>
        <div className="max-h-[50vh] min-h-[160px] overflow-y-auto custom-scrollbar border-t border-border p-2">
          {!q ? (
            <p className="text-center text-sm text-muted-foreground py-10">Type a name to find someone to message.</p>
          ) : results.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">No one matches "{q}".</p>
          ) : (
            users.map((u) => (
              <button
                key={u._id}
                onClick={() => start(u.handle)}
                disabled={opening !== null}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/60 transition-colors text-left"
              >
                <UserAvatar user={u} className="w-10 h-10" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{u.displayName}</p>
                  <p className="text-sm text-muted-foreground truncate">@{u.handle}</p>
                </div>
                {opening === u.handle && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewMessageDialog;
