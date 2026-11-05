import { NavLink } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import UserAvatar from '@/components/custom/UserAvatar';
import type { Conversation } from '@/types';

const ConversationList = ({ conversations }: { conversations: Conversation[] }) => {
  const myId = useAuthStore((s) => s.user?._id);

  return (
    <ul className="p-2 space-y-0.5">
      {conversations.map((c) => {
        const unread = c.unreadCount > 0;
        const fromMe = c.lastMessage?.sender === myId;
        return (
          <li key={c._id}>
            <NavLink
              to={`/messages/${c._id}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                  isActive ? 'bg-primary/10' : 'hover:bg-secondary/50'
                }`
              }
            >
              <UserAvatar user={c.participant} className="w-12 h-12 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>{c.participant.displayName}</p>
                  {c.lastMessage && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDistanceToNowStrict(new Date(c.lastMessage.createdAt))}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <p className={`text-sm truncate flex-1 ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {fromMe && 'You: '}
                    {c.lastMessage?.content}
                  </p>
                  {unread && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center">
                      {c.unreadCount > 99 ? '99+' : c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
};

export default ConversationList;
