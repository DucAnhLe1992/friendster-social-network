import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import PageHeader from '@/components/custom/PageHeader';
import CreatePost from '@/components/custom/CreatePost';
import PostFeed from '@/components/custom/PostFeed';
import EmptyState from '@/components/custom/EmptyState';
import { apiClient } from '@/lib/api';
import { usePageTitle } from '@/hooks/usePageTitle';

type FeedTab = 'following' | 'everyone';

const TABS: { id: FeedTab; label: string }[] = [
  { id: 'following', label: 'Following' },
  { id: 'everyone', label: 'Everyone' },
];

const Home = () => {
  usePageTitle('Home');
  const [tab, setTab] = useState<FeedTab>('following');

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <PageHeader title="Home">
        <div className="flex" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 relative py-3.5 text-sm font-medium transition-colors hover:bg-secondary/40"
            >
              <span className={tab === t.id ? 'text-foreground' : 'text-muted-foreground'}>{t.label}</span>
              {tab === t.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-14 rounded-full bg-gradient-to-r from-primary to-accent" />
              )}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="hidden md:block px-6 py-4 border-b border-border">
        <CreatePost />
      </div>

      {tab === 'following' ? (
        <PostFeed
          key="following"
          queryKey={['feed']}
          fetchPage={apiClient.getFeed}
          empty={
            <EmptyState
              icon={<Users className="w-7 h-7" />}
              title="Your feed is quiet"
              description="Follow people to see their posts here, or share something yourself."
              action={
                <Button asChild variant="outline">
                  <Link to="/explore">Find people to follow</Link>
                </Button>
              }
            />
          }
        />
      ) : (
        <PostFeed
          key="everyone"
          queryKey={['posts', 'all']}
          fetchPage={apiClient.getAllPosts}
          empty={
            <EmptyState
              icon={<Sparkles className="w-7 h-7" />}
              title="No posts yet"
              description="Be the first to share something with the community."
            />
          }
        />
      )}
    </div>
  );
};

export default Home;
