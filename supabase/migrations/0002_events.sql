-- Tracks what each visitor does, so the recommender can learn their interests.
-- Save as: supabase/migrations/0002_events.sql, then run it in the Supabase
-- SQL editor (or with your usual migration command).

create table if not exists user_events (
  id            bigint generated always as identity primary key,
  -- Logged-in user id, or a random id stored in a cookie for anonymous visitors.
  user_id       text        not null,
  -- id of the article. Kept as text so it works whatever type your articles.id is.
  article_id    text        not null,
  type          text        not null
                check (type in ('view', 'read', 'like', 'save', 'share', 'skip')),
  dwell_seconds integer     check (dwell_seconds is null or dwell_seconds >= 0),
  created_at    timestamptz not null default now()
);

-- Fast lookup of one user's recent history (used to build their profile).
create index if not exists user_events_user_recent
  on user_events (user_id, created_at desc);

-- Fast popularity counts per article.
create index if not exists user_events_article
  on user_events (article_id);

-- Lock the table: only your server code (service role key) can read/write it.
-- Browsers must go through your API route, never straight to this table.
alter table user_events enable row level security;