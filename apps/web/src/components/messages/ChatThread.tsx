import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Loader2, MessageSquareOff } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import UserAvatar from '@/components/custom/UserAvatar';
import EmptyState from '@/components/custom/EmptyState';
import { useAuthStore } from '@/store/authStore';
import { useRealtime } from '@/context/RealtimeContext';
import { apiClient, getErrorMessage } from '@/lib/api';
import type { Message } from '@/types';

const MAX = 1000;

const ChatThread = ({ conversationId }: { conversationId: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const socket = useRealtime();
  const myId = useAuthStore((s) => s.user?._id);

  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const keepOffset = useRef<number | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);

  const conversation = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => apiClient.getConversation(conversationId),
  });

  const messagesKey = ['messages', conversationId];
  const messages = useQuery({
    queryKey: messagesKey,
    queryFn: async () => {
      const res = await apiClient.getMessages(conversationId);
      setHasMore(Boolean(res.meta.hasMore));
      return res.messages;
    },
    staleTime: Infinity,
  });

  const list = messages.data ?? [];
  const lastMessage = list[list.length - 1];

  useEffect(() => {
    if (!lastMessage) return;
    apiClient
      .markConversationRead(conversationId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['unread', 'messages'] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => undefined);
  }, [conversationId, lastMessage?._id, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [list.length, otherTyping]);

  useEffect(() => {
    if (!socket) return;
    const onTyping = (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (data.conversationId === conversationId && data.userId !== myId) setOtherTyping(data.isTyping);
    };
    const onMessage = (data: { conversationId: string; message: Message }) => {
      if (data.conversationId === conversationId && data.message.sender !== myId) setOtherTyping(false);
    };
    socket.on('user_typing', onTyping);
    socket.on('new_message', onMessage);
    return () => {
      socket.off('user_typing', onTyping);
      socket.off('new_message', onMessage);
    };
  }, [socket, conversationId, myId]);

  const stopTyping = () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (isTyping.current) socket?.emit('typing_stop', conversationId);
    isTyping.current = false;
  };

  useEffect(() => {
    setOtherTyping(false);
    setDraft('');
    return stopTyping;
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!socket) return;
    if (!isTyping.current && value.trim()) {
      socket.emit('typing_start', conversationId);
      isTyping.current = true;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 2000);
  };

  const loadOlder = async () => {
    if (!list[0] || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await apiClient.getMessages(conversationId, list[0].createdAt);
      if (scroller.current) keepOffset.current = scroller.current.scrollHeight - scroller.current.scrollTop;
      queryClient.setQueryData<Message[]>(messagesKey, (old = []) => [...res.messages, ...old]);
      setHasMore(Boolean(res.meta.hasMore));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not load older messages'));
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending || content.length > MAX) return;
    setSending(true);
    stopTyping();
    try {
      const message = await apiClient.sendMessage(conversationId, content);
      queryClient.setQueryData<Message[]>(messagesKey, (old = []) =>
        old.some((m) => m._id === message._id) ? old : [...old, message]
      );
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Message not sent'));
    } finally {
      setSending(false);
    }
  };

  if (conversation.isError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<MessageSquareOff className="w-7 h-7" />}
          title="Conversation not found"
          action={<Button variant="outline" onClick={() => navigate('/messages')}>Back to messages</Button>}
        />
      </div>
    );
  }

  const other = conversation.data?.participant;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      <header className="flex items-center gap-3 px-4 h-16 border-b border-border glass flex-shrink-0">
        <button onClick={() => navigate('/messages')} className="lg:hidden p-2 -ml-2 rounded-full hover:bg-secondary" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {other ? (
          <Link to={`/profile/${other.handle}`} className="flex items-center gap-3 min-w-0 group">
            <UserAvatar user={other} className="w-9 h-9" />
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate group-hover:underline">{other.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{otherTyping ? 'typing...' : `@${other.handle}`}</p>
            </div>
          </Link>
        ) : (
          <div className="h-9 w-40 rounded shimmer" />
        )}
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
        {hasMore && (
          <div className="flex justify-center mb-4">
            <Button variant="ghost" size="sm" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Load earlier messages
            </Button>
          </div>
        )}

        {messages.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : list.length === 0 && other ? (
          <div className="flex flex-col items-center text-center py-12">
            <UserAvatar user={other} className="w-16 h-16 mb-3" />
            <p className="font-semibold">{other.displayName}</p>
            <p className="text-sm text-muted-foreground">Say hello to @{other.handle}</p>
          </div>
        ) : (
          list.map((m, i) => {
            const mine = m.sender === myId;
            const prev = list[i - 1];
            const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));
            const grouped = prev && !newDay && prev.sender === m.sender;
            return (
              <div key={m._id}>
                {newDay && (
                  <div className="flex justify-center my-4">
                    <span className="text-xs text-muted-foreground px-3 py-1 rounded-full bg-secondary/60">
                      {format(new Date(m.createdAt), 'EEEE, MMM d')}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-3'}`}>
                  <div
                    title={format(new Date(m.createdAt), 'p')}
                    className={`max-w-[78%] px-4 py-2 text-[15px] leading-relaxed whitespace-pre-wrap break-words animate-scale-in ${
                      mine
                        ? 'bg-gradient-to-br from-primary to-accent text-white rounded-2xl rounded-br-md'
                        : 'bg-secondary text-foreground rounded-2xl rounded-bl-md'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {otherTyping && (
          <div className="flex mt-3">
            <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 px-4 py-3 border-t border-border flex-shrink-0 mb-16 md:mb-0"
      >
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Write a message"
          className="flex-1 resize-none max-h-32 rounded-2xl bg-secondary border border-transparent focus:border-primary/50 outline-none px-4 py-2.5 text-[15px] placeholder:text-muted-foreground custom-scrollbar"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!draft.trim() || sending || draft.length > MAX}
          className="rounded-full h-11 w-11 bg-gradient-to-br from-primary to-accent text-white flex-shrink-0"
          aria-label="Send"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </form>
    </div>
  );
};

export default ChatThread;
