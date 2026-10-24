-- Newsroom schema. Run once in the Supabase SQL editor.
create extension if not exists vector;
create extension if not exists pg_trgm;

create type verdict as enum ('true','false','partly_true','misleading','out_of_context','unverified');
create type review_status as enum ('draft','pending_review','approved','rejected');
create type statement_relation as enum (
  'consistent','wording_change','policy_change','apparent_contradiction',
  'contradiction_explained_by_circumstances','cannot_establish');
create type source_type as enum ('speech','interview','transcript','social_post','official_record','news_report','other');

create table staff (user_id uuid primary key references auth.users on delete cascade, role text not null check (role in ('admin','editor')));

create table topics (id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null);
create table people (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  bio text, bio_source_url text, country text, created_at timestamptz default now());
create table organizations (
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  kind text check (kind in ('party','government','ngo','company','media','other')) default 'other');
-- Dated records. A switch of party adds a row; old rows are never overwritten.
create table affiliations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people on delete cascade,
  organization_id uuid not null references organizations,
  role text, start_date date, end_date date, source_url text not null,
  check (end_date is null or start_date is null or end_date >= start_date));
create index on affiliations (person_id);

create table sources (
  id uuid primary key default gen_random_uuid(), url text unique not null, title text, publisher text,
  source_type source_type default 'news_report', published_at timestamptz, language text default 'en',
  content text, fetched_at timestamptz default now(),
  tsv tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) stored);
create index on sources using gin (tsv);

create table statements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people on delete cascade,
  text text not null,
  is_excerpt boolean default true,
  made_on date, published_on date,
  source_id uuid references sources, source_url text not null, source_type source_type default 'other',
  language text default 'en', transcript_timestamp_seconds int,
  context text, topic_slug text, country text,
  verified boolean not null default false,       -- true only when the text was found verbatim in the fetched source
  embedding vector(768),
  created_at timestamptz default now(),
  tsv tsvector generated always as (to_tsvector('english', text)) stored,
  unique (person_id, source_url, text));
create index on statements using gin (tsv);
create index on statements (person_id, made_on);
create index on statements using hnsw (embedding vector_cosine_ops);

create table statement_relationships (
  id uuid primary key default gen_random_uuid(),
  statement_a uuid not null references statements on delete cascade,   -- earlier
  statement_b uuid not null references statements on delete cascade,   -- later / current
  relation statement_relation not null,
  summary text, claim_a text, claim_b text,
  context_differences jsonb default '[]', evidence jsonb default '[]', related_documents jsonb default '[]',
  uncertainty text, ai_confidence numeric check (ai_confidence between 0 and 1),
  review_status review_status not null default 'pending_review',
  reviewer_conclusion text, reviewed_by uuid references auth.users, reviewed_at timestamptz,
  created_at timestamptz default now(), unique (statement_a, statement_b));

create table news_clusters (id uuid primary key default gen_random_uuid(), title text not null, first_seen timestamptz default now());
create table news_items (
  id uuid primary key default gen_random_uuid(), cluster_id uuid references news_clusters on delete set null,
  title text not null, url text unique not null, publisher text, published_at timestamptz, summary text,
  created_at timestamptz default now());
create index on news_items (published_at desc);

create table articles (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  title text not null, summary text, body jsonb not null,
  cluster_id uuid references news_clusters, topic_slug text, country text,
  status review_status not null default 'draft', ai_generated boolean default true,
  reviewed_by uuid references auth.users, published_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  tsv tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,''))) stored);
create index on articles using gin (tsv);

create table fact_checks (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  claim_text text not null, claimant text, claimant_person_id uuid references people,
  claim_date date, context text, verdict verdict not null, explanation text,
  evidence jsonb not null default '{"supporting":[],"contradicting":[]}',
  topic_slug text, country text,
  status review_status not null default 'draft', ai_generated boolean default true,
  reviewed_by uuid references auth.users, reviewed_at timestamptz, published_at timestamptz,
  created_at timestamptz default now(),
  tsv tsvector generated always as (to_tsvector('english', claim_text || ' ' || coalesce(explanation,''))) stored);
