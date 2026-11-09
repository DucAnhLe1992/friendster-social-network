import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { mediaUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  user?: { avatar?: string; displayName?: string } | null;
  className?: string;
}

const UserAvatar = ({ user, className }: UserAvatarProps) => (
  <Avatar className={cn('w-10 h-10', className)}>
    <AvatarImage src={mediaUrl(user?.avatar)} alt={user?.displayName} loading="lazy" decoding="async" className="object-cover" />
    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-primary font-semibold">
      {user?.displayName?.charAt(0).toUpperCase() || 'U'}
    </AvatarFallback>
  </Avatar>
);

export default UserAvatar;
