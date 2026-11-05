import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, Hash, Users, FileSearch, TrendingUp } from 'lucide-react';

import PageHeader from '@/components/custom/PageHeader';
import PostFeed from '@/components/custom/PostFeed';
import UserRow from '@/components/custom/UserRow';
import EmptyState from '@/components/custom/EmptyState';
import { apiClient } from '@/lib/api';

type ResultTab = 'posts' | 'people';

const Explore = () => {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [input, setInput] = useState(q);
  const [tab, setTab] = useState<ResultTab>('posts');

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    const id = setTimeout(() => {
      const next = input.trim();
      if (next !== q) setParams(next ? { q: next } : {}, { replace: true });
    }, 350);
    return () => clearTimeout(id);
  }, [input, q, setParams]);

  const trending = useQuery({ queryKey: ['trending'], queryFn: apiClient.getTrending, enabled: !q });
  const people = useQuery({
    queryKey: ['search', 'users', q],
    queryFn: () => apiClient.searchUsers(q.replace(/^[@#]/, '')),
    enabled: !!q && tab === 'people',
  });

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <PageHeader title="Explore">
        <div className="px-4 sm:px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search people, posts or #hashtags"
              className="w-full h-11 pl-11 pr-10 rounded-full bg-secondary border border-transparent focus:border-primary/50 focus:bg-background outline-none text-sm placeholder:text-muted-foreground transition-all"
              aria-label="Search"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-primary text-primary-foreground"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {q && (
          <div className="flex" role="tablist">
            {(['posts', 'people'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className="flex-1 relative py-3 text-sm font-medium capitalize hover:bg-secondary/40 transition-colors"
              >
                <span className={tab === t ? 'text-foreground' : 'text-muted-foreground'}>{t}</span>
                {tab === t && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-12 rounded-full bg-gradient-to-r from-primary to-accent" />}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {!q ? (
        <>
          <section className="px-4 sm:px-6 py-5 border-b border-border">
            <h2 className="flex items-center gap-2 font-bold text-lg mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              Trending this week
            </h2>
            {trending.isLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}
              </div>
            ) : (trending.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No hashtags yet. Add a #tag to your next post to start a trend.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {trending.data!.map((topic, i) => (
                  <button
                    key={topic.tag}
                    onClick={() => setParams({ q: topic.tag })}
                    className="text-left p-3 rounded-xl glass hover:border-primary/40 hover:-translate-y-0.5 transition-all"
                  >
                    <p className="text-xs text-muted-foreground">#{i + 1} trending</p>
                    <p className="font-semibold text-primary truncate">{topic.tag}</p>
                    <p className="text-xs text-muted-foreground">{topic.count} {topic.count === 1 ? 'post' : 'posts'}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
          <h2 className="px-4 sm:px-6 pt-5 pb-2 font-bold text-lg">Latest from everyone</h2>
          <PostFeed
            queryKey={['posts', 'all']}
            fetchPage={apiClient.getAllPosts}
            empty={<EmptyState icon={<Hash className="w-7 h-7" />} title="No posts yet" />}
          />
        </>
      ) : tab === 'posts' ? (
        <PostFeed
          key={q}
          queryKey={['posts', 'search', q]}
          fetchPage={(page) => apiClient.searchPosts(q, page)}
          empty={
            <EmptyState
              icon={<FileSearch className="w-7 h-7" />}
              title={`No posts for "${q}"`}
              description="Try different words or check the spelling."
            />
          }
        />
      ) : people.isLoading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl shimmer" />)}
        </div>
      ) : people.isError ? (
        <p className="text-center text-muted-foreground py-12">Could not search people right now.</p>
      ) : (people.data ?? []).length === 0 ? (
        <EmptyState icon={<Users className="w-7 h-7" />} title={`No people match "${q}"`} />
      ) : (
        <div className="p-2">
          {people.data!.map((u) => <UserRow key={u._id} user={u} showBio />)}
        </div>
      )}
    </div>
  );
};

export default Explore;