create index on fact_checks using gin (tsv);

create table corrections (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references articles on delete cascade, fact_check_id uuid references fact_checks on delete cascade,
  note text not null, created_at timestamptz default now());

create table jobs (
  id uuid primary key default gen_random_uuid(), name text not null, status text not null default 'running',
  started_at timestamptz default now(), finished_at timestamptz, error text, result jsonb);

create table newsletter_subscribers (email text primary key, created_at timestamptz default now());

create view trending_clusters as
  select c.id, c.title, count(distinct i.publisher) as publishers, count(*) as items, max(i.published_at) as last_seen
  from news_clusters c join news_items i on i.cluster_id = c.id
  where i.published_at > now() - interval '48 hours'
  group by c.id, c.title
  order by publishers desc, items desc, last_seen desc;

-- Hybrid search: reciprocal-rank fusion of keyword rank and (optional) vector rank.
create or replace function search_statements(
  q text default null, q_embedding vector(768) default null, p_persons uuid[] default null,
  d_from date default null, d_to date default null, p_type source_type default null,
  p_topic text default null, p_country text default null, k int default 30)
returns table (id uuid, score float) language sql stable as $$
  with kw as (
    select s.id, row_number() over (
      order by case when coalesce(q,'') = '' then 0 else ts_rank_cd(s.tsv, websearch_to_tsquery('english', q)) end desc, s.made_on desc nulls last) as r
    from statements s
    where s.verified
      and (coalesce(q,'') = '' or s.tsv @@ websearch_to_tsquery('english', q))
      and (p_persons is null or s.person_id = any(p_persons))
      and (d_from is null or s.made_on >= d_from) and (d_to is null or s.made_on <= d_to)
      and (p_type is null or s.source_type = p_type)
      and (p_topic is null or s.topic_slug = p_topic) and (p_country is null or s.country = p_country)
    limit 60),
  vec as (
    select s.id, row_number() over (order by s.embedding <=> q_embedding) as r
    from statements s
    where q_embedding is not null and s.embedding is not null and s.verified
      and (p_persons is null or s.person_id = any(p_persons))
      and (d_from is null or s.made_on >= d_from) and (d_to is null or s.made_on <= d_to)
      and (p_type is null or s.source_type = p_type)
      and (p_topic is null or s.topic_slug = p_topic) and (p_country is null or s.country = p_country)
    limit 60)
  select u.id, sum(1.0 / (60 + u.r))::float as score
  from (select kw.id, kw.r from kw union all select vec.id, vec.r from vec) u
  group by u.id order by score desc limit k;
$$;

-- Row level security: public reads only published/approved/verified content. Writes use the service role.
alter table staff enable row level security;
alter table topics enable row level security;
alter table people enable row level security;
alter table organizations enable row level security;
alter table affiliations enable row level security;
alter table sources enable row level security;
alter table statements enable row level security;
alter table statement_relationships enable row level security;
alter table news_clusters enable row level security;
alter table news_items enable row level security;
alter table articles enable row level security;
alter table fact_checks enable row level security;
alter table corrections enable row level security;
alter table jobs enable row level security;
alter table newsletter_subscribers enable row level security;

create policy "read" on topics for select using (true);
create policy "read" on people for select using (true);
create policy "read" on organizations for select using (true);
create policy "read" on affiliations for select using (true);
create policy "read" on sources for select using (true);
create policy "read verified" on statements for select using (verified);
create policy "read approved" on statement_relationships for select using (review_status = 'approved');
create policy "read" on news_clusters for select using (true);
create policy "read" on news_items for select using (true);
create policy "read published" on articles for select using (status = 'approved');
create policy "read approved" on fact_checks for select using (status = 'approved');
create policy "read" on corrections for select using (true);
grant select on trending_clusters to anon, authenticated;
grant execute on function search_statements to anon, authenticated;

-- After creating a user in Supabase Auth, make them staff:
--   insert into staff (user_id, role) values ('<auth user uuid>', 'admin');
