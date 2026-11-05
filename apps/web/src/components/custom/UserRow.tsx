import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck } from 'lucide-react';

import UserAvatar from '@/components/custom/UserAvatar';
import FollowButton from '@/components/custom/FollowButton';
import type { User } from '@/types';

interface UserRowProps {
  user: User;
  showBio?: boolean;
  onNavigate?: () => void;
  action?: ReactNode;
}

const UserRow = ({ user, showBio, onNavigate, action }: UserRowProps) => (
  <Link
    to={`/profile/${user.handle}`}
    onClick={onNavigate}
    className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors rounded-xl"
  >
    <UserAvatar user={user} className="w-10 h-10 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1">
        <span className="font-semibold text-sm truncate">{user.displayName}</span>
        {user.isVerified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
      </div>
      <p className="text-sm text-muted-foreground truncate">@{user.handle}</p>
      {showBio && user.bio && <p className="text-sm mt-1 line-clamp-2">{user.bio}</p>}
    </div>
    {action ?? <FollowButton handle={user.handle} userId={user._id} isFollowing={user.isFollowing} />}
  </Link>
);

export default UserRow;
