import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquarePlus, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import EmptyState from '@/components/custom/EmptyState';
import ConversationList from '@/components/messages/ConversationList';
import ChatThread from '@/components/messages/ChatThread';
import NewMessageDialog from '@/components/messages/NewMessageDialog';
import { apiClient, getErrorMessage } from '@/lib/api';

const Messages = () => {
  const { id } = useParams<{ id: string }>();
  const [composeOpen, setComposeOpen] = useState(false);

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: apiClient.getConversations });
  const items = conversations.data ?? [];

  return (
    <div className="flex h-[100dvh]">
      <section className={`${id ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-[340px] lg:border-r border-border flex-shrink-0`}>
        <header className="flex items-center justify-between px-4 h-16 border-b border-border glass">
          <h1 className="font-bold text-lg">Messages</h1>
          <Button variant="ghost" size="icon" onClick={() => setComposeOpen(true)} aria-label="New message" className="rounded-full">
            <MessageSquarePlus className="w-5 h-5" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-16 md:pb-0">
          {conversations.isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}
            </div>
          ) : conversations.isError ? (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-muted-foreground mb-3">{getErrorMessage(conversations.error, 'Could not load messages')}</p>
              <Button variant="outline" size="sm" onClick={() => conversations.refetch()}>Try again</Button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Mail className="w-7 h-7" />}
              title="No conversations yet"
              description="Send a private message to anyone on Friendster."
              action={<Button onClick={() => setComposeOpen(true)}>Write a message</Button>}
            />
          ) : (
            <ConversationList conversations={items} />
          )}
        </div>
      </section>

      <section className={`${id ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0`}>
        {id ? (
          <ChatThread key={id} conversationId={id} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<Mail className="w-7 h-7" />}
              title="Select a conversation"
              description="Choose one from the list, or start a new one."
              action={<Button variant="outline" onClick={() => setComposeOpen(true)}>New message</Button>}
            />
          </div>
        )}
      </section>

      <NewMessageDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
};

export default Messages;
