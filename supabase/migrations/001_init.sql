create extension if not exists vector;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  shopify_customer_id text unique,
  email text,
  name text,
  created_at timestamptz default now()
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  external_thread_id text,
  customer_id uuid references customers(id),
  subject text,
  state text not null default 'NEW',
  last_intent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  direction text not null,
  from_email text,
  to_email text,
  body_text text,
  body_html text,
  raw jsonb,
  created_at timestamptz default now()
);

create table if not exists kb_docs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  title text not null,
  body text not null,
  updated_at timestamptz default now()
);

create table if not exists kb_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid references kb_docs(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists kb_chunks_embedding_idx on kb_chunks using ivfflat (embedding vector_cosine_ops);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  type text not null,
  payload jsonb,
  created_at timestamptz default now()
);