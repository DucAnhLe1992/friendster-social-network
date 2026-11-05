import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UserRow from '@/components/custom/UserRow';
import { apiClient } from '@/lib/api';

export type ConnectionKind = 'followers' | 'following';

interface ConnectionsDialogProps {
  handle: string;
  kind: ConnectionKind | null;
  onClose: () => void;
}

const ConnectionsDialog = ({ handle, kind, onClose }: ConnectionsDialogProps) => {
  const query = useQuery({
    queryKey: ['connections', handle, kind],
    queryFn: () => apiClient.getConnections(handle, kind!),
    enabled: kind !== null,
  });

  const users = query.data ?? [];

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle>{kind === 'followers' ? 'Followers' : 'Following'}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
          {query.isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl shimmer" />)}
            </div>
          ) : query.isError ? (
            <p className="text-center text-sm text-muted-foreground py-10">Could not load this list.</p>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Users className="w-8 h-8 mb-2" />
              <p className="text-sm">{kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</p>
            </div>
          ) : (
            users.map((u) => <UserRow key={u._id} user={u} onNavigate={onClose} />)
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectionsDialog;
