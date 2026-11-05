import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, TrendingUp } from 'lucide-react';

import UserRow from '@/components/custom/UserRow';
import { apiClient } from '@/lib/api';

const RightRail = () => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const trending = useQuery({ queryKey: ['trending'], queryFn: apiClient.getTrending, staleTime: 60_000 });
  const suggestions = useQuery({ queryKey: ['suggestions'], queryFn: apiClient.getSuggestions, staleTime: 60_000 });

  const topics = trending.data ?? [];
  const people = suggestions.data ?? [];

  return (
    <aside className="hidden xl:flex flex-col gap-4 w-[340px] flex-shrink-0 sticky top-0 h-screen overflow-y-auto hide-scrollbar py-4 pr-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/explore?q=${encodeURIComponent(q.trim())}`);
        }}
        className="relative"
      >
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Friendster"
          className="w-full h-11 pl-11 pr-4 rounded-full bg-secondary border border-transparent focus:border-primary/50 focus:bg-background outline-none text-sm placeholder:text-muted-foreground transition-all"
          aria-label="Search"
        />
      </form>

      <section className="glass rounded-2xl py-3">
        <h3 className="flex items-center gap-2 font-bold px-4 pb-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Trending
        </h3>
        {trending.isLoading ? (
          <div className="px-4 space-y-3 py-1">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded shimmer" />)}
          </div>
        ) : topics.length === 0 ? (
          <p className="px-4 pb-2 text-sm text-muted-foreground">No trends this week yet. Use a #hashtag in a post to start one.</p>
        ) : (
          topics.slice(0, 5).map((topic, i) => (
            <Link
              key={topic.tag}
              to={`/explore?q=${encodeURIComponent(topic.tag)}`}
              className="block px-4 py-2.5 hover:bg-secondary/40 transition-colors"
            >
              <p className="text-xs text-muted-foreground">{i + 1} · Trending</p>
              <p className="font-semibold text-sm">{topic.tag}</p>
              <p className="text-xs text-muted-foreground">{topic.count} {topic.count === 1 ? 'post' : 'posts'}</p>
            </Link>
          ))
        )}
        {topics.length > 5 && (
          <Link to="/explore" className="block px-4 pt-2 text-sm text-primary hover:underline">
            Show more
          </Link>
        )}
      </section>

      <section className="glass rounded-2xl py-3">
        <h3 className="font-bold px-4 pb-1">Who to follow</h3>
        {suggestions.isLoading ? (
          <div className="px-4 space-y-3 py-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-11 rounded shimmer" />)}
          </div>
        ) : people.length === 0 ? (
          <p className="px-4 py-2 text-sm text-muted-foreground">You're following everyone we'd suggest. Nice.</p>
        ) : (
          <div className="px-1">
            {people.map((u) => <UserRow key={u._id} user={u} />)}
          </div>
        )}
      </section>

      <p className="px-4 text-xs text-muted-foreground">Friendster · {new Date().getFullYear()}</p>
    </aside>
  );
};

export default RightRail;
