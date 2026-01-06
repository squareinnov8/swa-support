-- Gmail Monitoring Schema
-- Enables autonomous Gmail polling and HubSpot ticket integration

-- Gmail sync state - tracks polling progress per email account
create table if not exists gmail_sync_state (
  id uuid primary key default gen_random_uuid(),
  email_address text unique not null,
  last_history_id text,        -- Gmail historyId for incremental sync
  last_sync_at timestamptz,
  sync_enabled boolean default true,
  refresh_token text,          -- OAuth refresh token for persistent access
  error_count int default 0,   -- Track consecutive errors for backoff
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Initial state for support email
insert into gmail_sync_state (email_address, sync_enabled)
values ('support@squarewheelsauto.com', true)
on conflict (email_address) do nothing;

-- Function to increment error count
create or replace function increment_gmail_error_count(p_email text, p_error text)
returns void language plpgsql as $$
begin
  update gmail_sync_state
  set error_count = error_count + 1,
      last_error = p_error,
      updated_at = now()
  where email_address = p_email;
end;
$$;

-- Add Gmail and HubSpot tracking columns to threads
alter table threads add column if not exists gmail_thread_id text;
alter table threads add column if not exists hubspot_ticket_id text;
alter table threads add column if not exists hubspot_contact_id text;

-- Indexes for efficient lookups
create index if not exists idx_threads_gmail on threads(gmail_thread_id) where gmail_thread_id is not null;
create index if not exists idx_threads_hubspot_ticket on threads(hubspot_ticket_id) where hubspot_ticket_id is not null;

-- Agent poll runs - tracks each monitoring cycle
create table if not exists agent_poll_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  completed_at timestamptz,
  status text default 'running',  -- 'running', 'completed', 'failed'

  -- Stats
  threads_checked int default 0,
  new_messages_found int default 0,
  drafts_generated int default 0,
  tickets_created int default 0,
  tickets_updated int default 0,
  escalations int default 0,

  -- Error tracking
  error_message text,

  -- Sync state
  history_id_start text,
  history_id_end text
);

create index if not exists idx_poll_runs_status on agent_poll_runs(status);
create index if not exists idx_poll_runs_started on agent_poll_runs(started_at desc);

-- Escalation notes - detailed context for escalated tickets
create table if not exists escalation_notes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  hubspot_ticket_id text,

  -- Customer context
  customer_email text,
  customer_name text,
  order_history jsonb,          -- Recent orders
  verification_status text,
  verification_flags text[],

  -- Escalation details
  escalation_reason text not null,
  intent text,
  sentiment text,

  -- AI-generated recommendations
  recommended_actions text[],
  kb_gaps_identified jsonb,     -- [{topic, suggested_title}]
  instruction_recommendations text[],

  -- Summary
  thread_summary text,

  created_at timestamptz default now()
);

create index if not exists idx_escalation_notes_thread on escalation_notes(thread_id);
create index if not exists idx_escalation_notes_ticket on escalation_notes(hubspot_ticket_id);

-- Comments
comment on table gmail_sync_state is 'Tracks Gmail polling state for incremental sync using historyId';
comment on table agent_poll_runs is 'Logs each monitoring cycle run for debugging and metrics';
comment on table escalation_notes is 'Detailed context notes generated when escalating to human support';
